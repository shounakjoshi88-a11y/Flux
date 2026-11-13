/**
 * The tool factory.
 *
 * Assembles every tool group into one object bound to a single request. The
 * groups themselves live next to this file, one per domain.
 */
import { writerFor } from '../../http/sse/writers';
import type { AgentState } from './state';
import type { ToolContext } from './context';
import { createSearchTools } from './search';
import { createDocumentTools } from './documents';
import { createWeatherTools } from './weather';
import { createImageTools } from './images';
import { createExecTools } from './exec';
import { createFileTools } from './files';
import { createWikiTools } from './wiki';
import { createResearchTools } from './research';

/**
 * Build the tools for one request.
 *
 * Every tool is scoped to the request: it can write to that request's stream,
 * read that request's state, and knows which conversation's sandbox to use.
 */
export function createFluxTools(
    res: any,
    model: any,
    state: AgentState,
    userQuery?: string,
    activeConversationId?: string,
    uid?: string,
    abortSignal?: AbortSignal,
) {
    const ctx: ToolContext = {
        res,
        writer: writerFor(res),
        model,
        state,
        userQuery,
        activeConversationId,
        uid,
        abortSignal,
    };

    return {
        ...createSearchTools(ctx),
        ...createDocumentTools(ctx),
        ...createWeatherTools(ctx),
        ...createImageTools(ctx),
        ...createExecTools(ctx),
        ...createFileTools(ctx),
        ...createWikiTools(ctx),
        ...createResearchTools(ctx),
    };
}
