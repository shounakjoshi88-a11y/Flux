import { sandboxManager } from '../sandbox/sandboxManager';

export interface CodeExecutionResult {
  stdout: string[];
  stderr: string[];
  exitCode: number;
  duration: number;
  generatedFiles: string[];
  error?: string;
}

export interface AppProcess {
  id: string;
  name: string;
  command: string;
  cwd: string;
  startedAt: number;
  port?: number;
  handle: any;
}

export type AppProcessInfo = Omit<AppProcess, 'handle'>;

const mimeTypes: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf',
  csv: 'text/csv', json: 'application/json', txt: 'text/plain',
  html: 'text/html', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export class CodeExecutor {
  private apps = new Map<string, Map<string, AppProcess>>();

  async runPython(
    conversationId: string,
    code: string,
    onOutput?: (type: 'stdout' | 'stderr', line: string) => void,
    signal?: AbortSignal
  ): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const sandbox = await sandboxManager.getOrCreate(conversationId);
    try {
      const filesBefore = await this._listFiles(sandbox, '/home/user');
      const result = await sandbox.runCode(code, {
        onStdout: (output: any) => onOutput?.('stdout', output.line),
        onStderr: (output: any) => onOutput?.('stderr', output.line),
        timeoutMs: 120_000,
        signal,
      } as any);
      const filesAfter = await this._listFiles(sandbox, '/home/user');
      const newFiles = filesAfter.filter(f => !filesBefore.includes(f));
      return {
        stdout: result.logs.stdout,
        stderr: result.logs.stderr,
        exitCode: result.error ? 1 : 0,
        duration: Date.now() - startTime,
        generatedFiles: newFiles,
        error: result.error?.value,
      };
    } catch (e: any) {
      return { stdout: [], stderr: [e.message], exitCode: 1, duration: Date.now() - startTime, generatedFiles: [], error: e.message };
    }
  }

  async runBash(
    conversationId: string,
    command: string,
    onOutput?: (type: 'stdout' | 'stderr', line: string) => void,
    signal?: AbortSignal
  ): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const sandbox = await sandboxManager.getOrCreate(conversationId);
    try {
      const filesBefore = await this._listFiles(sandbox, '/home/user');
      const result = await sandbox.commands.run(command, {
        onStdout: (data) => onOutput?.('stdout', data),
        onStderr: (data) => onOutput?.('stderr', data),
        timeoutMs: 120_000,
        signal,
      });
      const filesAfter = await this._listFiles(sandbox, '/home/user');
      const newFiles = filesAfter.filter(f => !filesBefore.includes(f));
      return {
        stdout: [result.stdout], stderr: [result.stderr],
        exitCode: result.exitCode, duration: Date.now() - startTime,
        generatedFiles: newFiles,
      };
    } catch (e: any) {
      return { stdout: [], stderr: [e.message], exitCode: 1, duration: Date.now() - startTime, generatedFiles: [], error: e.message };
    }
  }

  async startApp(
    conversationId: string,
    name: string,
    command: string,
    cwd: string = '/home/user',
    port?: number,
  ): Promise<AppProcess> {
    const sandbox = await sandboxManager.getOrCreate(conversationId);
    const handle = await sandbox.commands.run(command, {
      background: true,
      cwd,
      envs: { ...(port ? { PORT: String(port) } : {}) },
    });
    const app: AppProcess = {
      id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      command,
      cwd,
      startedAt: Date.now(),
      port,
      handle,
    };
    if (!this.apps.has(conversationId)) this.apps.set(conversationId, new Map());
    this.apps.get(conversationId)!.set(app.id, app);
    return app;
  }

  async stopApp(conversationId: string, appId: string): Promise<boolean> {
    const apps = this.apps.get(conversationId);
    if (!apps) return false;
    const app = apps.get(appId);
    if (!app) return false;
    try { await app.handle.kill(); } catch {}
    apps.delete(appId);
    if (apps.size === 0) this.apps.delete(conversationId);
    return true;
  }

  listApps(conversationId: string): AppProcessInfo[] {
    const apps = this.apps.get(conversationId);
    if (!apps) return [];
    return Array.from(apps.values()).map(({ handle, ...rest }) => rest as AppProcessInfo);
  }

  getApp(conversationId: string, appId: string): AppProcess | null {
    return this.apps.get(conversationId)?.get(appId) ?? null;
  }

  async getAppLogs(conversationId: string, appId: string): Promise<{ stdout: string; stderr: string }> {
    const app = this.apps.get(conversationId)?.get(appId);
    if (!app) return { stdout: '', stderr: '' };
    try {
      const result = await app.handle.wait({ timeoutMs: 500 });
      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
      };
    } catch {
      return { stdout: '', stderr: '' };
    }
  }

  async getAppUrl(conversationId: string, appId: string): Promise<string | null> {
    const app = this.apps.get(conversationId)?.get(appId);
    if (!app || !app.port) return null;
    try {
      const sandbox = await sandboxManager.getOrCreate(conversationId);
      const url = await sandbox.commands.run(
        `curl -s http://localhost:${app.port} -o /dev/null -w "%{http_code}"`,
        { timeoutMs: 3_000 },
      );
      if (url.stdout && parseInt(url.stdout) > 0) {
        return `https://${sandbox.sandboxId}-${app.port}.${sandbox.sandboxDomain}`;
      }
      return null;
    } catch {
      return null;
    }
  }

  async readFile(conversationId: string, path: string): Promise<string> {
    const sandbox = await sandboxManager.getOrCreate(conversationId);
    const content = await sandbox.files.read(path);
    return content.toString();
  }

  async writeFile(conversationId: string, path: string, content: string): Promise<void> {
    const sandbox = await sandboxManager.getOrCreate(conversationId);
    await sandbox.files.write(path, content);
  }

  async editFile(conversationId: string, path: string, oldStr: string, newStr: string): Promise<{ success: boolean; error?: string }> {
    try {
      const content = await this.readFile(conversationId, path);
      if (!content.includes(oldStr)) return { success: false, error: `String not found in file: "${oldStr.slice(0, 50)}..."` };
      await this.writeFile(conversationId, path, content.replace(oldStr, newStr));
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async listFiles(conversationId: string, path = '/home/user'): Promise<string[]> {
    try {
      const sandbox = await sandboxManager.getOrCreate(conversationId);
      return (await sandbox.files.list(path)).map(f => f.path);
    } catch { return []; }
  }

  async installPackage(conversationId: string, packageName: string, onOutput?: (type: 'stdout' | 'stderr', line: string) => void): Promise<void> {
    await this.runBash(conversationId, `pip install ${packageName} -q`, onOutput);
  }

  async getGeneratedFile(conversationId: string, remotePath: string): Promise<{ base64: string; mimeType: string }> {
    const buffer = await sandboxManager.downloadFile(conversationId, remotePath);
    const ext = remotePath.split('.').pop()?.toLowerCase() || '';
    return { base64: buffer.toString('base64'), mimeType: mimeTypes[ext] || 'application/octet-stream' };
  }

  private async _listFiles(sandbox: any, path: string): Promise<string[]> {
    try { return (await sandbox.files.list(path)).map((f: any) => f.path); } catch { return []; }
  }
}

export const codeExecutor = new CodeExecutor();
