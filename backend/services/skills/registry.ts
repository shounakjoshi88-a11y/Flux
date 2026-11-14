/**
 * Flux Skills — Claude-style agent skills.
 *
 * A skill is a SKILL.md-style markdown document. Discovery is one line of
 * metadata in the system prompt; the body loads only when `read_skill` is
 * called with its name (progressive disclosure).
 *
 * Two sources:
 *   - Built-in  — the markdown files in backend/skills/ (curated below).
 *   - Custom    — per-user rows in the `Skill` table, created by the user in
 *                 chat ("make a skill that …"), via Settings, or by pasting a
 *                 skill folder. Custom skills shadow built-ins on name clash.
 *
 * Enable/disable state:
 *   - custom skills  → `Skill.enabled` column (DB; toggled via /api/skills)
 *   - built-in skills → Supabase `user_metadata.disabledBuiltinSkills` (string[]
 *     of names the user turned OFF; absent/empty = everything built-in is ON)
 *
 * The Settings page and the composer Skills menu toggle both, through GET/PATCH
 * /api/skills (custom) and a frontend-direct user_metadata write (built-ins).
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../../db/prisma';
import { skillsForPlugins } from '../plugins/catalog';

export interface SkillMeta {
    /** Skill identifier used by read_skill, e.g. "pdf-skill". */
    name: string;
    /** One line: what the skill does + when to use it. */
    description: string;
    /** Where the skill came from. */
    source: 'builtin' | 'custom';
    /** docType this skill backs (document generation), if any. */
    docType?: string;
    /** Enabled for this user (always true when no userId is passed). */
    enabled: boolean;
    /** Row id for custom skills. */
    id?: string;
}

export interface SkillPayload extends SkillMeta {
    /** Full markdown body (frontmatter stripped for disk-based skills). */
    body: string;
    /** Bundled files for sandbox materialisation: { "references/x.md": "..." }. */
    files?: Record<string, string>;
}

// ─── Built-in skill catalogue ────────────────────────────────────────────
const CURATED: Record<string, { description: string; docType?: string }> = {
    'pdf-skill': {
        docType: 'pdf',
        description: 'Use when generating a PDF document. 4 page templates (corporate/minimal/creative/report), citation-aware layouts and full content rules.',
    },
    'pptx-skill': {
        docType: 'pptx',
        description: 'Use when generating a PowerPoint (.pptx) deck. Slide structure, theme and speaker-note rules.',
    },
    'docx-skill': {
        docType: 'docx',
        description: 'Use when generating a Word (.docx) document. Sectioning, styles and export rules.',
    },
    'xlsx-skill': {
        docType: 'xlsx',
        description: 'Use when generating an Excel (.xlsx) spreadsheet with formulas and formatting.',
    },
    'csv-skill': {
        docType: 'csv',
        description: 'Use when exporting tabular data as CSV.',
    },
    'tsv-skill': {
        docType: 'tsv',
        description: 'Use when exporting tabular data as TSV.',
    },
    'md-skill': {
        docType: 'md',
        description: 'Use when generating a Markdown document as a deliverable file.',
    },
    'json-skill': {
        docType: 'json',
        description: 'Use when generating a JSON file or structured JSON output.',
    },
    'sql-skill': {
        docType: 'sql',
        description: 'Use when generating a SQL script.',
    },
    'html-skill': {
        docType: 'html',
        description: 'Use when generating a standalone HTML page/mockup as a deliverable file.',
    },
    'tech-writer-skill': {
        docType: 'tech',
        description: 'Use when writing technical documentation.',
    },
    'finance-skill': {
        docType: 'finance',
        description: 'Use for finance analysis and financial writing (companies, markets, valuations, earnings).',
    },
    'coder-skill': {
        docType: 'coder',
        description: 'Use for software-engineering writing: code explanations, design docs, API/CLI references.',
    },
    'creative-skill': {
        docType: 'creative',
        description: 'Use for creative copy: marketing, brand voice, storytelling, social campaigns.',
    },
    'legal-skill': {
        docType: 'legal',
        description: 'Use for legal drafting (terms, contracts, policies, notices).',
    },
    'file-reading': {
        docType: 'file',
        description: 'Use FIRST when a user uploads a file. Per-type rules for PDF, DOCX, XLSX, CSV, code and archives.',
    },
    'frontend-design': {
        docType: 'design',
        description: 'Use when building or styling any web UI or component. Distinctive, production-grade design that avoids generic AI aesthetics.',
    },
    'live-viz': {
        docType: 'live-viz',
        description: 'Use when building an interactive widget inline (<LIVE> tags): simulations, plots, force-directed graphs, games, audio visualizers.',
    },
};

/** docType → built-in skill name (document generation). */
export const DOC_TYPE_TO_SKILL: Record<string, string> = Object.fromEntries(
    Object.entries(CURATED).map(([name, v]) => [v.docType!, name]),
);

export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function parseFrontmatter(raw: string): { name?: string; description?: string; body: string } {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!m) return { body: raw };
    const fm: Record<string, string> = {};
    for (const line of m[1]!.split('\n')) {
        const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
        if (kv) fm[kv[1]!.trim()] = kv[2]!.trim();
    }
    return { name: fm['name'], description: fm['description'], body: m[2]! };
}

interface BuiltinSkill extends SkillMeta {
    body: string;
}

function loadBuiltinsFromDisk(): Map<string, BuiltinSkill> {
    const dir = path.join(__dirname, '..', '..', 'skills');
    const out = new Map<string, BuiltinSkill>();
    let files: string[] = [];
    try {
        files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    } catch (e) {
        console.warn('[SKILLS] skills/ directory unreadable:', (e as any)?.message);
        return out;
    }
    for (const file of files) {
        if (file === 'SKILL.md') continue; // template, not a skill
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        const parsed = parseFrontmatter(raw);
        const fallbackName = file.replace(/\.md$/i, '');
        const curated = CURATED[parsed.name ?? fallbackName] ?? CURATED[fallbackName];
        const name = parsed.name ?? fallbackName;
        const description = parsed.description ?? curated?.description ?? `Skill: ${name}`;
        out.set(name, {
            name,
            description,
            source: 'builtin',
            docType: curated?.docType,
            enabled: true,
            body: parsed.body.trim(),
        });
    }
    return out;
}

const BUILTINS = loadBuiltinsFromDisk();
console.log(`[SKILLS] Built-in skills: ${[...BUILTINS.keys()].join(', ')}`);

// ─── User metadata helpers ───────────────────────────────────────────────

/** Pure merge — exported for tests. */
export function mergeCatalog(
    builtins: SkillMeta[],
    custom: SkillMeta[],
    disabledBuiltin: string[] | null,
): SkillMeta[] {
    const byName = new Map<string, SkillMeta>();
    const disabled = new Set(disabledBuiltin ?? []);
    for (const b of builtins) byName.set(b.name, { ...b, enabled: !disabled.has(b.name) });
    for (const c of custom) byName.set(c.name, c); // custom (with its own enabled flag) shadows
    const all = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    return all;
}

async function userSkillRows(userId: string) {
    if (!userId) return [];
    try {
        return await prisma.skill.findMany({
            where: { userId },
            select: { id: true, name: true, description: true, content: true, files: true, enabled: true },
            orderBy: { createdAt: 'asc' },
        });
    } catch (e: any) {
        console.error('[SKILLS] Failed to read user skills:', e?.message?.slice(0, 200));
        return [];
    }
}

// ─── Public API ──────────────────────────────────────────────────────────

function toCustomMeta(rows: Awaited<ReturnType<typeof userSkillRows>>): SkillMeta[] {
    return rows.map<SkillMeta>((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        source: 'custom',
        enabled: r.enabled,
    }));
}

/** Catalog for a user without Supabase metadata (built-ins + custom, everything enabled). */
export async function listSkills(userId?: string | null): Promise<SkillMeta[]> {
    const builtins = [...BUILTINS.values()].map(({ body: _b, ...m }) => m);
    if (!userId) return mergeCatalog(builtins, [], null);
    return mergeCatalog(builtins, toCustomMeta(await userSkillRows(userId)), null);
}

/** Catalog with Supabase user_metadata disabledBuiltinSkills applied. Plugin-installed skills are always on. */
export async function listSkillsForUser(userId: string, disabledBuiltin: string[] | null) {
    const builtins = [...BUILTINS.values()].map(({ body: _b, ...m }) => m);
    let pluginSkills = new Set<string>();
    try {
        const installs = await prisma.pluginInstall.findMany({
            where: { userId, enabled: true },
            select: { pluginId: true },
        });
        pluginSkills = skillsForPlugins(installs.map((i) => i.pluginId));
    } catch {
        // Plugin table may not exist mid-deploy — degrade to normal toggling.
    }
    const merged = mergeCatalog(builtins, toCustomMeta(await userSkillRows(userId)), disabledBuiltin);
    if (pluginSkills.size === 0) return merged;
    return merged.map((s) => (pluginSkills.has(s.name) ? { ...s, enabled: true } : s));
}

/** Resolve one skill for use — body included. Custom shadows built-in. */
export async function resolveSkill(name: string, userId?: string | null): Promise<SkillPayload | null> {
    const safe = (name || '').trim();
    if (!safe) return null;
    if (userId) {
        const rows = await userSkillRows(userId);
        const hit = rows.find((r) => r.name === safe);
        if (hit) {
            const fm = parseFrontmatter(hit.content);
            return {
                id: hit.id,
                name: hit.name,
                description: hit.description,
                source: 'custom',
                enabled: true,
                body: (fm.body || hit.content).trim(),
                files: (hit.files as Record<string, string> | null) ?? undefined,
            };
        }
    }
    const b = BUILTINS.get(safe);
    if (b) return { ...b };
    return null;
}

/** Catalog block for the system prompt — enabled skills only. */
export function skillsCatalogText(skills: SkillMeta[]): string {
    const enabled = skills.filter((s) => s.enabled);
    const lines = enabled.map((s) => `- ${s.name}: ${s.description}`);
    return [
        '<skills>',
        'You have agent skills available. Before doing a task that matches one, call',
        'read_skill({ skill: "<name>" }) to load its full rules, then follow them.',
        'Do not load skills you do not need. When the user names a skill explicitly, use it.',
        ...lines,
        '</skills>',
    ].join('\n');
}

/** Toggle a custom skill. Returns false for built-ins (custom-only). */
export async function setCustomSkillEnabled(userId: string, name: string, enabled: boolean): Promise<boolean> {
    const res = await prisma.skill.updateMany({ where: { userId, name }, data: { enabled } });
    return res.count > 0;
}

/** Create a custom skill. Returns the row meta. */
export async function createCustomSkill(
    userId: string,
    input: { name: string; description: string; content: string; files?: Record<string, string> | null },
) {
    const name = String(input.name ?? '').trim().toLowerCase();
    if (!SKILL_NAME_RE.test(name)) {
        throw Object.assign(new Error('Invalid skill name — use lowercase letters, digits and hyphens.'), { code: 'BAD_NAME' });
    }
    const description = String(input.description ?? '').trim().slice(0, 1024);
    if (!description) {
        throw new Error('Description is required — it is the only thing the model sees before loading the skill.');
    }
    const content = String(input.content ?? '').trim();
    if (content.length < 20) {
        throw new Error('Skill content is too short to be useful.');
    }
    if (content.length > 200_000) {
        throw new Error('Skill content exceeds 200 KB.');
    }
    const files = input.files ?? null;
    if (files) {
        if (typeof files !== 'object' || Array.isArray(files)) {
            throw new Error('files must be an object of { path: content }.');
        }
        const entries = Object.entries(files);
        if (entries.length > 20) throw new Error('A skill may bundle at most 20 files.');
        for (const [p, c] of entries) {
            if (typeof c !== 'string') throw new Error(`File "${p}" must be a string.`);
            if (c.length > 100_000) throw new Error(`File "${p}" exceeds 100 KB.`);
        }
    }
    const frontmatter = `---\nname: ${name}\ndescription: ${description.replace(/\n/g, ' ')}\n---\n\n`;
    const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
    const row = await prisma.skill.create({
        data: {
            userId,
            name,
            description,
            content: frontmatter + body,
            files: files ?? undefined,
            enabled: true,
        },
    });
    return { id: row.id, name: row.name, description: row.description, enabled: row.enabled };
}

/** Replace fields of a custom skill. Returns updated row or null (not found). */
export async function updateCustomSkill(
    userId: string,
    name: string,
    patch: { description?: string; content?: string; files?: Record<string, string> | null },
) {
    const existing = await prisma.skill.findFirst({ where: { userId, name } });
    if (!existing) return null;
    const data: any = {};
    if (typeof patch.description === 'string') data.description = patch.description.trim().slice(0, 1024);
    if (typeof patch.content === 'string') data.content = patch.content;
    if (patch.files !== undefined) data.files = patch.files ?? undefined;
    return prisma.skill.update({ where: { id: existing.id }, data });
}

/** Delete a custom skill. Returns false for not found. */
export async function deleteCustomSkill(userId: string, name: string): Promise<boolean> {
    const res = await prisma.skill.deleteMany({ where: { userId, name } });
    return res.count > 0;
}

/** Built-in docType → skill name (unchanged contract for document generation). */
export function skillNameForDocType(docType: string): string | null {
    return DOC_TYPE_TO_SKILL[docType] ?? null;
}

export function skillBodyForDocType(docType: string): string | null {
    const name = skillNameForDocType(docType);
    if (!name) return null;
    const b = BUILTINS.get(name);
    return b?.body ?? null;
}
