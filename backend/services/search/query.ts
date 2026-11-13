export const STOPWORDS = new Set([
    'the','a','an','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','could',
    'should','may','might','can','shall','to','of','in','for',
    'on','with','at','by','from','as','into','through','during',
    'before','after','above','below','between','out','off','over',
    'under','again','further','then','once','here','there','when',
    'where','why','how','all','each','every','both','few','more',
    'most','other','some','such','no','nor','not','only','own',
    'same','so','than','too','very','just','because','about',
    'what','which','who','whom','this','that','these','those',
    'it','its','it\'s','and','but','or','if','while','up','down',
    'get','got','does','doesn\'t','don\'t','won\'t','can\'t',
]);

export function extractTokens(s: string): string[] {
    return s.toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

/** Returns proper nouns: PascalCase words (not at position 0) + known Indian city/landmark names */
export function extractProperNouns(text: string): string[] {
    const words = text.split(/\s+/);
    const out: string[] = [];
    for (let i = 0; i < words.length; i++) {
        const w = (words[i] ?? '').replace(/[^a-zA-Z0-9]/g, '');
        if (!w) continue;
        // PascalCase (not first word, length > 2)
        if (/^[A-Z][a-z]{1,}/.test(w) && i > 0) out.push(w.toLowerCase());
        // Indian geography / landmark names
        if (/^(nagpur|mumbai|delhi|pune|gujarat|kerala|goa|rajasthan|agra|jaipur|varanasi|chennai|kolkata|bangalore|hyderabad|ahmedabad|vadodara|baroda|kevadiya|statue|unity|patel|sardar|ajanta|ellora|shirdi|aurangabad|lonavala|mahabaleshwar|manali|shimla|rishikesh|haridwar|mathura|dwarka|coorg|ooty|munnar|alleppey|kasauli|darjeeling|gangtok|leh|ladakh)$/i.test(w)) {
            out.push(w.toLowerCase());
        }
    }
    return [...new Set(out)];
}

export function isQueryRelevant(userQuery: string, modelQuery: string): boolean {
    const uTokens = extractTokens(userQuery);
    const mTokens = extractTokens(modelQuery);

    if (mTokens.length === 0) return false;
    if (uTokens.length === 0) return true;

    const mLower = modelQuery.toLowerCase();

    // Hard gate: user query has ≥2 proper nouns but model query has ZERO of them
    // This is the instruction-echo signature — reject it
    const uProperNouns = extractProperNouns(userQuery);
    if (uProperNouns.length >= 2) {
        const hits = uProperNouns.filter(pn => mLower.includes(pn));
        if (hits.length === 0) return false;
    }

    // Require stricter overlap for long user queries (more entities = higher bar)
    const overlapping = mTokens.filter((t: string) => uTokens.includes(t));
    const minRequired = uTokens.length > 5 ? 2 : 1;
    if (overlapping.length >= minRequired) return true;

    // Bigram phrase check
    for (let i = 0; i < uTokens.length - 1; i++) {
        const bigram = `${uTokens[i]} ${uTokens[i + 1]}`;
        if (mLower.includes(bigram)) return true;
    }

    return false;
}

// ── Smart query rewriting ────────────────────────────────────────────────────

export const INSTRUCTION_ECHO_RE = /^(search\s+(for|up|about|the|on|regarding)?\s*|look\s+up\s+|find\s+(out\s+)?(about\s+)?|tell\s+me\s+(about\s+|the\s+)?|show\s+me\s+|get\s+(me\s+)?|what\s+(is|are|does|were)\s+|can\s+you\s+(find|search|tell|show)\s+|please\s+(search|find|look\s+up)?\s+|i\s+(want|need)\s+to\s+(find|know|search)(\s+about)?\s+)/gi;
export const TRAVEL_FILLER_RE = /^(tours?\s+and\s+travels?\s+(for\s+(visiting|going\s+to)?\s*|to\s+)?|travel\s+(to|for)\s+|visit(?:ing)?\s+(to\s+)?)/i;
export const TRAILING_NOISE_RE = /\s*(,\s*)?(and\s+)?(please|for\s+me|right\s+now|asap|as\s+well|also|too|with\s+details?|in\s+detail)\.?$/gi;
export const PRICE_SUFFIX_RE = /\s+(and\s+)?(prices?|costs?|pricing|fees?|charges?|rates?)\s+too\.?$/i;

/**
 * Strips instruction-echo prefixes and travel filler from a model-generated query.
 * Returns cleaned query string, or null if nothing meaningful remains or the
 * query is missing key proper nouns from the original user request.
 */
export function cleanAndValidateModelQuery(modelQuery: string, userQuery: string): string | null {
    let q = modelQuery.trim();

    // Strip instruction prefixes iteratively
    let prev = '';
    while (prev !== q) {
        prev = q;
        q = q.replace(INSTRUCTION_ECHO_RE, '').trim();
        q = q.replace(TRAVEL_FILLER_RE, '').trim();
    }
    q = q.replace(TRAILING_NOISE_RE, '').trim();

    // Preserve price intent: if original had "prices" but we stripped it, add back
    if (PRICE_SUFFIX_RE.test(modelQuery) && !/\bpric/i.test(q)) q += ' prices';

    q = q.replace(/\s{2,}/g, ' ').trim();
    if (!q || q.length < 5) return null;

    const cleanedTokens = extractTokens(q);
    if (cleanedTokens.length < 2) return null;

    // Reject if user query has ≥2 proper nouns and cleaned query contains none of them
    const userProperNouns = extractProperNouns(userQuery);
    if (userProperNouns.length >= 2) {
        const qLower = q.toLowerCase();
        const hits = userProperNouns.filter(pn => qLower.includes(pn));
        if (hits.length === 0) return null;
    }

    return q;
}

/**
 * Entity-priority query extraction from the raw user message.
 * Used when the model generates instruction echo or missing-entity queries.
 */
export function extractEntityQuery(userQuery: string): string {
    const currentYear = new Date().getFullYear().toString();

    // Strip instruction preamble from user query
    let q = userQuery.trim();
    let prev = '';
    while (prev !== q) { prev = q; q = q.replace(INSTRUCTION_ECHO_RE, '').trim(); }
    q = q
        .replace(TRAVEL_FILLER_RE, '')
        .replace(/\s+and\s+travels?\s+/i, ' ')
        .replace(/\s+for\s+visiting\s+/i, ' ')
        .replace(PRICE_SUFFIX_RE, (m) => /pric/i.test(m) ? ' prices' : '')
        .replace(/\s+(please|for\s+me)\.?$/i, '')
        .replace(/\s{2,}/g, ' ').trim();

    const words = q.split(/\s+/).filter(Boolean);

    // Score each word for search-query usefulness
    const scored = words.map((word, i) => {
        const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!lower || lower.length < 2) return { word, score: -99, i };

        let score = 0;
        if (STOPWORDS.has(lower)) return { word, score: -5, i };

        // Proper noun (PascalCase, not position 0)
        if (/^[A-Z]/.test(word) && i > 0) score += 8;
        // Known Indian cities / landmarks
        if (/^(nagpur|mumbai|delhi|pune|gujarat|kerala|goa|rajasthan|agra|jaipur|varanasi|chennai|kolkata|bangalore|hyderabad|ahmedabad|vadodara|baroda|kevadiya|statue|unity|patel|sardar|ajanta|ellora|shirdi|aurangabad|lonavala|manali|shimla|rishikesh|haridwar|mathura|dwarka|coorg|ooty|munnar|alleppey|kasauli|darjeeling|ladakh)$/i.test(lower)) score += 14;
        // Tourism / product nouns
        if (/^(tour|tours|package|packages|ticket|tickets|hotel|resort|bus|train|flight|price|prices|cost|costs|entry|visit|trip|travel|stay|booking|itinerary)$/i.test(lower)) score += 5;
        // Verification / fact-check intent
        if (/^(verify|check|confirm|validate|prove|disprove|debunk|legitimate|authentic|true|false|claim|rumor)$/i.test(lower)) score += 6;
        // Word immediately after "from" or "to" in travel context
        if (i > 0 && /^(from|to|via)$/i.test(words[i - 1] ?? '')) score += 7;
        // Year
        if (/^20[0-9]{2}$/.test(word)) score += 4;
        // Generic prepositions
        if (/^(from|to|via|and|or|in|at|near|around|for)$/i.test(lower)) score -= 2;
        // Length bonus
        if (lower.length >= 4) score += 1;

        return { word, score, i };
    });

    const kept = scored
        .filter(s => s.score > -4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 9)
        .sort((a, b) => a.i - b.i)
        .map(s => s.word);

    // Add year for time-sensitive queries
    const resultStr = kept.join(' ');
    const hasYear = /\b20[0-9]{2}\b/.test(resultStr);
    const isTimeSensitive = /\b(price|cost|tour|package|hotel|travel|news|latest|current|today|now|recent|deal|offer|rate|schedule|ticket)\b/i.test(resultStr);
    if (!hasYear && isTimeSensitive && kept.length < 9) kept.push(currentYear);

    return kept.join(' ');
}

/**
 * Master query rewriter. Takes the raw model query + original user message.
 * Returns 1 clean, entity-rich, Tavily-ready query string.
 *
 * Flow: try to salvage model query → if instruction echo, extract from user query.
 */
export function smartRewriteQuery(rawModelQuery: string, userQuery: string): string {
    const TAVILY_MAX = 395;
    const currentYear = new Date().getFullYear().toString();

    // 1. Try to salvage model's query
    const cleaned = cleanAndValidateModelQuery(rawModelQuery, userQuery ?? rawModelQuery);

    let finalQuery: string;
    if (cleaned) {
        finalQuery = cleaned;
        // Add year for time-sensitive queries if absent
        const hasYear = /\b20[0-9]{2}\b/.test(finalQuery);
        const isTimeSensitive = /\b(price|cost|tour|package|hotel|deal|latest|news|current|ticket|schedule)\b/i.test(finalQuery);
        if (!hasYear && isTimeSensitive) {
            const words = finalQuery.split(/\s+/);
            if (words.length < 9) finalQuery += ` ${currentYear}`;
        }
        // Smart truncation to 10 words: preserve entity-dense words
        const words = finalQuery.split(/\s+/).filter(Boolean);
        if (words.length > 10) {
            const scored = words.map((w, i) => ({
                w, i,
                s: (STOPWORDS.has(w.toLowerCase()) ? -2 : 0)
                 + (/^[A-Z]/.test(w) ? 4 : 0)
                 + (/^20[0-9]{2}$/.test(w) ? 3 : 0)
                 + (/\b(price|tour|package|hotel|from|nagpur|statue|unity)\b/i.test(w) ? 3 : 0)
                 + (i < 3 || i >= words.length - 2 ? 1 : 0),
            }));
            finalQuery = scored
                .sort((a, b) => b.s - a.s)
                .slice(0, 10)
                .sort((a, b) => a.i - b.i)
                .map(s => s.w)
                .join(' ');
        }
    } else {
        // 2. Model query was instruction echo or missing entities — extract from user query
        finalQuery = extractEntityQuery(userQuery ?? rawModelQuery);
        console.log(`[TOOL] web_search — rewrote instruction echo to entity query: "${finalQuery}"`);
    }

    return finalQuery.slice(0, TAVILY_MAX);
}

