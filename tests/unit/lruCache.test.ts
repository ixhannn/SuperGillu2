import { describe, it, expect } from 'vitest';
import { LruStringCache } from '../../utils/lruCache';

describe('LruStringCache', () => {
  it('behaves like a Map for has/get/set/delete/clear', () => {
    const c = new LruStringCache<string>(1024, 100);
    expect(c.has('a')).toBe(false);
    expect(c.get('a')).toBeUndefined();

    c.set('a', 'alpha');
    expect(c.has('a')).toBe(true);
    expect(c.get('a')).toBe('alpha');
    expect(c.size).toBe(1);

    expect(c.delete('a')).toBe(true);
    expect(c.delete('a')).toBe(false);
    expect(c.has('a')).toBe(false);

    c.set('x', '1');
    c.set('y', '2');
    c.clear();
    expect(c.size).toBe(0);
    expect(c.has('x')).toBe(false);
  });

  it('overwriting a key updates the byte total, not the count', () => {
    const c = new LruStringCache<string>(1024, 100);
    c.set('k', 'short');
    expect(c.byteLength).toBe(5);
    c.set('k', 'a-much-longer-value');
    expect(c.size).toBe(1);
    expect(c.byteLength).toBe('a-much-longer-value'.length);
  });

  it('evicts least-recently-used entries when the entry cap is exceeded', () => {
    const c = new LruStringCache<string>(1_000_000, 3);
    c.set('a', '1');
    c.set('b', '2');
    c.set('c', '3');
    // Touch 'a' so it becomes most-recently-used; 'b' is now the oldest.
    expect(c.get('a')).toBe('1');
    c.set('d', '4'); // exceeds cap of 3 → evict LRU ('b')
    expect(c.has('b')).toBe(false);
    expect(c.has('a')).toBe(true);
    expect(c.has('c')).toBe(true);
    expect(c.has('d')).toBe(true);
    expect(c.size).toBe(3);
  });

  it('evicts oldest entries when the byte budget is exceeded', () => {
    // Budget of 10 bytes; each value is 4 bytes.
    const c = new LruStringCache<string>(10, 100);
    c.set('a', 'aaaa'); // 4
    c.set('b', 'bbbb'); // 8
    c.set('c', 'cccc'); // 12 > 10 → evict 'a' → 8
    expect(c.has('a')).toBe(false);
    expect(c.has('b')).toBe(true);
    expect(c.has('c')).toBe(true);
    expect(c.byteLength).toBe(8);
  });

  it('never evicts the entry just inserted, even if it alone exceeds budget', () => {
    const c = new LruStringCache<string>(4, 100);
    c.set('huge', 'xxxxxxxxxxxxxxxx'); // 16 bytes > 4-byte budget
    // Only one entry → kept (eviction stops at size 1) so the caller still
    // reads back what it just wrote this turn.
    expect(c.get('huge')).toBe('xxxxxxxxxxxxxxxx');
    expect(c.size).toBe(1);
  });

  it('counts null values as zero bytes (no-media sentinels)', () => {
    const c = new LruStringCache<string | null>(1024, 100);
    c.set('missing', null);
    expect(c.has('missing')).toBe(true);
    expect(c.get('missing')).toBeNull();
    expect(c.byteLength).toBe(0);
  });
});
