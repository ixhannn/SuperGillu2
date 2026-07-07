/**
 * OUR HOME — the placement engine.
 *
 * The touch grammar, exactly as specified (docs/OUR_HOME_VISION.md §3):
 *   press 200ms → LIFT (rise, shadow spreads, light haptic)
 *   drag        → CARRY (1:1, object floats 56 units above the fingertip, 2° lean)
 *   near a seam → CATCH (24-unit magnet, crisp click)
 *   seated      → HYSTERESIS (12 units of intent past the LIFT point)
 *   release     → SETTLE (drop, dust, thock — the scene draws the warmth halo)
 *   press-release without drag (200–600ms) → step facing
 *   press past 600ms without drag          → the plaque
 *   simple tap  → the view decides; un-consumed taps wake a 4s fine-nudge window
 *   carry + hold still ~1.4s → SAVED YOU A SPOT (plant the dotted outline)
 *   release over the open cupboard → back to its shelf, story intact
 *
 * Robustness invariants (each guards a reviewed failure mode):
 * - Pointer capture goes on the SVG (the pressed <g> unmounts when the carry
 *   starts, which would silently drop capture) — so releases outside the
 *   scene still land and the carry can never wedge.
 * - carryRef mirrors the carry synchronously, so pointerup commits the drop
 *   from the LAST move, not a stale render closure.
 * - One press at a time: a second finger is ignored, never an overwrite.
 * - Hysteresis measures from the lift point, so pre-lift drift can't erode
 *   the 12-unit band that protects a partner's arrangement.
 * - The nudge window only arms on taps the view did NOT consume, requires
 *   the drag to start near the object, and commits at ~5Hz + on release.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HomeLane, HomeObject, HomeSku, SCENE_W } from './homeTypes';
import {
  DropResolution, HYSTERESIS, SeatField, gatherSeats, resolveDrop,
} from './homeSeats';
import type { CommitSpot } from './homeSoul';

const LIFT_MS = 200;
const PLAQUE_MS = 600;
const SPOT_ARM_MS = 700;
const SPOT_PLANT_MS = 1400;
const NUDGE_MS = 4000;
const NUDGE_COMMIT_MS = 220;
const NUDGE_START_REACH = 110;
const SLOP = 8;
const CARRY_RISE = 56;

export interface PlacementCallbacks {
  onCommit: (uid: string, spot: CommitSpot) => void;
  /** A brand-new instance dragged out of the furnishing drawer just settled. */
  onPlaceNew: (sku: string, spot: CommitSpot) => void;
  onFacing: (uid: string) => void;
  onPlaque: (uid: string) => void;
  /** Return true if the tap was consumed (replay, kettle, lamp…) — a consumed
   *  tap must NOT open the fine-nudge window. */
  onTap: (uid: string) => boolean;
  onPlantSpot: (uid: string, spot: { x: number; y: number; lane: HomeLane }) => void;
  onStore: (uid: string) => void;
  haptic: (kind: 'lift' | 'click' | 'thock' | 'tick') => void;
}

export interface CarryState {
  uid: string;
  sku: HomeSku;
  x: number;
  y: number;
  lean: number;
  drop: DropResolution;
  fromCupboard: boolean;
  spotArmed: boolean;
  field: SeatField;
}

export interface SettleFx {
  uid: string;
  x: number;
  y: number;
  key: number;
}

interface PlacementOptions {
  svgRef: React.RefObject<SVGSVGElement | null>;
  objects: readonly HomeObject[];
  resolveSku: (sku: string) => HomeSku | undefined;
  enabled: boolean;
  callbacks: PlacementCallbacks;
}

interface PressTracking {
  uid: string;
  pointerId: number;
  startX: number;
  startY: number;
  liftX: number;
  liftY: number;
  lastX: number;
  lastY: number;
  lastMoveAt: number;
  lifted: boolean;
  liftedAt: number;
  detached: boolean; // hysteresis: has the drag earned its way off the seam
  fromCupboard: boolean;
  lastSeatId: string | null;
  vx: number;
}

export const useHomePlacement = ({
  svgRef, objects, resolveSku, enabled, callbacks,
}: PlacementOptions) => {
  const [carry, setCarryState] = useState<CarryState | null>(null);
  const [nudgeUid, setNudgeUid] = useState<string | null>(null);
  const [settled, setSettled] = useState<SettleFx | null>(null);

  const press = useRef<PressTracking | null>(null);
  const carryRef = useRef<CarryState | null>(null);
  const timers = useRef<{ lift?: number; plaque?: number; spotArm?: number; spotPlant?: number; nudge?: number }>({});
  const cb = useRef(callbacks);
  cb.current = callbacks;
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const nudgeUidRef = useRef<string | null>(null);
  nudgeUidRef.current = nudgeUid;

  /** carryRef first (synchronous truth), state second (render). */
  const setCarry = useCallback((c: CarryState | null) => {
    carryRef.current = c;
    setCarryState(c);
  }, []);

  const clearTimer = (key: keyof typeof timers.current) => {
    const t = timers.current[key];
    if (t !== undefined) {
      window.clearTimeout(t);
      timers.current[key] = undefined;
    }
  };
  const clearAllTimers = () => {
    (['lift', 'plaque', 'spotArm', 'spotPlant', 'nudge'] as const).forEach(clearTimer);
  };
  const clearNudge = useCallback(() => {
    clearTimer('nudge');
    nudgeDrag.current = null;
    setNudgeUid(null);
  }, []);

  /** Client → scene coordinates. */
  const toScene = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    const scale = rect.width > 0 ? SCENE_W / rect.width : 1;
    return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
  }, [svgRef]);

  const captureOnSvg = useCallback((pointerId: number) => {
    try {
      svgRef.current?.setPointerCapture?.(pointerId);
    } catch {
      // a pointer can be gone by the time capture is requested — never fatal
    }
  }, [svgRef]);

  const fieldFor = useCallback((sku: HomeSku, ignoreUid: string): SeatField =>
    gatherSeats(sku, objectsRef.current, resolveSku, ignoreUid),
  [resolveSku]);

  const beginCarry = useCallback((
    uid: string, sku: HomeSku, sceneX: number, sceneY: number, fromCupboard: boolean,
  ) => {
    const field = fieldFor(sku, uid);
    const drop = resolveDrop(sku, sceneX, sceneY - CARRY_RISE, field, objectsRef.current, resolveSku, uid);
    setCarry({
      uid, sku, x: sceneX, y: sceneY - CARRY_RISE, lean: 0, drop, fromCupboard,
      spotArmed: false, field,
    });
    cb.current.haptic('lift');
  }, [fieldFor, setCarry]);

  const endCarry = useCallback((commit: boolean) => {
    const c = carryRef.current;
    setCarry(null);
    clearAllTimers();
    if (!c || !commit) return;
    const isNew = c.uid.startsWith('new:');
    const { drop } = c;
    const spot: CommitSpot = {
      x: drop.x, y: drop.y, lane: drop.lane, seatId: drop.seatId, surfaceUid: drop.surfaceUid,
    };
    if (isNew) cb.current.onPlaceNew(c.sku.sku, spot);
    else cb.current.onCommit(c.uid, spot);
    cb.current.haptic('thock');
    setSettled({ uid: isNew ? 'new' : c.uid, x: drop.x, y: drop.y, key: Date.now() });
  }, [setCarry]);

  /* ── pointer down on a placed object ─────────────────────── */

  const onObjectPointerDown = useCallback((
    e: React.PointerEvent, uid: string,
  ) => {
    if (!enabledRef.current || carryRef.current || press.current) return;
    const obj = objectsRef.current.find((o) => o.uid === uid);
    const sku = obj ? resolveSku(obj.sku) : undefined;
    if (!obj || !sku || obj.stored || obj.removed) return;
    e.stopPropagation();
    const { x, y } = toScene(e.clientX, e.clientY);
    captureOnSvg(e.pointerId);
    clearNudge();
    press.current = {
      uid,
      pointerId: e.pointerId,
      startX: x,
      startY: y,
      liftX: x,
      liftY: y,
      lastX: x,
      lastY: y,
      lastMoveAt: performance.now(),
      lifted: false,
      liftedAt: 0,
      detached: !obj.seatId, // free-standing objects owe no hysteresis
      fromCupboard: false,
      lastSeatId: obj.seatId ?? null,
      vx: 0,
    };
    clearAllTimers();
    timers.current.lift = window.setTimeout(() => {
      const p = press.current;
      if (!p || p.uid !== uid) return;
      p.lifted = true;
      p.liftedAt = performance.now();
      // hysteresis is measured from HERE — pre-lift drift owes nothing
      p.liftX = p.lastX;
      p.liftY = p.lastY;
      beginCarry(uid, sku, p.lastX, p.lastY, false);
      // still no drag by 600ms → set it down gently and unfurl the plaque
      timers.current.plaque = window.setTimeout(() => {
        const pp = press.current;
        if (!pp || pp.uid !== uid) return;
        if (Math.hypot(pp.lastX - pp.liftX, pp.lastY - pp.liftY) < SLOP) {
          press.current = null;
          setCarry(null);
          clearAllTimers();
          cb.current.onPlaque(uid);
        }
      }, PLAQUE_MS - LIFT_MS);
    }, LIFT_MS);
  }, [resolveSku, toScene, beginCarry, setCarry, captureOnSvg, clearNudge]);

  /* ── pointer down on a cupboard miniature ─────────────────── */

  const beginFromCupboard = useCallback((
    e: React.PointerEvent, uid: string,
  ) => {
    if (!enabledRef.current || carryRef.current || press.current) return;
    const obj = objectsRef.current.find((o) => o.uid === uid);
    const sku = obj ? resolveSku(obj.sku) : undefined;
    if (!obj || !sku) return;
    e.stopPropagation();
    const { x, y } = toScene(e.clientX, e.clientY);
    captureOnSvg(e.pointerId);
    clearAllTimers();
    clearNudge();
    press.current = {
      uid,
      pointerId: e.pointerId,
      startX: x,
      startY: y,
      liftX: x,
      liftY: y,
      lastX: x,
      lastY: y,
      lastMoveAt: performance.now(),
      lifted: true,
      liftedAt: performance.now(),
      detached: true,
      fromCupboard: true,
      lastSeatId: null,
      vx: 0,
    };
    // one continuous gesture: it scales up along the drag, already held
    beginCarry(uid, sku, x, y, true);
  }, [resolveSku, toScene, beginCarry, captureOnSvg, clearNudge]);

  /* ── pointer down on a furnishing-drawer card (mints on settle) ── */

  const beginFromDrawer = useCallback((
    e: React.PointerEvent, skuId: string,
  ) => {
    if (!enabledRef.current || carryRef.current || press.current) return;
    const sku = resolveSku(skuId);
    if (!sku) return;
    e.stopPropagation();
    const { x, y } = toScene(e.clientX, e.clientY);
    captureOnSvg(e.pointerId);
    clearAllTimers();
    clearNudge();
    const phantom = `new:${skuId}`;
    press.current = {
      uid: phantom,
      pointerId: e.pointerId,
      startX: x,
      startY: y,
      liftX: x,
      liftY: y,
      lastX: x,
      lastY: y,
      lastMoveAt: performance.now(),
      lifted: true,
      liftedAt: performance.now(),
      detached: true,
      fromCupboard: true,
      lastSeatId: null,
      vx: 0,
    };
    beginCarry(phantom, sku, x, y, true);
  }, [resolveSku, toScene, beginCarry, captureOnSvg, clearNudge]);

  /* ── scene-level move / up (captured on the svg) ──────────── */

  const onScenePointerMove = useCallback((e: React.PointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const { x, y } = toScene(e.clientX, e.clientY);
    const now = performance.now();
    const dt = Math.max(8, now - p.lastMoveAt);
    p.vx = p.vx * 0.7 + ((x - p.lastX) / dt) * 0.3;
    const movedFromStart = Math.hypot(x - p.startX, y - p.startY);

    if (!p.lifted) {
      p.lastX = x;
      p.lastY = y;
      p.lastMoveAt = now;
      // moved before the lift finished → this was a scroll, not a press
      if (movedFromStart > SLOP) {
        clearAllTimers();
        press.current = null;
      }
      return;
    }

    const movedFromLift = Math.hypot(x - p.liftX, y - p.liftY);

    // hysteresis: leaving a locked seam takes 12 units of intent PAST the lift
    if (!p.detached) {
      if (movedFromLift < HYSTERESIS) {
        p.lastX = x;
        p.lastY = y;
        p.lastMoveAt = now;
        return;
      }
      p.detached = true;
    }

    if (movedFromLift > SLOP) clearTimer('plaque');

    // stationary mid-carry arms Saved-You-a-Spot
    if (Math.hypot(x - p.lastX, y - p.lastY) > 6) {
      clearTimer('spotArm');
      clearTimer('spotPlant');
      if (carryRef.current?.spotArmed) {
        setCarry({ ...carryRef.current, spotArmed: false });
      }
      timers.current.spotArm = window.setTimeout(() => {
        const c = carryRef.current;
        if (!c || !press.current) return; // carry already ended — nothing to arm
        setCarry({ ...c, spotArmed: true });
        cb.current.haptic('tick');
        timers.current.spotPlant = window.setTimeout(() => {
          const cc = carryRef.current;
          if (!cc || !press.current) return;
          press.current = null;
          setCarry(null);
          clearAllTimers();
          cb.current.onPlantSpot(cc.uid, { x: cc.drop.x, y: cc.drop.y, lane: cc.drop.lane });
        }, SPOT_PLANT_MS - SPOT_ARM_MS);
      }, SPOT_ARM_MS);
    }

    p.lastX = x;
    p.lastY = y;
    p.lastMoveAt = now;

    const c = carryRef.current;
    if (!c || c.uid !== p.uid) return;
    const drop = resolveDrop(c.sku, x, y - CARRY_RISE, c.field, objectsRef.current, resolveSku, c.uid);
    if (drop.snapped && drop.seatId && drop.seatId !== p.lastSeatId) {
      p.lastSeatId = drop.seatId;
      cb.current.haptic('click');
    } else if (!drop.snapped) {
      p.lastSeatId = null;
    }
    const lean = Math.max(-2, Math.min(2, p.vx * 26));
    setCarry({ ...c, x, y: y - CARRY_RISE, lean, drop });
  }, [toScene, setCarry, resolveSku]);

  const onScenePointerUp = useCallback((e: React.PointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    press.current = null;
    const heldFor = performance.now() - (p.liftedAt || performance.now());
    const moved = Math.hypot(p.lastX - p.startX, p.lastY - p.startY);
    clearAllTimers();

    if (!p.lifted) {
      // a simple tap — the view decides; un-consumed taps wake the nudge window
      if (moved < SLOP) {
        const consumed = cb.current.onTap(p.uid);
        if (!consumed) {
          setNudgeUid(p.uid);
          timers.current.nudge = window.setTimeout(() => setNudgeUid(null), NUDGE_MS);
        }
      }
      return;
    }

    if (moved < SLOP && !p.fromCupboard) {
      // lifted, never carried: turning something heavy on a wooden floor
      setCarry(null);
      if (heldFor < PLAQUE_MS - LIFT_MS) {
        cb.current.onFacing(p.uid);
        cb.current.haptic('tick');
      }
      return;
    }

    endCarry(true);
  }, [endCarry, setCarry]);

  const onScenePointerCancel = useCallback((e: React.PointerEvent) => {
    // only the pointer that owns the gesture may cancel it — a palm resting
    // on the scene must never abort finger one's carry
    if (press.current && e.pointerId === press.current.pointerId) {
      press.current = null;
      clearAllTimers();
      setCarry(null);
      return;
    }
    if (nudgeDrag.current && e.pointerId === nudgeDrag.current.pointerId) {
      // the armed window must keep (or regain) its 4s expiry
      clearNudge();
    }
  }, [setCarry, clearNudge]);

  /* ── nudge: 1:2 fine drag during the window, starting near the object ── */

  const nudgeDrag = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    pending: DropResolution | null;
    lastCommitAt: number;
  } | null>(null);

  const commitNudge = useCallback((uid: string, drop: DropResolution) => {
    cb.current.onCommit(uid, {
      x: drop.x, y: drop.y, lane: drop.lane, seatId: drop.seatId, surfaceUid: drop.surfaceUid,
    });
  }, []);

  const onScenePointerDown = useCallback((e: React.PointerEvent) => {
    const uid = nudgeUidRef.current;
    if (!uid || carryRef.current || press.current) return;
    const obj = objectsRef.current.find((o) => o.uid === uid);
    if (!obj) return;
    const { x, y } = toScene(e.clientX, e.clientY);
    // fine-adjustment must begin near the thing being adjusted
    if (Math.hypot(x - obj.x, y - obj.y) > NUDGE_START_REACH) return;
    captureOnSvg(e.pointerId);
    nudgeDrag.current = {
      pointerId: e.pointerId, lastX: x, lastY: y, pending: null, lastCommitAt: 0,
    };
  }, [toScene, captureOnSvg]);

  const onSceneNudgeMove = useCallback((e: React.PointerEvent) => {
    const d = nudgeDrag.current;
    const uid = nudgeUidRef.current;
    if (!d || !uid || e.pointerId !== d.pointerId) return;
    const { x, y } = toScene(e.clientX, e.clientY);
    const dx = (x - d.lastX) / 2;
    const dy = (y - d.lastY) / 2;
    d.lastX = x;
    d.lastY = y;
    const obj = objectsRef.current.find((o) => o.uid === uid);
    const sku = obj ? resolveSku(obj.sku) : undefined;
    if (!obj || !sku || obj.seatId?.startsWith('surface')) return;
    clearTimer('nudge');
    timers.current.nudge = window.setTimeout(() => setNudgeUid(null), NUDGE_MS);
    const field = fieldFor(sku, obj.uid);
    const base = d.pending ?? obj;
    const drop = resolveDrop(sku, base.x + dx, base.y + dy, field, objectsRef.current, resolveSku, obj.uid);
    d.pending = drop;
    // every move is a full-state save + cloud push — trail it at ~5Hz, with a
    // guaranteed final commit on release. The 600ms rest transition glides
    // the object between commits, so the finger still feels 1:2-continuous.
    const now = performance.now();
    if (now - d.lastCommitAt > NUDGE_COMMIT_MS) {
      d.lastCommitAt = now;
      d.pending = null;
      commitNudge(obj.uid, drop);
    }
  }, [toScene, resolveSku, fieldFor, commitNudge]);

  const onSceneNudgeUp = useCallback((e: React.PointerEvent) => {
    const d = nudgeDrag.current;
    if (d?.pointerId !== e.pointerId) return;
    const uid = nudgeUidRef.current;
    if (d.pending && uid) commitNudge(uid, d.pending);
    nudgeDrag.current = null;
  }, [commitNudge]);

  useEffect(() => () => clearAllTimers(), []);

  const handlers = useMemo(() => ({
    onObjectPointerDown,
    beginFromCupboard,
    beginFromDrawer,
    scene: {
      onPointerDown: onScenePointerDown,
      onPointerMove: (e: React.PointerEvent) => {
        onScenePointerMove(e);
        onSceneNudgeMove(e);
      },
      onPointerUp: (e: React.PointerEvent) => {
        onScenePointerUp(e);
        onSceneNudgeUp(e);
      },
      onPointerCancel: onScenePointerCancel,
    },
  }), [
    onObjectPointerDown, beginFromCupboard, beginFromDrawer, onScenePointerDown,
    onScenePointerMove, onSceneNudgeMove, onScenePointerUp, onSceneNudgeUp,
    onScenePointerCancel,
  ]);

  return {
    carry, nudgeUid, settled, handlers,
    dismissSettled: useCallback(() => setSettled(null), []),
  };
};
