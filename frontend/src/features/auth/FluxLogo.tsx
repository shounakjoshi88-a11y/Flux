/**
 * FluxLogo — the wordmark glyph used in the landing page header.
 *
 * Extracted from `pages/Auth.tsx`.
 */
// Flux Logo Component
export function FluxLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 16C5 6 8 18 11 10S17 6 22 12" />
    </svg>
  );
}

// Fixed node layout for the ambient graph backdrop
