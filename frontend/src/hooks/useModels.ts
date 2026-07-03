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
  return BACKEND_URL || "https://localhost:3001";
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
          const clean = (cats: ModelCategory[]) => cats.map(c => ({ ...c, models: c.models.map(m => ({ ...m, label: cleanLabel(m.label) })) }));
          setCategories(clean(data.categories || []));
          setAll((data.all || []).map(m => ({ ...m, label: cleanLabel(m.label) })));
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

    // Poll every 30s for model changes (like AionUi)
    const interval = setInterval(fetchModels, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshRef.current]);

  return { categories, all, isLoading, error, refresh };
}

function cleanLabel(label: string): string {
  return label.replace(/\s*\(.*?\)\s*/g, "").trim();
}

function getFallbackModels(): ModelCategory[] {
  return [
    {
      category: "General Purpose",
      models: [
        { id: "mistral-large-675b", label: cleanLabel("Mistral Large 3 675B (Mistral AI)") },
        { id: "glm-5.1", label: cleanLabel("GLM 5.1 (Z‑AI)") },
        { id: "kimi-k2.6", label: cleanLabel("Kimi K2.6 (Moonshot AI)") },
        { id: "nemotron-3-ultra-550b", label: cleanLabel("Nemotron 3 Ultra 550B (NVIDIA)") },
        { id: "deepseek-v4-flash", label: cleanLabel("DeepSeek V4 Flash (DeepSeek)") },
        { id: "qwen3.5-397b-a17b", label: cleanLabel("Qwen 3.5 397B (Qwen)") },
        { id: "minimax-m2.7", label: cleanLabel("MiniMax M2.7 (MiniMax)") },
        { id: "minimax-m3", label: cleanLabel("MiniMax M3 (MiniMax)") },
        { id: "deepseek-v4-pro", label: cleanLabel("DeepSeek V4 Pro (DeepSeek)") },
        { id: "sarvam-m", label: cleanLabel("Sarvam-M (Sarvam AI)") },
        { id: "nemotron-nano-12b-v2-vl", label: cleanLabel("Nemotron Nano 12B v2 VL (NVIDIA)") },
      ],
    },
    {
      category: "Reasoning & Agents",
      models: [
        { id: "step-3.7-flash", label: cleanLabel("Step 3.7 Flash (StepFun)") },
        { id: "step-3.5-flash", label: cleanLabel("Step 3.5 Flash (StepFun)") },
      ],
    },
  ];
}
