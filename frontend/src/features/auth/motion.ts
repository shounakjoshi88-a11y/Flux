/**
 * Shared motion easings for the landing page.
 *
 * Extracted from `pages/Auth.tsx` so every landing-page module animates with
 * the same curves.
 */

/** Elite smooth easing curve. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Softer out-easing used for headline reveals. */
export const EASE_OUT_SOFT = [0.16, 1, 0.3, 1] as const;
