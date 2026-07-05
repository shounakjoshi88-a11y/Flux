import { Sandbox } from '@e2b/code-interpreter';

export class SandboxManager {
  private sandboxes = new Map<string, { sandbox: Sandbox; lastUsed: number }>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 2 * 60 * 1000);
  }

  async getOrCreate(conversationId: string): Promise<Sandbox> {
    const existing = this.sandboxes.get(conversationId);

    if (existing) {
      // Always extend the sandbox timeout on access to prevent mid-operation expiry
      try { await (existing.sandbox as any).setTimeout?.(1_800_000); } catch {}
      // Only health-check if it's been > 3 minutes since last use
      if (Date.now() - existing.lastUsed < 3 * 60 * 1000) {
        existing.lastUsed = Date.now();
        return existing.sandbox; // skip the echo ping — trust it's alive
      }
      try {
        await existing.sandbox.commands.run('echo alive', { timeoutMs: 3000 });
        existing.lastUsed = Date.now();
        return existing.sandbox;
      } catch {
        this.sandboxes.delete(conversationId);
      }
    }

    const sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY!,
      timeoutMs: 1_800_000,
    });

    // Extend sandbox timeout immediately after creation
    try { await (sandbox as any).setTimeout?.(1_800_000); } catch {}

    await sandbox.commands.run(
      'pip install pandas numpy matplotlib seaborn plotly scipy scikit-learn pillow requests -q',
      { timeoutMs: 60_000 }
    );

    this.sandboxes.set(conversationId, { sandbox, lastUsed: Date.now() });
    return sandbox;
  }

  async uploadFile(conversationId: string, filename: string, content: Buffer | string): Promise<string> {
    const sandbox = await this.getOrCreate(conversationId);
    const remotePath = `/home/user/${filename}`;
    await sandbox.files.write(remotePath, content as any);
    return remotePath;
  }

  async downloadFile(conversationId: string, remotePath: string): Promise<Buffer> {
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
    const idleTimeout = 12 * 60 * 1000;
    for (const [convId, { sandbox, lastUsed }] of this.sandboxes.entries()) {
      if (now - lastUsed > idleTimeout) {
        try { await sandbox.kill(); } catch {}
        this.sandboxes.delete(convId);
      }
    }
  }
}

export const sandboxManager = new SandboxManager();
