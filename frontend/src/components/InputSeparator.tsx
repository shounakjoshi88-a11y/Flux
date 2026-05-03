export function InputSeparator() {
    return (
      <div className="w-full pointer-events-none select-none">
        <div className="relative flex items-center justify-center py-2">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-black/10 dark:border-white/10" />
          </div>
          <span className="relative bg-[#f3f5f8] dark:bg-[#000000] px-3 text-xs font-semibold tracking-wide text-muted-foreground">
            AI‑generated, for reference only
          </span>
        </div>
      </div>
    );
  }