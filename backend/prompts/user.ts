/**
 * Wrappers for untrusted text that is about to enter a prompt.
 *
 * Delimiting user-supplied content with a labelled block makes it obvious in
 * the transcript which part came from outside the system, so an injection
 * attempt is at least visible to the model and to whoever reads the logs.
 */

export const wrapUser = (label: string, content: string) =>
    `[USER_INPUT - ${label}]\n${content}\n[/USER_INPUT]`;
