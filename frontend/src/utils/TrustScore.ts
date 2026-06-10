// src/utils/TrustScore.ts
//
// Calculates a Trust Score for a given URL based on its domain.
// Used for web search result ranking and citation validation.

export type TrustScoreResult = {
  score: number;
  reason: string;
  category: "high" | "medium" | "low" | "unverified";
};

// ─── Trusted Domains (High) ──────────────────────────────────
const TRUSTED_DOMAINS = [
  "wikipedia.org",
  "reuters.com",
  "apnews.com",
  "nytimes.com",
  "bbc.com",
  "bbc.co.uk",
  "nature.com",
  "sciencemag.org",
  "arxiv.org",
  "gov",
  "edu",
  "ieee.org",
  "github.com",
  "stackoverflow.com",
  "mdn.io",
  "mozilla.org",
  "microsoft.com",
  "apple.com",
  "google.com",
];

// ─── Medium Trust Domains ──────────────────────────────────
const MEDIUM_TRUST_DOMAINS = [
  "medium.com",
  "substack.com",
  "forbes.com",
  "bloomberg.com",
  "techcrunch.com",
  "theverge.com",
  "wired.com",
  "reddit.com",
];

// ─── Low Trust / Suspicious ──────────────────────────────────
const LOW_TRUST_DOMAINS = [
  "dailymail.co.uk",
  "foxnews.com",
  "buzzfeed.com",
  "tabloid",
];

/**
 * Calculates a 0-100 trust score for a URL.
 */
export function calculateTrustScore(url: string | undefined): TrustScoreResult {
  if (!url) {
    return { score: 0, reason: "No URL provided", category: "unverified" };
  }

  try {
    const domain = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    
    // Check for exact matches or TLDs (e.g. .gov, .edu)
    if (TRUSTED_DOMAINS.some(d => domain === d || domain.endsWith("." + d))) {
      return { score: 95, reason: "Verified authoritative source", category: "high" };
    }

    if (MEDIUM_TRUST_DOMAINS.some(d => domain === d || domain.endsWith("." + d))) {
      return { score: 70, reason: "Established media or community source", category: "medium" };
    }

    if (LOW_TRUST_DOMAINS.some(d => domain === d || domain.endsWith("." + d))) {
      return { score: 30, reason: "Source known for bias or low factual consistency", category: "low" };
    }

    // Default for unknown but valid domains
    return { score: 50, reason: "Unverified third-party source", category: "unverified" };
  } catch {
    return { score: 0, reason: "Invalid URL format", category: "unverified" };
  }
}

/**
 * Normalises a URL to its primary domain for display.
 */
export function getDomain(url: string | undefined): string {
  if (!url) return "unknown";
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    return url ?? "unknown";
  }
}
