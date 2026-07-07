/**
 * OUR HOME — the scene (isometric).
 *
 * Composition order (all inside one SVG, no blend modes anywhere):
 *   shell → cupboard minis → under-traces (ghosts, saved spots) →
 *   wall-hung things → floor furnishings in depth order → notes → Coco →
 *   the parcel → light pools → air tint → quiet veil → over-traces
 *   (halos, rim-lights, grid guides, settle fx) → hotspots.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  HomeLane, HomeNote, HomeObject, HomeParcel, HomeTrace, OurHomeState,
  SCENE_H, SCENE_W,
} from './homeTypes';
import { HomeShell } from './HomeShell';
import { skuOf } from './homeCatalog';
import { ARCH } from './homeSeats';
import { GRID, isoDiamond, tileToScene } from './homeIso';
import type { useHomePlacement } from './useHomePlacement';
import type { AirTint } from './homeSky';
import {
  CREAM_WALL, INK_GOLD, INK_SOFT, INK_WINE, LAMP_GOLD, PAPER, ROSE, SEAT_GOLD,
  SW_FINE, SW_HAIR, WARMTH_HALO,
} from './homeArt';
import { CocoArt } from './objects/homeObjectsSmall';
import { ParcelArt, TornPaperArt } from './objects/homeObjectsKept';

type Placement = ReturnType<typeof useHomePlacement>;

export interface HomeSceneProps {
  state: OurHomeState;
  traces: readonly HomeTrace[];
  airTint: AirTint;
  nightTucked: boolean;
  /** Whether this partner has drawn their curtains today (windows follow it). */
  curtainsOpen: boolean;
  /** False while the morning curtains are closed — drawing them IS the reveal. */
  revealTraces: boolean;
  /** Night ritual: the candidate lamps glow, waiting for the one deliberate tap. */
  chooseLamp: boolean;
  /** Wall lanes whose sky is in daylight — those windows pour a soft sun
      shaft (left wall follows my hour, right wall the partner's). */
  shaftLanes: readonly HomeLane[];
  quiet: boolean;
  wakeFx: { x: number; y: number; key: number } | null;
  placement: Placement;
  /** Null while the room is still an empty canvas — Coco arrives with life. */
  cocoAt: { x: number; y: number; lane: HomeLane; waiting: boolean } | null;
  parcel: HomeParcel | null;
  /** Noticing replay: animate uid from its prev spot to its current one. */
  replay: { uid: string; fromX: number; fromY: number; key: number } | null;
  resolveVState: (o: HomeObject) => string | undefined;
  resolveDetail: (o: HomeObject) => number | undefined;
  photoHrefFor: (memoryId?: string) => string | undefined;
  onDoorknobDown: () => void;
  onDoorknobUp: () => void;
  onCurtainSwipe: () => void;
  onParcelTap: () => void;
  onSweepTap: () => void;
  onNoteTap: (id: string) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}

/* ── one placed object ───────────────────────────────────────── */

const PlacedObject = React.memo(({
  o, vState, detail, photoHref, onPointerDown, replayFrom, dimmed, justSettled,
}: {
  o: HomeObject;
  vState?: string;
  detail?: number;
  photoHref?: string;
  onPointerDown: (e: React.PointerEvent, uid: string) => void;
  replayFrom: { x: number; y: number } | null;
  dimmed: boolean;
  justSettled: boolean;
}) => {
  const sku = skuOf(o.sku);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(replayFrom);
  useEffect(() => {
    if (!replayFrom) {
      setPos(null);
      return;
    }
    setPos(replayFrom);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setPos(null)));
    return () => cancelAnimationFrame(raf);
  }, [replayFrom]);
  if (!sku) return null;
  const x = pos?.x ?? o.x;
  const y = pos?.y ?? o.y;
  const onFloor = o.lane === 1 && !o.surfaceUid && sku.td > 0;
  return (
    <g
      className={`oh-object ${pos ? '' : 'oh-object-rest'} ${justSettled ? 'oh-just-settled' : ''}`}
      style={{
        transform: `translate(${x}px, ${y}px)`,
        opacity: dimmed ? 0.92 : 1,
      }}
      onPointerDown={(e) => onPointerDown(e, o.uid)}
    >
      {onFloor && (
        <path
          d={isoDiamond(Math.max(1, Math.ceil(sku.tw)), Math.max(1, Math.ceil(sku.td)))}
          transform="translate(0, 1.5)"
          fill="#3a2518" opacity={0.13}
        />
      )}
      {!onFloor && o.surfaceUid && (
        <ellipse cx={0} cy={1.5} rx={sku.w * 0.4} ry={sku.w * 0.2} fill="#3a2518" opacity={0.12} />
      )}
      <sku.art facing={o.facing} vState={vState} detail={detail} photoHref={photoHref} />
    </g>
  );
});
PlacedObject.displayName = 'PlacedObject';

/* ── a handwritten note ──────────────────────────────────────── */

const NOTE_SIZE = 26;

const PlacedNote = React.memo(({ n, unread, onTap }: {
  n: HomeNote; unread: boolean; onTap: (id: string) => void;
}) => {
  const ink = n.ink === 'wine' ? INK_WINE : INK_GOLD;
  const s = NOTE_SIZE / 100;
  return (
    <g
      className={`oh-note ${unread ? 'oh-note-unread' : ''}`}
      style={{ transform: `translate(${n.x}px, ${n.y}px) rotate(${n.tilt}deg)` }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onTap(n.id);
      }}
    >
      <rect x={-NOTE_SIZE / 2} y={-NOTE_SIZE} width={NOTE_SIZE} height={NOTE_SIZE} rx={1.5} fill={PAPER} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      <path d={`M ${NOTE_SIZE / 2 - 6} ${-NOTE_SIZE} l 6 6 l -6 0 Z`} fill="#eadfc6" stroke={INK_SOFT} strokeWidth={SW_HAIR} />
      {n.strokes.map((stroke, i) => {
        const pts: string[] = [];
        for (let j = 0; j + 1 < stroke.length; j += 2) {
          pts.push(`${(stroke[j] * s - NOTE_SIZE / 2).toFixed(1)},${(stroke[j + 1] * s - NOTE_SIZE).toFixed(1)}`);
        }
        if (pts.length < 2) return null;
        return (
          <polyline key={i} points={pts.join(' ')} fill="none" stroke={ink} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
        );
      })}
      {n.strokes.length === 0 && n.text && (
        <text x={0} y={-NOTE_SIZE / 2} textAnchor="middle" fontSize={4.6} fill={ink} style={{ fontStyle: 'italic' }}>
          {n.text.slice(0, 22)}
        </text>
      )}
    </g>
  );
});
PlacedNote.displayName = 'PlacedNote';

/* ── depth ordering: walls first, then floor by screen y ─────── */

const zOf = (o: HomeObject): number => (o.lane === 1 ? o.y : o.y - 1000);

/** The room + plinth silhouette (matches HomeShell geometry: wall tops at
 *  y=118/208, floor corners at 358/448, plinth 26 deeper). Mood layers clip
 *  to THIS so their edges never print rectangles on the light stage. */
const ROOM_SILHOUETTE = 'M 195 118 L 375 208 L 375 384 L 195 474 L 15 384 L 15 208 Z';

/* ── the scene ───────────────────────────────────────────────── */

export const HomeScene = ({
  state, traces, airTint, nightTucked, curtainsOpen, revealTraces, chooseLamp,
  shaftLanes, quiet, wakeFx,
  placement, cocoAt, parcel, replay, resolveVState, resolveDetail, photoHrefFor,
  onDoorknobDown, onDoorknobUp, onCurtainSwipe, onParcelTap,
  onSweepTap, onNoteTap, svgRef,
}: HomeSceneProps): React.JSX.Element => {
  const { carry, settled, handlers } = placement;

  const visible = useMemo(() => state.objects
    .filter((o) => !o.removed && !o.stored && o.uid !== carry?.uid)
    .sort((a, b) => (zOf(a) - zOf(b)) || a.uid.localeCompare(b.uid)),
  [state.objects, carry?.uid]);

  const notes = useMemo(
    () => state.notes.filter((n) => !n.removed && !n.peeled),
    [state.notes],
  );
  const unreadNoteIds = useMemo(() => new Set(
    traces.filter((t) => t.kind === 'note' && t.noteId).map((t) => t.noteId as string),
  ), [traces]);

  const spots = useMemo(
    () => state.objects.filter((o) => !o.removed && o.spot && o.stored),
    [state.objects],
  );

  const lamps = useMemo(() => visible.filter((o) => skuOf(o.sku)?.emitsLight), [visible]);

  const curtainSwipe = useRef<{ x: number; y: number } | null>(null);
  // the dedicated night veil (6b) owns the tucked-in darkness now
  const airOpacity = Math.min(0.3, airTint.opacity);

  // structural hotspots follow whatever the couple has placed
  const doors = useMemo(
    () => visible.filter((o) => o.sku === 'front-door'),
    [visible],
  );
  const windows = useMemo(
    () => visible.filter((o) => o.sku === 'window'),
    [visible],
  );

  return (
    <svg
      ref={svgRef}
      className={`oh-scene${chooseLamp ? ' oh-choosing' : ''}`}
      viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
      onPointerDown={handlers.scene.onPointerDown}
      onPointerMove={handlers.scene.onPointerMove}
      onPointerUp={handlers.scene.onPointerUp}
      onPointerCancel={handlers.scene.onPointerCancel}
    >
      <defs>
        <radialGradient id="oh-pool" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={LAMP_GOLD} stopOpacity="0.55" />
          <stop offset="0.7" stopColor={LAMP_GOLD} stopOpacity="0.18" />
          <stop offset="1" stopColor={LAMP_GOLD} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oh-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={WARMTH_HALO} stopOpacity="0.34" />
          <stop offset="1" stopColor={WARMTH_HALO} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oh-wake" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={LAMP_GOLD} stopOpacity="0.4" />
          <stop offset="1" stopColor={LAMP_GOLD} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oh-moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#9db1e0" stopOpacity="0.28" />
          <stop offset="0.6" stopColor="#9db1e0" stopOpacity="0.11" />
          <stop offset="1" stopColor="#9db1e0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 1 · architecture — the bare box; everything else is furniture */}
      <HomeShell />

      {/* 2 · under-traces (held behind the curtains until the morning draw) */}
      {revealTraces && traces.filter((t) => t.kind === 'ghost' && t.uid).map((t) => {
        const o = state.objects.find((x) => x.uid === t.uid);
        const sku = o ? skuOf(o.sku) : undefined;
        if (!o?.prev || !sku) return null;
        return (
          <path
            key={`ghost-${o.uid}`}
            className="oh-ghost"
            d={isoDiamond(Math.max(1, Math.ceil(sku.tw)), Math.max(1, Math.ceil(sku.td || 1)))}
            transform={`translate(${o.prev.x}, ${o.prev.y})`}
            fill="none" stroke={INK_SOFT} strokeWidth={SW_HAIR} strokeDasharray="3 4"
            opacity={0.32}
          />
        );
      })}
      {spots.map((o, i) => {
        const sku = skuOf(o.sku);
        if (!sku || !o.spot) return null;
        return (
          <g
            key={`spot-${o.uid}`}
            className={i === 0 ? 'oh-spot' : 'oh-spot-still'}
            style={{ transform: `translate(${o.spot.x}px, ${o.spot.y}px)` }}
          >
            <path
              d={isoDiamond(Math.max(1, Math.ceil(sku.tw)), Math.max(1, Math.ceil(sku.td || 1)))}
              fill="none" stroke={ROSE} strokeWidth={SW_FINE} strokeDasharray="4 5"
            />
            {o.spot.note && (
              <g>
                <rect x={-32} y={8} width={64} height={13} rx={3} fill={PAPER} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
                <text x={0} y={17} textAnchor="middle" fontSize={6} fill={INK_SOFT} style={{ fontStyle: 'italic' }}>
                  {o.spot.note.slice(0, 20)}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* 3 · furnishings (walls first, then floor in depth order) */}
      {visible.map((o) => (
        <PlacedObject
          key={o.uid}
          o={o}
          vState={resolveVState(o)}
          detail={resolveDetail(o)}
          photoHref={photoHrefFor(o.photoMemoryId)}
          onPointerDown={handlers.onObjectPointerDown}
          replayFrom={replay && replay.uid === o.uid ? { x: replay.fromX, y: replay.fromY } : null}
          dimmed={nightTucked}
          justSettled={settled?.uid === o.uid}
        />
      ))}

      {/* 4 · notes */}
      {notes.map((n) => (
        <PlacedNote key={n.id} n={n} unread={unreadNoteIds.has(n.id)} onTap={onNoteTap} />
      ))}

      {/* 5 · Coco — asleep wherever the other partner last lingered */}
      {cocoAt && (
        <g
          className="oh-coco"
          style={{ transform: `translate(${cocoAt.x}px, ${cocoAt.y}px)` }}
        >
          <ellipse cx={0} cy={1.5} rx={15} ry={6} fill="#3a2518" opacity={0.13} />
          <CocoArt facing={0} vState={cocoAt.waiting ? 'sitting' : 'asleep'} />
        </g>
      )}

      {/* 6 · the parcel on the doormat */}
      {parcel && parcel.stage < 2 && (
        <g
          className="oh-parcel"
          style={{ transform: `translate(${ARCH.parcelSpot.x}px, ${ARCH.parcelSpot.y}px)` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onParcelTap();
          }}
        >
          <path d={isoDiamond(1, 1)} transform="translate(0, 1.5)" fill="#3a2518" opacity={0.14} />
          <ParcelArt facing={0} vState={parcel.stage === 0 ? 'sealed' : 'bow'} />
        </g>
      )}
      {parcel && parcel.stage === 2 && (
        <g
          className="oh-torn"
          style={{ transform: `translate(${ARCH.parcelSpot.x - 14}px, ${ARCH.parcelSpot.y + 8}px)` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSweepTap();
          }}
        >
          <TornPaperArt facing={0} />
        </g>
      )}

      {/* 6b · tucked-in night — the house goes dark; every glow after this
             layer (the chosen lamp's pool, the halos) cuts through it */}
      {nightTucked && (
        <g className="oh-trace-in" pointerEvents="none">
          <path d={ROOM_SILHOUETTE} fill="#171223" opacity={0.4} />
        </g>
      )}

      {/* 6c · window light — a warm sun shaft by day, a cool moon pool by
             night; both are pure alpha gradients on the floor plane */}
      {windows.filter((o) => shaftLanes.includes(o.lane)).map((o) => {
        // wall axis + into-room direction per lane (screen-space 2:1 iso)
        const ax = 0.894;
        const ay = o.lane === 0 ? -0.447 : 0.447;
        const dx = o.lane === 0 ? 0.894 : -0.894;
        const dy = 0.447;
        const half = 30;
        const len = 118;
        const s1 = { x: o.x - ax * half, y: o.y - ay * half };
        const s2 = { x: o.x + ax * half, y: o.y + ay * half };
        const f1 = { x: s1.x + dx * len - ax * 12, y: s1.y + dy * len - ay * 12 };
        const f2 = { x: s2.x + dx * len + ax * 12, y: s2.y + dy * len + ay * 12 };
        return (
          <g key={`shaft-${o.uid}`} className="oh-trace-in" pointerEvents="none">
            <linearGradient
              id={`oh-shaft-${o.uid}`}
              gradientUnits="userSpaceOnUse"
              x1={o.x} y1={o.y} x2={o.x + dx * len} y2={o.y + dy * len}
            >
              <stop offset="0" stopColor="#f3d9a4" stopOpacity="0.2" />
              <stop offset="0.55" stopColor="#f3d9a4" stopOpacity="0.09" />
              <stop offset="1" stopColor="#f3d9a4" stopOpacity="0" />
            </linearGradient>
            <polygon
              points={`${s1.x},${s1.y} ${s2.x},${s2.y} ${f2.x},${f2.y} ${f1.x},${f1.y}`}
              fill={`url(#oh-shaft-${o.uid})`}
            />
          </g>
        );
      })}
      {nightTucked && windows.map((o) => (
        <ellipse
          key={`moon-${o.uid}`}
          className="oh-trace-in"
          cx={o.x + (o.lane === 0 ? 64 : -64)} cy={o.y + 64}
          rx={92} ry={46}
          fill="url(#oh-moon)" pointerEvents="none"
        />
      ))}

      {/* 7 · light pools (alpha gradients only, squashed to the floor plane) */}
      {lamps.map((o) => {
        const v = resolveVState(o);
        if (!v || v === 'out') return null;
        const big = o.sku.startsWith('lamp');
        const r = (big ? 72 : 34) * (v === 'lit' ? 1 : v === 'warm' ? 0.75 : 0.55);
        const op = v === 'lit' ? 0.85 : v === 'warm' ? 0.5 : 0.28;
        return (
          <ellipse
            key={`pool-${o.uid}`}
            className="oh-pool"
            cx={o.x} cy={o.y + 3}
            rx={r} ry={r * 0.5}
            fill="url(#oh-pool)" opacity={op}
          />
        );
      })}

      {/* 8 · air tint — one layer, walked by the hour, clipped to the room */}
      <path d={ROOM_SILHOUETTE} fill={airTint.color} opacity={airOpacity} pointerEvents="none" />

      {/* 9 · quiet hours veil + dust motes in the window shaft */}
      {quiet && (
        <g pointerEvents="none">
          <path d={ROOM_SILHOUETTE} fill={CREAM_WALL} opacity={0.28} />
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              className="oh-dust"
              style={{ animationDelay: `${i * 2.2}s` }}
              cx={110 - i * 12} cy={230 + i * 22} r={1.4}
              fill={LAMP_GOLD} opacity={0.5}
            />
          ))}
        </g>
      )}
      {wakeFx && (
        <circle
          key={wakeFx.key}
          className="oh-wake"
          cx={wakeFx.x} cy={wakeFx.y} r={220}
          fill="url(#oh-wake)" pointerEvents="none"
        />
      )}

      {/* 10 · over-traces: halos + rim-lights (revealed by the curtain draw,
             blooming one after another so the overnight news feels arrived) */}
      {revealTraces && traces.filter((t) => t.kind === 'halo' && t.uid).map((t, i) => {
        const o = state.objects.find((x) => x.uid === t.uid);
        const sku = o ? skuOf(o.sku) : undefined;
        if (!o || !sku || o.stored) return null;
        return (
          <g key={`halo-${o.uid}`} className="oh-trace-in" style={{ animationDelay: `${i * 160}ms` }}>
            <ellipse
              cx={o.x} cy={o.y - sku.h * 0.35}
              rx={sku.w * 0.75} ry={sku.h * 0.65}
              fill="url(#oh-halo)" opacity={0.12 + 0.2 * t.strength}
              pointerEvents="none"
            />
          </g>
        );
      })}
      {revealTraces && traces.filter((t) => t.kind === 'noticing' && t.uid).map((t, i) => {
        const o = state.objects.find((x) => x.uid === t.uid);
        const sku = o ? skuOf(o.sku) : undefined;
        if (!o || !sku || o.stored) return null;
        return (
          <g key={`rim-${o.uid}`} className="oh-trace-in" style={{ animationDelay: `${180 + i * 160}ms` }}>
            <rect
              className="oh-rim"
              x={o.x - sku.w / 2 - 3} y={o.y - sku.h - 3}
              width={sku.w + 6} height={sku.h + 8} rx={6}
              fill="none" stroke={SEAT_GOLD} strokeWidth={SW_FINE}
              pointerEvents="none"
            />
          </g>
        );
      })}

      {/* 10b · choose-lamp: every candidate glows until the one tap lands */}
      {chooseLamp && visible.filter((o) => o.sku === 'lamp-a' || o.sku === 'lamp-b').map((o) => {
        const sku = skuOf(o.sku);
        if (!sku) return null;
        return (
          <g key={`choose-${o.uid}`} className="oh-choose-ring">
            <ellipse
              cx={o.x} cy={o.y - sku.h * 0.4}
              rx={sku.w * 0.9} ry={sku.h * 0.7}
              fill="url(#oh-halo)"
            />
            <rect
              x={o.x - sku.w / 2 - 4} y={o.y - sku.h - 4}
              width={sku.w + 8} height={sku.h + 10} rx={7}
              fill="none" stroke={LAMP_GOLD} strokeWidth={SW_FINE}
            />
          </g>
        );
      })}

      {/* 11 · carry: the grid, the target tile, the floating object */}
      {carry && (
        <g pointerEvents="none">
          {/* the floor grid wakes while something is held */}
          {Array.from({ length: GRID + 1 }, (_, i) => {
            const c1 = tileToScene(i, 0);
            const c2 = tileToScene(i, GRID);
            const r1 = tileToScene(0, i);
            const r2 = tileToScene(GRID, i);
            return (
              <g key={i} className="oh-seat-line">
                <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke={SEAT_GOLD} strokeWidth={SW_HAIR} />
                <line x1={r1.x} y1={r1.y} x2={r2.x} y2={r2.y} stroke={SEAT_GOLD} strokeWidth={SW_HAIR} />
              </g>
            );
          })}
          {/* seats a small thing may rest on */}
          {carry.field.points.map((p) => (
            <path
              key={p.seatId}
              className={carry.drop.seatId === p.seatId ? 'oh-seat-pt oh-seat-near' : 'oh-seat-pt'}
              d={isoDiamond(0.4, 0.4)}
              transform={`translate(${p.x}, ${p.y})`}
              fill="none" stroke={SEAT_GOLD} strokeWidth={SW_FINE}
            />
          ))}
          {/* the target footprint breathes */}
          {carry.drop.tile && (
            <path
              className="oh-seat-near"
              d={isoDiamond(Math.max(1, Math.ceil(carry.sku.tw)), Math.max(1, Math.ceil(carry.sku.td)))}
              transform={`translate(${carry.drop.x}, ${carry.drop.y})`}
              fill={SEAT_GOLD} fillOpacity={0.18} stroke={SEAT_GOLD} strokeWidth={SW_FINE}
            />
          )}
          {carry.drop.snapped && !carry.drop.tile && (
            <path
              className="oh-align-tick"
              d={isoDiamond(0.5, 0.5)}
              transform={`translate(${carry.drop.x}, ${carry.drop.y})`}
              fill="none" stroke={SEAT_GOLD} strokeWidth={1.2}
            />
          )}
          {/* travelling shadow reads altitude */}
          <path
            d={isoDiamond(Math.max(1, Math.ceil(carry.sku.tw)), Math.max(1, Math.ceil(carry.sku.td || 1)))}
            transform={`translate(${carry.drop.x}, ${carry.drop.y + 1.5})`}
            fill="#3a2518"
            opacity={Math.max(0.07, 0.24 - Math.abs(carry.drop.y - carry.y) * 0.0012)}
          />
          {/* the held object, floating above the fingertip */}
          <g
            className="oh-carried"
            style={{ transform: `translate(${carry.x}px, ${carry.y}px) rotate(${carry.lean}deg) scale(1.04)` }}
          >
            <carry.sku.art facing={0} />
          </g>
          {carry.spotArmed && (
            <g style={{ transform: `translate(${carry.drop.x}px, ${carry.drop.y + 26}px)` }}>
              <rect x={-46} y={0} width={92} height={14} rx={7} fill={PAPER} stroke={INK_SOFT} strokeWidth={SW_HAIR} />
              <text x={0} y={9.6} textAnchor="middle" fontSize={6.4} fill={INK_SOFT} style={{ fontStyle: 'italic' }}>
                hold — save this spot
              </text>
            </g>
          )}
        </g>
      )}

      {/* 12 · settle fx: dust puff + warmth halo bloom */}
      {settled && (
        <g key={settled.key} pointerEvents="none">
          <circle className="oh-halo-bloom" cx={settled.x} cy={settled.y - 6} r={40} fill="url(#oh-halo)" />
          {[-1, 0, 1].map((d) => (
            <circle
              key={d}
              className="oh-dust-fleck"
              style={{ ['--oh-dx' as never]: `${d * 10}px` }}
              cx={settled.x + d * 6} cy={settled.y} r={1.3}
              fill={INK_SOFT} opacity={0.5}
            />
          ))}
        </g>
      )}

      {/* 13 · hotspots follow the placed structure (invisible, deliberate) */}
      {doors.map((o) => {
        // the brass knob sits on the leaf's leading edge, per wall skew
        const kx = o.x - 14;
        const ky = o.y + (o.facing === 1 ? -59 : -45);
        return (
          <circle
            key={`knob-${o.uid}`}
            cx={kx} cy={ky} r={13}
            fill="transparent"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDoorknobDown();
            }}
            onPointerUp={onDoorknobUp}
            onPointerLeave={onDoorknobUp}
          />
        );
      })}
      {!curtainsOpen && windows.map((o) => (
        <rect
          key={`curt-${o.uid}`}
          x={o.x - 44} y={o.y - 122} width={88} height={122}
          fill="transparent"
          onPointerDown={(e) => {
            curtainSwipe.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            const s = curtainSwipe.current;
            curtainSwipe.current = null;
            if (s && Math.abs(e.clientX - s.x) > 40 && Math.abs(e.clientY - s.y) < 60) {
              onCurtainSwipe();
            }
          }}
        />
      ))}
    </svg>
  );
};

export type { SettleFx, CarryState } from './useHomePlacement';
