import type { AgentState } from './state';
import type { StreamWriter } from '../../http/sse/writers';

/**
 * Everything a tool needs from the request that created it.
 *
 * Tools receive this instead of a positional argument list, which is what makes
 * them movable: a tool group is a function of the context and nothing else.
 *
 * `res` is still here because several tools write raw SSE frames the writers
 * module does not cover yet. New code should use `writer`.
 */
export interface ToolContext {
    /** Express response for the streaming request. */
    res: any;
    /** Writer bound to `res`; the interface tools should move onto. */
    writer: StreamWriter;
    /** Model chosen for this request. */
    model: any;
    /** Per-request scratch state (sources, files, search counts). */
    state: AgentState;
    /** The user's message, before any rewriting. */
    userQuery?: string;
    /** Conversation the request belongs to, used to scope sandbox files. */
    activeConversationId?: string;
    /** Local user id. */
    uid?: string;
    /** Built-in skills the user turned off (user_metadata.disabledBuiltinSkills). */
    disabledBuiltinSkills?: string[] | null;
    /** Aborted when the client disconnects. */
    abortSignal?: AbortSignal;
}

/** Files are scoped to a conversation; unauthenticated callers share `default`. */
export function conversationKey(ctx: ToolContext): string {
    return ctx.activeConversationId || 'default';
}

/** True once the model has searched enough and should be answering, not calling tools. */
export function shouldBlockFurtherTools(ctx: ToolContext): boolean {
    return ctx.state.searchCount >= 2 && (ctx.state.searchContent?.length ?? 0) > 100;
}

/** The message handed back to the model when `shouldBlockFurtherTools` is true. */
export const TOOL_BLOCKED_MESSAGE =
    '__TOOL_BLOCKED__ ANSWER THE USER NOW. You already have search results. Do NOT call tools.';
