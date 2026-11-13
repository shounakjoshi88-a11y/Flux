# FLUX — CODE INTERPRETER / COMPUTER USE FEATURE
> Give this entire document to GLM 5.2. It is your single source of truth for adding code execution to Flux.

---

## 0. YOUR ROLE & MISSION

You are adding a **code interpreter and file execution feature** to an existing production app called **Flux**. This is similar to Claude's computer use / code execution feature, ChatGPT's Code Interpreter, or Cursor's terminal.

You will write real, working, production-quality TypeScript code that integrates cleanly into Flux's existing architecture. No pseudocode. No placeholders. Every file fully implemented.

---

## 1. WHAT WE'RE BUILDING

### The Feature
When a user uploads a file or asks Flux to write/run code, Flux should:
1. Spin up an **isolated sandbox** (E2B)
2. Upload any user files into that sandbox
3. Let the AI **execute code**, **read files**, **edit files**, **run bash commands**
4. Stream **stdout/stderr output** back to the user via SSE in real time
5. Let the AI **generate output files** (charts, CSVs, processed data) that the user can download
6. Show a **terminal-style output panel** inline in the chat message

### User Experience Flow
```
User: "Here's my sales.csv — analyze it and make a bar chart"
         ↓ uploads file
Flux:  💭 Planning...
       📁 Reading sales.csv (342 rows, 5 columns)
       🐍 Running Python analysis...
       
       [TERMINAL OUTPUT]
       > import pandas as pd
       > df = pd.read_csv('sales.csv')
       > print(df.describe())
         revenue    units
       count  342.0  342.0
       mean   4521.3  89.2
       ...
       
       📊 Generating bar chart...
       ✅ chart.png generated
       
       [Downloadable: chart.png]
       
       "Here's your analysis. Revenue peaked in Q3..."
```

---

## 2. FLUX EXISTING ARCHITECTURE — WHAT YOU'RE WORKING WITH

### Tech Stack
```
Runtime:     Bun v1.2+
Backend:     Express 5 + TypeScript
Frontend:    React 19 + TypeScript + Vite
Styling:     Tailwind CSS v4 (CSS custom properties)
Animation:   Framer Motion
Database:    PostgreSQL + Prisma
Auth:        Supabase JWT middleware
Models:      NVIDIA NIM API (OpenAI-compatible)
Search:      Tavily API
SSE:         Custom fetch-based streaming (NOT EventSource)
```

### Existing Agentic Loop Tool Registry Pattern
```typescript
// Tools already in Flux — you are ADDING to this, not replacing it
const TOOL_REGISTRY = {
  web_search:      { description: 'Search the web', parameters: { query: 'string' } },
  memory_search:   { description: 'Search user memory', parameters: { query: 'string' } },
  image_search:    { description: 'Search for images', parameters: { query: 'string' } },
  generate_document: { description: 'Generate files', parameters: { type: 'string', content: 'object' } },
  // YOU ARE ADDING THESE:
  run_python:      { description: 'Execute Python code in sandbox', parameters: { code: 'string' } },
  run_bash:        { description: 'Run bash command in sandbox', parameters: { command: 'string' } },
  read_file:       { description: 'Read a file from sandbox', parameters: { path: 'string' } },
  write_file:      { description: 'Write a file to sandbox', parameters: { path: 'string', content: 'string' } },
  edit_file:       { description: 'Surgically edit a file', parameters: { path: 'string', old_str: 'string', new_str: 'string' } },
  list_files:      { description: 'List files in sandbox directory', parameters: { path: 'string' } },
  install_package: { description: 'Install a Python package', parameters: { package: 'string' } },
};
```

### Existing SSE Event Pattern
```typescript
// Flux already sends these events — you are ADDING new ones
sendEvent('thinking_start', { step, action });
sendEvent('tool_call', { tool, input });
sendEvent('tool_result', { tool, result });
sendEvent('text_delta', { content });
sendEvent('artifact', { type, filename, url });
sendEvent('done', {});

// NEW EVENTS YOU ARE ADDING:
sendEvent('sandbox_start', { sandboxId });
sendEvent('code_output', { type: 'stdout' | 'stderr', content: string });
sendEvent('code_done', { exitCode: number, duration: number });
sendEvent('file_generated', { filename: string, path: string, downloadUrl: string });
sendEvent('sandbox_end', {});
```

### Existing File Upload Pattern
```typescript
// Flux already has file upload — check your existing upload route
// Files land in a temp directory or are base64 encoded in the request
// You need to pipe these into the E2B sandbox
```

---

## 3. SANDBOX — E2B INTEGRATION

### Why E2B
- **Free tier**: 100 hours/month compute, more than enough
- **Isolated**: Each session gets its own sandboxed Ubuntu container
- **Fast**: Cold start ~150ms
- **TypeScript SDK**: First-class support
- **Pre-installed**: Python, Node.js, common packages available

### Installation
```bash
bun add @e2b/code-interpreter
# or
npm install @e2b/code-interpreter
```

### E2B Free Tier Setup
1. Sign up at **e2b.dev**
2. Get API key from dashboard
3. Add to `.env`: `E2B_API_KEY=e2b_...`
4. Free tier: 100 compute hours/month, sandboxes auto-timeout after 5 minutes of inactivity

### Core E2B Pattern
```typescript
import { Sandbox } from '@e2b/code-interpreter';

// Create sandbox (one per conversation session — reuse if still alive)
const sandbox = await Sandbox.create({
  apiKey: process.env.E2B_API_KEY,
  timeoutMs: 300_000,  // 5 minutes
});

// Run Python code
const result = await sandbox.runCode(`
import pandas as pd
df = pd.read_csv('/home/user/sales.csv')
print(df.head())
print(df.describe())
`);

console.log(result.logs.stdout);   // Array of stdout lines
console.log(result.logs.stderr);   // Array of stderr lines

// Upload a file into sandbox
await sandbox.files.write('/home/user/sales.csv', fileBuffer);

// Download a generated file from sandbox
const chartBytes = await sandbox.files.read('/home/user/chart.png');

// Run bash command
const bashResult = await sandbox.commands.run('ls -la /home/user/');

// Install package
await sandbox.commands.run('pip install matplotlib seaborn plotly');

// Kill sandbox when done
await sandbox.kill();
```

---

## 4. NEW FILES TO CREATE

### 4.1 `backend/sandbox/sandboxManager.ts`
```typescript
import { Sandbox } from '@e2b/code-interpreter';
import { prisma } from '../index';

// Manage sandbox lifecycle — one per conversation, reused across messages
export class SandboxManager {
  private sandboxes: Map<string, { sandbox: Sandbox; lastUsed: number }> = new Map();
  private cleanupInterval: NodeJS.Timer;

  constructor() {
    // Clean up idle sandboxes every 2 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 2 * 60 * 1000);
  }

  async getOrCreate(conversationId: string): Promise<Sandbox> {
    const existing = this.sandboxes.get(conversationId);
    
    if (existing) {
      // Check if sandbox is still alive
      try {
        await existing.sandbox.commands.run('echo alive');
        existing.lastUsed = Date.now();
        return existing.sandbox;
      } catch {
        // Sandbox died, remove it
        this.sandboxes.delete(conversationId);
      }
    }

    // Create new sandbox
    const sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY!,
      timeoutMs: 300_000,  // 5 minutes
    });

    // Pre-install commonly needed packages
    await sandbox.commands.run(
      'pip install pandas numpy matplotlib seaborn plotly scipy scikit-learn pillow requests -q',
      { timeoutMs: 60_000 }
    );

    this.sandboxes.set(conversationId, { sandbox, lastUsed: Date.now() });
    return sandbox;
  }

  async uploadFile(
    conversationId: string,
    filename: string,
    content: Buffer | string
  ): Promise<string> {
    const sandbox = await this.getOrCreate(conversationId);
    const remotePath = `/home/user/${filename}`;
    await sandbox.files.write(remotePath, content);
    return remotePath;
  }

  async downloadFile(
    conversationId: string,
    remotePath: string
  ): Promise<Buffer> {
    const sandbox = await this.getOrCreate(conversationId);
    return Buffer.from(await sandbox.files.read(remotePath));
  }

  async kill(conversationId: string): Promise<void> {
    const existing = this.sandboxes.get(conversationId);
    if (existing) {
      try { await existing.sandbox.kill(); } catch {}
      this.sandboxes.delete(conversationId);
    }
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const idleTimeout = 4 * 60 * 1000; // Kill after 4 minutes idle

    for (const [convId, { sandbox, lastUsed }] of this.sandboxes.entries()) {
      if (now - lastUsed > idleTimeout) {
        try { await sandbox.kill(); } catch {}
        this.sandboxes.delete(convId);
        console.log(`Killed idle sandbox for conversation ${convId}`);
      }
    }
  }
}

// Singleton instance — import this everywhere
export const sandboxManager = new SandboxManager();
```

### 4.2 `backend/tools/codeExecutor.ts`
```typescript
import { sandboxManager } from '../sandbox/sandboxManager';

export interface CodeExecutionResult {
  stdout: string[];
  stderr: string[];
  exitCode: number;
  duration: number;
  generatedFiles: string[];  // Paths of any new files created
  error?: string;
}

export class CodeExecutor {

  // Run Python code with streaming output
  async runPython(
    conversationId: string,
    code: string,
    onOutput: (type: 'stdout' | 'stderr', line: string) => void
  ): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const sandbox = await sandboxManager.getOrCreate(conversationId);

    try {
      // Get files before execution to detect newly created ones
      const filesBefore = await this.listFiles(conversationId, '/home/user');

      const result = await sandbox.runCode(code, {
        onStdout: (output) => onOutput('stdout', output.line),
        onStderr: (output) => onOutput('stderr', output.line),
        timeoutMs: 60_000,  // 1 minute max execution
      });

      // Detect newly generated files
      const filesAfter = await this.listFiles(conversationId, '/home/user');
      const newFiles = filesAfter.filter(f => !filesBefore.includes(f));

      return {
        stdout: result.logs.stdout,
        stderr: result.logs.stderr,
        exitCode: result.error ? 1 : 0,
        duration: Date.now() - startTime,
        generatedFiles: newFiles,
        error: result.error?.value,
      };
    } catch (error: any) {
      return {
        stdout: [],
        stderr: [error.message],
        exitCode: 1,
        duration: Date.now() - startTime,
        generatedFiles: [],
        error: error.message,
      };
    }
  }

  // Run bash command
  async runBash(
    conversationId: string,
    command: string,
    onOutput: (type: 'stdout' | 'stderr', line: string) => void
  ): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const sandbox = await sandboxManager.getOrCreate(conversationId);

    try {
      const result = await sandbox.commands.run(command, {
        onStdout: (data) => onOutput('stdout', data),
        onStderr: (data) => onOutput('stderr', data),
        timeoutMs: 30_000,
      });

      return {
        stdout: [result.stdout],
        stderr: [result.stderr],
        exitCode: result.exitCode,
        duration: Date.now() - startTime,
        generatedFiles: [],
      };
    } catch (error: any) {
      return {
        stdout: [],
        stderr: [error.message],
        exitCode: 1,
        duration: Date.now() - startTime,
        generatedFiles: [],
        error: error.message,
      };
    }
  }

  // Read file from sandbox
  async readFile(conversationId: string, path: string): Promise<string> {
    const sandbox = await sandboxManager.getOrCreate(conversationId);
    const content = await sandbox.files.read(path);
    return content.toString();
  }

  // Write file to sandbox
  async writeFile(conversationId: string, path: string, content: string): Promise<void> {
    const sandbox = await sandboxManager.getOrCreate(conversationId);
    await sandbox.files.write(path, content);
  }

  // Surgical edit — find old_str, replace with new_str
  async editFile(
    conversationId: string,
    path: string,
    oldStr: string,
    newStr: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const content = await this.readFile(conversationId, path);
      if (!content.includes(oldStr)) {
        return { success: false, error: `String not found in file: "${oldStr.slice(0, 50)}..."` };
      }
      const newContent = content.replace(oldStr, newStr);
      await this.writeFile(conversationId, path, newContent);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // List files in sandbox directory
  async listFiles(conversationId: string, path: string = '/home/user'): Promise<string[]> {
    try {
      const sandbox = await sandboxManager.getOrCreate(conversationId);
      const files = await sandbox.files.list(path);
      return files.map(f => f.path);
    } catch {
      return [];
    }
  }

  // Install Python package
  async installPackage(
    conversationId: string,
    packageName: string,
    onOutput: (type: 'stdout' | 'stderr', line: string) => void
  ): Promise<void> {
    await this.runBash(
      conversationId,
      `pip install ${packageName} -q`,
      onOutput
    );
  }

  // Download generated file from sandbox — returns base64
  async getGeneratedFile(
    conversationId: string,
    remotePath: string
  ): Promise<{ base64: string; mimeType: string }> {
    const buffer = await sandboxManager.downloadFile(conversationId, remotePath);
    const ext = remotePath.split('.').pop()?.toLowerCase() || '';
    
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      csv: 'text/csv',
      json: 'application/json',
      txt: 'text/plain',
      html: 'text/html',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    return {
      base64: buffer.toString('base64'),
      mimeType: mimeTypes[ext] || 'application/octet-stream',
    };
  }
}

export const codeExecutor = new CodeExecutor();
```

### 4.3 `backend/routes/upload.ts` (Update existing or create)
```typescript
import { Router } from 'express';
import { verifySupabaseJWT } from '../middleware/auth';
import { sandboxManager } from '../sandbox/sandboxManager';
import multer from 'multer';

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }  // 50MB limit
});

// Upload file — saves to sandbox for the conversation
router.post('/file', verifySupabaseJWT, upload.single('file'), async (req, res) => {
  try {
    const { conversationId } = req.body;
    const file = req.file;

    if (!file || !conversationId) {
      return res.status(400).json({ error: 'File and conversationId required' });
    }

    // Upload to E2B sandbox
    const remotePath = await sandboxManager.uploadFile(
      conversationId,
      file.originalname,
      file.buffer
    );

    res.json({
      success: true,
      filename: file.originalname,
      remotePath,
      size: file.size,
      mimeType: file.mimetype,
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Download generated file from sandbox
router.get('/generated/:conversationId/:filename', verifySupabaseJWT, async (req, res) => {
  try {
    const { conversationId, filename } = req.params;
    const remotePath = `/home/user/${filename}`;
    
    const buffer = await sandboxManager.downloadFile(conversationId, remotePath);
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

---

## 5. MODIFY EXISTING FILES

### 5.1 Add to `backend/orchestrator/executor.ts`
Find your existing `executeTool` function and add these new cases:

```typescript
// ADD these cases to your existing switch/if-else in executeTool()

case 'run_python': {
  const outputLines: Array<{ type: 'stdout' | 'stderr', content: string }> = [];
  
  // Stream output via SSE as code runs
  const result = await codeExecutor.runPython(
    context.conversationId,
    toolInput.code,
    (type, line) => {
      outputLines.push({ type, content: line });
      sendEvent('code_output', { type, content: line });  // Live streaming!
    }
  );

  sendEvent('code_done', {
    exitCode: result.exitCode,
    duration: result.duration
  });

  // If files were generated, send download links
  for (const filePath of result.generatedFiles) {
    const filename = filePath.split('/').pop()!;
    sendEvent('file_generated', {
      filename,
      downloadUrl: `/api/upload/generated/${context.conversationId}/${filename}`
    });
  }

  return {
    success: result.exitCode === 0,
    stdout: result.stdout.join('\n'),
    stderr: result.stderr.join('\n'),
    generatedFiles: result.generatedFiles,
    error: result.error,
  };
}

case 'run_bash': {
  const result = await codeExecutor.runBash(
    context.conversationId,
    toolInput.command,
    (type, line) => sendEvent('code_output', { type, content: line })
  );

  sendEvent('code_done', { exitCode: result.exitCode, duration: result.duration });
  return { stdout: result.stdout.join('\n'), stderr: result.stderr.join('\n'), exitCode: result.exitCode };
}

case 'read_file': {
  const content = await codeExecutor.readFile(context.conversationId, toolInput.path);
  return { content, path: toolInput.path };
}

case 'write_file': {
  await codeExecutor.writeFile(context.conversationId, toolInput.path, toolInput.content);
  return { success: true, path: toolInput.path };
}

case 'edit_file': {
  const result = await codeExecutor.editFile(
    context.conversationId,
    toolInput.path,
    toolInput.old_str,
    toolInput.new_str
  );
  return result;
}

case 'list_files': {
  const files = await codeExecutor.listFiles(context.conversationId, toolInput.path);
  return { files };
}

case 'install_package': {
  await codeExecutor.installPackage(
    context.conversationId,
    toolInput.package,
    (type, line) => sendEvent('code_output', { type, content: line })
  );
  return { success: true, package: toolInput.package };
}
```

### 5.2 Add to Tool Registry in `agenticLoop.ts` or `planner.ts`
Find where `TOOL_REGISTRY` or `availableTools` is defined and add:

```typescript
// ADD these to your existing TOOL_REGISTRY object
run_python: {
  description: 'Execute Python code in an isolated sandbox. Use for data analysis, visualization, file processing, calculations. Has pandas, numpy, matplotlib, seaborn, plotly, scipy, scikit-learn pre-installed.',
  parameters: {
    code: 'string — complete, runnable Python code'
  },
  when_to_use: 'When user asks to analyze data, create charts, process files, do math, run algorithms'
},
run_bash: {
  description: 'Run a bash command in the sandbox',
  parameters: {
    command: 'string — bash command to execute'
  },
  when_to_use: 'For file operations, installing tools, checking system info'
},
read_file: {
  description: 'Read contents of a file from the sandbox',
  parameters: {
    path: 'string — absolute path like /home/user/data.csv'
  },
  when_to_use: 'Before editing a file or when you need to see its contents'
},
write_file: {
  description: 'Create or overwrite a file in the sandbox',
  parameters: {
    path: 'string — file path',
    content: 'string — file content'
  },
  when_to_use: 'When creating new files or saving content to disk'
},
edit_file: {
  description: 'Surgically edit a file by replacing a specific string with new content. ALWAYS read_file first.',
  parameters: {
    path: 'string — file path',
    old_str: 'string — EXACT string to find (must be unique in file)',
    new_str: 'string — replacement string'
  },
  when_to_use: 'When modifying specific parts of existing files without rewriting the whole file'
},
list_files: {
  description: 'List files in a sandbox directory',
  parameters: {
    path: 'string — directory path, default /home/user'
  },
  when_to_use: 'To see what files exist, check what was generated'
},
install_package: {
  description: 'Install a Python package via pip',
  parameters: {
    package: 'string — package name e.g. "tensorflow" or "opencv-python"'
  },
  when_to_use: 'When the needed library is not pre-installed'
},
```

### 5.3 Add to System Prompt in `planner.ts`
Add this to whatever system prompt your planner uses:

```
You have access to a Python code interpreter running in an isolated Ubuntu sandbox.
Pre-installed packages: pandas, numpy, matplotlib, seaborn, plotly, scipy, scikit-learn, pillow, requests.

When the user uploads files, they are available at /home/user/<filename>.
Generated files (charts, CSVs, etc.) should be saved to /home/user/ so they can be downloaded.

For data analysis tasks:
1. First use list_files to see uploaded files
2. Use read_file to understand the data structure
3. Write Python code that saves output to /home/user/output.<ext>
4. Run it with run_python
5. Report what was generated

Always save matplotlib plots with: plt.savefig('/home/user/chart.png', dpi=150, bbox_inches='tight')
Always save DataFrames with: df.to_csv('/home/user/result.csv', index=False)
```

---

## 6. FRONTEND — NEW COMPONENTS

### 6.1 `frontend/src/components/CodeOutputBlock.tsx`
```typescript
// Terminal-style output panel shown inline in chat messages
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CodeLine {
  type: 'stdout' | 'stderr' | 'input';
  content: string;
}

interface CodeOutputBlockProps {
  language?: string;
  code?: string;           // The code that was run
  outputLines: CodeLine[]; // Streaming output
  exitCode?: number;
  duration?: number;
  isRunning: boolean;
  generatedFiles?: Array<{ filename: string; downloadUrl: string }>;
}

export function CodeOutputBlock({
  language = 'python',
  code,
  outputLines,
  exitCode,
  duration,
  isRunning,
  generatedFiles = []
}: CodeOutputBlockProps) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div style={{
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      overflow: 'hidden',
      marginTop: '8px',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: '#1e1e1e',
        borderBottom: '1px solid #333',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Traffic light dots */}
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
          <span style={{ fontSize: '11px', color: '#888', marginLeft: '4px' }}>
            {language} interpreter
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isRunning && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', color: '#888'
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#27c93f',
                animation: 'pulse 1.5s infinite'
              }} />
              Running...
            </div>
          )}
          {exitCode !== undefined && (
            <span style={{
              fontSize: '11px',
              color: exitCode === 0 ? '#27c93f' : '#ff5f56'
            }}>
              {exitCode === 0 ? '✓' : '✗'} Exit {exitCode}
              {duration && ` · ${(duration / 1000).toFixed(1)}s`}
            </span>
          )}
          {code && (
            <button
              onClick={() => setShowCode(!showCode)}
              style={{
                background: 'none', border: '1px solid #444',
                color: '#888', fontSize: '10px', padding: '2px 6px',
                borderRadius: '4px', cursor: 'pointer'
              }}
            >
              {showCode ? 'hide code' : 'show code'}
            </button>
          )}
        </div>
      </div>

      {/* Code section (collapsible) */}
      <AnimatePresence>
        {showCode && code && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              background: '#2d2d2d',
              padding: '12px',
              borderBottom: '1px solid #333',
              overflow: 'hidden',
            }}
          >
            <pre style={{
              margin: 0, fontSize: '12px', color: '#ccc',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word'
            }}>
              {code}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Output terminal */}
      <div style={{
        background: '#0d1117',
        padding: '12px',
        maxHeight: '400px',
        overflowY: 'auto',
        minHeight: outputLines.length === 0 && isRunning ? '60px' : 'auto',
      }}>
        {outputLines.length === 0 && isRunning && (
          <span style={{ color: '#888', fontSize: '12px' }}>
            ▶ Executing...
          </span>
        )}
        {outputLines.map((line, i) => (
          <div key={i} style={{
            fontSize: '12px',
            lineHeight: '1.6',
            color: line.type === 'stderr' ? '#ff7b72' : '#e6edf3',
            fontFamily: 'JetBrains Mono, monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {line.type === 'stderr' && (
              <span style={{ color: '#ff7b72', opacity: 0.7 }}>ERR </span>
            )}
            {line.content}
          </div>
        ))}
        {isRunning && (
          <span style={{
            display: 'inline-block',
            width: '8px', height: '14px',
            background: '#e6edf3',
            animation: 'blink 1s step-end infinite',
            marginLeft: '2px',
            verticalAlign: 'text-bottom'
          }} />
        )}
      </div>

      {/* Generated files */}
      {generatedFiles.length > 0 && (
        <div style={{
          background: '#161b22',
          padding: '8px 12px',
          borderTop: '1px solid #333',
          display: 'flex', flexWrap: 'wrap', gap: '8px'
        }}>
          {generatedFiles.map((file, i) => (
            <a
              key={i}
              href={file.downloadUrl}
              download={file.filename}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 10px',
                background: '#21262d',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#58a6ff',
                fontSize: '12px',
                textDecoration: 'none',
              }}
            >
              📎 {file.filename}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 6.2 Add CSS Animations to your global CSS
```css
/* Add to your main CSS file */
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

### 6.3 Update `MessageItem.tsx` — Handle New SSE Events
Find where you handle SSE events in your message rendering and add:

```typescript
// In your message state, add:
interface MessageState {
  // ... existing fields
  codeBlocks: Array<{
    code: string;
    language: string;
    outputLines: Array<{ type: 'stdout' | 'stderr'; content: string }>;
    exitCode?: number;
    duration?: number;
    isRunning: boolean;
    generatedFiles: Array<{ filename: string; downloadUrl: string }>;
  }>;
}

// In your SSE event handler (useChat.ts), add:
case 'tool_call':
  if (data.tool === 'run_python' || data.tool === 'run_bash') {
    // Start a new code block
    setCurrentMessage(prev => ({
      ...prev,
      codeBlocks: [...prev.codeBlocks, {
        code: data.input?.code || data.input?.command || '',
        language: data.tool === 'run_python' ? 'python' : 'bash',
        outputLines: [],
        isRunning: true,
        generatedFiles: [],
      }]
    }));
  }
  break;

case 'code_output':
  // Append to the last code block
  setCurrentMessage(prev => ({
    ...prev,
    codeBlocks: prev.codeBlocks.map((block, i) =>
      i === prev.codeBlocks.length - 1
        ? { ...block, outputLines: [...block.outputLines, { type: data.type, content: data.content }] }
        : block
    )
  }));
  break;

case 'code_done':
  setCurrentMessage(prev => ({
    ...prev,
    codeBlocks: prev.codeBlocks.map((block, i) =>
      i === prev.codeBlocks.length - 1
        ? { ...block, isRunning: false, exitCode: data.exitCode, duration: data.duration }
        : block
    )
  }));
  break;

case 'file_generated':
  setCurrentMessage(prev => ({
    ...prev,
    codeBlocks: prev.codeBlocks.map((block, i) =>
      i === prev.codeBlocks.length - 1
        ? {
            ...block,
            generatedFiles: [...block.generatedFiles, {
              filename: data.filename,
              downloadUrl: data.downloadUrl
            }]
          }
        : block
    )
  }));
  break;
```

### 6.4 Update `ChatInput.tsx` — File Upload Button
```typescript
// Add file upload button to your existing chat input
// When file is selected:
const handleFileUpload = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('conversationId', conversationId);

  const res = await fetch('/api/upload/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
  });

  const data = await res.json();
  
  // Add a message showing the file was uploaded
  setUploadedFiles(prev => [...prev, {
    filename: data.filename,
    remotePath: data.remotePath,
    size: data.size,
  }]);
  
  // Show pill in chat input area
  // "📎 sales.csv · 34KB  ×"
};

// When sending message, include uploaded files in context:
const messageWithFiles = uploadedFiles.length > 0
  ? `${userMessage}\n\n[Uploaded files: ${uploadedFiles.map(f => f.filename).join(', ')}]`
  : userMessage;
```

---

## 7. ENVIRONMENT VARIABLES TO ADD

```env
# Add to backend .env
E2B_API_KEY=e2b_...    # Get from e2b.dev (free)
```

---

## 8. PACKAGE.JSON ADDITIONS

```bash
# Backend
bun add @e2b/code-interpreter multer
bun add -d @types/multer

# Frontend — no new packages needed (D3 already there if wiki was added)
```

---

## 9. BUILD ORDER — FOLLOW EXACTLY

### Phase 1: Sandbox Foundation
1. Sign up at e2b.dev, get API key
2. `bun add @e2b/code-interpreter multer @types/multer`
3. Write `backend/sandbox/sandboxManager.ts` (full file above)
4. Write `backend/tools/codeExecutor.ts` (full file above)
5. Test with a simple script: create sandbox, run `print("hello world")`, kill sandbox

### Phase 2: Backend Integration  
1. Update `backend/routes/upload.ts` with file upload + download routes
2. Add new tool cases to `executor.ts`
3. Add new tools to tool registry in `agenticLoop.ts`/`planner.ts`
4. Add code interpreter context to system prompt
5. Test: POST to `/api/upload/file`, verify file lands in sandbox

### Phase 3: SSE Events
1. Add `code_output`, `code_done`, `file_generated` events to chat route
2. Test: Ask Flux "print hello world in python" — should see code_output events in network tab

### Phase 4: Frontend
1. Write `CodeOutputBlock.tsx` component
2. Update `useChat.ts` hook to handle new SSE events
3. Update `MessageItem.tsx` to render `CodeOutputBlock`
4. Update `ChatInput.tsx` with file upload button + pill display
5. Add CSS animations

### Phase 5: Polish + Test
1. Test full flow: upload CSV → ask for analysis → see live terminal output → download chart
2. Test error handling: bad code, missing file, timeout
3. Test sandbox reuse: second message in same conversation reuses sandbox
4. Test sandbox cleanup: idle 4+ minutes → sandbox killed automatically

---

## 10. CODING STANDARDS

1. **No `any` types** — type everything properly
2. **Error handling** — every sandbox operation in try/catch, surface errors gracefully
3. **SSE safety** — check `!res.writableEnded` before every `sendEvent` call
4. **Sandbox cleanup** — always clean up sandboxes, never leak them
5. **File size limits** — 50MB max upload, enforce on both frontend and backend
6. **Timeout handling** — code execution max 60 seconds, bash max 30 seconds
7. **Security** — never let user control the sandbox path prefix (always `/home/user/`)
8. **Design system** — `CodeOutputBlock` uses dark terminal theme (#0d1117, #1e1e1e) — this is intentional, keep it dark even in light mode since it's a terminal

---

## 11. SECURITY NOTES

E2B sandboxes are already isolated (separate container per session), but still:
- Never expose the sandbox ID to the frontend
- Always prefix file paths with `/home/user/` — never let raw paths from user reach the sandbox API
- Rate limit the upload endpoint (5 files per minute per user)
- Validate file types on upload (reject `.exe`, `.sh` from direct execution — only AI can run bash)
- Sanitize filenames: `filename.replace(/[^a-zA-Z0-9._-]/g, '_')`

---

## 12. WHAT THE FINISHED FEATURE LOOKS LIKE

```
User uploads: sales_data.csv
User says: "Analyze my sales data and show me trends"

Flux responds:
┌─────────────────────────────────────────────┐
│ 💭 Step 1: Planning...                       │
│ 📁 list_files → sales_data.csv found         │
│ 👁️ read_file → 342 rows, columns: date,      │
│    revenue, units, region                    │
│ 🐍 run_python → Analyzing...                 │
│                                              │
│ ┌─── python interpreter ──────────── ✓ 2.3s ┤
│ │> import pandas as pd               show   │
│ │> import matplotlib.pyplot as plt   code   │
│ │                                           │
│ │ Shape: (342, 5)                           │
│ │ Date range: 2024-01-01 to 2024-12-31      │
│ │ Total revenue: $1,547,832                 │
│ │ Peak month: August ($187,234)             │
│ │ Top region: West (38% of revenue)         │
│ └───────────────────────────────────────────┘
│                                              │
│ 📎 revenue_chart.png  📎 monthly_summary.csv │
│                                              │
│ Your sales show strong growth through Q3...  │
└─────────────────────────────────────────────┘
```

---

*End of prompt. Give this entire document to GLM 5.2, then say "Start Phase 1."*
*Always paste exact error messages when debugging. GLM will fix them.*
