export interface CacheMetrics {
  hitRate: number;
  compressionRatio: number;
  avgEvictionsPerSession: number;
  protectedSegmentUtilization: number;
  totalHits: number;
  totalMisses: number;
  totalEvictions: number;
  rawBytes: number;
  compressedBytes: number;
}

const SESSION_KEY = 'flux-cache-metrics';

function loadSessionMetrics(): Partial<CacheMetrics> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSessionMetrics(m: Partial<CacheMetrics>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(m));
  } catch {
  }
}

export class CacheMetricsCollector {
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private rawBytes = 0;
  private compressedBytes = 0;

  recordHit(bytesSaved?: number) {
    this.hits++;
    this.compressedBytes += bytesSaved ?? 0;
    const session = loadSessionMetrics();
    session.totalHits = (session.totalHits ?? 0) + 1;
    saveSessionMetrics(session);
  }

  recordMiss() {
    this.misses++;
    const session = loadSessionMetrics();
    session.totalMisses = (session.totalMisses ?? 0) + 1;
    saveSessionMetrics(session);
  }

  recordEviction() {
    this.evictions++;
    const session = loadSessionMetrics();
    session.totalEvictions = (session.totalEvictions ?? 0) + 1;
    saveSessionMetrics(session);
  }

  recordCompression(raw: number, compressed: number) {
    this.rawBytes += raw;
    this.compressedBytes += compressed;
  }

  getMetrics(): CacheMetrics {
    const session = loadSessionMetrics();
    const totalHits = session.totalHits ?? 0;
    const totalMisses = session.totalMisses ?? 0;
    const total = totalHits + totalMisses;

    return {
      hitRate: total > 0 ? totalHits / total : 0,
      compressionRatio: this.compressedBytes > 0 ? this.rawBytes / this.compressedBytes : 1,
      avgEvictionsPerSession: session.totalEvictions ?? 0,
      protectedSegmentUtilization: 0,
      totalHits,
      totalMisses,
      totalEvictions: session.totalEvictions ?? 0,
      rawBytes: this.rawBytes,
      compressedBytes: this.compressedBytes,
    };
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.rawBytes = 0;
    this.compressedBytes = 0;
    sessionStorage.removeItem(SESSION_KEY);
  }
}

export const cacheMetrics = new CacheMetricsCollector();
