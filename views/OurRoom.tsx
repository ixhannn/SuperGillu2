/**
 * OUR HOME — the place where the relationship lives.
 *
 * One hand-drawn room two partners keep alive across distance. Everything on
 * screen is either the world itself or one of two quiet verbs; the home never
 * narrates, never counts, never guilts. See docs/OUR_HOME_VISION.md.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Armchair, PenLine, Flame, Lamp, Sunrise } from 'lucide-react';
import { ViewState } from '../types';
import { Analytics } from '../services/analytics';
import { StorageService, storageEventTarget } from '../services/storage';
import { ViewHeader } from '../components/ViewHeader';
import { feedback } from '../utils/feedback';
import { daysTogetherFrom } from '../shared/dateOnly.js';
import {
  CoarsePhrase, HomeLane, HomeObject, HomeTrace, OurHomeState, SCENE_H, SCENE_W,
} from '../components/our-home/homeTypes';
import {
  addInscription, addNote, advanceParcel, assignInks, archUnlocks, attachPhoto,
  breatheFog, commitMove, computeDueParcels, cocoSpot, deriveTraces, dimForNight,
  flutterNote, hearthStage, isQuietHours, lampWarmthFor, leaveLampOn, lightCandle,
  markNoteRead, nameObject, noticeMove, openCurtains, peelNote, placeNewObject,
  plantSpot, potGrowth, recordVisit, seeCandle, seeFog, stepFacing, storeObject,
  TraceContext,
} from '../components/our-home/homeSoul';
import { HomeFurnishDrawer } from '../components/our-home/HomeFurnishDrawer';
import {
  airTintForHour, clockLabelForOffset, coarsePhrase, hoursSince, isEveningHour,
  localDayKey, localHourForOffset, myTzOffsetMin, provenancePhrase, skyForHour,
} from '../components/our-home/homeSky';
import { skuOf } from '../components/our-home/homeCatalog';
import { HomeScene } from '../components/our-home/HomeScene';
import { HomePlaque, PlaqueMemoryChoice } from '../components/our-home/HomePlaque';
import { HomeNoteComposer, HomeNoteReader } from '../components/our-home/HomeNoteLayer';
import { HomeShoebox } from '../components/our-home/HomeShoebox';
import { useHomePlacement } from '../components/our-home/useHomePlacement';
import { gatherSeats, resolveDrop } from '../components/our-home/homeSeats';
import '../styles/our-home.css';

interface OurRoomProps {
  setView: (view: ViewState) => void;
}

const CAPTION_MS = 3400;

/** What kind of presence the arrival glow should carry. */
type PresenceTone = 'lamp' | 'fog' | 'warm' | 'note' | 'candle' | 'fresh' | 'quiet' | 'still' | 'new';

interface PresenceSummary {
  tone: PresenceTone;
  eyebrow: string;
  headline: string;
  kicker?: string;
}

/**
 * The single most important thing to FEEL on arrival, in priority order:
 * a light left on › their cooling lamp › a note › a candle › a fresh trace ›
 * the held breath of a long-empty home › plain quiet. Presence first — the
 * room is the backdrop, the other person is the point.
 */
const describePresence = (
  traces: HomeTrace[],
  opts: {
    partnerKey: string | null;
    partnerName: string;
    seenPhrase: CoarsePhrase | undefined;
    quiet: boolean;
    /** A fog word from them is waiting, unread, on the glass. */
    fogWaiting: boolean;
  },
): PresenceSummary => {
  const { partnerKey, partnerName, seenPhrase, quiet, fogWaiting } = opts;
  if (!partnerKey) {
    return { tone: 'new', eyebrow: 'our home', headline: 'This is where we’ll live.', kicker: 'two sets of keys, one room' };
  }
  if (traces.some((t) => t.kind === 'lamp-left-on')) {
    return { tone: 'lamp', eyebrow: 'welcome home', headline: `${partnerName} left a light on for you`, kicker: 'still burning for your morning' };
  }
  if (fogWaiting) {
    return { tone: 'fog', eyebrow: 'welcome home', headline: `${partnerName} breathed a word on your window`, kicker: 'draw the curtains in the morning' };
  }
  if (traces.some((t) => t.kind === 'note')) {
    return { tone: 'note', eyebrow: 'welcome home', headline: `${partnerName} left you a note`, kicker: 'unread, in their hand' };
  }
  if (traces.some((t) => t.kind === 'lamp-warmth')) {
    return { tone: 'warm', eyebrow: 'welcome home', headline: `${partnerName} was here`, kicker: seenPhrase ?? 'a little while ago' };
  }
  if (traces.some((t) => t.kind === 'candle')) {
    return { tone: 'candle', eyebrow: 'welcome home', headline: `${partnerName} is thinking of you`, kicker: 'a candle, still lit' };
  }
  if (traces.some((t) => t.kind === 'noticing' || t.kind === 'halo' || t.kind === 'cup' || t.kind === 'ghost')) {
    return { tone: 'fresh', eyebrow: 'welcome home', headline: `${partnerName} was just here`, kicker: 'the room’s still warm' };
  }
  if (quiet) {
    return { tone: 'quiet', eyebrow: 'our home', headline: 'The home is holding its breath', kicker: 'waiting for you both' };
  }
  return { tone: 'still', eyebrow: 'our home', headline: 'All quiet here', kicker: 'you’re the first one home' };
};

/** Local demo dressing for dev previews — never persisted decisions, only paint. */
const dressForDemo = (state: OurHomeState, partnerKey: string, scene?: string | null): OurHomeState => {
  const now = Date.now();
  const ago = (min: number) => new Date(now - min * 60000).toISOString();
  // dev-only: `scene=lamp` seeds a lamp the partner left burning for your morning
  const leftOnLamp = scene === 'lamp'
    ? [{
        uid: 'demo-lamp', sku: 'lamp-a', rev: 1,
        x: 150, y: 340, lane: 1 as HomeLane, seatId: 'tile:1,3', facing: 0,
        stored: false, placedBy: partnerKey, placedAt: ago(600),
        touchedBy: partnerKey, touchedAt: ago(400),
        provenance: { kind: 'trousseau' as const, label: 'the lamp we leave on for each other', at: ago(600) },
      }]
    : [];
  return {
    ...state,
    lampOn: scene === 'lamp' ? { uid: 'demo-lamp', by: partnerKey, at: ago(400) } : state.lampOn,
    // dev-only: `scene=fog` — they breathed a heart on the glass last night
    fog: scene === 'fog'
      ? {
        strokes: [[50, 70, 34, 48, 36, 32, 50, 40, 64, 32, 66, 48, 50, 70]],
        by: partnerKey,
        at: ago(420),
      }
      : state.fog,
    objects: [
      ...state.objects,
      {
        uid: 'demo-armchair', sku: 'armchair', rev: 2,
        x: 215, y: 358, lane: 1 as HomeLane, seatId: 'tile:4,3', facing: 0,
        stored: false, placedBy: partnerKey, placedAt: ago(300),
        touchedBy: partnerKey, touchedAt: ago(48),
        prev: { x: 135, y: 338, lane: 1 as HomeLane, at: ago(48) },
        provenance: { kind: 'trousseau' as const, label: 'the first place to sit down together', at: ago(300) },
      },
      {
        uid: 'demo-window', sku: 'window', rev: 1,
        x: 235, y: 244, lane: 2 as HomeLane, seatId: 'wallR:2.0,44', facing: 1,
        stored: false, placedBy: partnerKey, placedAt: ago(300),
        touchedBy: partnerKey, touchedAt: ago(300),
        provenance: { kind: 'trousseau' as const, label: 'left wall shows your sky, right shows theirs', at: ago(300) },
      },
      {
        uid: 'demo-window-l', sku: 'window', rev: 1,
        x: 140, y: 272, lane: 0 as HomeLane, seatId: 'wallL:4.0,44', facing: 0,
        stored: false, placedBy: partnerKey, placedAt: ago(300),
        touchedBy: partnerKey, touchedAt: ago(300),
        provenance: { kind: 'trousseau' as const, label: 'your sky lives on this wall', at: ago(300) },
      },
      {
        uid: 'demo-door', sku: 'front-door', rev: 1,
        x: 335, y: 338, lane: 2 as HomeLane, seatId: 'wallR:7.0,0', facing: 1,
        stored: false, placedBy: partnerKey, placedAt: ago(300),
        touchedBy: partnerKey, touchedAt: ago(300),
        provenance: { kind: 'trousseau' as const, label: 'every home starts with a door', at: ago(300) },
      },
      {
        uid: 'demo-shoebox', sku: 'shoebox', rev: 1,
        x: 290, y: 418, lane: 1 as HomeLane, seatId: 'tile:6,6', facing: 0,
        stored: false, placedBy: partnerKey, placedAt: ago(300),
        touchedBy: partnerKey, touchedAt: ago(300),
        provenance: { kind: 'trousseau' as const, label: 'where the kept things live', at: ago(300) },
      },
      ...leftOnLamp,
    ],
    visits: {
      ...state.visits,
      [partnerKey]: { lastSeenAt: ago(52), tzOffsetMin: myTzOffsetMin() + 330 },
    },
    candle: { litBy: partnerKey, litAt: ago(70) },
    notes: [...state.notes, {
      id: 'demo-note', by: partnerKey, ink: 'gold' as const, at: ago(55),
      strokes: [
        [12, 38, 20, 22, 28, 40, 34, 26, 40, 42],
        [52, 30, 60, 22, 68, 30, 60, 44, 52, 36],
        [78, 26, 84, 40, 90, 26],
      ],
      x: 96, y: 302, lane: 0 as HomeLane, tilt: -4,
    }, {
      id: 'demo-kept-1', by: partnerKey, ink: 'gold' as const, at: ago(4000),
      strokes: [[16, 60, 30, 30, 44, 60], [24, 48, 37, 48], [56, 30, 56, 60, 74, 60]],
      x: 0, y: 0, lane: 1 as HomeLane, tilt: 3,
      readAt: ago(3900), peeled: true, peeledAt: ago(3900),
    }, {
      id: 'demo-kept-2', by: 'me', ink: 'wine' as const, at: ago(9000),
      strokes: [[20, 40, 30, 26, 40, 40, 40, 64], [58, 30, 52, 44, 62, 58, 74, 44, 66, 30]],
      x: 0, y: 0, lane: 1 as HomeLane, tilt: -3,
      readAt: ago(8800), peeled: true, peeledAt: ago(8800),
    }],
  };
};

export const OurRoom = ({ setView }: OurRoomProps): React.JSX.Element => {
  const demo = useMemo(() => {
    // dev servers AND e2e test builds — never a real (plain `vite build`) APK
    if (!import.meta.env.DEV && import.meta.env.VITE_E2E !== '1') return false;
    try {
      return new URLSearchParams(window.location.search).get('homedemo') === '1';
    } catch {
      return false;
    }
  }, []);
  // dev-only preview seams: force a presence scene / dock verb the real clock
  // can't produce on demand (`&scene=lamp`, `&dock=light|reveal`).
  const demoScene = useMemo(() => {
    if (!demo) return null;
    try { return new URLSearchParams(window.location.search).get('scene'); } catch { return null; }
  }, [demo]);
  const demoDock = useMemo(() => {
    if (!demo) return null;
    try { return new URLSearchParams(window.location.search).get('dock'); } catch { return null; }
  }, [demo]);

  const profile = useMemo(() => StorageService.getCoupleProfile(), []);
  const myKey = useMemo(
    () => StorageService.getMyUserId() || profile.myName || 'me',
    [profile.myName],
  );
  const partnerKey = useMemo(
    () => profile.partnerUserId || profile.partnerName || null,
    [profile.partnerUserId, profile.partnerName],
  );
  const partnerName = profile.partnerName || 'your person';
  const nameplate = `${profile.myName || 'you'} & ${partnerName}`;
  const inks = useMemo(() => assignInks(myKey, partnerKey), [myKey, partnerKey]);

  const [home, setHome] = useState<OurHomeState>(() => {
    const base = StorageService.getCoupleRoomState();
    return demo && partnerKey ? dressForDemo(base, partnerKey, demoScene) : base;
  });
  // synchronous truth for commit(): persistence must never live inside a
  // React state updater (StrictMode double-invokes them).
  const homeRef = useRef(home);
  homeRef.current = home;
  const visitRecorded = useRef(false);
  const myPrevSeenAt = useRef(home.visits[myKey]?.lastSeenAt).current;

  const [now, setNow] = useState(() => new Date());
  const [caption, setCaptionState] = useState<{ text: string; key: number } | null>(null);
  const [plaqueUid, setPlaqueUid] = useState<string | null>(null);
  const [readerNoteId, setReaderNoteId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [fogComposing, setFogComposing] = useState(false);
  const [shoeboxOpen, setShoeboxOpen] = useState(false);
  const [pendingStrokes, setPendingStrokes] = useState<number[][] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chooseLamp, setChooseLamp] = useState(false);
  const [quietVisit, setQuietVisit] = useState(false);
  const quietRef = useRef(false);
  quietRef.current = quietVisit;
  const [wakeFx, setWakeFx] = useState<{ x: number; y: number; key: number } | null>(null);
  const [replay, setReplay] = useState<{ uid: string; fromX: number; fromY: number; key: number } | null>(null);
  const [potSteamUntil, setPotSteamUntil] = useState(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const knobTimer = useRef<number | undefined>(undefined);
  const captionTimer = useRef<number | undefined>(undefined);
  const visitTimer = useRef<number | undefined>(undefined);
  const replayTimer = useRef<number | undefined>(undefined);
  const bookTimer = useRef<number | undefined>(undefined);
  const fogHintTimer = useRef<number | undefined>(undefined);
  const fogSeenTimer = useRef<number | undefined>(undefined);
  const murmurTimers = useRef<number[]>([]);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  /* the overlay is pruned shortly after back-navigation — no timer may
     outlive the room (a stray haptic or forced setView would fight the user) */
  useEffect(() => () => {
    [knobTimer, captionTimer, visitTimer, replayTimer, bookTimer, fogHintTimer, fogSeenTimer].forEach((t) => {
      window.clearTimeout(t.current);
    });
    murmurTimers.current.forEach((t) => window.clearTimeout(t));
  }, []);

  const setCaption = useCallback((text: string) => {
    setCaptionState({ text, key: Date.now() });
    window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => setCaptionState(null), CAPTION_MS);
  }, []);

  const commit = useCallback((
    updater: (prev: OurHomeState) => OurHomeState,
    opts?: { act?: boolean },
  ) => {
    const prev = homeRef.current;
    let next = updater(prev);
    if (next === prev) return;
    // any deliberate act means you're home — presence is never anonymous.
    // System-minted writes (parcel arrivals) pass act:false: they are the
    // home's doing, not yours, and must not spend your quiet entrance.
    if ((opts?.act ?? true) && !visitRecorded.current && !quietRef.current) {
      visitRecorded.current = true;
      next = recordVisit(next, myKey, new Date(), false, myTzOffsetMin());
    }
    homeRef.current = next;
    setHome(next);
    if (!demo) StorageService.saveCoupleRoomState(next, 'user');
  }, [demo, myKey]);

  /* ── the clock the room lives by ─────────────────────────── */
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  /* ── partner changes arrive as final states ───────────────── */
  useEffect(() => {
    const onStorage = (e: Event) => {
      const detail = (e as CustomEvent<{ table: string; source: string }>).detail;
      if (detail?.table !== 'our_room_state' || detail.source !== 'sync') return;
      const fresh = StorageService.getCoupleRoomState();
      homeRef.current = fresh;
      setHome(fresh);
    };
    storageEventTarget.addEventListener('storage-update', onStorage);
    return () => storageEventTarget.removeEventListener('storage-update', onStorage);
  }, []);

  /* ── growth: the relationship builds the house ────────────── */
  const daysTogether = useMemo(
    () => (profile.anniversaryDate ? daysTogetherFrom(profile.anniversaryDate) : 0),
    [profile.anniversaryDate],
  );
  const memoryCount = useMemo(() => StorageService.getMemories().length, []);
  const revealedQuestions = useMemo(
    () => (profile.questions ?? []).filter((q) => q.revealedAt).length,
    [profile.questions],
  );
  // Question entries are keyed by UTC day (that's how the store writes them) —
  // matching on the device-local day broke the ember for anyone west of UTC.
  const utcToday = now.toISOString().slice(0, 10);
  const todaysEntry = useMemo(
    () => (profile.questions ?? []).find((q) => q.date === utcToday),
    [profile.questions, utcToday],
  );
  const answeredTodayBoth = !!todaysEntry?.revealedAt;

  useEffect(() => {
    // an untouched canvas stays untouched — the home starts sending parcels
    // only once the couple has placed their first piece
    const touched = homeRef.current.objects.some((o) => !o.removed)
      || homeRef.current.parcels.length > 0;
    if (!touched) return;
    const due = computeDueParcels(home, {
      daysTogether, memoryCount, revealedQuestions, answeredTodayBoth,
    }, new Date());
    if (due.length > 0) {
      commit((prev) => {
        const have = new Set(prev.parcels.map((p) => p.id));
        const fresh = due.filter((p) => !have.has(p.id));
        return fresh.length ? { ...prev, parcels: [...prev.parcels, ...fresh] } : prev;
      }, { act: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysTogether, memoryCount, revealedQuestions, home.objects.length, home.parcels.length]);

  /* ── arrival: record the visit (unless you came in quietly).
     The dwell window is long enough to actually reach the doorknob; any
     deliberate act (commit) records the visit immediately instead. ── */
  useEffect(() => {
    visitTimer.current = window.setTimeout(() => {
      if (quietRef.current || visitRecorded.current) return;
      visitRecorded.current = true;
      commit((prev) => {
        let next = recordVisit(prev, myKey, new Date(), false, myTzOffsetMin());
        // a candle burning for you gutters once truly seen
        if (next.candle.litBy && next.candle.litBy !== myKey && !next.candle.seenAt) {
          next = seeCandle(next, new Date());
        }
        return next;
      });
    }, 8000);
    return () => window.clearTimeout(visitTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── derived atmosphere (memoized on the minute tick, so drags
     and captions never re-render the whole architecture) ─────── */
  const myTz = myTzOffsetMin(now);
  const partnerTz = (partnerKey ? home.visits[partnerKey]?.tzOffsetMin : undefined) ?? myTz;
  const myHour = localHourForOffset(myTz, now);
  const mySky = useMemo(() => skyForHour(myHour), [myHour]);
  const theirSky = useMemo(
    () => skyForHour(localHourForOffset(partnerTz, now)),
    [partnerTz, now],
  );
  const airTint = useMemo(() => airTintForHour(myHour), [myHour]);

  const ctx: TraceContext = useMemo(() => ({
    myKey, partnerKey, partnerName, myPrevSeenAt, now,
  }), [myKey, partnerKey, partnerName, myPrevSeenAt, now]);

  const traces = useMemo(() => deriveTraces(home, ctx), [home, ctx]);
  const quiet = isQuietHours(home, ctx) && !wakeFx;
  // an unread fog word from them, still fresh enough to survive the day
  const fogWaiting = !!partnerKey
    && home.fog.by === partnerKey
    && !!home.fog.at
    && !home.fog.seenAt
    && hoursSince(home.fog.at, now) < 20;
  const arch = useMemo(() => archUnlocks(daysTogether), [daysTogether]);
  const hearth = hearthStage(revealedQuestions);
  const pot = potGrowth(revealedQuestions);
  const today = localDayKey(now);
  // MY curtains, MY night — the rituals are each partner's own, on their own
  // clock. A late-afternoon fallback opens the room for whoever never swiped.
  const curtainsOpen = home.curtains[myKey]?.lastOpenedDay === today
    || myHour < 5 || myHour >= 15;
  const nightTucked = home.night[myKey]?.dimmedDay === today;
  const partnerSeen = partnerKey ? home.visits[partnerKey]?.lastSeenAt : undefined;
  const coco = useMemo(() => cocoSpot(home, ctx), [home, ctx]);
  const parcel = useMemo(() => {
    const open = home.parcels.filter((p) => p.stage < 3);
    open.sort((a, b) => a.earnedAt.localeCompare(b.earnedAt));
    return open[0] ?? null;
  }, [home.parcels]);

  /* ── visual state resolution (budget-aware: partner-trace pixels
     only render when their trace survived the ≤3 cap) ─────────── */
  const tracedUids = useMemo(() => new Set(
    traces.filter((t) => t.uid && (t.kind === 'cup' || t.kind === 'candle')).map((t) => t.uid),
  ), [traces]);
  const candleTraced = useMemo(() => traces.some((t) => t.kind === 'candle'), [traces]);

  const resolveVState = useCallback((o: HomeObject): string | undefined => {
    if (o.sku === 'lamp-a' || o.sku === 'lamp-b') {
      const isPartnerLamp = o.sku === inks.partnerLampSku && !!partnerKey;
      if (home.lampOn.uid === o.uid && hoursSince(home.lampOn.at, now) < 18) return 'lit';
      if (isPartnerLamp) return lampWarmthFor(partnerSeen, now);
      // after tuck-in the house goes dark — only the chosen lamp burns
      if (nightTucked) return 'out';
      if (!quietVisit && isEveningHour(myHour)) return 'lit';
      return 'out';
    }
    if (o.sku === 'candle') {
      const mine = home.candle.litBy === myKey;
      const lit = home.candle.litAt && !home.candle.seenAt && hoursSince(home.candle.litAt, now) < 24;
      return lit && (mine || candleTraced) ? 'lit' : 'out';
    }
    if (o.sku === 'mug-wine' || o.sku === 'mug-gold') {
      const mine = o.touchedBy === myKey;
      if (hoursSince(o.touchedAt, now) < 0.5 && (mine || tracedUids.has(o.uid))) return 'steam';
      if (o.touchedBy === partnerKey && tracedUids.has(o.uid)) return 'ring';
      return 'plain';
    }
    if (o.sku === 'coffee-pot') return Date.now() < potSteamUntil ? 'steam' : 'plain';
    if (o.sku === 'window') {
      // left wall holds this device's sky; the right wall, the partner's
      const sky = o.lane === 2 ? theirSky : mySky;
      return `${sky.top}|${sky.horizon}|${curtainsOpen ? 'o' : 'c'}`;
    }
    if (o.sku === 'front-door') return nameplate;
    if (o.sku === 'hearth') return answeredTodayBoth ? 'lit' : 'out';
    // every other light in the house simply follows the evening — and goes
    // dark after tuck-in, so the one chosen lamp is unmistakably the light
    if (skuOf(o.sku)?.emitsLight && o.sku !== 'candle') {
      return !quietVisit && !nightTucked && isEveningHour(myHour) ? 'lit' : 'out';
    }
    if (o.sku === 'book') {
      const partnerAnswered = todaysEntry
        && Object.keys(todaysEntry.answers ?? {}).some((k) => k !== profile.myName);
      const iAnswered = todaysEntry && profile.myName in (todaysEntry.answers ?? {});
      return partnerAnswered && !iAnswered ? 'ribbon' : 'closed';
    }
    if (o.sku === 'two-times-clock') {
      return `${clockLabelForOffset(myTz, now)}|${clockLabelForOffset(partnerTz, now)}`;
    }
    if (o.sku === 'vase') return 'fresh';
    if (o.sku === 'shoebox') return 'closed';
    return o.vState;
  }, [
    inks.partnerLampSku, partnerKey, home.lampOn, home.candle, partnerSeen, now,
    quietVisit, myHour, nightTucked, potSteamUntil, profile.myName, todaysEntry,
    myTz, partnerTz, myKey, tracedUids, candleTraced,
    mySky, theirSky, curtainsOpen, nameplate, answeredTodayBoth,
  ]);

  const resolveDetail = useCallback((o: HomeObject): number | undefined => {
    if (o.sku === 'bookcase') return Math.min(memoryCount, 14);
    if (o.sku === 'bookshelf-tall') return Math.min(memoryCount, 24);
    if (o.sku === 'sill-pot') return pot.stage;
    if (o.sku === 'cookie-plate') return o.detail ?? 5;
    if (o.sku === 'front-door') return arch.yearTicks;
    if (o.sku === 'hearth') return hearth;
    return o.detail;
  }, [memoryCount, pot.stage, arch.yearTicks, hearth]);

  const memories = useMemo(() => StorageService.getMemories(), []);
  const photoHrefFor = useCallback((memoryId?: string): string | undefined => {
    if (!memoryId) return undefined;
    const m = memories.find((mm) => mm.id === memoryId);
    return m?.image && m.image.startsWith('data:') ? m.image : undefined;
  }, [memories]);
  const photoChoices: PlaqueMemoryChoice[] = useMemo(() => memories
    .slice(0, 18)
    .map((m) => ({
      id: m.id,
      label: (m.text || m.mood || 'a memory').slice(0, 24),
      href: m.image?.startsWith('data:') ? m.image : undefined,
    })), [memories]);

  /* ── placement ────────────────────────────────────────────── */
  const placement = useHomePlacement({
    svgRef,
    objects: home.objects,
    resolveSku: skuOf,
    enabled: !plaqueUid && !composing && !fogComposing && !shoeboxOpen && !readerNoteId && !pendingStrokes,
    callbacks: {
      onCommit: (uid, spot) => commit((prev) => commitMove(prev, uid, spot, myKey, new Date())),
      onPlaceNew: (skuId, spot) => {
        const sku = skuOf(skuId);
        if (!sku) return;
        commit((prev) => placeNewObject(prev, skuId, sku.provenanceLabel, spot, myKey, new Date()));
        Analytics.feature('room_place_item');
        setCaption(`${sku.name} came home`);
      },
      onFacing: (uid) => {
        const sku = skuOf(home.objects.find((o) => o.uid === uid)?.sku ?? '');
        if (sku && sku.facings > 1) {
          commit((prev) => stepFacing(prev, uid, sku.facings, myKey, new Date()));
        }
      },
      onPlaque: (uid) => {
        feedback.light();
        setPlaqueUid(uid);
      },
      onTap: (uid) => {
        const o = homeRef.current.objects.find((x) => x.uid === uid);
        if (!o) return true;
        if (chooseLamp && (o.sku === 'lamp-a' || o.sku === 'lamp-b')) {
          commit((prev) => leaveLampOn(prev, uid, myKey, new Date()));
          setChooseLamp(false);
          setCaption(`it will burn until ${partnerName}'s morning`);
          feedback.confirm();
          // the night's second, quieter invitation — a word on the glass
          const fogged = homeRef.current.objects.some(
            (w) => w.sku === 'window' && !w.stored && !w.removed,
          );
          if (fogged && partnerKey) {
            window.clearTimeout(fogHintTimer.current);
            fogHintTimer.current = window.setTimeout(
              () => setCaption('the window has fogged over — breathe a word on it'),
              3800,
            );
          }
          return true;
        }
        if (chooseLamp) {
          // mid-ritual, a stray tap must never derail the choice (no book
          // navigation, no replays) — the home just re-offers the question
          setCaption(`a lamp for ${partnerName} — or not tonight`);
          return true;
        }
        // the tucked-in window fogs over — breathe a word for their morning
        if (o.sku === 'window' && nightTucked && partnerKey) {
          setFogComposing(true);
          feedback.light();
          return true;
        }
        // the shoebox opens: every note either of you chose to keep
        if (o.sku === 'shoebox') {
          setShoeboxOpen(true);
          feedback.light();
          return true;
        }
        const rim = traces.find((t) => t.kind === 'noticing' && t.uid === uid);
        if (rim && o.prev) {
          setReplay({ uid, fromX: o.prev.x, fromY: o.prev.y, key: Date.now() });
          window.clearTimeout(replayTimer.current);
          replayTimer.current = window.setTimeout(() => setReplay(null), 760);
          commit((prev) => noticeMove(prev, uid, myKey, new Date()));
          feedback.light();
          return true;
        }
        const lampTrace = traces.find((t) => t.kind === 'lamp-warmth' && t.phrase);
        if (o.sku === inks.partnerLampSku && lampTrace?.phrase) {
          setCaption(lampTrace.phrase);
          feedback.light();
          return true;
        }
        if (o.sku === 'coffee-pot') {
          setPotSteamUntil(Date.now() + 40000);
          const myMug = homeRef.current.objects.find(
            (m) => m.sku === (inks.myInk === 'wine' ? 'mug-wine' : 'mug-gold'),
          );
          if (myMug) {
            const mugSku = skuOf(myMug.sku);
            if (mugSku) {
              const field = gatherSeats(mugSku, homeRef.current.objects, skuOf, myMug.uid);
              const drop = resolveDrop(mugSku, o.x + 20, o.y - 6, field, homeRef.current.objects, skuOf, myMug.uid);
              commit((prev) => commitMove(prev, myMug.uid, {
                x: drop.x, y: drop.y, lane: drop.lane, seatId: drop.seatId, surfaceUid: drop.surfaceUid,
              }, myKey, new Date()));
            }
          }
          setCaption('the kettle is on');
          feedback.light();
          return true;
        }
        if (o.sku === 'book') {
          setCaption('today’s question lives in the book');
          window.clearTimeout(bookTimer.current);
          bookTimer.current = window.setTimeout(() => setView('home'), 650);
          return true;
        }
        // a plain tap on a plain object: wake the fine-nudge window
        return false;
      },
      onPlantSpot: (uid, spot) => {
        commit((prev) => storeObject(plantSpot(prev, uid, spot, undefined, myKey, new Date()), uid, myKey, new Date()));
        setCaption(`saved a spot for ${partnerName}`);
        feedback.confirm();
      },
      onStore: (uid) => {
        commit((prev) => storeObject(prev, uid, myKey, new Date()));
        setCaption('back on its shelf, story intact');
      },
      haptic: (kind) => {
        if (kind === 'lift' || kind === 'tick') feedback.light();
        else if (kind === 'click') feedback.medium();
        else feedback.interact();
      },
    },
  });

  /* ── rituals: doorknob, curtains, nightfall ───────────────── */
  const onDoorknobDown = useCallback(() => {
    knobTimer.current = window.setTimeout(() => {
      // never confirm invisibility that no longer exists — once the visit is
      // recorded, the hold simply does nothing (honest silence)
      if (visitRecorded.current) return;
      setQuietVisit(true);
      window.clearTimeout(visitTimer.current);
      setCaption('came in quietly');
      feedback.light();
    }, 900);
  }, [setCaption]);
  const onDoorknobUp = useCallback(() => window.clearTimeout(knobTimer.current), []);

  const onCurtainSwipe = useCallback(() => {
    commit((prev) => openCurtains(prev, myKey, new Date()));
    feedback.interact();
    // the home murmurs the overnight news — two quiet lines at most
    murmurTimers.current.forEach((t) => window.clearTimeout(t));
    murmurTimers.current = [];
    const lines: string[] = [];
    if (fogWaiting) lines.push('a word is waiting on the glass');
    if (traces.some((t) => t.kind === 'note')) lines.push('a note, in their hand');
    if (traces.some((t) => t.kind === 'noticing')) lines.push('something moved while you slept');
    if (traces.some((t) => t.kind === 'cup')) lines.push('the coffee is still warm');
    if (traces.some((t) => t.kind === 'candle')) lines.push('a candle is burning for you');
    setCaption('the morning came in');
    lines.slice(0, 2).forEach((line, i) => {
      murmurTimers.current.push(window.setTimeout(() => setCaption(line), 2700 * (i + 1)));
    });
  }, [commit, myKey, fogWaiting, traces, setCaption]);

  /* The night's one deliberate act — leave a single lamp burning until their
     morning. Reachable as a downward swipe OR the dock's evening verb. */
  const startNightRitual = useCallback(() => {
    // the dev seam lets previews rehearse the night outside real evenings
    if (nightTucked || !(isEveningHour(myHour) || demoDock === 'light')) return;
    commit((prev) => dimForNight(prev, myKey, new Date()));
    setChooseLamp(true);
    setCaption(`tap the lamp to leave on for ${partnerName}`);
    feedback.light();
  }, [nightTucked, myHour, demoDock, commit, myKey, partnerName, setCaption]);

  const onStagePointerDown = useCallback((e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
    if (quiet) {
      const svg = svgRef.current?.getBoundingClientRect();
      if (svg && svg.width > 0) {
        setWakeFx({
          x: (e.clientX - svg.left) * (SCENE_W / svg.width),
          y: (e.clientY - svg.top) * (SCENE_W / svg.width),
          key: Date.now(),
        });
      }
    }
  }, [quiet]);

  const onStagePointerUp = useCallback((e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || placement.carry || placement.nudgeUid) return;
    const dy = e.clientY - s.y;
    const dx = Math.abs(e.clientX - s.x);
    if (dy > 74 && dx < 60 && isEveningHour(myHour) && !nightTucked) {
      startNightRitual();
    }
  }, [placement.carry, placement.nudgeUid, myHour, nightTucked, startNightRitual]);

  /* ── notes ────────────────────────────────────────────────── */
  const onNoteDone = useCallback((strokes: number[][]) => {
    setComposing(false);
    setPendingStrokes(strokes);
    setCaption('tap where to leave it');
  }, [setCaption]);

  const onPlaceNote = useCallback((e: React.PointerEvent) => {
    if (!pendingStrokes) return;
    const svg = svgRef.current?.getBoundingClientRect();
    if (!svg || svg.width === 0) return;
    const scale = SCENE_W / svg.width;
    const x = (e.clientX - svg.left) * scale;
    const y = (e.clientY - svg.top) * scale;
    if (x < 0 || x > SCENE_W || y < 0 || y > SCENE_H) return;
    const lane: HomeLane = 1;
    commit((prev) => addNote(prev, { strokes: pendingStrokes, x, y, lane }, myKey, inks.myInk, new Date()));
    setPendingStrokes(null);
    setCaption(`left for ${partnerName}`);
    feedback.confirm();
  }, [pendingStrokes, commit, myKey, inks.myInk, partnerName, setCaption]);

  const readerNote = readerNoteId ? home.notes.find((n) => n.id === readerNoteId) ?? null : null;
  const onNoteTap = useCallback((id: string) => {
    if (chooseLamp) {
      // the night's one question stays the only thing on the table
      setCaption(`a lamp for ${partnerName} — or not tonight`);
      return;
    }
    setReaderNoteId(id);
    const n = home.notes.find((nn) => nn.id === id);
    if (n && n.by !== myKey && !n.readAt) {
      commit((prev) => markNoteRead(prev, id, new Date()));
    }
  }, [chooseLamp, partnerName, setCaption, home.notes, myKey, commit]);

  /* ── candle: thinking of you ──────────────────────────────── */
  const onCandle = useCallback(() => {
    commit((prev) => {
      let next = prev;
      const placed = next.objects.some((o) => o.sku === 'candle' && !o.stored && !o.removed);
      if (!placed) {
        // the home keeps one chamberstick — it appears on the nearest surface,
        // or waits on the floor by the walls if there isn't one yet
        const candleSku = skuOf('candle');
        if (candleSku) {
          const field = gatherSeats(candleSku, next.objects, skuOf);
          const drop = resolveDrop(candleSku, 195, 300, field, next.objects, skuOf);
          next = placeNewObject(
            next, 'candle', 'lit when one of us is thinking of the other',
            { x: drop.x, y: drop.y, lane: drop.lane, seatId: drop.seatId, surfaceUid: drop.surfaceUid },
            myKey, new Date(),
          );
        }
      }
      return lightCandle(next, myKey, new Date());
    });
    setCaption(`a small flame for ${partnerName}`);
    feedback.confirm();
  }, [commit, myKey, partnerName, setCaption]);

  /* ── furnishing ───────────────────────────────────────────── */
  const keptItems = useMemo(
    () => home.objects.filter((o) => o.stored && !o.removed),
    [home.objects],
  );
  const placedCount = useMemo(
    () => home.objects.filter((o) => !o.stored && !o.removed).length,
    [home.objects],
  );
  const onDragNew = useCallback((e: React.PointerEvent, skuId: string) => {
    setDrawerOpen(false);
    placement.handlers.beginFromDrawer(e, skuId);
  }, [placement.handlers]);
  const onTapNew = useCallback((skuId: string) => {
    const sku = skuOf(skuId);
    if (!sku) return;
    const field = gatherSeats(sku, homeRef.current.objects, skuOf);
    const drop = resolveDrop(sku, 195, 358, field, homeRef.current.objects, skuOf);
    commit((prev) => placeNewObject(prev, skuId, sku.provenanceLabel, {
      x: drop.x, y: drop.y, lane: drop.lane, seatId: drop.seatId, surfaceUid: drop.surfaceUid,
    }, myKey, new Date()));
    setDrawerOpen(false);
    setCaption(`${sku.name} came home — drag it where it belongs`);
    feedback.confirm();
  }, [commit, myKey, setCaption]);
  const onDragKept = useCallback((e: React.PointerEvent, uid: string) => {
    setDrawerOpen(false);
    placement.handlers.beginFromCupboard(e, uid);
  }, [placement.handlers]);
  const onTapKept = useCallback((uid: string) => {
    const o = homeRef.current.objects.find((x) => x.uid === uid);
    const sku = o ? skuOf(o.sku) : undefined;
    if (!o || !sku) return;
    const field = gatherSeats(sku, homeRef.current.objects, skuOf, uid);
    const drop = resolveDrop(sku, 195, 358, field, homeRef.current.objects, skuOf);
    commit((prev) => commitMove(prev, uid, {
      x: drop.x, y: drop.y, lane: drop.lane, seatId: drop.seatId, surfaceUid: drop.surfaceUid,
    }, myKey, new Date()));
    setDrawerOpen(false);
    setCaption('back where it belongs');
    feedback.confirm();
  }, [commit, myKey, setCaption]);

  /* ── parcels ──────────────────────────────────────────────── */
  const onParcelTap = useCallback(() => {
    if (!parcel) return;
    commit((prev) => advanceParcel(prev, parcel.id, myKey, new Date()));
    if (parcel.stage === 0) feedback.light();
    else {
      feedback.confirm();
      setCaption('something arrived');
    }
  }, [parcel, commit, myKey, setCaption]);
  const onSweepTap = useCallback(() => {
    if (!parcel) return;
    commit((prev) => advanceParcel(prev, parcel.id, myKey, new Date()));
    setCaption(`“${parcel.tag}”`);
    feedback.light();
  }, [parcel, commit, myKey, setCaption]);

  /* ── plaque wiring ────────────────────────────────────────── */
  const plaqueObject = plaqueUid ? home.objects.find((o) => o.uid === plaqueUid) ?? null : null;
  const plaqueSku = plaqueObject ? skuOf(plaqueObject.sku) : undefined;
  const nameFor = useCallback((key: string) => {
    if (key === myKey) return profile.myName || 'me';
    if (partnerKey && key === partnerKey) return partnerName;
    return key === 'home' ? 'the home' : key;
  }, [myKey, partnerKey, profile.myName, partnerName]);

  // the shoebox holds every kept note, newest memory first
  const keptNotes = useMemo(
    () => home.notes
      .filter((n) => n.peeled && !n.removed)
      .sort((a, b) => (b.peeledAt ?? b.at).localeCompare(a.peeledAt ?? a.at)),
    [home.notes],
  );

  const dockHidden = !!placement.carry || !!plaqueUid || composing || fogComposing
    || shoeboxOpen || !!readerNoteId || !!pendingStrokes;

  const seenPhrase = useMemo(() => coarsePhrase(partnerSeen, now), [partnerSeen, now]);
  const presence = useMemo<PresenceSummary>(
    () => describePresence(traces, { partnerKey, partnerName, seenPhrase, quiet, fogWaiting }),
    [traces, partnerKey, partnerName, seenPhrase, quiet, fogWaiting],
  );
  const windowsPlaced = useMemo(
    () => home.objects.some((o) => o.sku === 'window' && !o.stored && !o.removed),
    [home.objects],
  );
  const hasLamp = useMemo(
    () => home.objects.some((o) => (o.sku === 'lamp-a' || o.sku === 'lamp-b') && !o.stored && !o.removed),
    [home.objects],
  );

  // the fog word appears on MY side of the glass (left wall), else any window
  const fogWindowUid = useMemo(() => {
    const wins = home.objects.filter((o) => o.sku === 'window' && !o.stored && !o.removed);
    return (wins.find((o) => o.lane === 0) ?? wins[0])?.uid ?? null;
  }, [home.objects]);
  // the word reveals ONLY on a deliberate same-day curtain draw — the
  // late-day auto-open fallback must never passively consume it
  const curtainsDrawnToday = home.curtains[myKey]?.lastOpenedDay === today;
  const fogVisible = fogWaiting && curtainsDrawnToday && !!fogWindowUid;

  // reading it starts the sun on it — one gentle window, then it burns off
  useEffect(() => {
    if (!fogVisible) return undefined;
    fogSeenTimer.current = window.setTimeout(() => {
      commit((prev) => seeFog(prev, new Date()));
    }, 8000);
    return () => window.clearTimeout(fogSeenTimer.current);
  }, [fogVisible, commit]);

  // each window pours daylight only while ITS sky is in daylight — the left
  // wall lives on my clock, the right wall on theirs
  const shaftLanes = useMemo<HomeLane[]>(() => {
    if (!curtainsOpen || nightTucked || quiet) return [];
    const theirHour = localHourForOffset(partnerTz, now);
    const lanes: HomeLane[] = [];
    if (myHour >= 7 && myHour < 17) lanes.push(0 as HomeLane);
    if (theirHour >= 7 && theirHour < 17) lanes.push(2 as HomeLane);
    return lanes;
  }, [curtainsOpen, nightTucked, quiet, partnerTz, now, myHour]);

  // The dock leads with presence: the night's light, then the morning reveal,
  // and only falls back to furnishing when there's no ritual waiting.
  const nightReady = !!partnerKey && isEveningHour(myHour) && !nightTucked && hasLamp;
  const revealReady = windowsPlaced && !curtainsOpen && (traces.length > 0 || fogWaiting);
  const dockKind: 'light' | 'reveal' | 'furnish' = demoDock === 'light' && !nightTucked
    ? 'light'
    : demoDock === 'reveal' && !curtainsOpen ? 'reveal'
    : nightReady ? 'light' : revealReady ? 'reveal' : 'furnish';

  return (
    <div className={`oh-view ${nightTucked ? 'is-night' : ''}`}>
      <ViewHeader title="" variant="transparent" onBack={() => setView('us')} />
      <div
        ref={stageRef}
        className={`oh-stage ${pendingStrokes ? 'oh-placing-note' : ''}`}
        onPointerDown={onStagePointerDown}
        onPointerUp={onStagePointerUp}
      >
        {/* the stage itself dips to dusk while the house is tucked in */}
        <div className={`oh-dusk ${nightTucked ? 'is-on' : ''}`} />
        <div key={presence.headline} className={`oh-hero oh-hero--${presence.tone}`}>
          <span className="oh-hero-eyebrow">{presence.eyebrow}</span>
          <h1 className="oh-hero-line">{presence.headline}</h1>
          {presence.kicker && <span className="oh-hero-kicker">{presence.kicker}</span>}
        </div>
        <HomeScene
          svgRef={svgRef}
          state={home}
          traces={traces}
          airTint={airTint}
          nightTucked={nightTucked}
          curtainsOpen={curtainsOpen}
          revealTraces={curtainsOpen || !windowsPlaced}
          chooseLamp={chooseLamp}
          shaftLanes={shaftLanes}
          fogWord={fogVisible && fogWindowUid
            ? { strokes: home.fog.strokes ?? [], windowUid: fogWindowUid }
            : null}
          quiet={quiet}
          wakeFx={wakeFx}
          placement={placement}
          cocoAt={placedCount > 0 ? coco : null}
          parcel={parcel}
          replay={replay}
          resolveVState={resolveVState}
          resolveDetail={resolveDetail}
          photoHrefFor={photoHrefFor}
          onDoorknobDown={onDoorknobDown}
          onDoorknobUp={onDoorknobUp}
          onCurtainSwipe={onCurtainSwipe}
          onParcelTap={onParcelTap}
          onSweepTap={onSweepTap}
          onNoteTap={onNoteTap}
        />

        {/* note placement catcher */}
        {pendingStrokes && (
          <div className="oh-plaque-scrim" onPointerDown={onPlaceNote} />
        )}

        {/* the home's only voice */}
        {caption && (
          <div key={caption.key} className="oh-caption">{caption.text}</div>
        )}

        {/* the dock: one bold verb, two quiet ones */}
        <div className={`oh-dock ${dockHidden ? 'is-hidden' : ''}`}>
          <button
            type="button"
            className="oh-fab oh-fab-quiet"
            aria-label="leave a note"
            onClick={() => {
              feedback.light();
              setComposing(true);
            }}
          >
            <PenLine size={18} strokeWidth={1.9} />
          </button>
          {chooseLamp ? (
            <button
              type="button"
              className="oh-fab oh-fab-main oh-fab-cancel"
              onClick={() => {
                setChooseLamp(false);
                setCaption('maybe tomorrow');
              }}
            >
              <span>Not tonight</span>
            </button>
          ) : dockKind === 'light' ? (
            <button
              type="button"
              className="oh-fab oh-fab-main oh-fab-light"
              onClick={() => {
                feedback.light();
                startNightRitual();
              }}
            >
              <Lamp size={19} strokeWidth={2} />
              <span>Leave a light on</span>
            </button>
          ) : dockKind === 'reveal' ? (
            <button
              type="button"
              className="oh-fab oh-fab-main oh-fab-reveal"
              onClick={() => {
                feedback.interact();
                onCurtainSwipe();
              }}
            >
              <Sunrise size={19} strokeWidth={2} />
              <span>See what they left</span>
            </button>
          ) : (
            <button
              type="button"
              className="oh-fab oh-fab-main"
              onClick={() => {
                feedback.light();
                setDrawerOpen(true);
              }}
            >
              <Armchair size={19} strokeWidth={2} />
              <span>Furnish</span>
            </button>
          )}
          <button
            type="button"
            className="oh-fab oh-fab-quiet"
            aria-label="thinking of you"
            onClick={onCandle}
          >
            <Flame size={18} strokeWidth={1.9} />
          </button>
        </div>

        {/* an empty room is an invitation, not a lack — begin with the lamp */}
        {placedCount === 0 && !drawerOpen && !dockHidden && (
          <div className="oh-empty-hint">
            <span className="oh-empty-eyebrow">two sets of keys · one room</span>
            <h2>Start with a&nbsp;lamp.</h2>
            <p>It’s the light you’ll leave on for each other — the reason to come home.</p>
            <span className="oh-empty-cue">tap <b>Furnish</b> and place your first one</span>
          </div>
        )}

        {/* the furnishing drawer */}
        <HomeFurnishDrawer
          open={drawerOpen}
          keptItems={keptItems}
          onClose={() => setDrawerOpen(false)}
          onDragNew={onDragNew}
          onTapNew={onTapNew}
          onDragKept={onDragKept}
          onTapKept={onTapKept}
        />

        {/* plaque */}
        {plaqueObject && plaqueSku && (
          <HomePlaque
            object={plaqueObject}
            sku={plaqueSku}
            anchor={{
              leftPct: (plaqueObject.x / SCENE_W) * 100,
              topPct: ((plaqueObject.y - plaqueSku.h) / SCENE_H) * 100,
            }}
            whenPhrase={provenancePhrase(plaqueObject.provenance.at, home.createdAt, now)}
            myInk={inks.myInk}
            nameFor={nameFor}
            photoChoices={photoChoices}
            onName={(nick) => commit((prev) => nameObject(prev, plaqueObject.uid, nick, myKey, new Date()))}
            onInscribe={(text) => {
              commit((prev) => addInscription(prev, plaqueObject.uid, text, myKey, inks.myInk, new Date()));
              feedback.light();
            }}
            onPickPhoto={(memoryId) => commit((prev) => attachPhoto(prev, plaqueObject.uid, memoryId, myKey, new Date()))}
            onStore={() => {
              commit((prev) => storeObject(prev, plaqueObject.uid, myKey, new Date()));
              setPlaqueUid(null);
              setCaption('back on its shelf, story intact');
            }}
            onClose={() => setPlaqueUid(null)}
          />
        )}

        {/* note composer / reader */}
        {composing && (
          <HomeNoteComposer
            ink={inks.myInk}
            onDone={onNoteDone}
            onCancel={() => setComposing(false)}
          />
        )}

        {/* the fogged night window — breathe a word for their morning */}
        {fogComposing && (
          <HomeNoteComposer
            ink={inks.myInk}
            variant="fog"
            hint={`breathe a word for ${partnerName} — it waits on their glass`}
            doneLabel="leave it on the glass"
            onDone={(strokes) => {
              setFogComposing(false);
              commit((prev) => breatheFog(prev, strokes, myKey, new Date()));
              setCaption(`it will be on ${partnerName}'s window in the morning`);
              feedback.confirm();
            }}
            onCancel={() => setFogComposing(false)}
          />
        )}

        {/* the shoebox — every note either of you chose to keep */}
        {shoeboxOpen && (
          <HomeShoebox
            notes={keptNotes}
            fromLineFor={(n) => `from ${nameFor(n.by)} · ${coarsePhrase(n.peeledAt ?? n.at, now) ?? 'a while ago'}`}
            onClose={() => setShoeboxOpen(false)}
          />
        )}
        {readerNote && (
          <HomeNoteReader
            note={readerNote}
            fromLine={`from ${nameFor(readerNote.by)} · ${coarsePhrase(readerNote.at, now) ?? 'a while ago'}`}
            mine={readerNote.by === myKey}
            onKeep={() => {
              commit((prev) => peelNote(prev, readerNote.id, new Date()));
              setReaderNoteId(null);
              setCaption('kept — it lives in the shoebox now');
              feedback.confirm();
            }}
            onFlutter={() => {
              commit((prev) => flutterNote(prev, readerNote.id, new Date()));
              setReaderNoteId(null);
            }}
            onClose={() => setReaderNoteId(null)}
          />
        )}
      </div>
    </div>
  );
};
