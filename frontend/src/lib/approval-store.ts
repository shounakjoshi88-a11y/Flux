// Approval Store — inspired by AionUi's BaseApprovalStore
// Persistent "always allow" cache for tool permissions (survives page reloads)

const STORAGE_KEY = "flux-approval-store";

export interface ApprovalKey {
  action: string;
  identifier?: string;
}

export class ApprovalStore {
  private map = new Map<string, boolean>();

  constructor() {
    this.load();
  }

  private serializeKey(key: ApprovalKey): string {
    return `${key.action}:${key.identifier ?? "*"}`;
  }

  private save(): void {
    try {
      const obj: Record<string, boolean> = {};
      this.map.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch { /* quota exceeded, ignore */ }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, boolean>;
        for (const [k, v] of Object.entries(obj)) {
          if (v) this.map.set(k, true);
        }
      }
    } catch { /* corrupt data, ignore */ }
  }

  isApproved(key: ApprovalKey): boolean {
    return this.map.get(this.serializeKey(key)) === true;
  }

  approve(key: ApprovalKey): void {
    this.map.set(this.serializeKey(key), true);
    this.save();
  }

  revoke(key: ApprovalKey): void {
    this.map.delete(this.serializeKey(key));
    this.save();
  }

  allApproved(keys: ApprovalKey[]): boolean {
    return keys.length > 0 && keys.every((k) => this.isApproved(k));
  }

  clear(): void {
    this.map.clear();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  get size(): number {
    return this.map.size;
  }
}

export const globalApprovalStore = new ApprovalStore();

export function approvalKeyForTool(toolName: string): ApprovalKey {
  const lower = toolName.toLowerCase();
  if (lower.includes("search") || lower.includes("web")) return { action: "search", identifier: toolName };
  if (lower.includes("edit") || lower.includes("write")) return { action: "edit", identifier: toolName };
  if (lower.includes("execute") || lower.includes("bash") || lower.includes("run")) return { action: "exec", identifier: toolName };
  if (lower.includes("read") || lower.includes("file")) return { action: "read", identifier: toolName };
  if (lower.includes("generate") || lower.includes("create")) return { action: "generate", identifier: toolName };
  return { action: "default", identifier: toolName };
}
