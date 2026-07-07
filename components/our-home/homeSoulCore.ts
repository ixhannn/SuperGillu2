/**
 * OUR HOME — the soul's core: normalization, legacy migration, and the
 * CRDT-lite merge. This module is imported by services/storage.ts (a HOT
 * bundle chunk), so it carries zero runtime dependencies — interaction ops,
 * trace derivation and the growth engine live in homeSoul.ts, which only the
 * lazy Our Home view loads.
 *
 * Merge invariants (each one guards a reviewed failure mode):
 * - The default state is an EMPTY room (no pre-placed objects), so a fresh
 *   device's default can never out-rank the couple's real arranged room.
 * - Revisions order by a monotonic per-item `rev` counter first; wall-clock
 *   (which is coarse-bucketed for privacy) only breaks rev ties.
 * - All collections and record keys are emitted in CANONICAL order, so two
 *   devices that hold the same content serialize identically and the
 *   converge-push comparison terminates.
 * - A candle's seenAt belongs to one burn: a merge never carries a seenAt
 *   older than the winning litAt.
 * - Removed-note tombstones prune after 30 days (both devices prune by the
 *   same rule, so a pruned tombstone cannot resurrect meaningfully).
 */
import {
  HomeCurtains, HomeGlint, HomeLane, HomeNight, HomeNote, HomeObject,
  HomeParcel, OurHomeState,
} from './homeTypes';

export const INSCRIPTION_CAP = 4;
export const INSCRIPTION_CHARS = 90;
export const GLINT_CAP = 6;
export const NOTE_STROKE_CAP = 24;
export const NOTE_POINT_CAP = 480; // flat array length (240 points)

const EPOCH = new Date(0).toISOString();
const TOMBSTONE_DAYS = 30;

/**
 * The room starts as an EMPTY canvas: nothing is pre-placed. Every object is
 * an instance the couple mints from the furnishing drawer (or a parcel), so
 * the merge never has to protect a "default layout" — there isn't one.
 */
const DEFAULT_PROVENANCE_LABEL = 'part of our home';

/* ── normalization & migration ───────────────────────────────── */

const isIso = (v: unknown): v is string =>
  typeof v === 'string' && Number.isFinite(new Date(v).getTime());

const asString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

const asLane = (v: unknown): HomeLane => (v === 0 || v === 1 || v === 2 ? v : 1);

const asRev = (v: unknown): number =>
  (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

const normalizeObject = (raw: unknown): HomeObject | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.uid !== 'string' || typeof o.sku !== 'string') return null;
  const at = isIso(o.touchedAt) ? o.touchedAt : EPOCH;
  const obj: HomeObject = {
    uid: o.uid,
    sku: o.sku,
    rev: asRev(o.rev),
    x: Number.isFinite(o.x) ? (o.x as number) : 0,
    y: Number.isFinite(o.y) ? (o.y as number) : 0,
    lane: asLane(o.lane),
    seatId: typeof o.seatId === 'string' ? o.seatId : undefined,
    surfaceUid: typeof o.surfaceUid === 'string' ? o.surfaceUid : undefined,
    facing: Number.isFinite(o.facing) ? Math.max(0, Math.floor(o.facing as number)) : 0,
    stored: o.stored === true,
    placedBy: asString(o.placedBy, 'home'),
    placedAt: isIso(o.placedAt) ? o.placedAt : at,
    touchedBy: asString(o.touchedBy, 'home'),
    touchedAt: at,
    provenance: ((): HomeObject['provenance'] => {
      const p = o.provenance as Record<string, unknown> | undefined;
      const kind = p?.kind;
      const okKind = kind === 'trousseau' || kind === 'parcel' || kind === 'memory' || kind === 'heirloom';
      return {
        kind: okKind ? kind : 'trousseau',
        label: asString(p?.label, DEFAULT_PROVENANCE_LABEL),
        at: isIso(p?.at) ? (p?.at as string) : at,
        memoryId: typeof p?.memoryId === 'string' ? p.memoryId : undefined,
      };
    })(),
  };
  if (o.prev && typeof o.prev === 'object') {
    const p = o.prev as Record<string, unknown>;
    if (Number.isFinite(p.x) && Number.isFinite(p.y) && isIso(p.at)) {
      obj.prev = {
        x: p.x as number, y: p.y as number, lane: asLane(p.lane),
        surfaceUid: typeof p.surfaceUid === 'string' ? p.surfaceUid : undefined,
        at: p.at,
      };
    }
  }
  if (o.noticed === true) obj.noticed = true;
  if (typeof o.nickname === 'string' && o.nickname.trim()) obj.nickname = o.nickname.slice(0, 40);
  if (Array.isArray(o.lines)) {
    const lines = o.lines
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
      .filter((l) => typeof l.text === 'string' && typeof l.by === 'string' && isIso(l.at))
      .map((l) => ({
        by: l.by as string,
        ink: l.ink === 'gold' ? 'gold' as const : 'wine' as const,
        text: (l.text as string).slice(0, INSCRIPTION_CHARS),
        at: l.at as string,
      }))
      .slice(0, INSCRIPTION_CAP);
    if (lines.length) obj.lines = lines;
  }
  if (typeof o.photoMemoryId === 'string') obj.photoMemoryId = o.photoMemoryId;
  if (typeof o.vState === 'string') obj.vState = o.vState;
  if (Number.isFinite(o.detail)) obj.detail = o.detail as number;
  if (o.removed === true) {
    obj.removed = true;
    obj.removedAt = isIso(o.removedAt) ? o.removedAt : at;
  }
  if (o.spot && typeof o.spot === 'object') {
    const s = o.spot as Record<string, unknown>;
    if (Number.isFinite(s.x) && Number.isFinite(s.y) && typeof s.by === 'string' && isIso(s.at)) {
      obj.spot = {
        x: s.x as number, y: s.y as number, lane: asLane(s.lane), by: s.by,
        note: typeof s.note === 'string' ? s.note.slice(0, 60) : undefined,
        at: s.at,
      };
    }
  }
  if (o.placedTogether === true) obj.placedTogether = true;
  return obj;
};

const normalizeNote = (raw: unknown): HomeNote | null => {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw as Record<string, unknown>;
  if (typeof n.id !== 'string' || !isIso(n.at)) return null;
  const strokes = Array.isArray(n.strokes)
    ? n.strokes
      .filter((s): s is number[] => Array.isArray(s) && s.every((v) => Number.isFinite(v)))
      .slice(0, NOTE_STROKE_CAP)
      .map((s) => s.slice(0, NOTE_POINT_CAP).map((v) => Math.round(v)))
    : [];
  const note: HomeNote = {
    id: n.id,
    by: asString(n.by, 'home'),
    ink: n.ink === 'gold' ? 'gold' : 'wine',
    at: n.at,
    rev: asRev(n.rev),
    strokes,
    x: Number.isFinite(n.x) ? (n.x as number) : 200,
    y: Number.isFinite(n.y) ? (n.y as number) : 300,
    lane: asLane(n.lane),
    seatId: typeof n.seatId === 'string' ? n.seatId : undefined,
    surfaceUid: typeof n.surfaceUid === 'string' ? n.surfaceUid : undefined,
    tilt: Number.isFinite(n.tilt) ? (n.tilt as number) : -3,
  };
  if (typeof n.text === 'string' && n.text.trim()) note.text = n.text.slice(0, 240);
  if (isIso(n.readAt)) note.readAt = n.readAt;
  if (n.peeled === true) {
    note.peeled = true;
    note.peeledAt = isIso(n.peeledAt) ? n.peeledAt : n.at;
  }
  if (n.removed === true) {
    note.removed = true;
    note.removedAt = isIso(n.removedAt) ? n.removedAt : n.at;
  }
  if (note.strokes.length === 0 && !note.text) return null;
  return note;
};

const normalizeParcel = (raw: unknown): HomeParcel | null => {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || typeof p.sku !== 'string' || !isIso(p.earnedAt)) return null;
  const stage = p.stage === 1 || p.stage === 2 || p.stage === 3 ? p.stage : 0;
  return {
    id: p.id,
    sku: p.sku,
    tag: asString(p.tag, 'for our home'),
    earnedAt: p.earnedAt,
    stage,
    openedBy: typeof p.openedBy === 'string' ? p.openedBy : undefined,
    openedAt: isIso(p.openedAt) ? p.openedAt : undefined,
    sweptBy: typeof p.sweptBy === 'string' ? p.sweptBy : undefined,
    sweptAt: isIso(p.sweptAt) ? p.sweptAt : undefined,
  };
};

const normalizeDayRecord = <T extends { at?: string }>(
  raw: unknown,
  build: (rec: Record<string, unknown>) => T | null,
): Record<string, T> => {
  const out: Record<string, T> = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  // pre-per-partner shape carried a `by` field — adopt it under that key
  if (typeof r.by === 'string') {
    const rec = build(r);
    if (rec) out[r.by] = rec;
    return out;
  }
  Object.entries(r).forEach(([k, v]) => {
    if (!v || typeof v !== 'object') return;
    const rec = build(v as Record<string, unknown>);
    if (rec) out[k] = rec;
  });
  return out;
};

/** Legacy v2 room (placedItems/gifts era): keep birth date + typed notes. */
const migrateLegacy = (raw: Record<string, unknown>, nowIso: string): OurHomeState => {
  const createdAt = isIso(raw.createdAt) ? raw.createdAt : nowIso;
  const state = defaultOurHome(createdAt);
  const oldNotes = Array.isArray(raw.notes) ? raw.notes : [];
  oldNotes.forEach((n, i) => {
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (typeof o.text !== 'string' || !o.text.trim()) return;
    state.notes.push({
      id: typeof o.id === 'string' ? o.id : `legacy-${i}`,
      by: asString(o.author, 'home'),
      ink: 'wine',
      at: isIso(o.createdAt) ? o.createdAt : createdAt,
      rev: 0,
      strokes: [],
      text: o.text.slice(0, 240),
      x: 0,
      y: 0,
      lane: 1,
      tilt: -3,
      peeled: true, // straight into the shoebox — history is never deleted
      peeledAt: isIso(o.createdAt) ? o.createdAt : createdAt,
    });
  });
  return canonicalize(state);
};

export const defaultOurHome = (createdAt?: string): OurHomeState => {
  const at = createdAt ?? new Date().toISOString();
  return {
    v: 3,
    objects: [],
    notes: [],
    parcels: [],
    visits: {},
    lampOn: {},
    candle: {},
    glints: [],
    curtains: {},
    night: {},
    createdAt: at,
  };
};

/* ── canonical order (identical content ⇒ identical JSON) ────── */

const sortedRecord = <T>(rec: Record<string, T>): Record<string, T> => {
  const out: Record<string, T> = {};
  Object.keys(rec).sort().forEach((k) => {
    out[k] = rec[k];
  });
  return out;
};

const canonicalize = (state: OurHomeState): OurHomeState => ({
  ...state,
  objects: [...state.objects].sort((a, b) => a.uid.localeCompare(b.uid)),
  notes: [...state.notes].sort((a, b) => a.id.localeCompare(b.id)),
  parcels: [...state.parcels].sort((a, b) => a.id.localeCompare(b.id)),
  glints: [...state.glints].sort((a, b) =>
    a.at.localeCompare(b.at) || a.uid.localeCompare(b.uid) || a.by.localeCompare(b.by)),
  visits: sortedRecord(state.visits),
  curtains: sortedRecord(state.curtains),
  night: sortedRecord(state.night),
});

export const normalizeOurHome = (raw?: unknown): OurHomeState => {
  const nowIso = new Date().toISOString();
  if (!raw || typeof raw !== 'object') return canonicalize(defaultOurHome(nowIso));
  const r = raw as Record<string, unknown>;
  if (r.v !== 3) return migrateLegacy(r, nowIso);

  const createdAt = isIso(r.createdAt) ? r.createdAt : nowIso;
  const tombstoneCutoff = new Date(nowIso).getTime() - TOMBSTONE_DAYS * 86400000;
  const hasStory = (o: HomeObject): boolean =>
    !!(o.nickname || o.lines?.length || o.photoMemoryId || o.placedTogether);
  const objects = (Array.isArray(r.objects) ? r.objects : [])
    .map(normalizeObject)
    .filter((o): o is HomeObject => o !== null)
    // storyless removed instances prune like note tombstones; storied ones stay
    .filter((o) => !(o.removed && !hasStory(o) && ts(o.removedAt) > 0 && ts(o.removedAt) < tombstoneCutoff));

  const notes = (Array.isArray(r.notes) ? r.notes : [])
    .map(normalizeNote)
    .filter((n): n is HomeNote => n !== null)
    .filter((n) => !(n.removed && ts(n.removedAt) > 0 && ts(n.removedAt) < tombstoneCutoff));
  const parcels = (Array.isArray(r.parcels) ? r.parcels : [])
    .map(normalizeParcel)
    .filter((p): p is HomeParcel => p !== null);

  const visits: OurHomeState['visits'] = {};
  if (r.visits && typeof r.visits === 'object') {
    Object.entries(r.visits as Record<string, unknown>).forEach(([k, v]) => {
      const rec = v as Record<string, unknown> | null;
      const lastSeenAt = rec?.lastSeenAt;
      if (isIso(lastSeenAt)) {
        visits[k] = {
          lastSeenAt,
          tzOffsetMin: Number.isFinite(rec?.tzOffsetMin) ? (rec?.tzOffsetMin as number) : undefined,
        };
      }
    });
  }

  const lampOn = r.lampOn as Record<string, unknown> | undefined;
  const candle = r.candle as Record<string, unknown> | undefined;

  const curtains = normalizeDayRecord<HomeCurtains>(r.curtains, (rec) => (
    typeof rec.lastOpenedDay === 'string'
      ? { lastOpenedDay: rec.lastOpenedDay, at: isIso(rec.at) ? rec.at : undefined }
      : null
  ));
  const night = normalizeDayRecord<HomeNight>(r.night, (rec) => (
    typeof rec.dimmedDay === 'string'
      ? { dimmedDay: rec.dimmedDay, at: isIso(rec.at) ? rec.at : undefined }
      : null
  ));

  return canonicalize({
    v: 3,
    objects,
    notes,
    parcels,
    visits,
    lampOn: {
      uid: typeof lampOn?.uid === 'string' ? lampOn.uid : undefined,
      by: typeof lampOn?.by === 'string' ? lampOn.by : undefined,
      at: isIso(lampOn?.at) ? (lampOn?.at as string) : undefined,
    },
    candle: {
      litBy: typeof candle?.litBy === 'string' ? candle.litBy : undefined,
      litAt: isIso(candle?.litAt) ? (candle?.litAt as string) : undefined,
      seenAt: isIso(candle?.seenAt) ? (candle?.seenAt as string) : undefined,
    },
    glints: (Array.isArray(r.glints) ? r.glints : [])
      .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
      .filter((g) => typeof g.uid === 'string' && typeof g.by === 'string' && isIso(g.at))
      .map((g) => ({ uid: g.uid as string, by: g.by as string, at: g.at as string }))
      .slice(-GLINT_CAP),
    curtains,
    night,
    createdAt,
  });
};

/* ── the merge (two hands, one room, no clobber) ─────────────── */

export const ts = (iso?: string): number => (iso ? new Date(iso).getTime() : 0);

/** Wall-clock rank — only consulted when revs tie. */
const objectClock = (o: HomeObject): number => Math.max(
  ts(o.touchedAt), ts(o.removedAt), ts(o.spot?.at),
  ...(o.lines ?? []).map((l) => ts(l.at)),
);

const noteClock = (n: HomeNote): number =>
  Math.max(ts(n.at), ts(n.readAt), ts(n.peeledAt), ts(n.removedAt));

const laterIso = (a?: string, b?: string): string | undefined =>
  (ts(a) >= ts(b) ? a : b) ?? b ?? a;

/** Deterministic on both devices: rev, then clock, then a stable byte-order tiebreak. */
const objectWins = (a: HomeObject, b: HomeObject): boolean => {
  const revA = a.rev ?? 0;
  const revB = b.rev ?? 0;
  if (revA !== revB) return revA > revB;
  const clockA = objectClock(a);
  const clockB = objectClock(b);
  if (clockA !== clockB) return clockA > clockB;
  return JSON.stringify(a) > JSON.stringify(b);
};

export const mergeOurHome = (a: OurHomeState, b: OurHomeState): OurHomeState => {
  const objects = new Map<string, HomeObject>();
  [...a.objects, ...b.objects].forEach((o) => {
    const prior = objects.get(o.uid);
    if (!prior) {
      objects.set(o.uid, o);
      return;
    }
    const winner = objectWins(o, prior) ? o : prior;
    const loser = winner === o ? prior : o;
    // inscriptions are voices — never lose one to a race
    const lines = [...(winner.lines ?? [])];
    (loser.lines ?? []).forEach((l) => {
      if (!lines.some((w) => w.by === l.by && w.at === l.at && w.text === l.text)) lines.push(l);
    });
    lines.sort((x, y) => ts(x.at) - ts(y.at) || x.by.localeCompare(y.by) || x.text.localeCompare(y.text));
    objects.set(o.uid, {
      ...winner,
      rev: Math.max(winner.rev ?? 0, loser.rev ?? 0),
      lines: lines.length ? lines.slice(0, INSCRIPTION_CAP) : undefined,
      nickname: winner.nickname ?? loser.nickname,
      photoMemoryId: winner.photoMemoryId ?? loser.photoMemoryId,
      placedTogether: winner.placedTogether || loser.placedTogether || undefined,
      // a thing's birth date is history — keep the EARLIEST record of it, so a
      // fresh device's re-minted trousseau can never rewrite "day one"
      provenance: winner.provenance.kind === loser.provenance.kind
        && ts(loser.provenance.at) < ts(winner.provenance.at)
        ? loser.provenance
        : winner.provenance,
    });
  });

  const notes = new Map<string, HomeNote>();
  [...a.notes, ...b.notes].forEach((n) => {
    const prior = notes.get(n.id);
    if (!prior) {
      notes.set(n.id, n);
      return;
    }
    const revN = n.rev ?? 0;
    const revP = prior.rev ?? 0;
    const winner = revN !== revP
      ? (revN > revP ? n : prior)
      : (noteClock(n) >= noteClock(prior) ? n : prior);
    notes.set(n.id, { ...winner, rev: Math.max(revN, revP) });
  });

  const parcels = new Map<string, HomeParcel>();
  [...a.parcels, ...b.parcels].forEach((p) => {
    const prior = parcels.get(p.id);
    if (!prior) {
      parcels.set(p.id, p);
      return;
    }
    const ahead = p.stage >= prior.stage ? p : prior;
    const behind = ahead === p ? prior : p;
    parcels.set(p.id, {
      ...ahead,
      openedBy: ahead.openedBy ?? behind.openedBy,
      openedAt: ahead.openedAt ?? behind.openedAt,
      sweptBy: ahead.sweptBy ?? behind.sweptBy,
      sweptAt: ahead.sweptAt ?? behind.sweptAt,
    });
  });

  const visits: OurHomeState['visits'] = { ...a.visits };
  Object.entries(b.visits).forEach(([k, v]) => {
    const later = ts(v.lastSeenAt) >= ts(visits[k]?.lastSeenAt) ? v : visits[k];
    visits[k] = {
      lastSeenAt: laterIso(visits[k]?.lastSeenAt, v.lastSeenAt),
      tzOffsetMin: later?.tzOffsetMin ?? visits[k]?.tzOffsetMin ?? v.tzOffsetMin,
    };
  });

  const glints = new Map<string, HomeGlint>();
  [...a.glints, ...b.glints].forEach((g) => {
    const key = `${g.uid}|${g.by}`;
    const prior = glints.get(key);
    if (!prior || ts(g.at) > ts(prior.at)) glints.set(key, g);
  });

  const mergeDayRecord = <T extends { at?: string }>(
    ra: Record<string, T>, rb: Record<string, T>,
  ): Record<string, T> => {
    const out: Record<string, T> = { ...ra };
    Object.entries(rb).forEach(([k, v]) => {
      if (!out[k] || ts(v.at) >= ts(out[k].at)) out[k] = v;
    });
    return out;
  };

  // a candle's seenAt belongs to one burn — never resurrect a previous one
  const candleWinner = ts(a.candle.litAt) >= ts(b.candle.litAt) ? a.candle : b.candle;
  const candleSeen = laterIso(a.candle.seenAt, b.candle.seenAt);
  const candle = {
    ...candleWinner,
    seenAt: candleSeen && ts(candleSeen) >= ts(candleWinner.litAt) ? candleSeen : undefined,
  };

  return canonicalize({
    v: 3,
    objects: [...objects.values()],
    notes: [...notes.values()],
    parcels: [...parcels.values()],
    visits,
    lampOn: ts(a.lampOn.at) >= ts(b.lampOn.at) ? a.lampOn : b.lampOn,
    candle,
    // sort BEFORE capping — both merge directions must keep the same newest set
    glints: [...glints.values()]
      .sort((x, y) => x.at.localeCompare(y.at) || x.uid.localeCompare(y.uid) || x.by.localeCompare(y.by))
      .slice(-GLINT_CAP),
    curtains: mergeDayRecord(a.curtains, b.curtains),
    night: mergeDayRecord(a.night, b.night),
    createdAt: ts(a.createdAt) <= ts(b.createdAt) ? a.createdAt : b.createdAt,
  });
};
