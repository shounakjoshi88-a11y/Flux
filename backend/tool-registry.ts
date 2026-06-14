// Dynamic tool registry — MCP-like tool registration and management
import { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  execute: (args: any, context: ToolExecutionContext) => Promise<any>;
  category: 'data' | 'filesystem' | 'computation' | 'external' | 'utility';
  requiresApproval: boolean;
  maxRetries: number;
  timeout?: number;
}

export interface ToolExecutionContext {
  userId: string;
  conversationId: string;
  signal?: AbortSignal;
}

type ToolFactory = (ctx: ToolExecutionContext) => ToolDefinition;

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private factories = new Map<string, ToolFactory>();
  private customTools = new Map<string, ToolDefinition>();

  register(name: string, def: ToolDefinition): void {
    this.tools.set(name, def);
  }

  registerFactory(name: string, factory: ToolFactory): void {
    this.factories.set(name, factory);
  }

  registerCustom(name: string, def: ToolDefinition): void {
    this.customTools.set(name, def);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name) || this.customTools.get(name);
  }

  getAll(): ToolDefinition[] {
    return [...this.tools.values(), ...this.customTools.values()];
  }

  getByCategory(category: string): ToolDefinition[] {
    return this.getAll().filter(t => t.category === category);
  }

  createForContext(ctx: ToolExecutionContext): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, def] of this.tools) {
      result[name] = def;
    }
    for (const [name, def] of this.customTools) {
      result[name] = def;
    }
    return result;
  }

  unregister(name: string): void {
    this.tools.delete(name);
    this.customTools.delete(name);
  }

  getToolList(): Array<{ name: string; category: string; description: string; requiresApproval: boolean }> {
    return this.getAll().map(t => ({
      name: t.name,
      category: t.category,
      description: t.description.slice(0, 100),
      requiresApproval: t.requiresApproval,
    }));
  }
}

export const toolRegistry = new ToolRegistry();

// Register built-in tool metadata (actual implementations remain in index.ts)
toolRegistry.register('web_search', {
  name: 'web_search',
  description: 'Search the web for LIVE, CURRENT data. Uses Tavily API.',
  parameters: z.object({
    query: z.string().describe('A precise, targeted search query'),
    queries: z.array(z.string()).describe('Multiple search queries for parallel search').optional(),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'data',
  requiresApproval: false,
  maxRetries: 2,
  timeout: 15000,
});

toolRegistry.register('read_skill', {
  name: 'read_skill',
  description: 'Load the generation rules/skill file for a document type.',
  parameters: z.object({
    doc_type: z.enum(['pdf', 'pptx', 'docx', 'xlsx', 'csv', 'tsv', 'md', 'json', 'sql', 'html', 'tech', 'finance', 'coder', 'creative', 'legal']),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'data',
  requiresApproval: false,
  maxRetries: 1,
  timeout: 10000,
});

toolRegistry.register('generate_document', {
  name: 'generate_document',
  description: 'Generate a downloadable document file (PDF, DOCX, PPTX, XLSX, etc.). Do NOT use this tool for requests to create charts, graphs, diagrams, or flowcharts, unless the user explicitly requested a document file format (like "create a chart PDF" or "put the chart in a Word document"). For standard chart/diagram requests, render them inline instead.',
  parameters: z.object({
    doc_type: z.enum(['pdf', 'pptx', 'docx', 'xlsx', 'csv', 'tsv', 'md', 'json', 'sql', 'html', 'tech', 'finance', 'coder', 'creative', 'legal']),
    topic: z.string().describe('The topic or subject of the document'),
    skill_content: z.string().optional().describe('The skill file content returned by read_skill'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'utility',
  requiresApproval: true,
  maxRetries: 2,
  timeout: 60000,
});

toolRegistry.register('get_weather', {
  name: 'get_weather',
  description: 'Fetch real-time weather data for a specific city.',
  parameters: z.object({
    city: z.string().describe('The city name to get weather for'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'data',
  requiresApproval: false,
  maxRetries: 1,
  timeout: 10000,
});

toolRegistry.register('generate_image', {
  name: 'generate_image',
  description: 'Generate an AI image, illustration, photo, or artwork using Bonsai diffusion model. Do NOT use this tool for charts, graphs, or diagrams (which should be rendered inline using CHART or MERMAID tags).',
  parameters: z.object({
    prompt: z.string().describe('Description of the image to generate'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'external',
  requiresApproval: true,
  maxRetries: 1,
  timeout: 180000,
});
