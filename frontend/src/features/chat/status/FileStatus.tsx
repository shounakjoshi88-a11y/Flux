/**
 * FileStatus — the file and chart steps.
 *
 * Extracted from `features/chat/StatusMessage.tsx`. Covers generating a chart,
 * generating a file and reading a file back, including the code preview that
 * appears for files with a known extension.
 *
 * Returns `null` for any other subtype.
 */
import { StepRow, SpinnerIcon, TimelineNode } from "../ThoughtBlock";
import { ChartIcon } from "../icons";
import { FileCodeBlock } from "../TerminalBlock";
import type { StatusBlockProps } from "./types";

const SUBTYPES = new Set(["generating_chart", "generating_file", "generating_file_success", "generating_file_error", "reading_file", "reading_file_success", "reading_file_error"]);

/** True when this family renders the given status subtype. */
export function handles(subtype: string): boolean {
  return SUBTYPES.has(subtype);
}

function FileStatusComponent({
  status,
  isFirst,
  isLast,
  isActive,
  onSourceClick,
  rightSlot,
}: StatusBlockProps) {
  if (!SUBTYPES.has(status.subtype)) return null;

  // ─── chart ────────────────────────────────────────────────────────────────
  if (status.subtype === "generating_chart") {
    return (
      <StepRow rightSlot={rightSlot}
        icon={<ChartIcon cls={isActive ? "text-[var(--accent)]" : "text-[var(--text-secondary)]/40"} />}
        message={status.message}
        isFirst={isFirst} isLast={isLast} pulse={isActive}
      />
    );
  }

    // ─── file write / edit / create-project ──────────────────────────────────
  if (
    status.subtype === "generating_file" ||
    status.subtype === "generating_file_success" ||
    status.subtype === "generating_file_error"
  ) {
    const filePath: string = status.data?.path ?? "";
    const filename: string = status.data?.filename ?? filePath.split(/[\\/]/).pop() ?? filePath;
    const fileContent: string = status.data?.contentPreview ?? status.data?.content ?? "";
    const language: string = status.data?.language ?? "";
    const isSuccess = status.subtype === "generating_file_success";
    const isError = status.subtype === "generating_file_error";
    const isWriting = status.subtype === "generating_file";
    const isEdit = status.data?.diffAdded !== undefined;
    const diffAdded = status.data?.diffAdded ?? 0;
    const diffRemoved = status.data?.diffRemoved ?? 0;
    const oldStr = status.data?.old_str || "";
    const newStr = status.data?.new_str || "";
    const toolName = status.data?.toolName || (isEdit ? "edit_file" : fileContent ? "write_file" : "");

    const fileIconColor = isWriting && isActive
      ? "text-[var(--accent)]"
      : isSuccess
        ? "text-emerald-400/70"
        : isError
          ? "text-red-400/70"
          : "text-[var(--text-secondary)]/40";

    const fileIconEl = isEdit ? (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"
        className={`size-4 shrink-0 ${fileIconColor}`}>
        <path d="M12.5 2.5l3 3L7 14H4v-3l8.5-8.5z" />
        <line x1="10.5" y1="4.5" x2="13.5" y2="7.5" strokeWidth="1.1" />
        <path d="M4 14v2h2l8.5-8.5" strokeWidth="1.1" />
      </svg>
    ) : (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"
        className={`size-4 shrink-0 ${fileIconColor}`}>
        <path d="M5 2.5h6.5l3 3V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
        <polyline points="11.5,2.5 11.5,5.5 14.5,5.5" />
        <line x1="7" y1="9" x2="13" y2="9" strokeWidth="1.1" />
        <line x1="7" y1="11.5" x2="11" y2="11.5" strokeWidth="1.1" />
      </svg>
    );

    return (
      <div className="relative overflow-hidden">
        <div className="flex gap-2.5">
          <TimelineNode icon={fileIconEl} isFirst={isFirst} isLast={isLast} />
          <div className="py-2 min-w-0 flex-1">
            {/* Status label */}
            <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">{status.message}</span>
            {rightSlot && <span className="inline-flex shrink-0 align-middle ml-1">{rightSlot}</span>}

            {/* File block with content preview */}
            {filename && (
              <FileCodeBlock
                filename={filename}
                content={fileContent || undefined}
                language={language || filename.split('.').pop() || 'text'}
                isRunning={isWriting && !!isActive}
                isSuccess={isSuccess}
                isError={isError}
                diffAdded={isEdit ? diffAdded : undefined}
                diffRemoved={isEdit ? diffRemoved : undefined}
                oldStr={oldStr || undefined}
                newStr={newStr || undefined}
                toolName={toolName || undefined}
              />
            )}

            {isLast && (
              <div className="flex items-center h-4 mt-1">
                <span className="text-[13px] text-[var(--text-secondary)] leading-snug font-medium">Done</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── reading_file ─────────────────────────────────────────────────────────
  if (
    status.subtype === "reading_file" ||
    status.subtype === "reading_file_success" ||
    status.subtype === "reading_file_error"
  ) {
    const filePath: string = status.data?.path ?? "";
    const filename: string = status.data?.filename ?? filePath.split(/[\\/]/).pop() ?? filePath;
    const fileSize: number = status.data?.size ?? 0;
    const isSuccess = status.subtype === "reading_file_success";
    const isError = status.subtype === "reading_file_error";
    const isReading = status.subtype === "reading_file";

    const readIconColor = isReading && isActive
      ? "text-[var(--accent)]"
      : isSuccess
        ? "text-emerald-400/70"
        : isError
          ? "text-red-400/70"
          : "text-[var(--text-secondary)]/40";

    const readIconEl = (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"
        className={`size-4 shrink-0 ${readIconColor}`}>
        <path d="M4 3h8l3 3v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <polyline points="12,3 12,6 15,6" />
        <line x1="6" y1="8.5" x2="10" y2="8.5" strokeWidth="1.1" />
        <line x1="6" y1="11" x2="8.5" y2="11" strokeWidth="1.1" />
        <circle cx="15.5" cy="14.5" r="2.5" strokeWidth="1.2" />
        <line x1="17.5" y1="16.5" x2="19" y2="18" strokeWidth="1.2" />
      </svg>
    );

    return (
      <StepRow rightSlot={rightSlot}
        icon={readIconEl}
        message={status.message}
        isFirst={isFirst} isLast={isLast} pulse={isReading && isActive}
      >
        {filename && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[12px] font-mono text-[var(--text-secondary)]/70">
              {filename}
              {fileSize > 0 && !isReading && (
                <span className="ml-2 text-[11px] text-[var(--text-muted)]">
                  ({fileSize > 1024 ? `${(fileSize / 1024).toFixed(1)}KB` : `${fileSize}B`})
                </span>
              )}
            </span>
          </div>
        )}
      </StepRow>
    );
  }
}

/**
 * The family component plus its `handles` predicate, so a caller can ask
 * whether this family owns a subtype before building the element.
 */
export const FileStatus = Object.assign(FileStatusComponent, { handles });
