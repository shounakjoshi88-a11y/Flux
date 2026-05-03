// src/lib/chat-utils.ts
export type Source = { url: string };

export function parseAssistantContent(raw: string) {
  const sourcesRegex = /<SOURCES>([\s\S]*?)<\/SOURCES>/;
  const sourcesMatch = raw.match(sourcesRegex);
  const content = raw.replace(sourcesRegex, "").trim();
  const sources = (() => {
    if (!sourcesMatch?.[1]) return [] as Source[];
    try {
      const parsed = JSON.parse(sourcesMatch[1]) as Source[];
      return parsed.filter((item) => item?.url);
    } catch {
      return [] as Source[];
    }
  })();
  return { content, sources };
}

export function parseAssistantSections(content: string) {
  const answerMatch = content.match(/<ANSWER>([\s\S]*?)<\/ANSWER>/i);
  const followUpsMatch = content.match(/<FOLLOW_UPS>([\s\S]*?)<\/FOLLOW_UPS>/i);

  const rawAnswer = answerMatch?.[1] ?? content;
  const answer = rawAnswer
    .replace(/<\/?ANSWER>/gi, "")
    .replace(/<\/?FOLLOW_UPS>/gi, "")
    .replace(/<\/?question>/gi, "")
    .trim();

  const followUpScope = followUpsMatch?.[1] ?? content;
  const matches = followUpScope.match(/<question>(.*?)<\/question>/gi) ?? [];
  const followUps = Array.from(
    new Set(matches.map((q) => q.replace(/<\/?question>/gi, "").trim()).filter(Boolean))
  ).slice(0, 3);

  return { answer, followUps };
}

/**
 * Robust extraction that works even if only closing tags are present.
 * Used for both live streaming and historical message loading.
 */
export function extractLiveContent(raw: string): {
  answer: string;
  followUps: string[];
} {
  let answer = "";
  let followUps: string[] = [];

  // Extract answer between <ANSWER>…</ANSWER>, even if opening tag missing
  const answerStart = raw.indexOf("<ANSWER>");
  const answerEnd = raw.indexOf("</ANSWER>");

  if (answerStart !== -1) {
    const startIdx = answerStart + "<ANSWER>".length;
    const endIdx = answerEnd !== -1 ? answerEnd : raw.length;
    answer = raw.slice(startIdx, endIdx).trim();
  } else if (answerEnd !== -1) {
    // No opening tag, but closing tag exists – take everything before closing
    answer = raw.slice(0, answerEnd).trim();
  } else {
    // No tags at all – use the whole raw string
    answer = raw.trim();
  }

  // Extract follow‑up questions
  const followStart = raw.indexOf("<FOLLOW_UPS>");
  const followEnd = raw.indexOf("</FOLLOW_UPS>");

  if (followStart !== -1) {
    const startIdx = followStart + "<FOLLOW_UPS>".length;
    const endIdx = followEnd !== -1 ? followEnd : raw.length;
    const section = raw.slice(startIdx, endIdx);
    const questionMatches = section.matchAll(/<question>(.+?)<\/question>/gs);
    followUps = Array.from(questionMatches, (m) => (m[1] as string).trim());
  }

  return { answer, followUps };
}

export function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "unknown-source";
  }
}