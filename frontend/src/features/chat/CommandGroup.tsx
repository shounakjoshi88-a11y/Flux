/**
 * CommandGroup — claude.ai's aggregated tool-call disclosure.
 *
 * Consecutive non-search tool calls (bash, file reads/writes, other tools)
 * render as ONE 20px row — "Ran 3 commands, read 2 files" — which expands
 * into a hairline-divided card containing one nested disclosure per tool
 * call (each "Ran a command" row expands further to show the highlighted
 * command/output). While any member of the group is still streaming the row
 * shows the running indicator instead of the caret.
 *
 * Row label is built Claude's way: the counts of each tool family, the
 * first capitalized, the rest lowercase, Oxford-joined ("Ran 2 commands,
 * read a file, and used 1 other tool").
 */
import type { MessagePart, Source } from "../../types";
import { ToolRow, ToolPanel, ToolSection, useToolDisclosure } from "./ToolActivity";
import StatusMessage from "./StatusMessage";

type ToolCallPart = MessagePart & { type: "tool_call" };

type ToolFamily = "command" | "fetch" | "read" | "write" | "other";

function classify(name: string, input?: any): ToolFamily {
  // URL fetches are not file reads — a `read_url` call reads a web page / PDF
  // over HTTP, never the local filesystem.
  if (/^https?:\/\//i.test(String(input?.url ?? "")) || /url|fetch|http/i.test(name)) return "fetch";
  if (/bash|python|sandbox|terminal|run|exec|shell/i.test(name)) return "command";
  if (/write|create|edit|delete|append|generat/i.test(name)) return "write";
  if (/read|cat|get|open|file|list/i.test(name)) return "read";
  return "other";
}

/** Claude's phrasing: "Ran 3 commands, read 2 files, and used 1 other tool". */
function aggregateLabel(parts: ToolCallPart[]): string {
  const counts: Record<ToolFamily, number> = { command: 0, fetch: 0, read: 0, write: 0, other: 0 };
  for (const p of parts) counts[classify(p.name ?? "", p.input)] += 1;
  const segs: string[] = [];
  if (counts.command) segs.push(counts.command === 1 ? "Ran a command" : `Ran ${counts.command} commands`);
  if (counts.fetch) segs.push(counts.fetch === 1 ? "read a page" : `read ${counts.fetch} pages`);
  if (counts.read) segs.push(counts.read === 1 ? "read a file" : `read ${counts.read} files`);
  if (counts.write) segs.push(counts.write === 1 ? "wrote a file" : `wrote ${counts.write} files`);
  if (counts.other) segs.push(`used ${counts.other} other tool${counts.other > 1 ? "s" : ""}`);
  if (segs.length === 0) return "Tool calls";
  if (segs.length === 1) return segs[0]!;
  if (segs.length === 2) return segs.join(" and ");
  return `${segs.slice(0, -1).join(", ")}, and ${segs[segs.length - 1]}`;
}

export function CommandGroup({
  parts,
  isStreaming,
}: {
  parts: MessagePart[];
  isStreaming: boolean;
}) {
  const { open, toggle } = useToolDisclosure(true);
  const toolParts = parts as ToolCallPart[];
  const isActive = isStreaming && toolParts.some((p) => p.status === "running");

  return (
    <div className="mb-0.5 min-w-0">
      <ToolRow label={aggregateLabel(toolParts)} open={open} onToggle={toggle} isActive={isActive} />
      <ToolPanel open={open}>
        {toolParts.map((tp, idx) => (
          <ToolSection key={idx} className="py-1.5">
            <StatusMessage
              status={{
                type: "tool_call",
                subtype: tp.name,
                message: tp.output || "",
                data: {
                  args: tp.input,
                  result: tp.output,
                  status: tp.status,
                  path: tp.input?.path,
                  filename: tp.input?.filename,
                  content: tp.input?.content,
                  language: tp.input?.language,
                  ...(tp.input || {}),
                },
              }}
              isFirst={false}
              isLast={false}
              isActive={isStreaming && tp.status === "running"}
              showRail={false}
            />
          </ToolSection>
        ))}
      </ToolPanel>
    </div>
  );
}
