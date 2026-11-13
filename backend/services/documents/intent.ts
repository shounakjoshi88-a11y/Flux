// ─── Document intent detection ──────────────────────────────────────────────
export type DocType = 'pptx' | 'docx' | 'pdf' | 'xlsx' | 'csv' | 'tsv' | 'md' | 'json' | 'sql' | 'html' | 'tech' | 'finance' | 'coder' | 'creative' | 'legal' | null;

export function detectDocumentIntent(query: string): DocType {
    const q = query.toLowerCase();
    if (/\b(pptx?|powerpoint|presentation|slide\s*deck|slides)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'pptx';
    if (/\b(docx?|word\s+doc(?:ument)?|word\s+file)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'docx';
    if (/\bpdf\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'pdf';
    if (/\b(xlsx?|excel|spreadsheet|sheet)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'xlsx';
    if (/\b(csv|comma\s+separated)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'csv';
    if (/\b(tsv|tab\s+separated)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'tsv';
    if (/\b(json|data\s+file)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'json';
    if (/\b(sql|database\s+script|migration)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'sql';
    if (/\b(html|website|web\s+page|ui\s+mockup)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'html';
    if (/\b(markdown|md)\b/i.test(q) &&
        /\b(make|create|generate|build|write|give|produce|prepare)\b/i.test(q)) return 'md';
    if (/\ba\s+(docx?|word\s+doc(?:ument)?)\b/i.test(q)) return 'docx';
    if (/\ba\s+pptx?\b/i.test(q)) return 'pptx';
    if (/\ba\s+pdf\b/i.test(q)) return 'pdf';
    if (/\ba\s+(xlsx?|excel|spreadsheet)\b/i.test(q)) return 'xlsx';
    return null;
}

export function extractTopicFromQuery(query: string): string {
    const q = query.trim();
    // For long multi-sentence prompts, extract the actual topic
    if (q.length > 150 || q.includes('\n')) {
        // Try topic after "about/on/for/covering/titled/called"
        const tm = q.match(/(?:about|on|for|of|covering|titled|called)\s+["""]?([^""".\n]{5,120}?)["""]?(?:\s*[.\n]|$)/i);
        if (tm) return tm[1]!.trim().slice(0, 100);
        // Try task description after "Task:"
        const taskM = q.match(/Task:\s*(.+?)(?:\.\s|$)/i);
        if (taskM) return taskM[1]!.trim().slice(0, 100);
        // First sentence
        const firstSent = q.split(/[.\n]/)[0]?.trim();
        if (firstSent && firstSent.length < 120) return firstSent;
    }
    // Standard cleanup for shorter queries
    return q
        .replace(/\b(generate|create|make|build|write|give|produce|prepare)\s*(me\s+)?(a\s+|an\s+)?/gi, '')
        .replace(/\b(docx?|pdf|pptx?|powerpoint|word\s+doc(?:ument)?|presentation|slide\s*deck|slides?|file|document|report|xlsx?|excel|spreadsheet|csv|tsv|markdown|md)\b/gi, '')
        .replace(/\b(about|with\s+topic|with\s+the\s+topic\s+of|on\s+the\s+topic\s+of|on|regarding|for|covering|with)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100)
        || 'document';
}

