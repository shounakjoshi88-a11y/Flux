/**
 * SSE writers.
 *
 * Every server-sent event the backend emits goes through one of these, so the
 * wire format (`data:` framing, event names, JSON shape) lives in one file
 * instead of being retyped inside handlers and tools.
 *
 * `res` is intentionally typed loosely: these are called from Express handlers,
 * from tools holding a captured response, and from the orchestrator.
 */

const CJK_GLITCH_RE =
    /([a-zA-Z\u2019\s,.'!?;:()\--])([\u4e00-\u9fff\u3040-\u30ff\u30a0-\u30ff\uff00-\uffef]{1,8})([a-zA-Z\s,.'!?;:()\--])/g;

/** Write a plain text delta, de-glitched and newline-escaped. */
export function writeSafeSSE(res: any, content: string): void {
    if (res.writableEnded) return;
    let deglitched = content;
    let prev = '';
    while (prev !== deglitched) {
        prev = deglitched;
        deglitched = deglitched.replace(CJK_GLITCH_RE, '$1$3');
    }
    const normalized = deglitched.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const escaped = normalized.replace(/\n/g, '\ndata: ');
    res.write(`data: ${escaped}\n\n`);
}

/** Tell the client to discard the text it has already rendered. */
export function writeReplaceText(res: any): void {
    if (res.writableEnded) return;
    res.write(`event: replace_text\ndata: {}\n\n`);
}

export function sendStatus(res: any, subtype: string, message: string, data?: any, track?: any[]): void {
    if (res.writableEnded) return;
    const event = { type: 'status', subtype, message, data: data || null };
    res.write(`event: status\ndata: ${JSON.stringify(event)}\n\n`);
    if (track) track.push(event);
}

export function sendProgress(res: any, subtype: string, progress: number, message: string, data?: any): void {
    if (res.writableEnded) return;
    res.write(
        `event: status\ndata: ${JSON.stringify({ type: 'status', subtype, message, data: data || null, progress })}\n\n`,
    );
}

export function sendAgentStatus(res: any, status: string, message: string, data?: any): void {
    if (res.writableEnded) return;
    res.write(
        `event: agent_status\ndata: ${JSON.stringify({ type: 'agent_status', status, message, data: data || null })}\n\n`,
    );
}

export function sendPermissionRequest(res: any, id: string, toolName: string, args: any, description: string): void {
    if (res.writableEnded) return;
    res.write(`event: permission\ndata: ${JSON.stringify({ type: 'permission', id, toolName, args, description })}\n\n`);
}

export function sendToolGroup(res: any, tools: any[]): void {
    if (res.writableEnded) return;
    res.write(`event: tool_group\ndata: ${JSON.stringify({ type: 'tool_group', tools })}\n\n`);
}

export function sendToolCall(res: any, toolName: string, args: any, status: string, result?: any): void {
    if (res.writableEnded) return;
    res.write(`event: tool_call\ndata: ${JSON.stringify({ type: 'tool_call', toolName, args, status, result })}\n\n`);
}

/**
 * Raw stdout/stderr lines from a sandbox command, streamed to the client as
 * they arrive.
 */
export function sendCodeOutput(res: any, type: string, content: string): void {
    if (res.writableEnded) return;
    res.write(`event: code_output\ndata: ${JSON.stringify({ type, content })}\n\n`);
}

/** The code about to run, so the client can show a container before any output. */
export function sendCodeExecution(res: any, code: string, language: string): void {
    if (res.writableEnded) return;
    res.write(`event: code_execution\ndata: ${JSON.stringify({ code, language })}\n\n`);
}

/** The command finished: exit code and wall time. */
export function sendCodeDone(res: any, exitCode: number | undefined, duration: number | undefined): void {
    if (res.writableEnded) return;
    res.write(`event: code_done\ndata: ${JSON.stringify({ exitCode, duration })}\n\n`);
}

/** A file the sandbox produced, with its content inlined when it could be read. */
export function sendFileGenerated(res: any, payload: {
    filename: string;
    path: string;
    mime?: string;
    base64?: string;
    downloadUrl?: string;
}): void {
    if (res.writableEnded) return;
    res.write(`event: file_generated\ndata: ${JSON.stringify(payload)}\n\n`);
}

/** A generated document, pushed to the client so it can offer a download. */
export function sendFile(res: any, payload: any): void {
    if (res.writableEnded) return;
    res.write(`event: file\ndata: ${JSON.stringify(payload)}\n\n`);
}

/**
 * A writer bound to one response, for code that should not know about Express.
 * This is the seam tools will move onto: same behaviour, no `res` in the signature.
 */
export interface StreamWriter {
    text(content: string): void;
    replaceText(): void;
    /** `track` mirrors the original signature: the event is also pushed to it. */
    status(subtype: string, message: string, data?: any, track?: any[]): void;
    progress(subtype: string, progress: number, message: string, data?: any): void;
    toolCall(toolName: string, args: any, status: string, result?: any): void;
    codeExecution(code: string, language: string): void;
    codeOutput(type: string, content: string): void;
    codeDone(exitCode: number | undefined, duration: number | undefined): void;
    fileGenerated(payload: {
        filename: string;
        path: string;
        mime?: string;
        base64?: string;
        downloadUrl?: string;
    }): void;
    /** A generated document, pushed to the client so it can offer a download. */
    file(payload: any): void;
    ended(): boolean;
}

export function writerFor(res: any): StreamWriter {
    return {
        text: (content) => writeSafeSSE(res, content),
        replaceText: () => writeReplaceText(res),
        status: (subtype, message, data, track) => sendStatus(res, subtype, message, data, track),
        progress: (subtype, progress, message, data) => sendProgress(res, subtype, progress, message, data),
        toolCall: (toolName, args, status, result) => sendToolCall(res, toolName, args, status, result),
        codeExecution: (code, language) => sendCodeExecution(res, code, language),
        codeOutput: (type, content) => sendCodeOutput(res, type, content),
        codeDone: (exitCode, duration) => sendCodeDone(res, exitCode, duration),
        fileGenerated: (payload) => sendFileGenerated(res, payload),
        file: (payload) => sendFile(res, payload),
        ended: () => Boolean(res.writableEnded),
    };
}
