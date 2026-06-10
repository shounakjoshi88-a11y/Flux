export function InputSeparator() {
    return (
      <div className="w-full pointer-events-none select-none">
        <div className="relative flex items-center justify-center py-2">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-[var(--surface-border)]" />
          </div>
          <span className="relative bg-[var(--bg-primary)] px-4 text-[10px] font-medium tracking-wide text-[var(--text-muted)]/60">
            Flux can make mistakes. Verify important info.
          </span>
        </div>
      </div>
    );
  }