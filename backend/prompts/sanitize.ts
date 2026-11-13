export function cleanAnswerChunk(text: string): string {
    if (!text) return "";
    let cleaned = text;
    // Remove <THOUGHT>/<think> blocks entirely
    cleaned = cleaned.replace(/<(?:THOUGHT|think)>[\s\S]*?<\/(?:THOUGHT|think)>/gi, '');
    // Remove leftover tags
    cleaned = cleaned
        .replace(/<\/?(?:THOUGHT|think)>/gi, '')
        .replace(/<\/?ANSWER>/gi, '')
        .replace(/<\/?FOLLOW_UPS>/gi, '')
        .replace(/<\/?SEARCH_QUERY>/gi, '');
    // Remove <question> tags (keep content)
    cleaned = cleaned.replace(/<\/?question>/gi, '');
    return cleaned.trim();
}

// ── Strict thought sanitisation – removes any accidental answer content ──
export function sanitizeThought(text: string): string {
    const lines = text.split('\n');
    const clean: string[] = [];
    const answerIndicators = [
        /^(The answer is|Here is|Here’s|To summarize|In conclusion|The capital is|The weather is|Right now|Let me|I recommend|You should)/i,
        /^[*-]\s/,
        /^(\d+\.)\s/,
        /^[A-Z][a-z\s]{20,}[:;]?\s*$/,
        /^---$/,
    ];
    for (const line of lines) {
        if (answerIndicators.some(r => r.test(line.trim()))) break;
        clean.push(line);
    }
    return clean.join('\n').trim();
}

