// ─── Robust JSON parser (handles LLM truncation / trailing commas) ────────

/** Stateful pass: replace literal control characters that appear INSIDE JSON
 *  string literals with proper escape sequences. Structural whitespace between
 *  tokens is left untouched. Must run after invalid-escape sanitisation so the
 *  escape-pair walker sees a clean backslash state. */
export function fixControlChars(s: string): string {
    const out: string[] = [];
    let inStr = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i]!;
        if (inStr) {
            if (c === '\\') { out.push(c); if (i + 1 < s.length) out.push(s[++i]!); }
            else if (c === '"') { inStr = false; out.push(c); }
            else if (c === '\n') { out.push('\\n'); }
            else if (c === '\r') { out.push('\\r'); }
            else if (c === '\t') { out.push('\\t'); }
            else if (c < ' ') { /* drop other ASCII control chars */ }
            else { out.push(c); }
        } else {
            if (c === '"') inStr = true;
            out.push(c);
        }
    }
    return out.join('');
}

/**
 * Stateful pass: escape bare double-quote characters that appear INSIDE JSON
 * string values (e.g. LaTeX labels like "AABB", code like player.state = "jumping").
 *
 * A `"` inside a string is treated as a closing delimiter only when it is
 * immediately followed (ignoring inline spaces/tabs) by a JSON structural
 * character: , } ] : or end-of-input or a newline (since multi-line JSON uses
 * real newlines between tokens, not inside values).
 *
 * Must run BEFORE fixControlChars so that fixControlChars sees correct inStr
 * state and doesn't misidentify LaTeX braces as JSON structure.
 */
export function fixUnescapedQuotes(s: string): string {
    const out: string[] = [];
    let inStr = false;

    for (let i = 0; i < s.length; i++) {
        const c = s[i]!;

        // Always forward escape pairs intact (handles \", \\, \n, \uXXXX, etc.)
        if (c === '\\' && inStr) {
            out.push(c);
            if (i + 1 < s.length) out.push(s[++i]!);
            continue;
        }

        if (c === '"') {
            if (!inStr) {
                // Opening a new string
                inStr = true;
                out.push(c);
                continue;
            }

            // Inside a string: is this `"` a real closing delimiter or an
            // embedded bare quote?  Look ahead past inline horizontal space.
            let j = i + 1;
            while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j++;
            const next = j < s.length ? s[j] : '';

            // Treat as closing if followed by a structural token or line-end
            const isClosing = next === '' || next === ',' || next === '}'
                || next === ']' || next === ':' || next === '\n'
                || next === '\r';

            if (isClosing) {
                inStr = false;
                out.push(c);
            } else {
                // Embedded bare quote — escape it so downstream parsers don't
                // flip their inStr state incorrectly
                out.push('\\', '"');
            }
            continue;
        }

        out.push(c);
    }
    return out.join('');
}

/**
 * Best-effort JSON parser that survives every common way LLMs mangle output:
 *  ① markdown fences  ② leading/trailing prose  ③ invalid escapes (\-, \(…)
 *  ④ bare " inside string values (LaTeX labels, quoted code strings)
 *  ⑤ literal newlines inside strings  ⑥ trailing commas  ⑦ truncation /
 *    missing closing braces  ⑧ unterminated string at end of output
 */
export function robustParseJSON(raw: string): any {
    if (!raw?.trim()) throw new Error('robustParseJSON: empty input');

    // 1. Strip markdown code fences (handles ```json, ```JSON, plain ```)
    let s = raw.trim()
        .replace(/^`{3,}(?:json|JSON)?\s*/m, '')
        .replace(/\s*`{3,}\s*$/m, '');

    // 2. Strip accidental doubled opening brace
    while (s.startsWith('{{')) s = s.slice(1);

    // 3. Seek the first JSON container character ({ or [).
    //    The model sometimes prepends a sentence before the JSON.
    const braceIdx = s.indexOf('{');
    const bracketIdx = s.indexOf('[');
    if (braceIdx === -1 && bracketIdx === -1)
        throw new Error('robustParseJSON: no JSON structure found in response');
    const startIdx = braceIdx === -1 ? bracketIdx
        : bracketIdx === -1 ? braceIdx
            : Math.min(braceIdx, bracketIdx);
    s = s.slice(startIdx);

    // 4. Fix invalid escape sequences (\- \( \) \. etc. — not legal in JSON)
    s = s.replace(/\\([^"\\\/bfnrtu])/g, (_, c: string) => c);

    // 4.5. Escape bare double-quotes inside string values BEFORE fixControlChars
    //      so that the control-char walker's inStr state is never thrown off by
    //      unescaped " from LaTeX labels ("AABB") or code ("jumping").
    s = fixUnescapedQuotes(s);

    // 5. Fix literal control chars inside strings (raw 0x0A → \n, etc.)
    s = fixControlChars(s);

    // 6. Happy path
    try { return JSON.parse(s); } catch { /* fall through */ }

    // 7. Find the longest structurally-complete prefix by tracking brace depth
    {
        const depth: ('brace' | 'bracket')[] = [];
        let inStr = false, esc = false, lastGoodPos = 0;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (esc) { esc = false; continue; }
            if (c === '\\' && inStr) { esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (c === '{') depth.push('brace');
            else if (c === '[') depth.push('bracket');
            else if (c === '}') { if (depth.at(-1) === 'brace') depth.pop(); }
            else if (c === ']') { if (depth.at(-1) === 'bracket') depth.pop(); }
            if (depth.length === 0) lastGoodPos = i + 1;
        }
        if (lastGoodPos > 0)
            try { return JSON.parse(s.slice(0, lastGoodPos)); } catch { /* continue */ }
    }

    // 8. Aggressive repair: strip trailing incomplete fragments
    let repaired = s
        .replace(/,?\s*"[^"]*"\s*:\s*"[^"]*$/s, '')  // truncated string value
        .replace(/,?\s*"[^"]*"\s*:\s*\[[^\]]*$/s, '')  // truncated array value
        .replace(/,?\s*"[^"]*"\s*:\s*\{[^}]*$/s, '')  // truncated object value
        .replace(/,?\s*"[^"]*"\s*:\s*[^,\]{}"]*$/s, '') // truncated scalar
        .replace(/,?\s*"[^"]*"\s*:\s*$/s, '')  // key with no value
        .replace(/,?\s*"[^"]*"\s*$/s, '')  // dangling key
        .replace(/,\s*$/s, ''); // trailing comma

    // Close any unterminated string (odd number of unescaped quotes)
    const unescapedQuotes = repaired.match(/(?<!\\)"/g)?.length ?? 0;
    if (unescapedQuotes % 2 !== 0) repaired += '"';

    // Close all open braces/brackets
    const rDepth: ('brace' | 'bracket')[] = [];
    {
        let inStr2 = false, esc2 = false;
        for (let i = 0; i < repaired.length; i++) {
            const c = repaired[i];
            if (esc2) { esc2 = false; continue; }
            if (c === '\\' && inStr2) { esc2 = true; continue; }
            if (c === '"') { inStr2 = !inStr2; continue; }
            if (inStr2) continue;
            if (c === '{') rDepth.push('brace');
            else if (c === '[') rDepth.push('bracket');
            else if (c === '}') { if (rDepth.at(-1) === 'brace') rDepth.pop(); }
            else if (c === ']') { if (rDepth.at(-1) === 'bracket') rDepth.pop(); }
        }
    }
    const suffix = rDepth.reduceRight((acc, t) => acc + (t === 'brace' ? '}' : ']'), '');

    try { return JSON.parse(repaired + suffix); } catch (e) {
        throw new Error(
            `robustParseJSON: all repair strategies exhausted. ` +
            `Last attempt (truncated): "${(repaired + suffix).slice(0, 300)}"`
        );
    }
}

