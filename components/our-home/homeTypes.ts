/**
 * OUR HOME — state model & contracts.
 *
 * One shared hand-drawn room two partners keep alive. State is a couple-scoped
 * singleton synced over the existing `our_room_state` channel, but internally it
 * is a set of per-item records merged CRDT-style (per-uid latest-touch wins,
 * tombstones for removals) so two hands can rearrange the same room from two
 * continents without ever clobbering each other. See docs/OUR_HOME_VISION.md.
 */
import type React from 'react';

/* ── Geometry ────────────────────────────────────────────────── */

/** Scene units. The room is authored at 390×520 and scales with the viewport. */
export const SCENE_W = 390;
export const SCENE_H = 520;

/**
 * Where an object lives in the isometric room:
 * 0 = the left wall, 1 = the floor grid, 2 = the right wall.
 */
export type HomeLane = 0 | 1 | 2;

/* ── Partner inks (voice, never tally) ───────────────────────── */

export type HomeInk = 'wine' | 'gold';

/* ── Objects ─────────────────────────────────────────────────── */

export interface HomeProvenance {
  kind: 'trousseau' | 'parcel' | 'memory' | 'heirloom';
  /** One warm line: "came home with the first parcel". Never a date-stamp. */
  label: string;
  at: string; // ISO — rendered only as coarse warm time
  memoryId?: string;
}

export interface HomeInscription {
  by: string; // userKey
  ink: HomeInk;
  text: string; // one handwritten-style line, max ~90 chars
  at: string;
}

export interface HomeObject {
  uid: string;
  sku: string;
  /**
   * Monotonic edit counter — the merge's primary ordering. touchedAt stays
   * coarse (privacy), so revisions can't ride on wall-clock alone: every
   * mutating op bumps rev, and the higher rev wins a merge outright.
   */
  rev?: number;
  /** Floor-contact centre in scene units (already lane-scaled space). */
  x: number;
  y: number;
  lane: HomeLane;
  /** Locked architecture seam (see homeSeats). Empty string = free-standing. */
  seatId?: string;
  /** Seated on another object's surface (uid). */
  surfaceUid?: string;
  facing: number; // index into the sku's hand-drawn facings
  stored: boolean; // true = resting on its cupboard shelf
  placedBy: string; // userKey of whoever brought it into the room
  placedAt: string;
  touchedBy: string; // last deliberate hand on it
  touchedAt: string; // ISO, coarse-bucketed to 5 minutes before sync
  /** Previous committed spot — fuels Noticing replay + the ghost outline. */
  prev?: { x: number; y: number; lane: HomeLane; surfaceUid?: string; at: string };
  /** Set once the OTHER partner replays the move; cleared on next move. */
  noticed?: boolean;
  nickname?: string;
  lines?: HomeInscription[]; // plaque inscriptions, capped at 4
  provenance: HomeProvenance;
  /** Memory photo tucked behind frames — duotone-treated at render. */
  photoMemoryId?: string;
  /** Visual state key the sku's art understands ('lit', 'ring', 'open'…). */
  vState?: string;
  /** Small numeric state: pot stage, cookies left, etc. */
  detail?: number;
  /** Tombstone — objects never truly delete, but merges must not resurrect. */
  removed?: boolean;
  removedAt?: string;
  /** "Saved you a spot": planted outline waiting for the partner's hands. */
  spot?: { x: number; y: number; lane: HomeLane; by: string; note?: string; at: string };
  /** Earned when one partner plants the spot and the other performs the placement. */
  placedTogether?: boolean;
}

/* ── Handwritten notes (raw finger strokes) ──────────────────── */

export interface HomeNote {
  id: string;
  by: string;
  ink: HomeInk;
  at: string;
  /** Monotonic edit counter (see HomeObject.rev). */
  rev?: number;
  /** Each stroke is a flat [x0,y0,x1,y1,…] polyline in 100×100 note space. */
  strokes: number[][];
  /** Legacy import only — old typed notes carried into the shoebox. */
  text?: string;
  x: number;
  y: number;
  lane: HomeLane;
  seatId?: string;
  surfaceUid?: string;
  tilt: number; // degrees — self-placed slightly crooked, no two alike
  readAt?: string; // when the other partner first saw it
  peeled?: boolean; // kept — lives in the shoebox forever
  peeledAt?: string;
  removed?: boolean; // let flutter away
  removedAt?: string;
}

/* ── Parcels (growth arrives wrapped) ────────────────────────── */

export interface HomeParcel {
  /** Deterministic id ("day-2", "memory-5") so both devices mint identically. */
  id: string;
  sku: string;
  tag: string; // the gift-tag line, read by whoever sweeps the paper
  earnedAt: string;
  /** 0 sealed · 1 bow pulled · 2 open (paper on floor) · 3 paper swept. */
  stage: 0 | 1 | 2 | 3;
  openedBy?: string;
  openedAt?: string;
  sweptBy?: string;
  sweptAt?: string;
}

/* ── Ambient & ritual state ──────────────────────────────────── */

export interface HomeVisit {
  lastSeenAt?: string; // coarse-bucketed; quiet visits do NOT update this
  /** Minutes east of UTC — lets each window hold its person's real sky. */
  tzOffsetMin?: number;
}

export interface HomeLampChoice {
  uid?: string; // which lamp burns for the other's morning
  by?: string;
  at?: string;
}

export interface HomeCandle {
  litBy?: string;
  litAt?: string;
  seenAt?: string; // gutters to a smoke curl once seen
}

export interface HomeGlint {
  uid: string; // object whose move was noticed
  by: string; // who noticed
  at: string;
}

/** Per-partner: your curtains are YOUR morning ritual, on your clock. */
export interface HomeCurtains {
  lastOpenedDay?: string; // YYYY-MM-DD local — closed again each new morning
  at?: string;
}

/** Per-partner: tucking the room in is each person's own nightly last act. */
export interface HomeNight {
  dimmedDay?: string; // YYYY-MM-DD local — tucked in tonight
  at?: string;
}

/* ── The whole home ──────────────────────────────────────────── */

export interface OurHomeState {
  v: 3;
  objects: HomeObject[];
  notes: HomeNote[];
  parcels: HomeParcel[];
  /** Per-userKey ambient presence (coarse). */
  visits: Record<string, HomeVisit>;
  lampOn: HomeLampChoice;
  candle: HomeCandle;
  glints: HomeGlint[];
  curtains: Record<string, HomeCurtains>;
  night: Record<string, HomeNight>;
  createdAt: string;
}

/* ── Catalog contracts ───────────────────────────────────────── */

export type HomeCategory =
  | 'structure' | 'seating' | 'surface' | 'light' | 'living' | 'rugs' | 'music'
  | 'wall' | 'table-things' | 'kept';

/** Where a sku is allowed to rest. */
export type HomePlaceKind = 'floor' | 'wall' | 'sill' | 'surface' | 'mantel';

export interface HomeSurfaceSeat {
  /** Seat point relative to the host object's floor-contact centre. */
  dx: number;
  dy: number;
  /** Max footprint width (scene units) a guest may have to sit here. */
  maxW: number;
}

export interface ObjectArtProps {
  facing: number;
  vState?: string;
  detail?: number;
  /** Duotone-treated photo href for frames; art may ignore. */
  photoHref?: string;
}

export interface HomeSku {
  sku: string;
  name: string;
  category: HomeCategory;
  /** Screen bounding box (px) — hit areas, plaque anchors, cupboard minis. */
  w: number;
  h: number;
  /** Floor footprint in TILES (cols × rows). Wall/surface-only pieces use
   *  tw as their wall-slot width and td = 0. */
  tw: number;
  td: number;
  facings: number; // 1–3 pre-drawn facings; no free rotation exists
  placeOn: HomePlaceKind[];
  /** Surface seat points this object OFFERS to smaller guests. */
  seats?: HomeSurfaceSeat[];
  /** Emits light — renders a pool in the light layer when placed (and lit). */
  emitsLight?: boolean;
  /** Part of the day-1 trousseau (starts on a cupboard shelf). */
  trousseau?: boolean;
  /** Only ever arrives wrapped on the doormat — never listed in the drawer. */
  parcelOnly?: boolean;
  /** Default provenance label for trousseau pieces. */
  provenanceLabel: string;
  art: (props: ObjectArtProps) => React.JSX.Element;
}

/* ── Derived presence traces (never persisted — always recomputed) ─ */

export type HomeTraceKind =
  | 'lamp-warmth' // their lamp, cooling
  | 'lamp-left-on' // burning for your morning
  | 'halo' // warmth on something they touched
  | 'noticing' // rim-light with a replayable move
  | 'ghost' // pencil outline where something used to sit
  | 'note' // unread handwriting
  | 'candle' // thinking of you, still burning
  | 'cup'; // steam or ring stain

export interface HomeTrace {
  kind: HomeTraceKind;
  uid?: string; // object/note this trace lives on
  noteId?: string;
  /** 0..1 — halos cool, steam thins, lamp fades. */
  strength: number;
  /** Priority already applied — the scene renders these verbatim (budget ≤3 + lamp). */
  phrase?: string; // coarse warm time, partner-name lines only
}

/* ── Coarse warm time (the only clock the home speaks) ───────── */

export type CoarsePhrase =
  | 'just now'
  | 'a little while ago'
  | 'this morning'
  | 'this evening'
  | 'yesterday'
  | 'a few days ago';
