import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Heart } from 'lucide-react';
// The real pet art — rendered with the user's own colour + accessories so the
// creature that sneaks around the app is identical to the one on the pet screen.
import { CocoPet } from './coco-pet/CocoPetCreature.jsx';
import { storageEventTarget, StorageUpdateDetail } from '../services/storage';
import { syncEventTarget } from '../services/sync';
import '../styles/living-pet.css';

interface SneakyPetProps {
    /** Where a tap takes you — the full pet screen. */
    onTap: () => void;
}

type Edge = 'bottom' | 'left' | 'right' | 'top';

const PET_STATE_KEY = 'lior_coco_pet_state_v1';
const PET_W = 132;
const PET_H = 156;

// Edges are weighted: face-forward peeks (bottom/left/right) are cuter and more
// frequent; the top "peering over" peek is a rarer treat.
const EDGE_BAG: Edge[] = ['bottom', 'bottom', 'left', 'left', 'right', 'right', 'top'];

const REACTING_TABLES = new Set([
    'memories', 'daily_photos', 'keepsakes', 'notes',
    'time_capsules', 'surprises', 'voice_notes',
]);

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

interface EdgeConfig {
    anchor: React.CSSProperties;
    hidden: { x?: number; y?: number; rotate: number; scale: number };
    peek: { x?: number; y?: number; rotate: number; scale: number };
}

// Tucked fully behind the relevant viewport edge → leaning partway out.
const buildEdgeConfig = (edge: Edge): EdgeConfig => {
    const along = 14 + Math.random() * 72; // 14%..86% along the edge
    switch (edge) {
        case 'top':
            return {
                anchor: { left: `${along}%`, top: 0, marginLeft: -PET_W / 2 },
                hidden: { y: -(PET_H + 28), rotate: 180, scale: 0.92 },
                peek: { y: -66, rotate: 180, scale: 1 },
            };
        case 'left':
            return {
                anchor: { top: `${along}%`, left: 0, marginTop: -PET_H / 2 },
                hidden: { x: -(PET_W + 28), rotate: 12, scale: 0.92 },
                peek: { x: -54, rotate: 9, scale: 1 },
            };
        case 'right':
            return {
                anchor: { top: `${along}%`, right: 0, marginTop: -PET_H / 2 },
                hidden: { x: PET_W + 28, rotate: -12, scale: 0.92 },
                peek: { x: 54, rotate: -9, scale: 1 },
            };
        case 'bottom':
        default:
            return {
                anchor: { left: `${along}%`, bottom: 74, marginLeft: -PET_W / 2 },
                hidden: { y: PET_H + 28, rotate: 0, scale: 0.92 },
                peek: { y: 58, rotate: 0, scale: 1 },
            };
    }
};

interface ActivePeek {
    id: number;
    edge: Edge;
    cfg: EdgeConfig;
    look: PetLook;
}

/**
 * A living creature that quietly inhabits the app: every so often (and when
 * something lovely happens) the user's actual pet sneaks out from behind a
 * screen edge — popping up from the bottom, leaning around the side, or peering
 * over the top — looks around, then ducks back. Tapping it opens the full pet.
 *
 * Reflective, never demanding: it never decays, blocks, or nags. The heavy pet
 * art is only mounted while it is actually peeking, and everything pauses while
 * the tab is hidden, so it costs nothing the rest of the time.
 */
export const SneakyPet: React.FC<SneakyPetProps> = ({ onTap }) => {
    const prefersReducedMotion = useReducedMotion();
    const [peek, setPeek] = useState<ActivePeek | null>(null);
    const [pulse, setPulse] = useState(0);
    const [hearts, setHearts] = useState<number[]>([]);

    const peekRef = useRef<ActivePeek | null>(null);
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
        setPeek(null); // AnimatePresence plays the duck-back exit
    }, []);

    const appear = useCallback((happy: boolean) => {
        if (peekRef.current) return; // already on screen
        const edge = EDGE_BAG[Math.floor(Math.random() * EDGE_BAG.length)];
        const next: ActivePeek = { id: idRef.current++, edge, cfg: buildEdgeConfig(edge), look: readPetLook() };
        setPeek(next);
        if (happy) { setPulse((p) => p + 1); popHeart(); }
        // Linger, then duck back on its own.
        if (retreatRef.current) clearTimeout(retreatRef.current);
        retreatRef.current = setTimeout(retreat, happy ? 4200 : 3600);
    }, [popHeart, retreat]);

    // Idle schedule: wander out every so often while the tab is visible.
    const scheduleNext = useCallback(() => {
        if (scheduleRef.current) clearTimeout(scheduleRef.current);
        const delay = 15000 + Math.random() * 17000; // 15s..32s
        scheduleRef.current = setTimeout(() => {
            if (document.visibilityState === 'visible' && !peekRef.current) appear(false);
            scheduleNext();
        }, delay);
    }, [appear]);

    useEffect(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            scheduleRef.current = setTimeout(scheduleNext, 6000); // first peek a little after arrival
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

    // React to real moments — a happy pop-out (throttled so it never spams).
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

    const handleTap = useCallback(() => {
        setPulse((p) => p + 1);
        popHeart();
        onTap();
        if (retreatRef.current) clearTimeout(retreatRef.current);
        retreatRef.current = setTimeout(retreat, 320);
    }, [onTap, popHeart, retreat]);

    const emergeTransition = prefersReducedMotion
        ? { duration: 0.35, ease: 'easeOut' as const }
        : { type: 'spring' as const, stiffness: 240, damping: 15, mass: 0.9 };

    return (
        <AnimatePresence>
            {peek && (
                <motion.div
                    key={peek.id}
                    className="sneaky-pet"
                    style={{ position: 'fixed', width: PET_W, height: PET_H, zIndex: 30, pointerEvents: 'none', ...peek.cfg.anchor }}
                    initial={peek.cfg.hidden}
                    animate={{ ...peek.cfg.peek, transition: emergeTransition }}
                    exit={{ ...peek.cfg.hidden, transition: { duration: 0.42, ease: 'easeIn' } }}
                >
                    <AnimatePresence>
                        {hearts.map((id) => (
                            <motion.div
                                key={id}
                                initial={{ opacity: 0, y: 0, scale: 0.5 }}
                                animate={{ opacity: 1, y: -42, scale: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1.4, ease: 'easeOut' }}
                                style={{ position: 'absolute', top: 6, left: '50%', marginLeft: -7, pointerEvents: 'none' }}
                            >
                                <Heart size={14} className="text-lior-400" fill="currentColor" />
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
