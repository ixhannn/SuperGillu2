/**
 * Insertion-ordered LRU cache for string values, bounded by a total byte budget
 * (approximated by string length) and an entry count cap.
 *
 * It is a drop-in for the slice of the `Map` API the in-RAM media caches use —
 * `has` / `get` / `set` / `delete` / `clear` / `size` — so it can replace an
 * unbounded `Map<string, string | null>` with no call-site changes.
 *
 * Eviction policy is least-recently-used:
 *  - `get()` and `set()` promote a key to most-recently-used.
 *  - `set()` evicts the oldest entries until both the running byte total and the
 *    entry count are within budget (never evicting the entry just inserted).
 *
 * The media caches hold base64 data URIs that are always reconstructable from
 * IndexedDB / cloud, so an eviction only ever costs a re-resolve — never data
 * loss. Without a bound, scrolling a long media timeline grew these maps without
 * limit until Android reclaimed the WebView (white-screen / restart).
 */
export class LruStringCache<V extends string | null = string> {
  private readonly map = new Map<string, V>();
  private bytes = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly maxEntries: number = Number.MAX_SAFE_INTEGER,
  ) {}

  private sizeOf(value: V): number {
    return value ? value.length : 0;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    // Promote to most-recently-used: delete + re-insert moves it to the tail of
    // the Map's insertion order, which `evict()` reads from the head.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: V): this {
    if (this.map.has(key)) {
      this.bytes -= this.sizeOf(this.map.get(key) as V);
      this.map.delete(key);
    }
    this.map.set(key, value);
    this.bytes += this.sizeOf(value);
    this.evict();
    return this;
  }

  delete(key: string): boolean {
    if (!this.map.has(key)) return false;
    this.bytes -= this.sizeOf(this.map.get(key) as V);
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.bytes = 0;
  }

  get size(): number {
    return this.map.size;
  }

  /** Approximate current byte footprint — exposed for tests / diagnostics. */
  get byteLength(): number {
    return this.bytes;
  }

  private evict(): void {
    while (
      (this.bytes > this.maxBytes || this.map.size > this.maxEntries)
      && this.map.size > 1
    ) {
      const oldestKey = this.map.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.bytes -= this.sizeOf(this.map.get(oldestKey) as V);
      this.map.delete(oldestKey);
    }
  }
}
