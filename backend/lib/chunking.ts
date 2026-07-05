export interface PageData {
  page: number;
  text: string;
  images: { base64: string; index: number }[];
  ocr_applied: boolean;
  heading: string | null;
}

export interface ChunkResult {
  index: number;
  text: string;
  heading: string;
  page: number;
  tokenCount: number;
}

export function chunkByHeadings(
  pages: PageData[],
  docName: string,
  maxTokens = 400,
  overlapRatio = 0.15,
): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  let globalIndex = 0;
  let currentHeading = "Introduction";

  for (const page of pages) {
    const sections = splitOnMarkdownHeadings(page.text);
    for (const [heading, body] of sections) {
      if (heading) currentHeading = heading;
      const subChunks = splitFixedWindow(body, maxTokens, overlapRatio);
      for (const sub of subChunks) {
        const contextualized = `Document: ${docName} | Section: ${currentHeading}\n\n${sub}`;
        chunks.push({
          index: globalIndex++,
          text: contextualized,
          heading: currentHeading,
          page: page.page,
          tokenCount: estimateTokens(contextualized),
        });
      }
    }
  }

  return chunks;
}

function splitOnMarkdownHeadings(text: string): Array<[string | null, string]> {
  const sections: Array<[string | null, string]> = [];
  let lastIndex = 0;
  let lastHeading: string | null = null;

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      if (i > lastIndex) {
        sections.push([lastHeading, lines.slice(lastIndex, i).join("\n").trim()]);
      }
      lastHeading = match[2]!.trim();
      lastIndex = i;
    }
  }

  if (lastIndex < lines.length) {
    sections.push([lastHeading, lines.slice(lastIndex).join("\n").trim()]);
  }

  if (sections.length === 0 && text.trim()) {
    sections.push([null, text.trim()]);
  }

  return sections.filter(([, body]) => body.length > 0);
}

function splitFixedWindow(text: string, maxTokens: number, overlapRatio: number): string[] {
  const estimatedTotalTokens = estimateTokens(text);
  if (estimatedTotalTokens <= maxTokens) return [text];

  const chunks: string[] = [];
  const words = text.split(/\s+/);
  const maxWords = maxTokens * 3;
  const overlapWords = Math.round(maxWords * overlapRatio);
  const step = maxWords - overlapWords;

  for (let i = 0; i < words.length; i += step) {
    const slice = words.slice(i, i + maxWords);
    if (slice.length === 0) break;
    chunks.push(slice.join(" "));
  }

  return chunks;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
