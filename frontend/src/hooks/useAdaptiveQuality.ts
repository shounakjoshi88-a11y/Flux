import { useMemo } from "react";
import { useConnectionQuality, type ConnectionQuality } from "./useConnectionQuality";

export interface AdaptiveConfig {
  quality: ConnectionQuality;
  batchingDelay: number;
  loadImages: boolean;
  loadFullImages: boolean;
  loadFonts: boolean;
  renderDiagrams: boolean;
  showFollowUps: boolean;
  runAutoDocGen: boolean;
  updateWiki: boolean;
  cachePreference: 'network-first' | 'cache-first';
}

function computeConfig(quality: ConnectionQuality, dataSaver: boolean): AdaptiveConfig {
  switch (quality) {
    case 'fast':
      return {
        quality,
        batchingDelay: 0,
        loadImages: true,
        loadFullImages: true,
        loadFonts: true,
        renderDiagrams: true,
        showFollowUps: true,
        runAutoDocGen: true,
        updateWiki: true,
        cachePreference: 'network-first',
      };
    case 'medium':
      return {
        quality,
        batchingDelay: 500,
        loadImages: true,
        loadFullImages: !dataSaver,
        loadFonts: true,
        renderDiagrams: true,
        showFollowUps: true,
        runAutoDocGen: true,
        updateWiki: true,
        cachePreference: dataSaver ? 'cache-first' : 'network-first',
      };
    case 'slow':
      return {
        quality,
        batchingDelay: 2000,
        loadImages: !dataSaver,
        loadFullImages: false,
        loadFonts: !dataSaver,
        renderDiagrams: false,
        showFollowUps: false,
        runAutoDocGen: false,
        updateWiki: false,
        cachePreference: 'cache-first',
      };
    case 'offline':
      return {
        quality,
        batchingDelay: 0,
        loadImages: false,
        loadFullImages: false,
        loadFonts: false,
        renderDiagrams: false,
        showFollowUps: false,
        runAutoDocGen: false,
        updateWiki: false,
        cachePreference: 'cache-first',
      };
  }
}

export function useAdaptiveQuality(dataSaverOverride?: boolean) {
  const { quality, saveData } = useConnectionQuality(30_000);
  const dataSaver = dataSaverOverride ?? saveData;

  const config = useMemo(() => computeConfig(quality, dataSaver), [quality, dataSaver]);

  return config;
}
