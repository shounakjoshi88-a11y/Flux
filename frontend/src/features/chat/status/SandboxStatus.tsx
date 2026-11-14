/**
 * SandboxStatus — the sandbox steps (run_bash / run_python / install_package).
 *
 * Extracted from `features/chat/StatusMessage.tsx`. Renders the terminal block
 * with the command output and the success / error framing around it.
 *
 * Returns `null` for any other subtype.
 */
import { StepRow, TimelineNode } from "../ThoughtBlock";
import { TerminalBlock } from "../TerminalBlock";
import type { StatusBlockProps } from "./types";

const SUBTYPES = new Set(["sandbox_start", "sandbox_success", "sandbox_error"]);

/** True when this family renders the given status subtype. */
export function handles(subtype: string): boolean {
  return SUBTYPES.has(subtype);
}

function SandboxStatusComponent({
  status,
  isFirst,
  isLast,
  isActive,
  onSourceClick,
  rightSlot,
}: StatusBlockProps) {
  if (!SUBTYPES.has(status.subtype)) return null;

  // ─── sandbox: run_bash / run_python / install_package ────────────────────
  if (
    status.subtype === "sandbox_start" ||
    status.subtype === "sandbox_success" ||
    status.subtype === "sandbox_error"
  ) {
    const command: string = status.data?.command ?? status.data?.code ?? "";
    const tool: string = status.data?.tool ?? "run_bash";
    const exitCode: number | undefined = status.data?.exitCode;
    const stdout: string | undefined = status.data?.stdout;
    const stderr: string | undefined = status.data?.stderr;
    const errorMsg: string | undefined = status.data?.error;
    const isRunning = status.subtype === "sandbox_start";
    const isSuccess = status.subtype === "sandbox_success";
    const isError = status.subtype === "sandbox_error";

    // Determine language label
    const langLabel =
      tool === "run_python" ? "python"
        : tool === "install_package" ? "bash"
          : tool === "bash_fallback" ? "bash"
            : "bash";

    // Icon — terminal for bash, python symbol for python, package for install
    const termIconEl = (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"
        className={`size-4 shrink-0 ${isRunning && isActive ? "text-[var(--accent)]"
          : isSuccess ? "text-emerald-400/70"
            : isError ? "text-red-400/70"
              : "text-[var(--text-secondary)]/40"
          }`}>
        <rect x="2" y="3.5" width="16" height="13" rx="2" />
        <polyline points="5.5,8 8,10.5 5.5,13" strokeWidth="1.5" />
        <line x1="9.5" y1="13" x2="14.5" y2="13" strokeWidth="1.3" />
      </svg>
    );

    // Parse duration from the success message e.g. "Bash finished (exit 0, 1.5s)"
    const durationMatch = status.message.match(/(\d+\.?\d*s)\)/);
    const durationStr = durationMatch?.[1];

    // For install_package, there's no command — synthesize one for display
    const displayCommand = command || (tool === 'install_package' && status.data?.package ? `pip install ${status.data.package}` : '');

    return (
      <div className="flex gap-2.5">
        <TimelineNode icon={termIconEl} isFirst={isFirst} isLast={isLast} />
        <div className="py-2 min-w-0 flex-1">
          {/* Header label */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">
              {status.message}
            </span>
            {rightSlot && <span className="inline-flex shrink-0 align-middle">{rightSlot}</span>}
          </div>

          {/* Terminal block with command + output */}
          {displayCommand && (
            <TerminalBlock
              command={displayCommand}
              language={langLabel}
              isRunning={isRunning && !!isActive}
              exitCode={isSuccess ? (exitCode ?? 0) : isError ? (exitCode ?? 1) : undefined}
              durationStr={durationStr}
              stdout={stdout}
              stderr={stderr}
              error={errorMsg}
            />
          )}

          {/* Success / error micro-badge when no command data */}
          {!displayCommand && (exitCode !== undefined || isError) && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {exitCode !== undefined && (
                <span className={`text-[11px] font-mono rounded border px-1.5 py-[2px] ${exitCode === 0
                  ? 'bg-emerald-500/8 text-emerald-400/80 border-emerald-500/20'
                  : 'bg-red-500/8 text-red-400/80 border-red-500/20'
                  }`}>
                  exit {exitCode}
                </span>
              )}
              {durationStr && (
                <span className="text-[11px] text-[var(--text-muted)]">{durationStr}</span>
              )}
            </div>
          )}

          {isLast && (
            <div className="flex items-center h-4 mt-1">
              <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">Done</span>
            </div>
          )}
        </div>
      </div>
    );
  }
}

/**
 * The family component plus its `handles` predicate, so a caller can ask
 * whether this family owns a subtype before building the element.
 */
export const SandboxStatus = Object.assign(SandboxStatusComponent, { handles });
