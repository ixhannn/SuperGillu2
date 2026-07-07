/**
 * OUR HOME — time, sky and the coarse warm clock.
 *
 * Two windows, two skies: each window renders its person's real local hour from
 * pure timezone math (no weather API). One air-tint layer walks the whole room
 * from pale-gold dawn to plum midnight. And the only clock the home ever speaks
 * is five warm phrases — never a timestamp.
 */
import type { CoarsePhrase } from './homeTypes';

/* ── colour math ─────────────────────────────────────────────── */

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const mixHex = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${c(lerp(ar, br, t))}${c(lerp(ag, bg, t))}${c(lerp(ab, bb, t))}`;
};

/* ── the 24-stop sky track (top colour, horizon colour) ──────── */

const SKY_TRACK: ReadonlyArray<readonly [string, string]> = [
  ['#241c33', '#3a2a41'], // 0  deep night
  ['#221b31', '#372840'], // 1
  ['#211a30', '#35273e'], // 2
  ['#231c32', '#38293f'], // 3
  ['#2a2340', '#4a3149'], // 4  the sky starts to remember morning
  ['#3a2f4d', '#7a4a55'], // 5  pre-dawn
  ['#6b5a7d', '#d99a72'], // 6  dawn
  ['#93a4bb', '#f3d9a4'], // 7  first gold
  ['#a3bccd', '#ecdfc4'], // 8  morning
  ['#aac4d4', '#e9e2cf'], // 9
  ['#b0cbd9', '#e7e6d6'], // 10
  ['#b3cddb', '#e6e8da'], // 11 noon-pale
  ['#b3cddb', '#e6e8da'], // 12
  ['#b0cad8', '#e7e4d2'], // 13
  ['#accfd6', '#eadfc6'], // 14
  ['#a9c2d2', '#ecd9b8'], // 15 afternoon
  ['#9fb2c6', '#eec996'], // 16 light starts to lean
  ['#8fa3bd', '#eeb87a'], // 17 golden hour
  ['#7a6a92', '#e08a5e'], // 18 sunset
  ['#54466e', '#b06456'], // 19 dusk
  ['#3f3357', '#7a4650'], // 20
  ['#332a49', '#5e3a4a'], // 21 evening settles
  ['#2b2340', '#4a3145'], // 22
  ['#261e36', '#3f2a3f'], // 23
];

export interface SkyColors {
  top: string;
  horizon: string;
}

/** Sky for a fractional local hour (0–24), smoothly interpolated. */
export const skyForHour = (hour: number): SkyColors => {
  const h = ((hour % 24) + 24) % 24;
  const i = Math.floor(h);
  const t = h - i;
  const a = SKY_TRACK[i];
  const b = SKY_TRACK[(i + 1) % 24];
  return { top: mixHex(a[0], b[0], t), horizon: mixHex(a[1], b[1], t) };
};

/* ── the air-tint layer (one overlay, alpha only, no blends) ─── */

interface AirStop {
  hour: number;
  color: string;
  opacity: number;
}

const AIR_TRACK: ReadonlyArray<AirStop> = [
  { hour: 0, color: '#2e1f33', opacity: 0.2 },
  { hour: 4.5, color: '#2e1f33', opacity: 0.2 },
  { hour: 6, color: '#f3d9a4', opacity: 0.07 },
  { hour: 8, color: '#f3d9a4', opacity: 0.03 },
  { hour: 10, color: '#f3d9a4', opacity: 0 },
  { hour: 15.5, color: '#c98a4e', opacity: 0 },
  { hour: 17.5, color: '#c98a4e', opacity: 0.08 },
  { hour: 19, color: '#8a4e50', opacity: 0.11 },
  { hour: 20.5, color: '#2e1f33', opacity: 0.16 },
  { hour: 22, color: '#2e1f33', opacity: 0.2 },
  { hour: 24, color: '#2e1f33', opacity: 0.2 },
];

export interface AirTint {
  color: string;
  opacity: number;
}

export const airTintForHour = (hour: number): AirTint => {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < AIR_TRACK.length - 1; i += 1) {
    const a = AIR_TRACK[i];
    const b = AIR_TRACK[i + 1];
    if (h >= a.hour && h <= b.hour) {
      const t = b.hour === a.hour ? 0 : (h - a.hour) / (b.hour - a.hour);
      return { color: mixHex(a.color, b.color, t), opacity: lerp(a.opacity, b.opacity, t) };
    }
  }
  return { color: '#2e1f33', opacity: 0.2 };
};

/** Rooms lamps matter after this and before dawn. */
export const isEveningHour = (hour: number): boolean => hour >= 18 || hour < 6;

/* ── local hours & timezones ─────────────────────────────────── */

/** Fractional local hour for a timezone offset (minutes EAST of UTC, i.e. -new Date().getTimezoneOffset()). */
export const localHourForOffset = (offsetMin: number, now: Date = new Date()): number => {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
  const local = (((utcMinutes + offsetMin) % 1440) + 1440) % 1440;
  return local / 60;
};

export const myTzOffsetMin = (now: Date = new Date()): number => -now.getTimezoneOffset();

/** "HH:MM" for a timezone offset — feeds the two-times clock. */
export const clockLabelForOffset = (offsetMin: number, now: Date = new Date()): string => {
  const h = localHourForOffset(offsetMin, now);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

/* ── coarse warm time (the only clock the home speaks) ───────── */

/** Bucket an ISO instant to 5 minutes — presence is never forensic. */
export const coarseBucketIso = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const bucket = 5 * 60 * 1000;
  return new Date(Math.floor(t / bucket) * bucket).toISOString();
};

export const localDayKey = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const coarsePhrase = (iso: string | undefined, now: Date = new Date()): CoarsePhrase | null => {
  if (!iso) return null;
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = ms / 60000;
  if (minutes < 20) return 'just now';
  if (minutes < 150) return 'a little while ago';
  const sameDay = localDayKey(then) === localDayKey(now);
  if (sameDay) return then.getHours() < 12 ? 'this morning' : 'this evening';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (localDayKey(then) === localDayKey(yesterday)) return 'yesterday';
  return 'a few days ago';
};

/** Hours elapsed since an ISO instant (∞ when absent/invalid). */
export const hoursSince = (iso: string | undefined, now: Date = new Date()): number => {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / 3600000;
};

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];

/** Coarse warm time for provenance — "came home in our third month". */
export const provenancePhrase = (at: string, homeStart: string, now: Date = new Date()): string => {
  const t = new Date(at).getTime();
  const start = new Date(homeStart).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(start)) return 'a while ago';
  const daysAgo = (now.getTime() - t) / 86400000;
  if (daysAgo < 7) return 'this week';
  const daysIn = Math.max(0, (t - start) / 86400000);
  if (daysIn < 30) return 'in our first days';
  const months = Math.floor(daysIn / 30.4);
  if (months < 12) return `in our ${ORDINALS[Math.min(months, 11)]} month`;
  const years = Math.floor(daysIn / 365.25);
  return `in our ${ORDINALS[Math.min(years, 11)]} year`;
};
