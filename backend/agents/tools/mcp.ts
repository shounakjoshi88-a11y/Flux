/**
 * MCP tool adapter — wraps each enabled custom MCP connector's remote tools
 * as native Flux tools, so the model sees them in the same flat toolspace as
 * built-in tools.
 *
 * Rules: hard cap of 5 connectors × 20 tools per request; tools/list is
 * cached per (user, url) for 2 minutes; failing servers degrade to "absent"
 * instead of breaking the request.
 */
import { tool, jsonSchema } from 'ai';
import { prisma } from '../../db/prisma';
import { McpRemoteClient, listToolsCached, toolNameSegment } from '../../services/mcp/client';
import type { ToolContext } from './context';

const MAX_CONNECTORS = 5;
const MAX_TOOLS_PER_CONNECTOR = 20;

export async function createMcpTools(ctx: ToolContext): Promise<Record<string, any>> {
    if (!ctx.uid) return {};
    let connectors: Array<{ id: string; name: string; url: string }> = [];
    try {
        connectors = await prisma.mcpConnector.findMany({
            where: { userId: ctx.uid, enabled: true },
            select: { id: true, name: true, url: true },
            orderBy: { createdAt: 'asc' },
            take: MAX_CONNECTORS,
        });
    } catch (e: any) {
        console.warn('[MCP] Connector table unreadable — skipping MCP tools:', e?.message);
        return {};
    }

    const out: Record<string, any> = {};
    for (const c of connectors) {
        const slug = toolNameSegment(c.name);
        const client = new McpRemoteClient(c.url, c.name);
        const tools = await listToolsCached(`${ctx.uid}:${c.url}`, () => client.listTools());
        for (const t of tools.slice(0, MAX_TOOLS_PER_CONNECTOR)) {
            const name = `${slug}_${toolNameSegment(t.name)}`.slice(0, 64);
            out[name] = (tool as any)({
                description: `[MCP · ${c.name}] ${t.description}`.slice(0, 1024),
                inputSchema: jsonSchema(t.inputSchema as any),
                execute: async (args: any) => {
                    try {
                        return await client.callTool(t.name, args ?? {});
                    } catch (e: any) {
                        return `MCP tool "${t.name}" on connector "${c.name}" failed: ${e?.message ?? e}`;
                    }
                },
            });
        }
        if (tools.length > 0) {
            console.log(`[MCP] Connector "${c.name}" registered ${Math.min(tools.length, MAX_TOOLS_PER_CONNECTOR)} tool(s)`);
        }
    }
    return out;
}
