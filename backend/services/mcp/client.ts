/**
 * Minimal MCP (Model Context Protocol) client for remote HTTP servers.
 *
 * Speaks JSON-RPC 2.0 over HTTP POST and understands both plain-JSON and
 * SSE-framed (`text/event-stream`) responses, which is what current MCP
 * servers (e.g. DeepWiki, remote MCP gateways) emit.
 *
 * Scope: initialize → tools/list → tools/call against *stateless* remote
 * servers. Session-bound servers that require an Mcp-Session-Id dance still
 * work (we echo any session id the server hands back), but file/resource
 * methods and prompts are deliberately not implemented.
 */

export interface McpToolDef {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
}

const DEFAULT_PROTOCOL = '2025-03-26';

interface RpcResult {
    result?: any;
    error?: { code: number; message: string };
}

function parseSseOrJson(text: string, contentType: string): RpcResult | null {
    if (!text) return null;
    if (contentType.includes('text/event-stream')) {
        const dataLines = text.split('\n').filter((l) => l.startsWith('data:'));
        // Take the LAST data frame — servers may emit notifications before the result.
        for (let i = dataLines.length - 1; i >= 0; i--) {
            const payload = dataLines[i]!.slice(5).trim();
            if (!payload) continue;
            try {
                const parsed = JSON.parse(payload);
                if (parsed && (parsed.result !== undefined || parsed.error !== undefined || parsed.jsonrpc === '2.0')) {
                    return parsed;
                }
            } catch { /* keep looking */ }
        }
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function rpcCall(
    url: string,
    method: string,
    params: any,
    { id = 1, timeoutMs = 10_000, sessionId }: { id?: number | string; timeoutMs?: number; sessionId?: string | null } = {},
): Promise<{ parsed: RpcResult | null; sessionId: string | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
            },
            body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
            signal: controller.signal,
        });
        const text = await res.text();
        const sid = res.headers.get('mcp-session-id');
        const ct = res.headers.get('content-type') || '';
        return { parsed: parseSseOrJson(text, ct), sessionId: sid ?? sessionId ?? null };
    } finally {
        clearTimeout(timer);
    }
}

export class McpRemoteClient {
    private sessionId: string | null = null;

    constructor(
        private readonly url: string,
        private readonly label: string,
        private readonly timeoutMs = 12_000,
    ) {}

    /** initialize → notifications/initialized → tools/list */
    async listTools(): Promise<McpToolDef[]> {
        const init = await rpcCall(this.url, 'initialize', {
            protocolVersion: DEFAULT_PROTOCOL,
            capabilities: {},
            clientInfo: { name: 'flux', version: '1.0.0' },
        }, { id: 1, timeoutMs: this.timeoutMs });
        this.sessionId = init.sessionId;

        if (init.parsed?.error) {
            throw new Error(`MCP initialize failed for ${this.label}: ${init.parsed.error.message}`);
        }
        if (!init.parsed?.result?.capabilities?.tools) {
            throw new Error(`${this.label} does not advertise a tools capability — not a usable MCP server.`);
        }

        // Fire-and-forget: servers expect this notification, tolerate its loss.
        rpcCall(this.url, 'notifications/initialized', {}, { id: 'init-note', timeoutMs: 3_000, sessionId: this.sessionId }).catch(() => null);

        const list = await rpcCall(this.url, 'tools/list', {}, { id: 2, timeoutMs: this.timeoutMs, sessionId: this.sessionId });
        if (list.parsed?.error) {
            throw new Error(`MCP tools/list failed for ${this.label}: ${list.parsed.error.message}`);
        }
        const tools = list.parsed?.result?.tools;
        if (!Array.isArray(tools)) return [];
        return tools
            .filter((t: any) => t && typeof t.name === 'string')
            .map((t: any) => ({
                name: String(t.name),
                description: String(t.description ?? ''),
                inputSchema: (t.inputSchema && typeof t.inputSchema === 'object') ? t.inputSchema : { type: 'object', properties: {} },
            }));
    }

    /** tools/call — returns the concatenated text content, or an error string. */
    async callTool(name: string, args: Record<string, any>, timeoutMs = 60_000): Promise<string> {
        const call = await rpcCall(this.url, 'tools/call', { name, arguments: args ?? {} }, {
            id: Math.floor(Math.random() * 1e9),
            timeoutMs,
            sessionId: this.sessionId,
        });
        if (call.parsed?.error) {
            return `MCP error from ${this.label}: ${call.parsed.error.message}`;
        }
        const result = call.parsed?.result;
        if (!result) return `MCP server ${this.label} returned no result for tool "${name}".`;
        if (result.isError) {
            const text = (result.content ?? []).map((c: any) => c?.text ?? '').join('\n');
            return `MCP tool "${name}" failed: ${text || 'unknown error'}`;
        }
        const text = (result.content ?? []).map((c: any) => (typeof c?.text === 'string' ? c.text : JSON.stringify(c))).join('\n').trim();
        return text || JSON.stringify(result.structuredContent ?? result);
    }
}

// ─── tools/list cache ─────────────────────────────────────────────────────
const listCache = new Map<string, { at: number; tools: McpToolDef[] }>();
const LIST_TTL_MS = 120_000;

/** Cached tools/list for a connector. Failures return [] and are NOT cached long. */
export async function listToolsCached(cacheKey: string, fetcher: () => Promise<McpToolDef[]>): Promise<McpToolDef[]> {
    const hit = listCache.get(cacheKey);
    if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.tools;
    try {
        const tools = await fetcher();
        listCache.set(cacheKey, { at: Date.now(), tools });
        return tools;
    } catch (e: any) {
        console.warn(`[MCP] tools/list failed for ${cacheKey}:`, e?.message ?? e);
        // Negative-cache briefly so a dead server doesn't add 12s to every message.
        listCache.set(cacheKey, { at: Date.now() - LIST_TTL_MS + 30_000, tools: [] });
        return [];
    }
}

/** Sanitise a string into an MCP-safe tool name segment. */
export function toolNameSegment(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'mcp';
}
