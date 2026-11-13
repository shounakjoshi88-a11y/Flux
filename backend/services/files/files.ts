export type FileCategory = 'code' | 'document' | 'data' | 'config';

export function detectFileCategory(name: string, content: string): FileCategory {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['ts','tsx','js','jsx','py','go','rs','java','c','cpp','cs','rb','php','swift','kt','vue','svelte'].includes(ext)) return 'code';
    if (['json','jsonl','csv','tsv','xml','yaml','yml','toml'].includes(ext)) return 'data';
    if (['env','sh','bash','zsh','dockerfile','makefile'].includes(ext) || name.toLowerCase().startsWith('.env')) return 'config';
    if (['md','txt','html','htm','rst','tex'].includes(ext)) return 'document';
    const snip = content.slice(0, 200).trim();
    if (snip.startsWith('{') || snip.startsWith('[')) return 'data';
    if (/\b(function|const|class|import|export|def |fn |pub fn)\b/.test(snip)) return 'code';
    return 'document';
}

export function extractCodeSymbols(content: string, maxSymbols = 45): string {
    const lines = content.split('\n');
    const importLines: string[] = [];
    const symbols: string[] = [];

    for (let i = 0; i < Math.min(lines.length, 1200); i++) {
        const line = (lines[i] ?? '').trim();
        if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('#')) continue;

        // Imports — first 25 lines only, cap at 6
        if (i < 25 && importLines.length < 6 &&
            (line.startsWith('import ') || line.startsWith('from ') || /^const .* = require/.test(line))) {
            importLines.push(`  ${line.slice(0, 90)}`);
            continue;
        }
        // Express/Hono routes
        const route = line.match(/(?:app|router|server)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`\s]+)/);
        if (route && route[1] && route[2]) { symbols.push(`  route  ${route[1].toUpperCase().padEnd(6)} ${route[2]} — line ${i + 1}`); continue; }
        // Classes
        const cls = line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
        if (cls) { symbols.push(`  class  ${cls[1]} — line ${i + 1}`); continue; }
        // Interfaces / Types
        const iface = line.match(/^(?:export\s+)?(?:interface|type)\s+(\w+)/);
        if (iface) { symbols.push(`  type   ${iface[1]} — line ${i + 1}`); continue; }
        // Named functions
        const fn = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
        if (fn) { symbols.push(`  fn     ${fn[1]} — line ${i + 1}`); continue; }
        // Arrow / const lambdas (camelCase only)
        const arrow = line.match(/^(?:export\s+)?const\s+([a-z]\w+)\s*(?::[^=]+)?\s*=\s*(?:async\s+)?\(/);
        if (arrow) { symbols.push(`  fn     ${arrow[1]} — line ${i + 1}`); continue; }
        // React / PascalCase components
        const comp = line.match(/^(?:export\s+)?(?:default\s+)?(?:const|function)\s+([A-Z]\w+)/);
        if (comp) { symbols.push(`  cmp    ${comp[1]} — line ${i + 1}`); continue; }
    }

    const parts: string[] = [];
    if (importLines.length) parts.push('Imports:\n' + importLines.join('\n'));
    if (symbols.length) parts.push('Symbols:\n' + symbols.slice(0, maxSymbols).join('\n'));
    return parts.join('\n');
}

export function scoreSectionRelevance(sectionText: string, query: string): number {
    const words = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const lower = sectionText.toLowerCase();
    return words.reduce((acc, w) => acc + (lower.split(w).length - 1), 0);
}

/**
 * Converts raw file data into a structured, section-labeled representation
 * that mirrors careful sequential file reading:
 *   metadata → structural outline → header section → query-relevant body → tail
 */
export function buildStructuredFileContext(
    files: Array<{ name: string; content: string }>,
    query: string,
    totalBudget = 36_000,
    onStatus?: (filename: string, section: string) => void
): string {
    if (!files.length) return '';
    const perFile = Math.floor(totalBudget / files.length);
    const out: string[] = [];

    for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        if (!file) continue;
        const { name, content } = file;
        if (!content?.trim()) continue;

        const lines = content.split('\n');
        const n = lines.length;
        const kb = (content.length / 1024).toFixed(1);
        const cat = detectFileCategory(name, content);

        onStatus?.(name, 'outline');

        // ── File banner ───────────────────────────────────────────────────
        out.push(`━━━ FILE ${fi + 1}/${files.length}: ${name}  (${n} lines · ${kb} KB · ${cat}) ━━━`);

        // ── Structural outline (code only) ────────────────────────────────
        if (cat === 'code') {
            const symbols = extractCodeSymbols(content);
            if (symbols) out.push(`OUTLINE (auto-extracted):\n${symbols}`);
        }

        const budget = Math.max(perFile - 600, 4000); // 600 chars reserved for labels/outline

        if (content.length <= budget) {
            // Small enough: include the whole file verbatim
            onStatus?.(name, 'full');
            out.push(`[FULL CONTENT · lines 1–${n}]\n${content}`);
        } else {
            // Strategic 3-section sampling ─────────────────────────────────
            const secBudget = Math.floor(budget / 3);

            // Section 1 — Header/Imports (first ~15 %, max 100 lines)
            onStatus?.(name, 'section 1/3: header/imports');
            const s1End = Math.min(Math.ceil(n * 0.15), 100);
            out.push(
                `[SECTION 1/3 · Header / Imports · lines 1–${s1End}]\n` +
                lines.slice(0, s1End).join('\n').slice(0, secBudget)
            );

            // Section 2 — Query-relevant body chunk
            onStatus?.(name, 'section 2/3: query-relevant body');
            const bodyStart = s1End;
            const bodyEnd = Math.floor(n * 0.85);
            const step = 80;
            let bestScore = -1, bestStart = bodyStart;
            for (let c = bodyStart; c < bodyEnd - step; c += step) {
                const score = scoreSectionRelevance(lines.slice(c, c + step).join('\n'), query);
                if (score > bestScore) { bestScore = score; bestStart = c; }
            }
            const s2End = Math.min(bestStart + 140, bodyEnd);
            out.push(
                `[SECTION 2/3 · Most relevant to query · lines ${bestStart + 1}–${s2End}]\n` +
                lines.slice(bestStart, s2End).join('\n').slice(0, secBudget)
            );

            // Section 3 — Tail/Exports (last ~10 %, max 80 lines)
            onStatus?.(name, 'section 3/3: tail/exports');
            const s3Start = Math.max(n - 80, s2End);
            if (s3Start < n) {
                out.push(
                    `[SECTION 3/3 · Tail / Exports · lines ${s3Start + 1}–${n}]\n` +
                    lines.slice(s3Start).join('\n').slice(0, secBudget)
                );
            }

            const shownLines = s1End + (s2End - bestStart) + (n - s3Start);
            const skipped = n - shownLines;
            if (skipped > 30) {
                out.push(
                    `[⚠ ${skipped} lines in mid-body not shown here — ` +
                    `full file was passed to the primary model context.]`
                );
            }
        }

        out.push(`━━━ END: ${name} ━━━`);
    }

    return out.join('\n\n');
}

