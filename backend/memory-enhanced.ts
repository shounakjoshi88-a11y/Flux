// Enhanced memory-aware tool execution
// Injects user memory context into tool calls for personalized responses
import { retrieveMemories, buildMemoryContext } from './memory';

interface MemoryEnhancerOptions {
  userId: string;
  query: string;
  toolName: string;
  toolArgs: any;
}

interface EnhancedToolArgs {
  originalArgs: any;
  memoryContext: string;
  personalizedQuery?: string;
}

export async function enhanceWithMemory(opts: MemoryEnhancerOptions): Promise<EnhancedToolArgs> {
  try {
    const memories = await retrieveMemories(opts.userId, opts.query);
    const memoryContext = buildMemoryContext(memories);

    if (!memoryContext) {
      return { originalArgs: opts.toolArgs, memoryContext: '' };
    }

    // Enhance search queries with user preferences from memory
    if (opts.toolName === 'web_search' && opts.toolArgs.query) {
      const personalizedQuery = injectMemoryIntoQuery(opts.toolArgs.query, memoryContext);
      return {
        originalArgs: { ...opts.toolArgs, query: personalizedQuery },
        memoryContext,
        personalizedQuery,
      };
    }

    // Enhance document generation with user preferences
    if (opts.toolName === 'generate_document') {
      const enhancedArgs = enhanceDocGenWithMemory(opts.toolArgs, memoryContext);
      return {
        originalArgs: enhancedArgs,
        memoryContext,
      };
    }

    return { originalArgs: opts.toolArgs, memoryContext };
  } catch {
    return { originalArgs: opts.toolArgs, memoryContext: '' };
  }
}

function injectMemoryIntoQuery(query: string, memoryContext: string): string {
  const preferences = extractPreferences(memoryContext);
  if (!preferences) return query;

  const topics = preferences.match(/\b(?:interested in|likes|prefers|focus on|works with|studies|researches)\s+([^.\n]+)/gi);
  if (topics) {
    const relevantTopics = topics.map(t => t.replace(/^(?:interested in|likes|prefers|focus on|works with|studies|researches)\s+/i, '').trim());
    if (relevantTopics.length > 0) {
      return `${query} — context: user is interested in ${relevantTopics.slice(0, 2).join(', ')}`;
    }
  }

  return query;
}

function enhanceDocGenWithMemory(args: any, memoryContext: string): any {
  const enhanced = { ...args };

  const stylePrefs = extractPreferences(memoryContext);
  if (stylePrefs) {
    if (stylePrefs.includes('concise') || stylePrefs.includes('brief')) {
      enhanced.topic = `${args.topic || ''} — keep concise and to the point`;
    }
    if (stylePrefs.includes('detailed') || stylePrefs.includes('comprehensive')) {
      enhanced.topic = `${args.topic || ''} — make comprehensive and detailed`;
    }
    if (stylePrefs.includes('formal') || stylePrefs.includes('professional')) {
      enhanced.topic = `${args.topic || ''} — use formal tone`;
    }
  }

  return enhanced;
}

function extractPreferences(memoryContext: string): string | null {
  if (!memoryContext || memoryContext === 'No relevant memories.') return null;
  return memoryContext;
}
