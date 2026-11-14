import { tool } from 'ai';
import { z } from 'zod';

export function sseLine(obj: object): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export function toOpenAIChunk(params: {
  completionId: string;
  model: string;
  delta: { content?: string; tool_calls?: any[] };
  finishReason?: string | null;
}): object {
  const choice: any = {
    index: 0,
    delta: params.delta,
  };
  if (params.finishReason) {
    choice.finish_reason = params.finishReason;
  }
  return {
    id: params.completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: params.model,
    choices: [choice],
  };
}

function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema) return z.any();
  if (schema.type === 'string') {
    let s = z.string();
    if (schema.enum) s = z.enum(schema.enum as any) as any;
    return s;
  }
  if (schema.type === 'number') return z.number();
  if (schema.type === 'integer') return z.number().int();
  if (schema.type === 'boolean') return z.boolean();
  if (schema.type === 'array') {
    return z.array(jsonSchemaToZod(schema.items || {}));
  }
  if (schema.type === 'object' || schema.properties) {
    const shape: Record<string, z.ZodTypeAny> = {};
    if (schema.properties) {
      for (const [key, val] of Object.entries(schema.properties)) {
        shape[key] = jsonSchemaToZod(val);
      }
    }
    let obj = z.object(shape);
    if (schema.required && Array.isArray(schema.required)) {
      const requiredSet = new Set(schema.required);
      for (const key of Object.keys(shape)) {
        if (!requiredSet.has(key)) {
          shape[key] = shape[key]!.optional();
        }
      }
      obj = z.object(shape);
    }
    return obj;
  }
  return z.any();
}

export function fromOpenAITools(openAiTools: any[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const t of openAiTools || []) {
    if (t.type !== 'function') continue;
    const fn = t.function;
    if (!fn?.name) continue;
    let inputSchema: z.ZodTypeAny = z.any();
    if (fn.parameters) {
      try {
        const parsed = typeof fn.parameters === 'string' ? JSON.parse(fn.parameters) : fn.parameters;
        inputSchema = jsonSchemaToZod(parsed);
      } catch {
        inputSchema = z.any();
      }
    }
    result[fn.name] = tool({
      description: fn.description || '',
      parameters: inputSchema,
      execute: async (args: any) => {
        return JSON.stringify({ tool_name: fn.name, result: 'Tool execution forwarded. The opencode client will handle this locally.' });
      },
    } as any);
  }
  return result;
}

export function mapModelId(requestedModel: string, nimModels: Record<string, string>): string {
  if (!requestedModel || typeof requestedModel !== 'string') {
    throw new Error('Model is required');
  }
  if (nimModels[requestedModel]) {
    return requestedModel;
  }
  const trimmed = requestedModel.includes('/') ? requestedModel.split('/').pop() || requestedModel : requestedModel;
  if (nimModels[trimmed]) {
    return trimmed;
  }
  for (const [key, val] of Object.entries(nimModels)) {
    if (val === requestedModel || val.endsWith(requestedModel)) {
      return key;
    }
  }
  throw new Error(`Unknown model: ${requestedModel}. Available models: ${Object.keys(nimModels).join(', ')}`);
}

export const BUILD_PROJECT_TOOL = {
  type: 'function',
  function: {
    name: 'build_project_with_subagents',
    description: 'Builds a complete multi-file software project using parallel sandboxed AI subagents. Use this when the user asks to build, create, or scaffold a full application or project, rather than editing existing files.',
    parameters: {
      type: 'object',
      properties: {
        projectDescription: { type: 'string', description: 'A clear, complete description of the project to build.' },
      },
      required: ['projectDescription'],
    },
  },
};
