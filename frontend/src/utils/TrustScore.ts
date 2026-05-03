export type TrustResult = {
    score: number;          // 0‑100
    explanation?: string;
};

// ------------------------------------------------------
// 1. AUTHORITATIVE SOURCES – 100 % (editorial / gov / official)
//    We store the "registered domain" e.g. "wikipedia.org".
// ------------------------------------------------------
const AUTHORITATIVE_BASES: string[] = [
    // Knowledge / Reference
    "wikipedia.org",
    "britannica.com",
    "merriam-webster.com",
    "dictionary.com",
    "thesaurus.com",
    "wolframalpha.com",
    "mathworld.wolfram.com",
    "arxiv.org",
    "pubmed.ncbi.nlm.nih.gov",
    "ncbi.nlm.nih.gov",
    "doi.org",
    "ieeexplore.ieee.org",
    "scholar.google.com",
    "worldcat.org",
    "openlibrary.org",
    "gutenberg.org",
    "loc.gov",
    "nasa.gov",
    "noaa.gov",
    "usgs.gov",
    "epa.gov",
    "cdc.gov",
    "who.int",
    "un.org",
    "worldbank.org",
    "imf.org",
    "google.com",              // search, scholar, etc. (main domain)
    "microsoft.com",           // official docs, security bulletins
    "apple.com",
    "cloudflare.com",
    "aws.amazon.com",          // official AWS docs
    "stackoverflow.com",       // strong community, but we keep it authoritative

    // Top‑tier news / media (editorial oversight)
    "reuters.com",
    "apnews.com",
    "bbc.com",
    "bbc.co.uk",
    "npr.org",
    "pbs.org",
    "nytimes.com",
    "washingtonpost.com",
    "wsj.com",
    "economist.com",
    "theguardian.com",
    "bloomberg.com",
    "ft.com",
    "aljazeera.com",
    "dw.com",
    "france24.com",
    "snopes.com",
    "factcheck.org",
    "politifact.com",
    "propublica.org",

    // Tech / Science media (editorial)
    "techcrunch.com",
    "theverge.com",
    "venturebeat.com",
    "arstechnica.com",
    "wired.com",
    "zdnet.com",
    "tomshardware.com",
    "anandtech.com",

    // Cybersecurity
    "cisa.gov",
    "us-cert.cisa.gov",
    "krebsonsecurity.com",
    "schneier.com",
    "thehackernews.com",
    "bleepingcomputer.com",
    "threatpost.com",
    "darkreading.com",
    "nist.gov",
    "mitre.org",
    "crowdstrike.com",
    "mandiant.com",
    "paloaltonetworks.com",
    "proofpoint.com",
    "eff.org",
    "torproject.org",
    "chromium.org",
    "webkit.org",
];

// ------------------------------------------------------
// 2. COMMUNITY / USER‑GENERATED SITES – 65 % (useful, but not editorially
//    controlled).  Keep separate to avoid giving them equal weight to CISA.
// ------------------------------------------------------
const COMMUNITY_BASES: string[] = [
    "reddit.com",
    "medium.com",
    "quora.com",
    "github.com",          // code is often correct, but user pages vary
    "gitlab.com",
    "bitbucket.org",
    "codepen.io",
    "codesandbox.io",
    "npmjs.com",
    "pypi.org",
    "crates.io",
    "hub.docker.com",
    "dev.to",
    "hashnode.com",
];

// ------------------------------------------------------
// 3. LOW‑TRUST / SPAMMY – 25 %
// ------------------------------------------------------
const LOW_TRUST_BASES: string[] = [
    "example.com",
    "clickbait-news.com",  // placeholder – add more as you discover them
];

// ------------------------------------------------------
// Helpers
// ------------------------------------------------------
function extractHostname(url: string): string {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        // fallback for malformed URLs
        return url.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
    }
}

/**
 * Check if a hostname belongs to a trusted base domain.
 * Works for any subdomain (e.g. de.wikipedia.org → wikipedia.org) but
 * avoids false matches because we only test exactly our trusted bases.
 */
function hostnameMatchesBase(hostname: string, baseList: string[]): boolean {
    // strip leading "www." for convenience (already handled by hostname extraction)
    const h = hostname.replace(/^www\./, "");
    for (const base of baseList) {
        if (h === base || h.endsWith("." + base)) {
            return true;
        }
    }
    return false;
}

function deterministicBase(hostname: string): number {
    let hash = 5381;
    for (let i = 0; i < hostname.length; i++) {
        hash = ((hash << 5) + hash) + hostname.charCodeAt(i);
    }
    return Math.abs(hash) % 100;
}

// ------------------------------------------------------
// Main score calculation
// ------------------------------------------------------
export function calculateTrustScore(url: string): TrustResult {
    const hostname = extractHostname(url);
    const protocolBonus = url.startsWith("https") ? 10 : 0;

    // 1. Low‑trust → 25 %
    if (hostnameMatchesBase(hostname, LOW_TRUST_BASES)) {
        return { score: 25, explanation: "Flagged as low‑credibility source" };
    }

    // 2. Authoritative → 100 %
    if (hostnameMatchesBase(hostname, AUTHORITATIVE_BASES)) {
        return { score: 100, explanation: "Recognised high‑authority source" };
    }

    // 3. Community / UGC → 65 %
    if (hostnameMatchesBase(hostname, COMMUNITY_BASES)) {
        return { score: 65, explanation: "Community‑vetted site, content may vary" };
    }

    // 4. Government, military, education TLDs → 90+%
    const tld = hostname.split(".").pop() ?? "";
    if (["gov", "mil", "edu"].includes(tld)) {
        return { score: 90 + protocolBonus, explanation: `.${tld} domain is generally trustworthy` };
    }

    // 5. Known security vendor (by name) → 85+%
    const securityNames = [
        "crowdstrike", "mandiant", "fireeye", "paloalto", "proofpoint",
        "trendmicro", "symantec", "mcafee", "kaspersky", "sentinelone",
        "sophos", "rapid7",
    ];
    if (securityNames.some(v => hostname.includes(v))) {
        return { score: 85 + protocolBonus, explanation: "Security vendor website" };
    }

    // 6. Fallback deterministic score (50‑80)
    const base = 50 + (deterministicBase(hostname) % 30) + protocolBonus;
    return { score: Math.min(100, base), explanation: "General site – score based on domain characteristics" };
}