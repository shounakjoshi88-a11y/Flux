/**
 * Document generation pipeline.
 *
 * Three steps: ask the model for a JSON document matching the format schema,
 * repair the JSON it returns, then hand the result to the builder that writes
 * the actual file. Every failure path falls back to synthesised data so a
 * document request never returns nothing.
 */
import * as fs from 'fs';
import * as path from 'path';
import { generateText } from 'ai';
import { buildPPTX, buildDOCX, buildPDF, buildXLSX, buildCSV, buildTSV, buildMD, buildJSON, buildSQL, buildHTML } from '../../agents/tools/builders';
import type { GeneratedFileResult } from '../../agents/tools/builders';
import { sendStatus } from '../../http/sse/writers';
import { robustParseJSON } from './json';
import { extractTopicFromQuery } from './intent';
import type { DocType } from './intent';
import type { ContextualStatusMessages } from './types';
// ── SKILL REGISTRY ─────────────────────────────────────────────────────────
// Add entries here as you add skill files to the skills/ folder.
export const SKILL_REGISTRY: Record<string, { fileName: string; label: string }> = {
    pdf: { fileName: 'pdf-skill', label: 'PDF generation' },
    pptx: { fileName: 'pptx-skill', label: 'PowerPoint generation' },
    docx: { fileName: 'docx-skill', label: 'Word document generation' },
    xlsx: { fileName: 'xlsx-skill', label: 'Excel spreadsheet generation' },
    csv: { fileName: 'csv-skill', label: 'CSV export generation' },
    tsv: { fileName: 'tsv-skill', label: 'TSV export generation' },
    md: { fileName: 'md-skill', label: 'Markdown document generation' },
    json: { fileName: 'json-skill', label: 'JSON data generation' },
    sql: { fileName: 'sql-skill', label: 'SQL script generation' },
    html: { fileName: 'html-skill', label: 'HTML mockup generation' },
    tech: { fileName: 'tech-writer-skill', label: 'Technical documentation' },
    finance: { fileName: 'finance-skill', label: 'Financial analysis' },
    coder: { fileName: 'coder-skill', label: 'Software engineering' },
    creative: { fileName: 'creative-skill', label: 'Creative copywriting' },
    legal: { fileName: 'legal-skill', label: 'Legal drafting' },
    design: { fileName: 'frontend-design', label: 'Frontend design & styling' },
    'live-viz': { fileName: 'live-viz', label: 'Live interactive visualization' },
    file: { fileName: 'file-reading', label: 'File reading & analysis per type' },
};

export async function fetchSkillFile(skillName: string): Promise<string> {
    try {
        const safeName = (skillName || '').replace(/[^a-z0-9-]/g, '').slice(0, 80);
        if (!safeName) return '';
        const p = path.join(__dirname, '..', '..', 'skills', `${safeName}.md`);
        if (!fs.existsSync(p)) {
            console.warn(`[SKILL] File not found: ${p}`);
            return '';
        }
        const text = fs.readFileSync(p, 'utf-8');
        console.log(`[SKILL] "${skillName}" loaded — ${text.length} chars`);
        return text;
    } catch (e) {
        console.warn(`[SKILL] Could not load "${skillName}":`, e);
        return '';
    }
}

/** Exact JSON schema shown to the model for each doc type */
const DOC_SCHEMA: Record<Exclude<DocType, null>, string> = {
    pptx: `{"title":"Presentation Title","slides":[{"title":"Slide Title","content":"Slide body text"},{"title":"Slide 2","content":"More content"}]}`,
    docx: `{"title":"Document Title","sections":[{"heading":"Introduction","body":"Section content"},{"heading":"Section 2","body":"More content"}]}`,
    pdf: `{"title":"Document Title","template":"corporate","pages":[{"text":"# Section\n\nContent here.\n\n## Subsection\n\nMore content."},{"text":"# Next Section\n\nFurther detail."}]}`,
    xlsx: `{"title":"Spreadsheet Title","rows":[["Header 1","Header 2","Header 3"],["Row 1 A","Row 1 B","Row 1 C"],["Row 2 A","Row 2 B","Row 2 C"]]}`,
    csv: `{"title":"CSV Title","rows":[["Header 1","Header 2"],["Row 1 A","Row 1 B"],["Row 2 A","Row 2 B"]]}`,
    tsv: `{"title":"TSV Title","rows":[["Header 1","Header 2"],["Row 1 A","Row 1 B"],["Row 2 A","Row 2 B"]]}`,
    md: `{"title":"Document Title","content":"# Document Title\\n\\n## Section 1\\n\\nContent paragraph.\\n\\n## Section 2\\n\\nMore content."}`,
    json: `{"title":"Data Filename","content":"{\\n  \\"key\\": \\"value\\",\\n  \\"nested\\": {\\n    \\"id\\": 1\\n  }\\n}"}`,
    sql: `{"title":"Database Script","content":"-- Schema Setup\\nCREATE TABLE users (\\n  id SERIAL PRIMARY KEY,\\n  email TEXT UNIQUE\\n);"}`,
    html: `{"title":"Web Page","content":"<!DOCTYPE html>\\n<html>\\n<head>\\n<title>Page Title</title>\\n</head>\\n<body>\\n<h1>Hello World</h1>\\n</body>\\n</html>"}`,
    tech: `{"title":"Technical Document","content":"# Technical Overview\\n\\n## Architecture\\nDetailed description...\\n\\n## API Reference\\nParameters and endpoints..."}`,
    finance: `{"title":"Financial Report","content":"# Quarterly Analysis\\n\\n## Performance Metrics\\nRevenue and growth data...\\n\\n## Risk Assessment\\nMarket variables..."}`,
    coder: `{"title":"System Design","content":"# Implementation Plan\\n\\n## Module Structure\\nComponent definitions...\\n\\n## Migration Strategy\\nData handling..."}`,
    creative: `{"title":"Brand Strategy","content":"# Creative Direction\\n\\n## Narrative Framework\\nStory arcs and tone...\\n\\n## Visual Identity\\nStyle and aesthetics..."}`,
    legal: `{"title":"Legal Agreement","content":"# Service Terms\\n\\n## Clauses\\nDefinitions and obligations...\\n\\n## Disclaimers\\nLiability and compliance..."}`,
};

/** Guaranteed-valid fallback data — used when the LLM response is unparseable */
export function makeFallbackData(docType: Exclude<DocType, null>, topic: string): any {
    switch (docType) {
        case 'pptx': return {
            title: topic, slides: [
                { title: 'Introduction', content: `An overview of ${topic}.` },
                { title: 'Key Points', content: `Important aspects of ${topic}.` },
                { title: 'Details', content: `Further details about ${topic}.` },
                { title: 'Summary', content: `Key takeaways about ${topic}.` },
            ]
        };
        case 'docx': return {
            title: topic, sections: [
                { heading: 'Introduction', body: `This document provides an overview of ${topic}.` },
                { heading: 'Background', body: `Background information on ${topic}.` },
                { heading: 'Details', body: `Detailed information about ${topic}.` },
                { heading: 'Conclusion', body: `Summary and conclusions about ${topic}.` },
            ]
        };
        case 'pdf': return {
            title: topic, template: 'corporate', pages: [
                { text: `# ${topic}\n\nThis document was generated by Flux AI.` },
            ]
        };
        case 'xlsx':
        case 'csv':
        case 'tsv': return {
            title: topic, rows: [
                ['Topic', 'Details', 'Notes'],
                [topic, 'Generated by Flux AI', '—'],
            ]
        };
        default: return { title: topic, content: `Content about ${topic} generated by Flux AI.` };
    }
}

/**
 * Walk through `raw` collecting every structurally-complete JSON object that
 * lives at depth 1 inside the array identified by `arrayKey`.
 * Returns an empty array (never throws) so callers can decide what to do with
 * the results.
 */
export function extractCompleteItems(raw: string, arrayKey: string): any[] {
    const keyIdx = raw.indexOf(`"${arrayKey}"`);
    if (keyIdx === -1) return [];
    const arrStart = raw.indexOf('[', keyIdx);
    if (arrStart === -1) return [];

    const results: any[] = [];
    let depth = 0;
    let inStr = false, esc = false;
    let objStart = -1;

    for (let i = arrStart + 1; i < raw.length; i++) {
        const c = raw[i];
        if (esc) { esc = false; continue; }
        if (c === '\\' && inStr) { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;

        if (c === '{') {
            if (depth === 0) objStart = i;
            depth++;
        } else if (c === '}') {
            depth--;
            if (depth === 0 && objStart !== -1) {
                const fragment = raw.slice(objStart, i + 1);
                try {
                    // Try the full repair pipeline on each individual object
                    results.push(robustParseJSON(fragment));
                } catch { /* incomplete fragment — discard */ }
                objStart = -1;
            }
        } else if (c === ']' && depth === 0) {
            break; // Reached end of the array
        }
    }
    return results;
}

/**
 * Best-effort partial-content extractor.  Called only when robustParseJSON
 * gives up entirely.  Returns whatever complete items were generated before
 * the truncation point, or null if nothing useful could be salvaged.
 *
 * Callers should merge the result with makeFallbackData so required fields
 * (title, arrays) are never absent.
 */
export function tryExtractPartialContent(
    raw: string,
    docType: Exclude<DocType, null>,
    topic: string,
): any | null {
    try {
        // Extract the title (almost always appears first and is short enough to survive truncation)
        const titleM = raw.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        let title = topic;
        if (titleM) {
            try { title = JSON.parse(`"${titleM[1]}"`); } catch { /* keep topic */ }
        }

        switch (docType) {
            case 'pptx': {
                const items = extractCompleteItems(raw, 'slides');
                const slides = items
                    .map(o => (typeof o?.title === 'string' && typeof o?.content === 'string'
                        ? { title: o.title, content: o.content } : null))
                    .filter(Boolean) as { title: string; content: string }[];
                return slides.length ? { title, slides } : null;
            }
            case 'docx': {
                const items = extractCompleteItems(raw, 'sections');
                const sections = items
                    .map(o => (typeof o?.heading === 'string' && typeof o?.body === 'string'
                        ? { heading: o.heading, body: o.body } : null))
                    .filter(Boolean) as { heading: string; body: string }[];
                return sections.length ? { title, sections } : null;
            }
            case 'pdf': {
                const items = extractCompleteItems(raw, 'pages');
                const pages = items
                    .map(o => (typeof o?.text === 'string' ? { text: o.text } : null))
                    .filter(Boolean) as { text: string }[];
                return pages.length ? { title, pages } : null;
            }
            case 'xlsx':
            case 'csv':
            case 'tsv': {
                // rows is an array of arrays — try extracting the outer array
                const rowsKeyIdx = raw.indexOf('"rows"');
                if (rowsKeyIdx === -1) return null;
                const arrStart = raw.indexOf('[', rowsKeyIdx);
                if (arrStart === -1) return null;
                // Find complete inner arrays by depth tracking
                const rows: any[][] = [];
                let depth = 0, inStr2 = false, esc2 = false;
                let rowStart = -1;
                for (let i = arrStart + 1; i < raw.length; i++) {
                    const c = raw[i];
                    if (esc2) { esc2 = false; continue; }
                    if (c === '\\' && inStr2) { esc2 = true; continue; }
                    if (c === '"') { inStr2 = !inStr2; continue; }
                    if (inStr2) continue;
                    if (c === '[') { if (depth === 0) rowStart = i; depth++; }
                    else if (c === ']') {
                        depth--;
                        if (depth === 0 && rowStart !== -1) {
                            try { rows.push(JSON.parse(raw.slice(rowStart, i + 1))); } catch { /* skip */ }
                            rowStart = -1;
                        } else if (depth < 0) break;
                    }
                }
                return rows.length >= 2 ? { title, rows } : null;
            }
            case 'md':
            case 'json':
            case 'sql':
            case 'html': {
                // Grab whatever has been generated of the content field, even if truncated
                const contentM = raw.match(/"content"\s*:\s*"([\s\S]*)/);
                if (!contentM) return null;
                // Unescape known sequences from the partial string
                let partial = contentM[1]!
                    .replace(/\\n/g, '\n')
                    .replace(/\\t/g, '\t')
                    .replace(/\\"/g, '"')
                    .replace(/\\r/g, '\r')
                    .replace(/\\\\/g, '\\');
                // Strip trailing incomplete escape or orphaned quote
                partial = partial.replace(/\\$/, '').replace(/"$/, '').trimEnd();
                return partial.length > 10 ? { title, content: partial } : null;
            }
            default:
                return null;
        }
    } catch {
        return null;
    }
}

/** Dispatch parsed (or fallback) data to the appropriate builder */
export async function buildDocFromData(
    docType: Exclude<DocType, null>,
    data: any,
): Promise<GeneratedFileResult | null> {
    try {
        switch (docType) {
            case 'pptx': return await buildPPTX(data);
            case 'docx': return await buildDOCX(data);
            case 'pdf': {
                // Forward template; validate it's a known value
                const VALID_TEMPLATES = ['corporate', 'minimal', 'creative', 'report'];
                const template = VALID_TEMPLATES.includes(data.template) ? data.template : 'corporate';
                console.log(`[PDF] Using template: ${template}`);
                return await buildPDF({ title: data.title, pages: data.pages, template });
            }
            case 'xlsx': return await buildXLSX(data);
            case 'csv': return await buildCSV(data);
            case 'tsv': return await buildTSV(data);
            case 'md': return await buildMD(data);
            case 'json': return await buildJSON(data);
            case 'sql': return await buildSQL(data);
            case 'html': return await buildHTML(data);
            default: return null;
        }
    } catch (e) {
        console.error('buildDocFromData: builder threw:', e);
        return null;
    }
}

export async function generateDocument(
    docType: Exclude<DocType, null>,
    query: string,
    model: any,
    res?: any,
    statusMsgs?: ContextualStatusMessages,
    searchContent: string = ""
): Promise<GeneratedFileResult | null> {
    const topic = extractTopicFromQuery(query);
    if (!topic) return null;

    const schema = DOC_SCHEMA[docType];

    // Fetch the skill file for this doc type if one exists in the registry.
    // This gives the LLM full format awareness (templates, layout rules, content rules).
    let skillContext = "";
    if (docType && docType in SKILL_REGISTRY) {
        if (res && statusMsgs?.readingSkill) {
            sendStatus(res, "reading_skill", statusMsgs.readingSkill);
        }
        const skillMd = await fetchSkillFile(SKILL_REGISTRY[docType]!.fileName);
        if (skillMd) {
            skillContext = `\n\n=== ${docType.toUpperCase()} GENERATION SKILL FILE ===\n${skillMd}\n=== END SKILL FILE ===\n\nRead the skill file above carefully. Follow all instructions, templates, and content rules exactly.\n\n`;
        }
    }

    const searchContext = searchContent
        ? `\n\n=== REFERENCE SEARCH RESULTS ===\n${searchContent}\n=== END REFERENCE SEARCH RESULTS ===\n\nUse the search results content above to write detailed, substantive information in the document.`
        : "";

    const SYSTEM = [
        "You are a JSON document generator.",
        "Output ONLY a valid JSON object — no markdown fences, no prose, no explanations.",
        "The response must start with { and end with }.",
        skillContext ? "You have been provided a skill file with full instructions. Follow them exactly." : "",
    ].filter(Boolean).join(" ");

    const QUOTE_RULE = `CRITICAL — string escaping rules (violations will break the parser):
- Use \\n (backslash + n) for line breaks inside strings, never a literal newline character.
- Escape every double-quote character that appears INSIDE a string value as \\". This applies to: LaTeX labels like \\"Axis Aligned Bounding Box\\", quoted code like player.state = \\"jumping\\", inline quotations, and any \\"word\\" wrapped in double quotes within text.
- Escape every backslash as \\\\ (two backslashes). LaTeX commands like \\\\frac, \\\\sqrt, \\\\le must be written with double backslashes.
- Do NOT use Markdown formatting (no **bold**, no # headings, no bullet - or * prefixes) inside string values — write plain text only.`;

    const makeUserPrompt = (isRetry: boolean) => isRetry
        ? `Your previous response did not contain a valid JSON object. You MUST output ONLY a JSON object — no other text whatsoever.

Generate a ${docType.toUpperCase()} document about "${topic}" using exactly this structure:
${schema}

${QUOTE_RULE}

Start your entire response with { and end with }.`
        : `${skillContext}${searchContext}Generate a comprehensive, detailed ${docType.toUpperCase()} document about: "${topic}"

Use exactly this JSON structure:
${schema}

Rules:
- Include substantive, professional content directly relevant to the topic.
${QUOTE_RULE}
- Output ONLY the JSON object. Your response must start with { and end with }.`;

    let text = '';

    // ── Attempt 1 ────────────────────────────────────────────────────────
    try {
        ({ text } = await generateText({
            model,
            system: SYSTEM,
            messages: [{ role: 'user', content: makeUserPrompt(false) }],
            maxTokens: 8000,   // raised from 4000 — long physics/technical docs need headroom
        } as any));
    } catch (e) {
        console.error('generateDocument: LLM call failed (attempt 1):', e);
        return buildDocFromData(docType, makeFallbackData(docType, topic));
    }

    // ── Retry if the response contains no JSON at all ────────────────────
    if (!text.includes('{')) {
        console.warn('generateDocument: no JSON in response, retrying with correction prompt…');
        try {
            ({ text } = await generateText({
                model,
                system: SYSTEM,
                messages: [
                    { role: 'user', content: makeUserPrompt(false) },
                    { role: 'assistant', content: text },
                    { role: 'user', content: makeUserPrompt(true) },
                ],
                maxTokens: 8000,
            } as any));
        } catch (e) {
            console.error('generateDocument: LLM call failed (retry):', e);
            return buildDocFromData(docType, makeFallbackData(docType, topic));
        }
    }

    // ── Parse (with full repair pipeline) ────────────────────────────────
    let data: any;
    try {
        data = robustParseJSON(text);
    } catch (e) {
        console.warn('generateDocument: robustParseJSON exhausted, trying partial-content extraction…', e);
        // Smart fallback: rescue whatever complete items the LLM generated before truncation
        data = tryExtractPartialContent(text, docType, topic) ?? makeFallbackData(docType, topic);
        if (data !== makeFallbackData(docType, topic)) {
            console.info('generateDocument: partial content salvaged successfully');
        }
    }

    // Patch missing title and required content arrays
    if (!data.title) data.title = topic;
    const fb = makeFallbackData(docType, topic);
    switch (docType) {
        case 'pptx': if (!Array.isArray(data.slides) || !data.slides.length) data.slides = fb.slides; break;
        case 'docx': if (!Array.isArray(data.sections) || !data.sections.length) data.sections = fb.sections; break;
        case 'pdf': if (!Array.isArray(data.pages) || !data.pages.length) data.pages = fb.pages; break;
        case 'xlsx':
        case 'csv':
        case 'tsv': if (!Array.isArray(data.rows) || data.rows.length < 2) data.rows = fb.rows; break;
        case 'md':
        case 'json':
        case 'sql':
        case 'html': if (!data.content) data.content = fb.content; break;
    }

    return buildDocFromData(docType, data);
}

/**
 * Like generateDocument() but accepts skill content that was already
 * fetched in the agentic tool-execution phase.
 * If skillContent is empty, falls back to fetching it internally.
 */
export async function generateDocumentWithSkill(
    docType: Exclude<DocType, null>,
    query: string,
    model: any,
    preloadedSkillContent: string = "",
    searchContent: string = ""
): Promise<GeneratedFileResult | null> {
    const topic = extractTopicFromQuery(query);
    if (!topic) return null;

    const schema = DOC_SCHEMA[docType];
    const skillContext = preloadedSkillContent
        ? `\n\n=== ${docType.toUpperCase()} GENERATION SKILL FILE ===\n${preloadedSkillContent}\n=== END SKILL FILE ===\n\nFollow all instructions in the skill file exactly.\n\n`
        : "";
    const searchContext = searchContent
        ? `\n\n=== REFERENCE SEARCH RESULTS ===\n${searchContent}\n=== END REFERENCE SEARCH RESULTS ===\n\nUse the search results content above to write detailed, substantive information in the document.`
        : "";

    const SYSTEM = [
        "You are a JSON document generator.",
        "Output ONLY a valid JSON object — no markdown fences, no prose, no explanations.",
        "The response must start with { and end with }.",
        skillContext ? "A skill file with full generation instructions is provided. Follow them exactly." : "",
    ].filter(Boolean).join(" ");

    const QUOTE_RULE = `CRITICAL — string escaping rules:
- Use \\n for line breaks inside strings, never a literal newline.
- Escape every double-quote inside a string value as \\".
- Escape every backslash as \\\\.
- No Markdown formatting inside string values.`;

    const makePrompt = (isRetry: boolean) => isRetry
        ? `Your previous response had no valid JSON. Output ONLY a JSON object for a ${docType.toUpperCase()} about "${topic}":\n${schema}\n${QUOTE_RULE}\nStart with { and end with }.`
        : `${skillContext}${searchContext}Generate a comprehensive ${docType.toUpperCase()} document about: "${topic}"\n\nUse exactly this JSON structure:\n${schema}\n\nRules:\n- Include substantive, professional content.\n${QUOTE_RULE}\n- Output ONLY the JSON object. Start with { end with }.`;

    let text = '';
    try {
        ({ text } = await generateText({
            model,
            system: SYSTEM,
            messages: [{ role: 'user', content: makePrompt(false) }],
            maxTokens: 8000,
        } as any));
    } catch (e) {
        console.error('generateDocumentWithSkill: LLM call failed:', e);
        return buildDocFromData(docType, makeFallbackData(docType, topic));
    }

    if (!text.includes('{')) {
        try {
            ({ text } = await generateText({
                model, system: SYSTEM,
                messages: [
                    { role: 'user', content: makePrompt(false) },
                    { role: 'assistant', content: text },
                    { role: 'user', content: makePrompt(true) },
                ],
                maxTokens: 8000,
            } as any));
        } catch (e) {
            return buildDocFromData(docType, makeFallbackData(docType, topic));
        }
    }

    let data: any;
    try {
        data = robustParseJSON(text);
    } catch {
        data = tryExtractPartialContent(text, docType, topic) ?? makeFallbackData(docType, topic);
    }

    if (!data.title) data.title = topic;
    const fb = makeFallbackData(docType, topic);
    return buildDocFromData(docType, data);
}

// ── PER-REQUEST AGENT STATE ────────────────────────────────────────────────
// AgentState lives in agents/tools/state.ts
