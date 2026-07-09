/**
 * OUR HOME — the soul (view side).
 *
 * Interaction ops (all immutable), presence-trace derivation, and the growth
 * engine that turns a lived relationship into parcels on the doormat.
 * Normalization + the CRDT-lite merge live in homeSoulCore.ts, which the hot
 * storage chunk imports; this module is loaded only with the Our Home view.
 */
import {
  HomeInk, HomeLane, HomeNote, HomeObject, HomeParcel, HomeTrace, OurHomeState,
} from './homeTypes';
import { coarseBucketIso, coarsePhrase, hoursSince, localDayKey } from './homeSky';
import { ARCH } from './homeSeats';
import {
  GLINT_CAP, INSCRIPTION_CAP, INSCRIPTION_CHARS, NOTE_POINT_CAP, NOTE_STROKE_CAP, ts,
} from './homeSoulCore';

export { defaultOurHome, mergeOurHome, normalizeOurHome } from './homeSoulCore';

const TRACE_BUDGET = 3;

/* ── ink & lamp assignment (voice, never tally) ──────────────── */

/** Deterministic on both devices: the lexically-first key writes in wine. */
export const assignInks = (
  myKey: string, partnerKey: string | null,
): { myInk: HomeInk; partnerInk: HomeInk; myLampSku: string; partnerLampSku: string } => {
  const mineFirst = !partnerKey || myKey.localeCompare(partnerKey) <= 0;
  return mineFirst
    ? { myInk: 'wine', partnerInk: 'gold', myLampSku: 'lamp-a', partnerLampSku: 'lamp-b' }
    : { myInk: 'gold', partnerInk: 'wine', myLampSku: 'lamp-b', partnerLampSku: 'lamp-a' };
};

/* ── interaction ops (all immutable) ─────────────────────────── */

const touch = (now: Date): string => coarseBucketIso(now.toISOString());

/** Every deliberate edit advances the merge counter — coarse time is display-only. */
const bump = (o: HomeObject): number => (o.rev ?? 0) + 1;

const withObject = (
  state: OurHomeState, uid: string, fn: (o: HomeObject) => HomeObject,
): OurHomeState => ({
  ...state,
  objects: state.objects.map((o) => (o.uid === uid ? fn(o) : o)),
});

export interface CommitSpot {
  x: number;
  y: number;
  lane: HomeLane;
  seatId?: string;
  surfaceUid?: string;
}

/** Mint a brand-new instance from the furnishing drawer — place as many
 *  copies of anything as a life needs (four dining chairs are a dinner). */
export const placeNewObject = (
  state: OurHomeState, sku: string, provenanceLabel: string, spot: CommitSpot,
  byKey: string, now: Date,
): OurHomeState => ({
  ...state,
  objects: [...state.objects, {
    uid: `i:${sku}:${now.getTime().toString(36)}:${byKey.slice(0, 4)}`,
    sku,
    rev: 1,
    x: spot.x,
    y: spot.y,
    lane: spot.lane,
    seatId: spot.seatId,
    surfaceUid: spot.surfaceUid,
    facing: 0,
    stored: false,
    placedBy: byKey,
    placedAt: now.toISOString(),
    touchedBy: byKey,
    touchedAt: touch(now),
    provenance: { kind: 'trousseau', label: provenanceLabel, at: now.toISOString() },
  }],
});

export const commitMove = (
  state: OurHomeState, uid: string, spot: CommitSpot, byKey: string, now: Date,
): OurHomeState => withObject(state, uid, (o) => {
  const moved = !o.stored && (Math.abs(o.x - spot.x) > 2 || Math.abs(o.y - spot.y) > 2 || o.lane !== spot.lane);
  const savedSpot = o.spot && o.spot.by !== byKey
    && Math.hypot(o.spot.x - spot.x, o.spot.y - spot.y) < 28;
  // a rapid trail of moves by the same hand is ONE gesture: keep its origin,
  // so the partner's ghost + Noticing replay show the real before → after
  const sameGesture = !!o.prev && o.touchedBy === byKey
    && now.getTime() - ts(o.prev.at) < 5 * 60 * 1000;
  return {
    ...o,
    rev: bump(o),
    x: spot.x,
    y: spot.y,
    lane: spot.lane,
    seatId: spot.seatId,
    surfaceUid: spot.surfaceUid,
    stored: false,
    prev: moved
      ? (sameGesture ? o.prev : { x: o.x, y: o.y, lane: o.lane, surfaceUid: o.surfaceUid, at: touch(now) })
      : o.prev,
    noticed: moved ? undefined : o.noticed,
    touchedBy: byKey,
    touchedAt: touch(now),
    spot: undefined,
    placedTogether: o.placedTogether || savedSpot || undefined,
  };
});

/** Taking something off the floor: pieces that carry a story (a name, a line,
 *  a photo, a placed-together mark) rest in the cupboard, story intact;
 *  plain pieces simply leave (tombstoned so merges can't resurrect them). */
export const storeObject = (
  state: OurHomeState, uid: string, byKey: string, now: Date,
): OurHomeState => withObject(state, uid, (o) => {
  const hasStory = !!(o.nickname || o.lines?.length || o.photoMemoryId || o.placedTogether);
  return {
    ...o,
    rev: bump(o),
    stored: hasStory,
    removed: hasStory ? o.removed : true,
    removedAt: hasStory ? o.removedAt : now.toISOString(),
    seatId: undefined,
    surfaceUid: undefined,
    prev: !o.stored ? { x: o.x, y: o.y, lane: o.lane, surfaceUid: o.surfaceUid, at: touch(now) } : o.prev,
    touchedBy: byKey,
    touchedAt: touch(now),
  };
});

export const stepFacing = (
  state: OurHomeState, uid: string, facings: number, byKey: string, now: Date,
): OurHomeState => withObject(state, uid, (o) => ({
  ...o,
  rev: bump(o),
  facing: facings > 0 ? (o.facing + 1) % facings : 0,
  touchedBy: byKey,
  touchedAt: touch(now),
}));

export const nameObject = (
  state: OurHomeState, uid: string, nickname: string, byKey: string, now: Date,
): OurHomeState => withObject(state, uid, (o) => ({
  ...o,
  rev: bump(o),
  nickname: nickname.trim().slice(0, 40) || undefined,
  touchedBy: byKey,
  touchedAt: touch(now),
}));

export const addInscription = (
  state: OurHomeState, uid: string, text: string, byKey: string, ink: HomeInk, now: Date,
): OurHomeState => withObject(state, uid, (o) => {
  const trimmed = text.trim().slice(0, INSCRIPTION_CHARS);
  if (!trimmed) return o;
  const lines = [...(o.lines ?? []), { by: byKey, ink, text: trimmed, at: now.toISOString() }];
  return { ...o, rev: bump(o), lines: lines.slice(-INSCRIPTION_CAP) };
});

export const attachPhoto = (
  state: OurHomeState, uid: string, memoryId: string | undefined, byKey: string, now: Date,
): OurHomeState => withObject(state, uid, (o) => ({
  ...o,
  rev: bump(o),
  photoMemoryId: memoryId,
  touchedBy: byKey,
  touchedAt: touch(now),
}));

export const setObjectVisual = (
  state: OurHomeState, uid: string, vState: string | undefined, detail: number | undefined,
  byKey: string, now: Date,
): OurHomeState => withObject(state, uid, (o) => ({
  ...o,
  rev: bump(o),
  vState,
  detail: detail ?? o.detail,
  touchedBy: byKey,
  touchedAt: touch(now),
}));

export const plantSpot = (
  state: OurHomeState, uid: string, at: { x: number; y: number; lane: HomeLane },
  note: string | undefined, byKey: string, now: Date,
): OurHomeState => withObject(state, uid, (o) => ({
  ...o,
  rev: bump(o),
  spot: { ...at, by: byKey, note: note?.trim().slice(0, 60) || undefined, at: now.toISOString() },
}));

export const noticeMove = (
  state: OurHomeState, uid: string, byKey: string, now: Date,
): OurHomeState => {
  const next = withObject(state, uid, (o) => ({ ...o, rev: bump(o), noticed: true }));
  const glints = [
    ...next.glints.filter((g) => !(g.uid === uid && g.by === byKey)),
    { uid, by: byKey, at: now.toISOString() },
  ].slice(-GLINT_CAP);
  return { ...next, glints };
};

export const addNote = (
  state: OurHomeState,
  note: Pick<HomeNote, 'strokes' | 'x' | 'y' | 'lane' | 'seatId' | 'surfaceUid'>,
  byKey: string, ink: HomeInk, now: Date,
): OurHomeState => {
  const strokes = note.strokes
    .slice(0, NOTE_STROKE_CAP)
    .map((s) => s.slice(0, NOTE_POINT_CAP).map((v) => Math.round(v)));
  if (strokes.length === 0) return state;
  return {
    ...state,
    notes: [...state.notes, {
      id: `n:${now.getTime().toString(36)}:${byKey.slice(0, 6)}`,
      by: byKey,
      ink,
      at: now.toISOString(),
      rev: 1,
      strokes,
      x: note.x,
      y: note.y,
      lane: note.lane,
      seatId: note.seatId,
      surfaceUid: note.surfaceUid,
      tilt: ((now.getTime() % 9) - 4) || -3, // crooked, no two alike
    }],
  };
};

const withNote = (
  state: OurHomeState, id: string, fn: (n: HomeNote) => HomeNote,
): OurHomeState => ({
  ...state,
  notes: state.notes.map((n) => (n.id === id ? fn(n) : n)),
});

export const markNoteRead = (state: OurHomeState, id: string, now: Date): OurHomeState =>
  withNote(state, id, (n) => (n.readAt ? n : { ...n, rev: (n.rev ?? 0) + 1, readAt: now.toISOString() }));

export const peelNote = (state: OurHomeState, id: string, now: Date): OurHomeState =>
  withNote(state, id, (n) => ({ ...n, rev: (n.rev ?? 0) + 1, peeled: true, peeledAt: now.toISOString() }));

export const flutterNote = (state: OurHomeState, id: string, now: Date): OurHomeState =>
  withNote(state, id, (n) => ({ ...n, rev: (n.rev ?? 0) + 1, removed: true, removedAt: now.toISOString() }));

export const recordVisit = (
  state: OurHomeState, myKey: string, now: Date, quiet: boolean, tzOffsetMin?: number,
): OurHomeState => {
  if (quiet) return state; // hiding is not itself legible
  return {
    ...state,
    visits: {
      ...state.visits,
      [myKey]: { lastSeenAt: touch(now), tzOffsetMin: tzOffsetMin ?? state.visits[myKey]?.tzOffsetMin },
    },
  };
};

export const leaveLampOn = (
  state: OurHomeState, lampUid: string, byKey: string, now: Date,
): OurHomeState => ({
  ...state,
  lampOn: { uid: lampUid, by: byKey, at: now.toISOString() },
});

export const lightCandle = (state: OurHomeState, byKey: string, now: Date): OurHomeState => ({
  ...state,
  candle: { litBy: byKey, litAt: now.toISOString() },
});

export const seeCandle = (state: OurHomeState, now: Date): OurHomeState => ({
  ...state,
  candle: state.candle.litAt && !state.candle.seenAt
    ? { ...state.candle, seenAt: now.toISOString() }
    : state.candle,
});

/** Breathe a word onto the night glass — it waits for their morning. */
export const breatheFog = (
  state: OurHomeState, strokes: number[][], byKey: string, now: Date,
): OurHomeState => (strokes.length === 0 ? state : {
  ...state,
  fog: {
    strokes: strokes
      .slice(0, NOTE_STROKE_CAP)
      .map((s) => s.slice(0, NOTE_POINT_CAP).map((v) => Math.round(v))),
    by: byKey,
    at: now.toISOString(),
  },
});

/** The morning sun starts burning the word off once it has been read. */
export const seeFog = (state: OurHomeState, now: Date): OurHomeState => ({
  ...state,
  fog: state.fog.at && !state.fog.seenAt
    ? { ...state.fog, seenAt: now.toISOString() }
    : state.fog,
});

/** Curtains are per-partner: your morning is yours, on your clock. */
export const openCurtains = (state: OurHomeState, byKey: string, now: Date): OurHomeState => ({
  ...state,
  curtains: {
    ...state.curtains,
    [byKey]: { lastOpenedDay: localDayKey(now), at: now.toISOString() },
  },
});

/** Tucking the room in is each person's own nightly last act. */
export const dimForNight = (state: OurHomeState, byKey: string, now: Date): OurHomeState => ({
  ...state,
  night: {
    ...state.night,
    [byKey]: { dimmedDay: localDayKey(now), at: now.toISOString() },
  },
});

/** Advance a parcel one calm stage; opening (stage 2) mints its object. */
export const advanceParcel = (
  state: OurHomeState, id: string, byKey: string, now: Date,
): OurHomeState => {
  const parcel = state.parcels.find((p) => p.id === id);
  if (!parcel || parcel.stage >= 3) return state;
  const stage = (parcel.stage + 1) as HomeParcel['stage'];
  const parcels = state.parcels.map((p) => (p.id === id
    ? {
      ...p,
      stage,
      openedBy: stage >= 2 ? (p.openedBy ?? byKey) : p.openedBy,
      openedAt: stage >= 2 ? (p.openedAt ?? now.toISOString()) : p.openedAt,
      sweptBy: stage === 3 ? byKey : p.sweptBy,
      sweptAt: stage === 3 ? now.toISOString() : p.sweptAt,
    }
    : p));
  let objects = state.objects;
  if (stage === 2 && !state.objects.some((o) => o.uid === `p:${id}`)) {
    objects = [...state.objects, {
      uid: `p:${id}`,
      sku: parcel.sku,
      rev: 1,
      x: ARCH.parcelSpot.x,
      y: ARCH.parcelSpot.y,
      lane: 1,
      facing: 0,
      stored: false,
      placedBy: byKey,
      placedAt: now.toISOString(),
      touchedBy: byKey,
      touchedAt: touch(now),
      provenance: { kind: 'parcel', label: parcel.tag, at: parcel.earnedAt },
    }];
  }
  return { ...state, parcels, objects };
};

/* ── growth engine (the relationship builds the house) ───────── */

export interface GrowthSignals {
  daysTogether: number;
  memoryCount: number;
  revealedQuestions: number;
  answeredTodayBoth: boolean;
}

const KEEPSAKE_CYCLE = ['shell-bowl', 'pressed-flower', 'ticket-stub'] as const;

const PARCEL_TAGS: Record<string, string> = {
  'day-2': 'the first thing we ever owned together',
  'day-30': 'so our hours can share a wall',
};

/** Deterministic on both devices — same ids, merges unify. */
export const computeDueParcels = (
  state: OurHomeState, signals: GrowthSignals, now: Date,
): HomeParcel[] => {
  const due: HomeParcel[] = [];
  const have = new Set(state.parcels.map((p) => p.id));
  const mint = (id: string, sku: string, tag: string) => {
    if (!have.has(id)) due.push({ id, sku, tag, earnedAt: now.toISOString(), stage: 0 });
  };

  if (signals.daysTogether >= 2) mint('day-2', 'braided-rug', PARCEL_TAGS['day-2']);
  if (signals.daysTogether >= 30) mint('day-30', 'two-times-clock', PARCEL_TAGS['day-30']);

  for (let n = 5; n <= signals.memoryCount; n += 5) {
    const sku = KEEPSAKE_CYCLE[((n / 5) - 1) % KEEPSAKE_CYCLE.length];
    mint(`memory-${n}`, sku, `because ${n} memories deserve a keepsake`);
  }
  return due;
};

/** The hearth's lifetime character — never ash, never a readout. */
export const hearthStage = (revealedQuestions: number): 0 | 1 | 2 | 3 => {
  if (revealedQuestions <= 0) return 0; // cold grate
  if (revealedQuestions <= 6) return 1; // kindling
  if (revealedQuestions <= 30) return 2; // steady fire
  return 3; // deep old coals
};

/** The pot only ever moves toward bloom — nothing in this home regresses. */
export const potGrowth = (revealedQuestions: number): { stage: number; blooms: number } => ({
  stage: Math.min(Math.max(revealedQuestions, 0), 4),
  blooms: Math.floor(revealedQuestions / 5),
});

export const archUnlocks = (daysTogether: number): { mantel: boolean; yearTicks: number } => ({
  mantel: daysTogether >= 100,
  yearTicks: Math.floor(daysTogether / 365),
});

/* ── presence traces (derived, never stored) ─────────────────── */

export type LampWarmth = 'lit' | 'warm' | 'ember' | 'out';

export const lampWarmthFor = (lastSeenAt: string | undefined, now: Date): LampWarmth => {
  const h = hoursSince(lastSeenAt, now);
  if (h < 1 / 3) return 'lit';
  if (h < 1.2) return 'warm';
  if (h < 2.2) return 'ember';
  return 'out';
};

export interface TraceContext {
  myKey: string;
  partnerKey: string | null;
  partnerName: string;
  /** My lastSeenAt from BEFORE this session opened (for "left on for you"). */
  myPrevSeenAt?: string;
  now: Date;
}

export const deriveTraces = (state: OurHomeState, ctx: TraceContext): HomeTrace[] => {
  const { myKey, partnerKey, partnerName, now } = ctx;
  if (!partnerKey) return [];
  const partnerSeen = state.visits[partnerKey]?.lastSeenAt;
  const traces: HomeTrace[] = [];

  // their lamp — always rendered, outside the budget
  const warmth = lampWarmthFor(partnerSeen, now);
  if (warmth !== 'out') {
    const phrase = coarsePhrase(partnerSeen, now);
    traces.push({
      kind: 'lamp-warmth',
      strength: warmth === 'lit' ? 1 : warmth === 'warm' ? 0.55 : 0.25,
      phrase: phrase ? `${partnerName} was here ${phrase}` : undefined,
    });
  }

  if (
    state.lampOn.uid && state.lampOn.by === partnerKey
    && hoursSince(state.lampOn.at, now) < 18
    && ts(state.lampOn.at) > ts(ctx.myPrevSeenAt)
  ) {
    traces.push({ kind: 'lamp-left-on', uid: state.lampOn.uid, strength: 1, phrase: 'left on for you' });
  }

  const budget: HomeTrace[] = [];

  state.notes
    .filter((n) => !n.removed && !n.peeled && n.by === partnerKey && !n.readAt)
    .sort((a, b) => ts(b.at) - ts(a.at))
    .forEach((n) => budget.push({ kind: 'note', noteId: n.id, strength: 1 }));

  state.objects
    .filter((o) => !o.removed && !o.stored && o.prev && o.touchedBy === partnerKey && !o.noticed)
    .sort((a, b) => ts(b.touchedAt) - ts(a.touchedAt))
    .forEach((o) => budget.push({ kind: 'noticing', uid: o.uid, strength: 1 }));

  if (state.candle.litBy === partnerKey && !state.candle.seenAt
    && hoursSince(state.candle.litAt, now) < 24) {
    budget.push({ kind: 'candle', strength: 1 });
  }

  state.objects
    .filter((o) => !o.removed && !o.stored && (o.sku === 'mug-wine' || o.sku === 'mug-gold'))
    .filter((o) => o.touchedBy === partnerKey && hoursSince(o.touchedAt, now) < 14)
    .forEach((o) => budget.push({
      kind: 'cup', uid: o.uid,
      strength: hoursSince(o.touchedAt, now) < 0.5 ? 1 : 0.4,
    }));

  state.objects
    .filter((o) => !o.removed && !o.stored && o.touchedBy === partnerKey)
    .filter((o) => {
      const h = hoursSince(o.touchedAt, now);
      return h < 12 && h >= 0;
    })
    .sort((a, b) => ts(b.touchedAt) - ts(a.touchedAt))
    .forEach((o) => budget.push({
      kind: 'halo', uid: o.uid,
      strength: Math.max(0.15, 1 - hoursSince(o.touchedAt, now) / 12),
    }));

  state.objects
    .filter((o) => !o.removed && o.prev && hoursSince(o.prev.at, now) < 24 && o.touchedBy === partnerKey)
    .forEach((o) => budget.push({ kind: 'ghost', uid: o.uid, strength: 0.5 }));

  // the room must read as tended, never as a crime scene
  const seen = new Set<string>();
  const capped = budget.filter((t) => {
    const key = t.uid ?? t.noteId ?? t.kind;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, TRACE_BUDGET);

  return [...traces, ...capped];
};

/* ── ambient conditions ──────────────────────────────────────── */

/** Both away 3+ days → the home holds its breath (never a punishment). */
export const isQuietHours = (state: OurHomeState, ctx: TraceContext): boolean => {
  const mine = state.visits[ctx.myKey]?.lastSeenAt;
  const theirs = ctx.partnerKey ? state.visits[ctx.partnerKey]?.lastSeenAt : undefined;
  if (!mine && !theirs) return false; // a brand-new home is sparse, not asleep
  return hoursSince(mine, ctx.now) > 72 && hoursSince(theirs, ctx.now) > 72;
};

/** Coco sleeps wherever the OTHER partner last lingered. */
export const cocoSpot = (
  state: OurHomeState, ctx: TraceContext,
): { x: number; y: number; lane: HomeLane; waiting: boolean } => {
  if (isQuietHours(state, ctx)) {
    return { x: ARCH.cocoDoorSpot.x, y: ARCH.cocoDoorSpot.y, lane: 2, waiting: true };
  }
  const theirs = ctx.partnerKey
    ? state.objects
      // she sleeps on the FLOOR near their trace — never up on a sill
      .filter((o) => !o.removed && !o.stored && o.touchedBy === ctx.partnerKey && o.lane === 1)
      .sort((a, b) => ts(b.touchedAt) - ts(a.touchedAt))[0]
    : undefined;
  const basket = state.objects.find((o) => o.uid === 't:coco-basket' && !o.stored && !o.removed);
  if (theirs) {
    return { x: theirs.x + 22, y: theirs.y + 12, lane: theirs.lane, waiting: false };
  }
  if (basket) return { x: basket.x, y: basket.y - 4, lane: basket.lane, waiting: false };
  return { x: 215, y: 398, lane: 1, waiting: false };
};
