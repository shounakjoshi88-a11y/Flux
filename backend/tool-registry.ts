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
    doc_type: z.enum(['pdf', 'pptx', 'docx', 'xlsx', 'csv', 'tsv', 'md', 'json', 'sql', 'html', 'tech', 'finance', 'coder', 'creative', 'legal', 'design']),
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

toolRegistry.register('wiki_search', {
  name: 'wiki_search',
  description: 'Search the knowledge graph for concepts, entities, and topics previously discussed in this conversation.',
  parameters: z.object({
    query: z.string().describe('The concept or topic to search for'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'data',
  requiresApproval: false,
  maxRetries: 1,
  timeout: 10000,
});

toolRegistry.register('create_project', {
  name: 'create_project',
  description: 'Scaffold a full project directory with files in the sandbox.',
  parameters: z.object({
    name: z.string().describe('Project name (folder name under /home/user)'),
    files: z.array(z.object({
      path: z.string().describe('Relative file path within the project'),
      content: z.string().describe('Full file content'),
    })).describe('Array of files to create'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'filesystem',
  requiresApproval: true,
  maxRetries: 1,
  timeout: 30000,
});

toolRegistry.register('start_app', {
  name: 'start_app',
  description: 'Start a long-running background process (web server, dev server) in the sandbox.',
  parameters: z.object({
    name: z.string().describe('Human-readable name for this process'),
    command: z.string().describe('Command to run'),
    cwd: z.string().optional().describe('Working directory'),
    port: z.number().optional().describe('Port the app listens on'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'computation',
  requiresApproval: true,
  maxRetries: 1,
  timeout: 30000,
});

toolRegistry.register('stop_app', {
  name: 'stop_app',
  description: 'Stop a running background app by its ID.',
  parameters: z.object({
    app_id: z.string().describe('App ID returned by start_app'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'computation',
  requiresApproval: false,
  maxRetries: 1,
  timeout: 10000,
});

toolRegistry.register('list_apps', {
  name: 'list_apps',
  description: 'List all running background apps.',
  parameters: z.object({}),
  execute: async () => 'Implemented in index.ts',
  category: 'computation',
  requiresApproval: false,
  maxRetries: 1,
  timeout: 10000,
});

toolRegistry.register('get_app_logs', {
  name: 'get_app_logs',
  description: 'Get stdout/stderr output from a running or finished app.',
  parameters: z.object({
    app_id: z.string().describe('App ID returned by start_app'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'computation',
  requiresApproval: false,
  maxRetries: 1,
  timeout: 10000,
});

toolRegistry.register('get_app_url', {
  name: 'get_app_url',
  description: 'Get the public HTTPS URL for a running web app.',
  parameters: z.object({
    app_id: z.string().describe('App ID returned by start_app'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'computation',
  requiresApproval: false,
  maxRetries: 1,
  timeout: 10000,
});

toolRegistry.register('get_generated_file', {
  name: 'get_generated_file',
  description: 'Download a file from the sandbox as base64 with MIME type.',
  parameters: z.object({
    path: z.string().describe('Absolute path to the file in the sandbox'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'filesystem',
  requiresApproval: false,
  maxRetries: 1,
  timeout: 15000,
});

toolRegistry.register('shell_execute', {
  name: 'shell_execute',
  description: 'Execute a shell command in the local workspace. Use this for running code, installing packages, or system tasks.',
  parameters: z.object({
    command: z.string().describe('The shell command to execute'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'computation',
  requiresApproval: true,
  maxRetries: 1,
  timeout: 60000,
});

toolRegistry.register('file_list', {
  name: 'file_list',
  description: 'List files and directories in the local workspace.',
  parameters: z.object({
    path: z.string().default('.').describe('The directory path to list (relative to workspace root)'),
    recursive: z.boolean().default(false).describe('Whether to list files recursively'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'filesystem',
  requiresApproval: false,
  maxRetries: 1,
  timeout: 10000,
});

toolRegistry.register('file_read', {
  name: 'file_read',
  description: 'Read the content of a local file.',
  parameters: z.object({
    path: z.string().describe('The path to the file to read (relative to workspace root)'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'filesystem',
  requiresApproval: false,
  maxRetries: 1,
  timeout: 10000,
});

toolRegistry.register('file_write', {
  name: 'file_write',
  description: 'Create or update a local file with specific content.',
  parameters: z.object({
    path: z.string().describe('The path to the file to write (relative to workspace root)'),
    content: z.string().describe('The full content to write to the file'),
  }),
  execute: async () => 'Implemented in index.ts',
  category: 'filesystem',
  requiresApproval: true,
  maxRetries: 1,
  timeout: 15000,
});
