import { extractLiveContent, parseAssistantContent } from "../lib/chat-utils";
import type { Message, MessagePart, Source } from "../types";

export type ConvCacheEntry = { enriched: Message[]; ts: number };

export function enrichConversationMessages(rawMessages: any[]): ConvCacheEntry {
      const enriched = (rawMessages || []).map((msg) => {
        if (!msg) return msg;
        if (msg.role === "Assistant") {
          const storedSources = (msg as any).sources as Source[] | undefined;
          const storedFollowUps = (msg as any).followUps as string[] | undefined;
          const storedThoughtProcess = (msg as any).thoughtProcess as any[] | undefined;
          if (typeof msg.content !== "string") msg.content = "";
          const { answer, followUps: parsedFollowUps } = extractLiveContent(msg.content);
          const finalFollowUps =
            storedFollowUps && storedFollowUps.length > 0 ? storedFollowUps : parsedFollowUps;

          // Check localStorage for persisted parts first
          // The backend may replace a partial stream with a synthesized answer
          // (replace_text). Persisted parts can then be a stale/partial suffix of
          // the final content — rendering them hides most of the answer. If the
          // DB content is materially longer than the joined text parts, drop the
          // stored parts and fall back to rendering the content directly.
          const storedParts = msg.id ? (() => { try { const p = localStorage.getItem(`flux-parts-${msg.id}`); return p ? JSON.parse(p) : null; } catch { return null; } })() : null;
          if (storedParts && Array.isArray(storedParts) && storedParts.length > 0) {
            const joinedTextLen = storedParts.reduce((acc: number, p: any) => acc + (p && p.type === "text" ? String(p.text ?? "").length : 0), 0);
            const contentLen = typeof msg.content === "string" ? msg.content.trim().length : 0;
            if (contentLen > joinedTextLen + 200) {
              try { localStorage.removeItem(`flux-parts-${msg.id}`); } catch {}
              // Do not attach stale parts — render content directly instead.
            } else {
              (msg as any).parts = storedParts;
            }
          } else if (!(msg as any).parts && Array.isArray(storedThoughtProcess) && storedThoughtProcess.length) {
            const parts: MessagePart[] = [];
            let lastTodosIdx = -1;
            for (let tpi = 0; tpi < storedThoughtProcess.length; tpi++) {
              const tp = storedThoughtProcess[tpi];
              if (!tp) continue;
              if (tp.type === "status") {
                const sub = tp.subtype as string;
                const isTerminal = sub.endsWith('_success') || sub.endsWith('_error') || sub.endsWith('_complete');
                
                // Map/merge sandbox status events into code_execution blocks
                if (sub.startsWith('sandbox_')) {
                  const isStart = sub === 'sandbox_start';
                  const lastCodeExec = [...parts].reverse().find(p => p.type === 'code_execution') as any;
                  
                  if (isStart) {
                    parts.push({
                      type: "code_execution",
                      block: {
                        code: tp.data?.command ?? tp.data?.code ?? "",
                        language: tp.data?.tool === "run_python" ? "python" : "bash",
                        outputLines: [],
                        isRunning: true,
                        generatedFiles: []
                      }
                    } as any);
                  } else {
                    if (lastCodeExec && lastCodeExec.block) {
                      lastCodeExec.block.isRunning = false;
                      lastCodeExec.block.exitCode = tp.data?.exitCode ?? (sub === 'sandbox_error' ? 1 : 0);
                      lastCodeExec.block.duration = tp.data?.duration;
                      if (tp.data?.stdout || tp.data?.stderr) {
                        lastCodeExec.block.outputLines = [
                          ...(tp.data.stdout ? tp.data.stdout.split('\n').map((line: string) => ({ type: 'stdout', content: line })) : []),
                          ...(tp.data.stderr ? tp.data.stderr.split('\n').map((line: string) => ({ type: 'stderr', content: line })) : [])
                        ];
                      }
                    } else {
                      parts.push({
                        type: "code_execution",
                        block: {
                          code: tp.data?.command ?? tp.data?.code ?? "",
                          language: tp.data?.tool === "run_python" ? "python" : "bash",
                          outputLines: [
                            ...(tp.data?.stdout ? tp.data.stdout.split('\n').map((line: string) => ({ type: 'stdout', content: line })) : []),
                            ...(tp.data?.stderr ? tp.data.stderr.split('\n').map((line: string) => ({ type: 'stderr', content: line })) : [])
                          ],
                          isRunning: false,
                          exitCode: tp.data?.exitCode,
                          duration: tp.data?.duration,
                          generatedFiles: []
                        }
                      } as any);
                    }
                  }
                  continue;
                }

                // URL fetch phases: collapse the start ('fetching') and completion
                // ('fetched'/'error') events for the same URL into one part, so the
                // row flips from "Fetching" to "Fetched: <title>" instead of
                // rendering two rows.
                if (sub === 'reading') {
                  const url = (tp.data as any)?.url as string | undefined;
                  const prevIdx = url
                    ? parts.findIndex(
                        (p: any) => p.type === 'tool_call' && p.name === 'reading' && p.input?.url === url,
                      )
                    : -1;
                  const terminal = (tp.data as any)?.phase === 'fetched' || (tp.data as any)?.phase === 'error';
                  const statusVal = terminal
                    ? ((tp.data as any)?.phase === 'error' ? 'error' : 'completed')
                    : 'running';
                  if (prevIdx >= 0) {
                    const existing = parts[prevIdx] as any;
                    existing.input = { ...existing.input, ...tp.data };
                    existing.output = tp.message || existing.output;
                    existing.status = statusVal;
                  } else {
                    parts.push({
                      type: 'tool_call',
                      name: 'reading',
                      input: tp.data || {},
                      output: tp.message || '',
                      status: statusVal,
                    } as any);
                  }
                  continue;
                }

                if (isTerminal) {
                  const baseSub = sub.replace(/_(?:success|error|complete)$/, '');
                  let idx = parts.findIndex(
                    p => p.type === 'tool_call' && p.name === baseSub
                  );
                  if (idx < 0) {
                    idx = parts.findIndex(
                      p => p.type === 'tool_call' && p.name === `${baseSub}_start`
                    );
                  }
                  if (idx >= 0) {
                    const existing = parts[idx] as any;
                    existing.status = sub.endsWith('_error') ? 'error' : 'completed';
                    existing.output = tp.message;
                    if (tp.data) {
                      existing.input = { ...existing.input, ...tp.data };
                    }
                  } else {
                    parts.push({
                      type: "tool_call",
                      name: baseSub,
                      input: tp.data || {},
                      output: tp.message || "",
                      status: sub.endsWith('_error') ? 'error' : 'completed',
                    });
                  }
                } else {
                  parts.push({
                    type: "tool_call",
                    name: sub,
                    input: tp.data || {},
                    output: tp.message || "",
                    status: "running",
                  });
                }
              } else if (tp.type === "thought" && tp.content?.trim()) {
                parts.push({ type: "thought", content: tp.content });
              } else if (tp.type === "todos" && tp.items?.length) {
                lastTodosIdx = parts.length;
                parts.push({ type: "todos", items: tp.items });
              }
            }
            // Only keep the last todos entry (replaces in-place like SSE does)
            if (lastTodosIdx >= 0) {
              const lastEntry = parts.splice(lastTodosIdx, 1)[0] as any;
              // Remove any earlier todos entries
              for (let pi = parts.length - 1; pi >= 0; pi--) {
                if (parts[pi]?.type === "todos") parts.splice(pi, 1);
              }
              parts.push(lastEntry);
            }
            // Place the text right after the last search-related tool call, so the
            // visible order is: search disclosure → prose/answer → read/fetch tool
            // disclosures — matching how the streaming UI rendered it.
            if (answer.trim()) {
              const SEARCH_NAMES = new Set(['searching', 'found_sources', 'no_results', 'web_search', 'wiki_search']);
              let insertAt = 0;
              for (let i = parts.length - 1; i >= 0; i--) {
                const p: any = parts[i];
                if (p?.type === 'tool_call' && SEARCH_NAMES.has(p.name)) { insertAt = i + 1; break; }
              }
              parts.splice(insertAt, 0, { type: "text", text: answer });
            }
            (msg as any).parts = parts;
          }

          const msgGenerated = (msg as any).generatedFiles ?? [];
          const msgFileAtt = (msg as any).fileAttachment ?? [];
          if (storedSources && storedSources.length > 0) {
            return { ...msg, content: answer, sources: storedSources, followUps: finalFollowUps, generatedFiles: msgGenerated, fileAttachment: msgFileAtt } as Message;
          }
          const { sources: parsedSources } = parseAssistantContent(msg.content);
          return { ...msg, content: answer, sources: parsedSources.length > 0 ? parsedSources : (msg.sources ?? []), followUps: finalFollowUps, generatedFiles: msgGenerated, fileAttachment: msgFileAtt } as Message;
        }
        if (msg.role === "User") {
          const fileAttachment = (msg as any).fileAttachment as { name: string; content?: string }[] | undefined;
          return { ...msg, fileAttachment: fileAttachment || [] };
        }
        return msg;
      }) as Message[];
      return { enriched, ts: Date.now() };
}
