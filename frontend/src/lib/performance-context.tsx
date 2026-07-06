import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type PerformanceTier = "high" | "low";

interface PerformanceContextValue {
  tier: PerformanceTier;
  setTier: (tier: PerformanceTier) => void;
  isHigh: boolean;
  isLow: boolean;
}

const PerformanceContext = createContext<PerformanceContextValue | null>(null);

const STORAGE_KEY = "flux_performance_tier";

export function PerformanceProvider({ children }: { children: ReactNode }) {
  const [tier, setTierState] = useState<PerformanceTier>("high");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "low" || saved === "high") {
        setTierState(saved);
      }
    } catch {}
  }, []);

  const setTier = useCallback((t: PerformanceTier) => {
    setTierState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (tier === "low") {
      root.classList.add("performance-low");
      root.classList.remove("performance-high");
    } else {
      root.classList.add("performance-high");
      root.classList.remove("performance-low");
    }
  }, [tier]);

  return (
    <PerformanceContext.Provider value={{ tier, setTier, isHigh: tier === "high", isLow: tier === "low" }}>
      {children}
    </PerformanceContext.Provider>
  );
}

export function usePerformance(): PerformanceContextValue {
  const ctx = useContext(PerformanceContext);
  if (!ctx) throw new Error("usePerformance must be used within PerformanceProvider");
  return ctx;
}
