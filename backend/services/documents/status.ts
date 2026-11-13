/**
 * Status message generation.
 *
 * Produces the short, topic-specific loading messages the UI shows while a
 * document is being built. Falls back to sensible defaults when the model call
 * fails.
 */
import { generateText } from 'ai';
import { sendStatus } from '../../http/sse/writers';
import type { ContextualStatusMessages } from './types';
import type { DocType } from './intent';
export async function generateContextualStatusMessages(
    query: string,
    thoughtText: string,
    model: any,
    docType?: DocType,
): Promise<ContextualStatusMessages> {
    const dt = docType ?? null;
    const defaults: ContextualStatusMessages = {
        searching: "Searching the web...",
        reading: "Reading through sources...",
        generating: "Composing response...",
        generatingFile: dt ? `Generating your ${dt.toUpperCase()}...` : "Generating document...",
        readingSkill: dt ? `Reading the ${dt.toUpperCase()} skill` : "Reading the skill rules...",
    };

    try {
        const docCtx = dt
            ? `The user wants a ${dt.toUpperCase()} file generated about this topic.`
            : "The user wants a regular chat response.";

        const { text } = await generateText({
            model,
            system: [
                "You are a UI copywriter for Flux, an AI assistant.",
                "Output ONLY a valid JSON object — no markdown fences, no prose, no backticks.",
                "Every value must be 3–8 words and end with '...'",
                "Messages must be SPECIFIC to the actual topic — never generic filler.",
            ].join(" "),
            messages: [{
                role: "user",
                content: `Write SHORT, SPECIFIC loading status messages for Flux AI.
Each message describes what is happening RIGHT NOW for the given query.

User query: "${(query ?? '').slice(0, 200)}"
AI reasoning notes: "${(thoughtText ?? '').slice(0, 500)}"
Document context: ${docCtx}

Respond ONLY with this JSON (no other text):
{"searching":"...","reading":"...","generating":"...","generatingFile":"...","readingSkill":"..."}

RULES:
1. 3–8 words per message, always end with "..."
2. Be SPECIFIC to the query topic — mention actual subject matter
3. Per-key guidelines:
   "searching"      → what is being looked up        e.g. "Fetching latest GPU benchmark data..."
   "reading"        → what is being analysed          e.g. "Scanning hardware reviews and specs..."
   "generating"     → what answer/text is being built e.g. "Writing your detailed analysis now..."
   "generatingFile" → what ${dt ? dt.toUpperCase() + " file" : "file"} is being built e.g. "${dt ? `Assembling your ${dt.toUpperCase()} now...` : "Building your document now..."}"
    "readingSkill"   → loading format rules for type   e.g. "${dt ? `Reading the ${dt.toUpperCase()} skill` : "Reading the skill rules..."}"

FORBIDDEN (too generic — never write these):
  "Searching the web...", "Reading results...", "Generating document...", "Applying rules..."

GOOD examples (specific — write like these):
  searching:      "Looking up recent quantum computing papers...", "Finding 2025 EV range data..."
  reading:        "Scanning research papers and studies...", "Analysing benchmark comparisons..."
  generating:     "Writing your analysis now...", "Composing the explanation step by step..."
  generatingFile: "Building your climate policy PDF...", "Assembling slides on machine learning..."
  readingSkill:   "Reading the PDF skill...", "Reading the PPTX skill..."`,
            }],
            maxTokens: 200,
        } as any);

        const stripped = text.replace(/```json|```/g, "").trim();
        const firstBrace = stripped.indexOf("{");
        const lastBrace = stripped.lastIndexOf("}");
        if (firstBrace === -1 || lastBrace === -1) return defaults;

        const parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
        return {
            searching: typeof parsed.searching === "string" ? parsed.searching : defaults.searching,
            reading: typeof parsed.reading === "string" ? parsed.reading : defaults.reading,
            generating: typeof parsed.generating === "string" ? parsed.generating : defaults.generating,
            generatingFile: typeof parsed.generatingFile === "string" ? parsed.generatingFile : defaults.generatingFile,
            readingSkill: typeof parsed.readingSkill === "string" ? parsed.readingSkill : defaults.readingSkill,
        };
    } catch (e) {
        console.warn("[STATUS_MSG] generateContextualStatusMessages failed, using defaults:", e);
        return defaults;
    }
}

