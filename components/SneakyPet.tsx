import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Heart } from 'lucide-react';
// The real pet art — rendered with the user's own colour + accessories so the
// creature roaming the app is identical to the one on the pet screen.
import { CocoPet } from './coco-pet/CocoPetCreature.jsx';
import { storageEventTarget, StorageUpdateDetail } from '../services/storage';
import { syncEventTarget } from '../services/sync';
import '../styles/living-pet.css';

interface SneakyPetProps {
    /** Where a tap takes you — the full pet screen. */
    onTap: () => void;
}

type Edge = 'bottom' | 'left' | 'right' | 'top';
type Transform = { x?: number; y?: number; rotate?: number; scale: number; opacity?: number };

const PET_STATE_KEY = 'lior_coco_pet_state_v1';
const PET_W = 72;
const PET_H = 86;
const TILE_OVERLAP = 0.3; // fraction of the pet that laps DOWN over the tile's lip
const TILE_SELECTOR = '.bento-card, .glass-card, [data-coachmark]';

const REACTING_TABLES = new Set([
    'memories', 'daily_photos', 'keepsakes', 'notes',
    'time_capsules', 'surprises', 'voice_notes',
]);

const EDGE_BAG: Edge[] = ['bottom', 'left', 'right', 'top'];

interface PetLook { variant: string; equipped: string[]; }

const readPetLook = (): PetLook => {
    try {
        const raw = JSON.parse(localStorage.getItem(PET_STATE_KEY) || '{}');
        return {
            variant: typeof raw.variant === 'string' ? raw.variant : 'rose',
            equipped: Array.isArray(raw.equipped) ? raw.equipped : ['glasses'],
        };
    } catch {
        return { variant: 'rose', equipped: ['glasses'] };
    }
};

interface PeekTarget {
    id: number;
    mode: 'tile' | 'edge';
    look: PetLook;
    anchor: React.CSSProperties;     // initial fixed position
    hidden: Transform;
    peek: Transform;
    exit: Transform;
    el?: HTMLElement;                // tile to stay glued to
    xFrac?: number;                  // horizontal grip point along the tile
}

const collectTiles = (): HTMLElement[] => {
    if (typeof document === 'undefined') return [];
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    return Array.from(document.querySelectorAll<HTMLElement>(TILE_SELECTOR)).filter((el) => {
        const r = el.getBoundingClientRect();
        // Visible, big enough to perch on, and its top edge sits comfortably in view.
        return r.width >= 92 && r.height >= 64
            && r.top >= 14 && r.top <= vh - 96
            && r.right > 24 && r.left < vw - 24;
    });
};

const tileTopFor = (r: DOMRect) => r.top - PET_H * (1 - TILE_OVERLAP);
const tileLeftFor = (r: DOMRect, xFrac: number) => {
    const cx = r.left + xFrac * r.width;
    return Math.max(r.left - 8, Math.min(cx - PET_W / 2, r.right - PET_W + 8));
};

const buildTileTarget = (id: number, look: PetLook, el: HTMLElement): PeekTarget => {
    const xFrac = 0.22 + Math.random() * 0.56;
    const r = el.getBoundingClientRect();
    return {
        id, mode: 'tile', look, el, xFrac,
        anchor: { left: tileLeftFor(r, xFrac), top: tileTopFor(r) },
        hidden: { y: 20, scale: 0.45, opacity: 0 },   // tucked low, as if rising from behind the lip
        peek: { y: 0, scale: 1, opacity: 1 },
        exit: { y: 22, scale: 0.5, opacity: 0 },
    };
};

const buildEdgeTarget = (id: number, look: PetLook): PeekTarget => {
    const edge = EDGE_BAG[Math.floor(Math.random() * EDGE_BAG.length)];
    const along = 16 + Math.random() * 68;
    const common = { id, mode: 'edge' as const, look };
    switch (edge) {
        case 'top':
            return { ...common, anchor: { left: `${along}%`, top: 0, marginLeft: -PET_W / 2 },
                hidden: { y: -(PET_H + 18), rotate: 180, scale: 0.9 }, peek: { y: -38, rotate: 180, scale: 1 }, exit: { y: -(PET_H + 18), rotate: 180, scale: 0.9 } };
        case 'left':
            return { ...common, anchor: { top: `${along}%`, left: 0, marginTop: -PET_H / 2 },
                hidden: { x: -(PET_W + 18), rotate: 10, scale: 0.9 }, peek: { x: -28, rotate: 8, scale: 1 }, exit: { x: -(PET_W + 18), rotate: 10, scale: 0.9 } };
        case 'right':
            return { ...common, anchor: { top: `${along}%`, right: 0, marginTop: -PET_H / 2 },
                hidden: { x: PET_W + 18, rotate: -10, scale: 0.9 }, peek: { x: 28, rotate: -8, scale: 1 }, exit: { x: PET_W + 18, rotate: -10, scale: 0.9 } };
        case 'bottom':
        default:
            return { ...common, anchor: { left: `${along}%`, bottom: 72, marginLeft: -PET_W / 2 },
                hidden: { y: PET_H + 18, scale: 0.9 }, peek: { y: 32, scale: 1 }, exit: { y: PET_H + 18, scale: 0.9 } };
    }
};

/**
 * A small living creature that inhabits the app. Every so often (and when a
 * lovely moment happens) the user's actual pet sneaks out — usually perching on
 * a random tile, rising from behind its top edge with its paws lapping over the
 * front lip (grounded by a soft contact shadow), and occasionally peeking from a
 * screen edge. It stays glued to its tile as you scroll, looks around, then ducks
 * back. Tap it to open the full pet.
 *
 * Reflective, never demanding: never decays or nags. The heavy art only mounts
 * while peeking, timers pause while the tab is hidden, event-peeks are throttled,
 * and reduced motion is respected.
 */
export const SneakyPet: React.FC<SneakyPetProps> = ({ onTap }) => {
    const prefersReducedMotion = useReducedMotion();
    const [peek, setPeek] = useState<PeekTarget | null>(null);
    const [pulse, setPulse] = useState(0);
    const [hearts, setHearts] = useState<number[]>([]);

    const peekRef = useRef<PeekTarget | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const idRef = useRef(0);
    const heartIdRef = useRef(0);
    const lastEventPeekRef = useRef(0);
    const scheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retreatRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    peekRef.current = peek;

    const clearTimers = useCallback(() => {
        if (scheduleRef.current) { clearTimeout(scheduleRef.current); scheduleRef.current = null; }
        if (retreatRef.current) { clearTimeout(retreatRef.current); retreatRef.current = null; }
    }, []);

    const popHeart = useCallback(() => {
        const id = heartIdRef.current++;
        setHearts((cur) => [...cur, id]);
        window.setTimeout(() => setHearts((cur) => cur.filter((h) => h !== id)), 1500);
    }, []);

    const retreat = useCallback(() => {
        if (retreatRef.current) { clearTimeout(retreatRef.current); retreatRef.current = null; }
        setPeek(null);
    }, []);

    const appear = useCallback((happy: boolean) => {
        if (peekRef.current) return;
        const id = idRef.current++;
        const look = readPetLook();
        const tiles = collectTiles();
        const target = (tiles.length && Math.random() < 0.78)
            ? buildTileTarget(id, look, tiles[Math.floor(Math.random() * tiles.length)])
            : buildEdgeTarget(id, look);
        setPeek(target);
        if (happy) { setPulse((p) => p + 1); popHeart(); }
        if (retreatRef.current) clearTimeout(retreatRef.current);
        retreatRef.current = setTimeout(retreat, happy ? 4200 : 3400);
    }, [popHeart, retreat]);

    const scheduleNext = useCallback(() => {
        if (scheduleRef.current) clearTimeout(scheduleRef.current);
        const delay = 14000 + Math.random() * 16000; // 14s..30s
        scheduleRef.current = setTimeout(() => {
            if (document.visibilityState === 'visible' && !peekRef.current) appear(false);
            scheduleNext();
        }, delay);
    }, [appear]);

    useEffect(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            scheduleRef.current = setTimeout(scheduleNext, 5000);
        }
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                if (!scheduleRef.current) scheduleNext();
            } else {
                clearTimers();
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            clearTimers();
        };
    }, [scheduleNext, clearTimers]);

    // React to real moments — a happy pop-out (throttled).
    useEffect(() => {
        const onMoment = () => {
            const now = Date.now();
            if (peekRef.current) { setPulse((p) => p + 1); popHeart(); return; }
            if (now - lastEventPeekRef.current < 9000) return;
            lastEventPeekRef.current = now;
            appear(true);
        };
        const onStorage = (event: Event) => {
            const detail = (event as CustomEvent).detail as StorageUpdateDetail | undefined;
            if (detail?.action === 'save' && detail.table && REACTING_TABLES.has(detail.table)) onMoment();
        };
        const onSignal = (event: Event) => {
            const detail = (event as CustomEvent).detail as { signalType?: string } | undefined;
            if (detail?.signalType === 'HEARTBEAT' || detail?.signalType === 'AURA_SIGNAL') onMoment();
        };
        storageEventTarget.addEventListener('storage-update', onStorage);
        syncEventTarget.addEventListener('signal-received', onSignal);
        return () => {
            storageEventTarget.removeEventListener('storage-update', onStorage);
            syncEventTarget.removeEventListener('signal-received', onSignal);
        };
    }, [appear, popHeart]);

    // Stay glued to the tile while perched (follows scroll/resize); retreat if it leaves.
    useEffect(() => {
        if (!peek || peek.mode !== 'tile' || !peek.el) return;
        let raf = 0;
        const reposition = () => {
            raf = 0;
            const el = peek.el!;
            const wrap = wrapRef.current;
            if (!wrap || !el.isConnected) { retreat(); return; }
            const r = el.getBoundingClientRect();
            if (r.bottom < 8 || r.top > window.innerHeight - 40) { retreat(); return; }
            wrap.style.left = `${tileLeftFor(r, peek.xFrac ?? 0.5)}px`;
            wrap.style.top = `${tileTopFor(r)}px`;
        };
        const onScroll = () => { if (!raf) raf = requestAnimationFrame(reposition); };
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
        };
    }, [peek, retreat]);

    const handleTap = useCallback(() => {
        setPulse((p) => p + 1);
        popHeart();
        onTap();
        if (retreatRef.current) clearTimeout(retreatRef.current);
        retreatRef.current = setTimeout(retreat, 320);
    }, [onTap, popHeart, retreat]);

    const emergeTransition = prefersReducedMotion
        ? { duration: 0.32, ease: 'easeOut' as const }
        : { type: 'spring' as const, stiffness: 260, damping: 16, mass: 0.8 };

    return (
        <AnimatePresence>
            {peek && (
                <motion.div
                    key={peek.id}
                    ref={wrapRef}
                    className="sneaky-pet"
                    style={{ position: 'fixed', width: PET_W, height: PET_H, zIndex: 30, pointerEvents: 'none', ...peek.anchor }}
                    initial={peek.hidden}
                    animate={{ ...peek.peek, transition: emergeTransition }}
                    exit={{ ...peek.exit, transition: { duration: 0.38, ease: 'easeIn' } }}
                >
                    {peek.mode === 'tile' && (
                        <div
                            className="sneaky-pet-contact"
                            style={{ top: PET_H * (1 - TILE_OVERLAP) - 3 }}
                            aria-hidden="true"
                        />
                    )}
                    <AnimatePresence>
                        {hearts.map((id) => (
                            <motion.div
                                key={id}
                                initial={{ opacity: 0, y: 0, scale: 0.5 }}
                                animate={{ opacity: 1, y: -34, scale: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1.4, ease: 'easeOut' }}
                                style={{ position: 'absolute', top: 2, left: '50%', marginLeft: -6, pointerEvents: 'none' }}
                            >
                                <Heart size={12} className="text-lior-400" fill="currentColor" />
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    <button
                        type="button"
                        onClick={handleTap}
                        aria-label="Your pet is peeking — open it"
                        style={{ pointerEvents: 'auto', width: '100%', height: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                    >
                        <CocoPet variant={peek.look.variant} equipped={peek.look.equipped} happy pulse={pulse} />
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
