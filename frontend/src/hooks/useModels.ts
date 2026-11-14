// Dynamic model discovery — fetches models from backend API
// Inspired by AionUi's useAcpModelInfo with polling fallback
import { useState, useEffect, useCallback, useRef } from "react";
import { BACKEND_URL } from "../lib/config";

export interface ModelOption {
  id: string;
  label: string;
}

export interface ModelCategory {
  category: string;
  models: ModelOption[];
}

interface ModelDiscoveryResult {
  categories: ModelCategory[];
  all: ModelOption[];
  currentModelId?: string;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

// Backend host for direct API calls
function getApiHost(): string {
  return BACKEND_URL || "http://localhost:3001";
}

export function useModels(): ModelDiscoveryResult {
  const [categories, setCategories] = useState<ModelCategory[]>([]);
  const [all, setAll] = useState<ModelOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef(0);

  const refresh = useCallback(() => {
    refreshRef.current++;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const fetchModels = async () => {
      try {
        const res = await fetch(`${getApiHost()}/api/models`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { categories: ModelCategory[]; all: ModelOption[] };
        if (!cancelled) {
          setCategories(data.categories || []);
          setAll(data.all || []);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.warn("[models] Backend fetch failed, using fallback:", e.message);
          setError(e.message);
          // Fallback to hardcoded list
          const fallback = getFallbackModels();
          setCategories(fallback);
          setAll(fallback.flatMap((c) => c.models));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchModels();

    // Poll every 5min for model changes (models rarely change at runtime)
    const interval = setInterval(fetchModels, 300_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshRef.current]);

  return { categories, all, isLoading, error, refresh };
}

// Last-resort catalog shown when /api/models is unreachable. Mirrors the
// backend: only models verified live on NVIDIA NIM (2026-11-14) are listed.
function getFallbackModels(): ModelCategory[] {
  return [
    {
      category: "General Purpose",
      models: [
        { id: "nemotron-3-ultra-550b", label: "Nemotron 3 Ultra 550B (NVIDIA)" },
        { id: "laguna-xs-2.1", label: "Laguna XS 2.1 (Poolside)" },
      ],
    },
    {
      category: "Reasoning & Agents",
      models: [
        { id: "nemotron-3-nano-omni-30b-a3b-reasoning", label: "Nemotron 3 Nano Omni 30B Reasoning (NVIDIA)" },
      ],
    },
  ];
}
