/**
 * Agent discovery routes.
 *
 * `/api/acp/capabilities` advertises what Flux can do to ACP clients, and the
 * `/api/agents/custom` endpoints manage the in-memory list of user-defined
 * agents. State is per-process and does not survive a restart.
 */
import { Router } from 'express';
import { toolRegistry } from '../../agents/tools/registry';

interface CustomAgentEntry {
    id: string;
    name: string;
    command: string;
    args: string[];
    env?: Array<{ name: string; value: string }>;
    icon?: string;
    advanced?: {
        yolo_id?: string;
        native_skills_dirs?: string[];
        description?: string;
    };
    createdAt: string;
}

const customAgents: Map<string, CustomAgentEntry> = new Map();

export function createAgentsRouter(): Router {
    const router = Router();

    router.get('/api/acp/capabilities', (_req, res) => {
        res.json({
            protocolVersion: 1,
            agentInfo: {
                name: 'Flux',
                version: '1.0.0',
                description: 'Flux AI agent with tool orchestration and team mode',
            },
            capabilities: {
                supportsStreaming: true,
                supportsVision: true,
                supportsThinking: true,
                maxTools: 25,
                maxSteps: 30,
                supportedModes: ['default', 'plan', 'yolo'],
                availableTools: toolRegistry.getToolList().map((t) => ({
                    name: t.name,
                    description: t.description,
                    category: t.category,
                    requiresApproval: t.requiresApproval,
                })),
            },
            configOptions: {
                categories: [
                    {
                        name: 'mode',
                        options: [
                            { value: 'default', label: 'Default — ask before tool execution' },
                            { value: 'plan', label: 'Plan — create execution plan first' },
                            { value: 'yolo', label: 'YOLO — execute without asking' },
                        ],
                    },
                ],
            },
        });
    });

    router.get('/api/agents/custom', (_req, res) => {
        res.json({ agents: [...customAgents.values()] });
    });

    router.post('/api/agents/custom', (req, res) => {
        const { name, command, args, env, icon, advanced } = req.body || {};
        if (!name || !command) return res.status(400).json({ error: 'name and command required' });
        const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const entry: CustomAgentEntry = {
            id,
            name,
            command,
            args: args || [],
            env,
            icon,
            advanced,
            createdAt: new Date().toISOString(),
        };
        customAgents.set(id, entry);
        res.status(201).json({ agent: entry });
    });

    router.delete('/api/agents/custom/:id', (req, res) => {
        if (!customAgents.delete(req.params.id!)) return res.status(404).json({ error: 'not found' });
        res.json({ ok: true });
    });

    return router;
}
