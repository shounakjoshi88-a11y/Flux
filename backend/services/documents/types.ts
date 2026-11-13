/**
 * Shared types for the document pipeline.
 *
 * `ContextualStatusMessages` is what the UI shows while a document is being
 * built. It lives here rather than in the generator so the status-message
 * model and the generator can both depend on it without depending on each
 * other.
 */

export interface ContextualStatusMessages {
    searching: string;
    reading: string;
    generating: string;
    generatingFile: string;
    readingSkill: string;
}
