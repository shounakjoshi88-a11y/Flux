import { useState, useEffect, useRef, useCallback } from "react";
import { BACKEND_URL } from "@/lib/config";

export type ConnectionQuality = 'fast' | 'medium' | 'slow' | 'offline';

interface ConnectionInfo {
  quality: ConnectionQuality;
  latency: number;
  effectiveType: string | null;
  saveData: boolean;
}

function classifyQuality(latency: number, effectiveType: string | null, saveData: boolean): ConnectionQuality {
  if (!navigator.onLine) return 'offline';
  if (saveData) return 'slow';
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 'slow';
  if (effectiveType === '3g') return 'medium';
  if (effectiveType === '4g' || effectiveType === '5g') {
    if (latency < 200) return 'fast';
    if (latency < 800) return 'medium';
    return 'slow';
  }
  if (latency < 200) return 'fast';
  if (latency < 800) return 'medium';
  return 'slow';
}

export function useConnectionQuality(probeIntervalMs = 30_000) {
  const [info, setInfo] = useState<ConnectionInfo>(() => ({
    quality: navigator.onLine ? 'medium' : 'offline',
    latency: 0,
    effectiveType: null,
    saveData: false,
  }));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const probeLatency = useCallback(async (): Promise<number> => {
    const start = performance.now();
    try {
      await fetch(`${BACKEND_URL}/ping`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      return performance.now() - start;
    } catch {
      return Infinity;
    }
  }, []);

  const updateInfo = useCallback(async () => {
    if (!mountedRef.current) return;

    let effectiveType: string | null = null;
    let saveData = false;
    let latency = Infinity;

    if ((navigator as any).connection) {
      const conn = (navigator as any).connection as any;
      effectiveType = conn.effectiveType ?? null;
      saveData = conn.saveData ?? false;
    }

    latency = await probeLatency();

    if (!mountedRef.current) return;

    const quality = classifyQuality(latency, effectiveType, saveData);
    setInfo({ quality, latency, effectiveType, saveData });
  }, [probeLatency]);

  useEffect(() => {
    mountedRef.current = true;
    updateInfo();

    const handleOnline = () => {
      updateInfo();
    };
    const handleOffline = () => {
      setInfo({ quality: 'offline', latency: Infinity, effectiveType: null, saveData: false });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const conn = (navigator as any).connection as EventTarget | undefined;
    conn?.addEventListener('change', updateInfo);

    timerRef.current = setInterval(updateInfo, probeIntervalMs);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      conn?.removeEventListener('change', updateInfo);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [probeIntervalMs, updateInfo]);

  return info;
}
