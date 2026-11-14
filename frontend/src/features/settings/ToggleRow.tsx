/**
 * ToggleRow — the accessible switch row used across the settings tabs.
 *
 * Extracted from `features/settings/Settings.tsx` so every tab panel can
 * share one implementation.
 */

// ─── Reusable accessible toggle row ─────────────────────────
export function ToggleRow({ label, description, enabled, onToggle }: { label: string; description?: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div><p className="text-sm text-[var(--text-primary)]">{label}</p>{description && (<p className="text-xs text-[var(--text-primary)]/50 mt-0.5">{description}</p>)}</div>
      <button type="button" role="switch" aria-checked={enabled} aria-label={label} onClick={onToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${enabled ? "bg-[var(--accent)]" : "bg-[var(--surface-border)]"}`}>
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-6" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
