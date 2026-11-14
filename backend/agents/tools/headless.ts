import { tool } from 'ai';
import { z } from 'zod';
import { codeExecutor } from '../../sandbox/executor';
import { wikiManager } from '../../services/wiki/manager';
import { sandboxManager } from '../../sandbox/sandboxManager';
import { createGoogleTools } from '../../services/google/tools';
import { resolveSkill, skillNameForDocType, skillBodyForDocType } from '../../services/skills/registry';
import { generateDocumentWithSkill } from '../../services/documents/generate';

type StatusCallback = (event: string, data: any) => void;

interface AgentState {
  sources: any[];
  generatedFiles: any[];
  thoughtProcess: any[];
  searchCount: number;
  wikiSearchCount: number;
  searchContent: string;
  weatherDone: boolean;
}

function smartRewriteQuery(q: string, _userQuery: string): string { return q; }
function extractTopicFromQuery(q: string): string { return q; }
function isFollowUpQuery(q: string): boolean { return /^(can you|tell me|explain|elaborate|continue|more|and|what about)/i.test(q); }
function isQueryRelevant(userQ: string, modelQ: string): boolean {
  const userWords = new Set(userQ.toLowerCase().split(/\s+/));
  const modelWords = modelQ.toLowerCase().split(/\s+/);
  return modelWords.some(w => w.length > 3 && userWords.has(w));
}
function isGenericQuery(q: string): boolean {
  return /^(tell me more|elaborate|explain|continue|go on|what else|more details|can you expand)/i.test(q.trim());
}
function sanitizeLocation(loc: string): string { return loc; }
function buildStructuredFileContext(_files: any[], _query: string, _maxLen: number, _onProgress: any): string { return ''; }

function enhanceImagePrompt(prompt: string, _model: any): Promise<string> {
  return Promise.resolve(prompt);
}
async function fetchWeatherFromAPI(city: string): Promise<any> {
  return null;
}
async function extractDocxText(buf: Buffer): Promise<string> { return ''; }
async function extractPdf(buf: Buffer): Promise<any> { return { markdown: '', text: '', pages: [], token_count: 0, metadata: { pages: 0, ocr_pages: 0, is_scanned: false, has_images: false } }; }
async function processLargeDocument(_result: any, _uid: string, _source: string, _tool: string, _query: string): Promise<void> {}
const IMAGE_SERVICE_URL = process.env.IMAGE_SERVICE_URL || 'http://localhost:8001';
const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'shall', 'should', 'may', 'might', 'must', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'down', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom']);

export function createHeadlessFluxTools(
  onStatus: StatusCallback,
  model: any,
  state: AgentState,
  userQuery?: string,
  activeConversationId?: string,
  uid?: string,
  abortSignal?: AbortSignal,
) {
  const res: any = {
    writableEnded: false,
    write: () => true,
    end: () => {},
    flush: () => {},
    on: () => {},
  };

  return {
    web_search: (tool as any)({
      description: 'Search the web to retrieve LIVE, CURRENT data.',
      inputSchema: z.object({
        query: z.string().describe('Targeted search query (6-10 words)'),
        queries: z.array(z.string()).optional(),
      }),
      execute: async ({ query, queries: queriesArr }: any) => {
        if (state.searchCount >= 2) {
          return '__SEARCH_BLOCKED__ SEARCH LIMIT REACHED.';
        }
        state.searchCount++;
        onStatus('searching', { query, searchCount: state.searchCount });
        return `[Search results for "${query}"]\nSearch completed. ${state.searchCount} search(es) so far.`;
      },
    }),

    read_skill: (tool as any)({
      description: 'Load a skill from the catalog by name (e.g. "pdf-skill"), or a doc_type ("file", "design", "pdf"…) for document generation.',
      inputSchema: z.object({
        skill: z.string().optional(),
        doc_type: z.string().optional(),
      }),
      execute: async ({ skill, doc_type }: any) => {
        const requested = (typeof skill === 'string' && skill.trim()) ? skill.trim().toLowerCase() : (typeof doc_type === 'string' ? doc_type : '');
        const name = skillNameForDocType(requested) ?? requested;
        onStatus('reading_skill', { skill: name });
        const resolved = await resolveSkill(name, uid);
        if (!resolved) return `No skill named "${name}" exists. Available skills are in the catalog.`;
        return resolved.body;
      },
    }),

    generate_document: (tool as any)({
      description: 'Generate a downloadable document file.',
      inputSchema: z.object({
        doc_type: z.enum(['pdf', 'pptx', 'docx', 'xlsx', 'csv', 'tsv', 'md', 'json', 'sql', 'html', 'tech', 'finance', 'coder', 'creative', 'legal']),
        topic: z.string(),
        skill_content: z.string().optional(),
      }),
      execute: async ({ doc_type, topic, skill_content }: any) => {
        onStatus('generating_file', { docType: doc_type, topic: topic?.slice(0, 30) });
        const file = await generateDocumentWithSkill(doc_type, topic || '', model, skill_content || '', state.searchContent || '');
        if (file) {
          state.generatedFiles.push(file);
          onStatus('generating_file_success', { docType: doc_type, filename: file.filename });
          return `${doc_type.toUpperCase()} file "${file.filename}" generated.`;
        }
        return `Failed to generate ${doc_type.toUpperCase()} document.`;
      },
    }),

    get_weather: (tool as any)({
      description: 'Fetch real-time weather data for a specific city.',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }: any) => {
        onStatus('weather', { city });
        const result = await fetchWeatherFromAPI(sanitizeLocation(city || ''));
        if (!result) return `Could not fetch weather for ${city}.`;
        return `${result.resolvedCity}: ${Math.round(result.temperature)}°C, ${result.description}`;
      },
    }),

    generate_image: (tool as any)({
      description: 'Generate an AI image.',
      inputSchema: z.object({ prompt: z.string() }),
      execute: async ({ prompt }: any) => {
        onStatus('image_generating', { prompt: prompt?.slice(0, 80) });
        const enhanced = await enhanceImagePrompt(prompt, model);
        try {
          const health = await fetch(`${IMAGE_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
          if (!health?.ok) return 'Image service is offline.';
          const imgRes = await fetch(`${IMAGE_SERVICE_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: enhanced, width: 1024, height: 1024 }),
            signal: AbortSignal.timeout(180_000),
          });
          if (!imgRes.ok) return `Image service error: HTTP ${imgRes.status}`;
          const imgData = await imgRes.json() as any;
          state.generatedFiles.push({ base64: imgData.image_base64, filename: `bonsai-${Date.now()}.png`, mime: 'image/png' });
          onStatus('image_generating_success', { width: imgData.width, height: imgData.height });
          return `Image generated (${imgData.width}x${imgData.height}px).`;
        } catch (e: any) {
          return `Image generation failed: ${e.message}`;
        }
      },
    }),

    run_python: (tool as any)({
      description: 'Execute Python code in an isolated sandbox.',
      inputSchema: z.object({ code: z.string() }),
      execute: async ({ code }: any) => {
        const cid = activeConversationId || 'default';
        onStatus('sandbox_start', { tool: 'run_python' });
        try {
          const result = await codeExecutor.runPython(cid, code || '', undefined, abortSignal);
          onStatus('sandbox_success', { tool: 'run_python', exitCode: result.exitCode, duration: result.duration });
          const out = result.stdout.join('\n').slice(0, 4000);
          const err = result.stderr.join('\n').slice(0, 2000);
          return `Exit code: ${result.exitCode} (${(result.duration / 1000).toFixed(1)}s)\n${out ? `STDOUT:\n${out}\n` : ''}${err ? `STDERR:\n${err}\n` : ''}`;
        } catch (e: any) {
          return `Python execution failed: ${e.message}`;
        }
      },
    }),

    run_bash: (tool as any)({
      description: 'Run a bash command in the sandbox.',
      inputSchema: z.object({ command: z.string() }),
      execute: async ({ command }: any) => {
        const cid = activeConversationId || 'default';
        onStatus('sandbox_start', { tool: 'run_bash', command: command?.slice(0, 80) });
        try {
          const result = await codeExecutor.runBash(cid, command || '', undefined, abortSignal);
          onStatus('sandbox_success', { tool: 'run_bash', exitCode: result.exitCode, duration: result.duration });
          const out = result.stdout.join('\n').slice(0, 4000);
          const err = result.stderr.join('\n').slice(0, 2000);
          return `Exit code: ${result.exitCode} (${(result.duration / 1000).toFixed(1)}s)\n${out ? `STDOUT:\n${out}\n` : ''}${err ? `STDERR:\n${err}\n` : ''}`;
        } catch (e: any) {
          return `Bash failed: ${e.message}`;
        }
      },
    }),

    read_file: (tool as any)({
      description: 'Read contents of a text/code file from the sandbox.',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }: any) => {
        const cid = activeConversationId || 'default';
        try {
          const content = await codeExecutor.readFile(cid, path);
          return `Contents of ${path}:\n\n${content}`;
        } catch (e: any) {
          return `Failed to read ${path}: ${e.message}`;
        }
      },
    }),

    write_file: (tool as any)({
      description: 'Write content to a new file in the sandbox.',
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }: any) => {
        const cid = activeConversationId || 'default';
        try {
          await codeExecutor.writeFile(cid, path, content || '');
          return `File written to ${path}.`;
        } catch (e: any) {
          return `Failed to write ${path}: ${e.message}`;
        }
      },
    }),

    list_files: (tool as any)({
      description: 'List files in a sandbox directory.',
      inputSchema: z.object({ path: z.string().optional() }),
      execute: async ({ path }: any) => {
        const cid = activeConversationId || 'default';
        try {
          const files = await codeExecutor.listFiles(cid, path || '/home/user');
          return `Files in ${path || '/home/user'}:\n${files.join('\n') || '(empty)'}`;
        } catch (e: any) {
          return `Failed to list files: ${e.message}`;
        }
      },
    }),

    install_package: (tool as any)({
      description: 'Install a Python package via pip in the sandbox.',
      inputSchema: z.object({ package: z.string() }),
      execute: async ({ package: pkg }: any) => {
        const cid = activeConversationId || 'default';
        onStatus('sandbox_start', { tool: 'install_package', package: pkg });
        try {
          await codeExecutor.installPackage(cid, pkg || '');
          onStatus('sandbox_success', { tool: 'install_package', package: pkg });
          return `Package ${pkg} installed.`;
        } catch (e: any) {
          return `Install failed: ${e.message}`;
        }
      },
    }),

    edit_file: (tool as any)({
      description: 'Surgically edit a file by replacing the first occurrence of old_str with new_str.',
      inputSchema: z.object({ path: z.string(), old_str: z.string(), new_str: z.string() }),
      execute: async ({ path, old_str, new_str }: any) => {
        const cid = activeConversationId || 'default';
        onStatus('generating_file', { tool: 'edit_file', path });
        try {
          const result = await codeExecutor.editFile(cid, path, old_str || '', new_str || '');
          if (result.success) {
            onStatus('generating_file_success', { tool: 'edit_file', path });
            return `File ${path} edited.`;
          }
          return `Edit failed: ${result.error}`;
        } catch (e: any) {
          return `Edit failed: ${e.message}`;
        }
      },
    }),

    wiki_search: (tool as any)({
      description: 'Search the knowledge graph for concepts and entities.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }: any) => {
        if (!uid || !query) return 'No user or query provided.';
        state.wikiSearchCount++;
        try {
          const nodes = await wikiManager.searchConcepts(uid, query);
          if (!nodes.length) return `No wiki entries found for "${query}".`;
          return `Wiki results for "${query}":\n${nodes.map((n: any) => `  - ${n.label} (${n.type}): ${n.description || 'no description'}`).join('\n')}`;
        } catch (e: any) {
          return `Wiki search failed: ${e.message}`;
        }
      },
    }),

    create_project: (tool as any)({
      description: 'Scaffold a full project directory with files in the sandbox.',
      inputSchema: z.object({
        name: z.string(),
        files: z.array(z.object({ path: z.string(), content: z.string() })),
      }),
      execute: async ({ name, files }: any) => {
        const cid = activeConversationId || 'default';
        const projectDir = `/home/user/${name}`;
        onStatus('generating_file', { tool: 'create_project', name });
        try {
          await codeExecutor.runBash(cid, `mkdir -p ${projectDir}`);
          let created = 0;
          for (const f of files || []) {
            const fullPath = f.path.startsWith('/') ? f.path : `${projectDir}/${f.path}`;
            const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
            await codeExecutor.runBash(cid, `mkdir -p ${dir}`);
            await codeExecutor.writeFile(cid, fullPath, f.content || '');
            created++;
          }
          onStatus('generating_file_success', { tool: 'create_project', name, created });
          return `Project "${name}" created with ${created} files at ${projectDir}`;
        } catch (e: any) {
          return `Failed to create project: ${e.message}`;
        }
      },
    }),

    start_app: (tool as any)({
      description: 'Start a long-running background process in the sandbox.',
      inputSchema: z.object({
        name: z.string(),
        command: z.string(),
        cwd: z.string().optional(),
        port: z.number().optional(),
      }),
      execute: async ({ name, command, cwd, port }: any) => {
        const cid = activeConversationId || 'default';
        onStatus('sandbox_start', { tool: 'start_app', name });
        try {
          const app = await codeExecutor.startApp(cid, name || 'app', command, cwd || '/home/user', port);
          onStatus('sandbox_success', { tool: 'start_app', name, app_id: app.id });
          return `App "${app.name}" started (ID: ${app.id}).`;
        } catch (e: any) {
          return `Failed to start app: ${e.message}`;
        }
      },
    }),

    stop_app: (tool as any)({
      description: 'Stop a running background app by its ID.',
      inputSchema: z.object({ app_id: z.string() }),
      execute: async ({ app_id }: any) => {
        const cid = activeConversationId || 'default';
        try {
          const stopped = await codeExecutor.stopApp(cid, app_id);
          return stopped ? `App ${app_id} stopped.` : `App ${app_id} not found.`;
        } catch (e: any) {
          return `Failed to stop app: ${e.message}`;
        }
      },
    }),

    list_apps: (tool as any)({
      description: 'List all running background apps in the current sandbox.',
      inputSchema: z.object({}),
      execute: async () => {
        const cid = activeConversationId || 'default';
        const apps = codeExecutor.listApps(cid);
        if (!apps.length) return 'No running apps.';
        return apps.map(a => `  ID: ${a.id} | Name: ${a.name} | Command: ${a.command}`).join('\n');
      },
    }),

    get_app_logs: (tool as any)({
      description: 'Get stdout/stderr from a running or finished app.',
      inputSchema: z.object({ app_id: z.string() }),
      execute: async ({ app_id }: any) => {
        const cid = activeConversationId || 'default';
        const logs = await codeExecutor.getAppLogs(cid, app_id);
        let result = '';
        if (logs.stdout) result += `STDOUT:\n${logs.stdout}\n`;
        if (logs.stderr) result += `STDERR:\n${logs.stderr}\n`;
        return result || 'No logs available.';
      },
    }),

    get_app_url: (tool as any)({
      description: 'Get the public HTTPS URL for a running web app.',
      inputSchema: z.object({ app_id: z.string() }),
      execute: async ({ app_id }: any) => {
        const cid = activeConversationId || 'default';
        onStatus('searching', { tool: 'get_app_url', app_id });
        try {
          const url = await codeExecutor.getAppUrl(cid, app_id);
          if (url) {
            onStatus('found_sources', { url });
            return `Your app is live at: ${url}`;
          }
          return 'App URL not yet available.';
        } catch (e: any) {
          return `Failed to get app URL: ${e.message}`;
        }
      },
    }),

    get_generated_file: (tool as any)({
      description: 'Download a file from the sandbox as base64.',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }: any) => {
        const cid = activeConversationId || 'default';
        try {
          const { base64, mimeType } = await codeExecutor.getGeneratedFile(cid, path);
          const filename = path.split('/').pop() || 'file';
          onStatus('generating_file_success', { filename, mimeType });
          return `File "${filename}" (${mimeType}, ${Math.round(base64.length * 0.75 / 1024)}KB) ready. Download: /api/sandbox/download/${cid}/${filename}`;
        } catch (e: any) {
          return `Failed to get file: ${e.message}`;
        }
      },
    }),

    read_url: (tool as any)({
      description: 'Fetch and extract readable text content from a URL.',
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }: any) => {
        if (!url || typeof url !== 'string') return 'No URL provided.';
        if (!url.startsWith('http://') && !url.startsWith('https://')) return 'Invalid URL.';
        onStatus('reading', { url });
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);
          const resp = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FluxBot/1.0)' } });
          clearTimeout(timeoutId);
          if (!resp.ok) return `HTTP ${resp.status}`;
          const text = await resp.text();
          const extracted = text
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 50000);
          onStatus('found_sources', { url, length: extracted.length });
          return `[CONTENT FROM ${url}]\n${extracted}`;
        } catch (e: any) {
          return `Failed to fetch: ${e.message}`;
        }
      },
    }),

    retrieve_doc_chunks: (tool as any)({
      description: 'Search previously uploaded documents for relevant sections.',
      inputSchema: z.object({
        query: z.string(),
        documentName: z.string().optional(),
        topK: z.number().optional(),
      }),
      execute: async ({ query, documentName, topK }: any) => {
        if (!uid || !query) return 'No user or query.';
        const { retrieveDocChunks } = await import('../../lib/hybrid-retrieval');
        const results = await retrieveDocChunks(query, uid, documentName, Math.min(topK ?? 5, 10));
        if (results.length === 0) return 'No matching sections found.';
        return results.map((r: any, i: number) => `[Section ${i + 1}]${r.heading ? ` (${r.heading})` : ''}\n${r.text}`).join('\n\n---\n\n');
      },
    }),

    ...createGoogleTools(uid, res, state),
  };
}
