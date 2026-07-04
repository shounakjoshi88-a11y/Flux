interface CacheEntry<V> {
  value: V;
  size: number;
  lastAccess: number;
  segment: 'probationary' | 'protected';
}

export class SegmentedLRUCache<K extends string, V> {
  private entries = new Map<K, CacheEntry<V>>();
  private totalBytes = 0;

  constructor(
    private maxBytes: number,
    private maxEntries: number,
    private protectedRatio = 0.7,
  ) {}

  get(key: K): V | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    entry.lastAccess = Date.now();

    if (entry.segment === 'probationary') {
      entry.segment = 'protected';
      this.rebalanceProtected();
    }

    return entry.value;
  }

  set(key: K, value: V, size: number): boolean {
    if (size > this.maxBytes) return false;

    if (this.entries.has(key)) {
      this.remove(key);
    }

    this.evictUntilFits(size);

    this.entries.set(key, {
      value,
      size,
      lastAccess: Date.now(),
      segment: 'probationary',
    });
    this.totalBytes += size;
    return true;
  }

  has(key: K): boolean {
    return this.entries.has(key);
  }

  delete(key: K): boolean {
    return this.remove(key);
  }

  private evictUntilFits(incomingSize: number) {
    while (
      this.totalBytes + incomingSize > this.maxBytes ||
      this.entries.size >= this.maxEntries
    ) {
      const victim = this.pickEvictionVictim();
      if (!victim) break;
      this.remove(victim);
    }
  }

  private pickEvictionVictim(): K | null {
    let victim: K | null = null;
    let victimScore = -Infinity;

    for (const [key, entry] of this.entries) {
      const segmentWeight = entry.segment === 'probationary' ? 1_000_000_000 : 0;
      const age = Date.now() - entry.lastAccess;
      const score = segmentWeight + age * 1 + entry.size * 0.001;
      if (score > victimScore) {
        victimScore = score;
        victim = key;
      }
    }
    return victim;
  }

  private rebalanceProtected() {
    const protectedBytes = [...this.entries.values()]
      .filter((e) => e.segment === 'protected')
      .reduce((sum, e) => sum + e.size, 0);

    const cap = this.maxBytes * this.protectedRatio;
    if (protectedBytes <= cap) return;

    const protectedEntries = [...this.entries.entries()]
      .filter(([, e]) => e.segment === 'protected')
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    let excess = protectedBytes - cap;
    for (const [, entry] of protectedEntries) {
      if (excess <= 0) break;
      entry.segment = 'probationary';
      excess -= entry.size;
    }
  }

  private remove(key: K): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.totalBytes -= entry.size;
    this.entries.delete(key);
    return true;
  }

  getTotalSize(): number {
    return this.totalBytes;
  }

  get size(): number {
    return this.entries.size;
  }

  clear() {
    this.entries.clear();
    this.totalBytes = 0;
  }

  keys(): IterableIterator<K> {
    return this.entries.keys();
  }
}
