/**
 * Sandbox manager backed by agent-infra/sandbox (AIO Sandbox).
 *
 * Unlike the previous E2B backend, this is a single shared container: every
 * conversation gets its own working directory under /home/user/<id>, and all
 * file and shell operations are scoped to that directory.
 *
 * The container is expected to be running at SANDBOX_BASE_URL (default
 * http://localhost:8080). Start it with:
 *   docker run -p 127.0.0.1:8080:8080 ghcr.io/agent-infra/sandbox:latest
 */
import { SandboxClient } from '@agent-infra/sandbox';
import { env } from '../config/env';

export interface SandboxHandle {
  /** Conversation-scoped working directory. */
  workdir: string;
  /** Run a shell command and stream output. */
  commands: {
    run: (command: string, options?: any) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  };
  /** File operations. */
  files: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string | Buffer) => Promise<void>;
    list: (path: string) => Promise<{ path: string }[]>;
  };
  /** Run Python code via Jupyter and return logs. */
  runCode: (code: string, options?: any) => Promise<{ logs: { stdout: string[]; stderr: string[] }; error?: { value?: string } }>;
  /** Identifier used for preview URLs. */
  sandboxId: string;
  sandboxDomain: string;
}

/** The SDK does NOT throw on connection failure — it returns
 *  { ok: false, error: { content: { errorMessage } } }. Unwrap to the real
 *  reason: throws with the actual message, or returns the data payload. */
function unwrapSandbox(res: any, op: string): any {
  if (res && res.ok === false) {
    const msg = res?.error?.content?.errorMessage || res?.error?.errorMessage || `sandbox ${op} failed`;
    throw new Error(`[sandbox ${op}] ${msg}`);
  }
  return (res as any)?.data ?? res;
}

export class SandboxManager {
  private client: SandboxClient;
  private base: string;
  private sandboxes = new Map<string, { handle: SandboxHandle; lastUsed: number }>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.base = env.SANDBOX_BASE_URL || 'http://localhost:8080';
    this.client = new SandboxClient({ baseUrl: this.base, environment: this.base });
    this.cleanupInterval = setInterval(() => this.cleanup(), 2 * 60 * 1000);
  }

  async getOrCreate(conversationId: string): Promise<SandboxHandle> {
    const existing = this.sandboxes.get(conversationId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.handle;
    }

    const workdir = `/home/user/${conversationId}`;
    // Ensure the working directory exists — surface failure loudly.
    try {
      const mk = await this.client.shell.execCommand({ command: `mkdir -p ${workdir}` });
      if (mk && (mk as any).ok === false) throw new Error((mk as any)?.error?.content?.errorMessage ?? 'mkdir failed');
    } catch (e: any) {
      console.warn(`[sandbox] cannot reach ${this.base} — commands will fail with the real reason (${e?.message ?? e})`);
    }

    const handle: SandboxHandle = {
      workdir,
      sandboxId: conversationId,
      sandboxDomain: new URL(this.base).host,
      commands: {
        run: async (command: string, options?: any) => {
          const timeout = options?.timeoutMs ?? 120_000;
          try {
            const res = await this.client.shell.execCommand({
              command,
              exec_dir: options?.cwd ?? workdir,
              timeout: Math.round(timeout / 1000),
            });
            const data = unwrapSandbox(res, 'exec');
            // Stream output to callbacks if provided.
            if (options?.onStdout && data?.output) {
              for (const line of String(data.output).split('\n')) {
                if (line) options.onStdout(line);
              }
            }
            if (options?.onStderr && data?.stderr) {
              for (const line of String(data.stderr).split('\n')) {
                if (line) options.onStderr(line);
              }
            }
            // Background processes: fire and forget.
            if (options?.background) {
              return { stdout: data?.output ?? '', stderr: data?.stderr ?? '', exitCode: data?.exit_code ?? 1 };
            }
            return {
              stdout: data?.output ?? '',
              stderr: data?.stderr ?? '',
              exitCode: typeof data?.exit_code === 'number' ? data.exit_code : 1,
            };
          } catch (e: any) {
            // Honest failure — never fake exit 0.
            const msg = e?.message ?? String(e);
            if (options?.onStderr) options.onStderr(msg);
            return { stdout: '', stderr: msg, exitCode: 1 };
          }
        },
      },
      files: {
        read: async (filePath: string) => {
          const res = await this.client.file.readFile({ file: filePath });
          const data = unwrapSandbox(res, 'read');
          return data?.content ?? '';
        },
        write: async (filePath: string, content: string | Buffer) => {
          const res = await this.client.file.writeFile({ file: filePath, content: String(content) });
          unwrapSandbox(res, 'write');
        },
        list: async (dirPath: string) => {
          const res = await this.client.file.listPath({ path: dirPath });
          const data = unwrapSandbox(res, 'list');
          const files = data?.files ?? [];
          return files.map((f: any) => ({ path: f.name ?? f.path ?? '' }));
        },
      },
      runCode: async (code: string, options?: any) => {
        const startTime = Date.now();
        // Use jupyter for Python execution.
        try {
          const res = await this.client.jupyter.executeCode({ code });
          const data = unwrapSandbox(res, 'execute');
          const stdout: string[] = [];
          const stderr: string[] = [];
          if (data?.outputs) {
            for (const o of data.outputs) {
              if (o.text) stdout.push(o.text);
              if (o.stderr) stderr.push(o.stderr);
            }
          }
          if (options?.onStdout) {
            for (const line of stdout) options.onStdout({ line });
          }
          if (options?.onStderr) {
            for (const line of stderr) options.onStderr({ line });
          }
          return { logs: { stdout, stderr }, error: data?.error ? { value: data.error } : undefined };
        } catch (e: any) {
          if (options?.onStderr) options.onStderr({ line: e.message });
          return { logs: { stdout: [], stderr: [e.message] }, error: { value: e.message } };
        }
      },
    };

    this.sandboxes.set(conversationId, { handle, lastUsed: Date.now() });
    return handle;
  }

  async uploadFile(conversationId: string, filename: string, content: Buffer | string): Promise<string> {
    const sandbox = await this.getOrCreate(conversationId);
    const remotePath = `${sandbox.workdir}/${filename}`;
    await sandbox.files.write(remotePath, content);
    return remotePath;
  }

  async downloadFile(conversationId: string, remotePath: string): Promise<Buffer> {
    const sandbox = await this.getOrCreate(conversationId);
    const content = await sandbox.files.read(remotePath);
    return Buffer.from(content);
  }

  async listFiles(conversationId: string, dir = '/home/user'): Promise<string[]> {
    const sandbox = await this.getOrCreate(conversationId);
    try {
      return (await sandbox.files.list(dir)).map((f) => f.path);
    } catch {
      return [];
    }
  }

  async kill(conversationId: string): Promise<void> {
    const existing = this.sandboxes.get(conversationId);
    if (existing) {
      this.sandboxes.delete(conversationId);
    }
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const idleTimeout = 12 * 60 * 1000;
    for (const [convId, { lastUsed }] of this.sandboxes.entries()) {
      if (now - lastUsed > idleTimeout) {
        this.sandboxes.delete(convId);
      }
    }
  }
}

export const sandboxManager = new SandboxManager();
