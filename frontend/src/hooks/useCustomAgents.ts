// Custom Agents — inspired by AionUi's custom agent system with Hub integration
import { useState, useCallback, useEffect } from "react";
import { BACKEND_URL } from "@/lib/config";

export interface CustomAgent {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Array<{ name: string; value: string }>;
  icon?: string;
  advanced?: {
    yolo_id?: string;
    native_skills_dirs?: string[];
    description?: string;
  };
  createdAt: string;
}

function apiHost(): string {
  return BACKEND_URL || "http://localhost:3001";
}

export function useCustomAgents() {
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch(`${apiHost()}/api/agents/custom`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { agents: CustomAgent[] };
      setAgents(data.agents || []);
    } catch (e: any) {
      console.warn("[custom-agents] Failed to load:", e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createAgent = useCallback(async (spec: {
    name: string; command: string; args?: string[];
    env?: Array<{ name: string; value: string }>;
    icon?: string;
  }) => {
    const res = await fetch(`${apiHost()}/api/agents/custom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spec),
    });
    if (!res.ok) throw new Error("Failed to create agent");
    const data = await res.json() as { agent: CustomAgent };
    setAgents((prev) => [...prev, data.agent]);
    return data.agent;
  }, []);

  const deleteAgent = useCallback(async (id: string) => {
    const res = await fetch(`${apiHost()}/api/agents/custom/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete agent");
    setAgents((prev) => prev.filter((a) => a.id !== id));
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  return { agents, isLoading, createAgent, deleteAgent, refresh: loadAgents };
}
