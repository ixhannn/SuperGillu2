/**
 * CoachmarkSystem — spotlight-based feature discovery.
 *
 * Usage:
 *   1. Wrap any element with data-coachmark="key"
 *   2. Call triggerCoachmark('key') from anywhere in the app
 *   3. The overlay spotlights that element with a callout bubble
 *
 * The system queues coachmarks and shows them one at a time.
 * Seen state persists in localStorage via FeatureDiscovery.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { FeatureDiscovery } from '../services/featureDiscovery';
import { Haptics } from '../services/haptics';

// ─── Coachmark definitions ────────────────────────────────────────────────────

export interface CoachmarkDef {
    key: string;
    emoji: string;
    title: string;
    body: string;
    calloutPosition?: 'above' | 'below' | 'auto';  // default: auto
}

export const COACHMARKS: CoachmarkDef[] = [
    {
        key: 'center-fab',
        emoji: '📸',
        title: 'Add a memory',
        body: 'Tap this button any time to capture a moment — a photo, a note, or just a feeling.',
        calloutPosition: 'above',
    },
    {
        key: 'daily-moments',
        emoji: '🌅',
        title: 'Daily Moments',
        body: 'Send your partner a photo from your day. It disappears in 24 hours — like a private story just for two.',
        calloutPosition: 'above',
    },
    {
        key: 'aura-signal',
        emoji: '💫',
        title: 'Aura Signal',
        body: 'Send a silent wave. No words needed — just let them know you\'re thinking of them.',
        calloutPosition: 'below',
    },
    {
        key: 'partner-pair',
        emoji: '🔗',
        title: 'Invite your partner',
        body: 'Tap here to generate a QR code. Once they scan it, your space is truly shared.',
        calloutPosition: 'below',
    },
];

// ─── Context ──────────────────────────────────────────────────────────────────

interface CoachmarkCtx {
    triggerCoachmark: (key: string) => void;
    triggerTour: () => void;        // show all unseen coachmarks in order
    dismissAll: () => void;
}

const CoachmarkContext = createContext<CoachmarkCtx>({
    triggerCoachmark: () => {},
    triggerTour: () => {},
    dismissAll: () => {},
});

export const useCoachmark = () => useContext(CoachmarkContext);

// ─── Spotlight overlay ────────────────────────────────────────────────────────

interface SpotlightState {
    rect: DOMRect;
    def: CoachmarkDef;
    queueLength: number;
}

const PADDING = 10; // px around target

const Spotlight: React.FC<{
    state: SpotlightState;
    onNext: () => void;
    onSkipAll: () => void;
    queueIndex: number;
}> = ({ state, onNext, onSkipAll, queueIndex }) => {
    const { rect, def } = state;

    const spotLeft   = rect.left   - PADDING;
    const spotTop    = rect.top    - PADDING;
    const spotWidth  = rect.width  + PADDING * 2;
    const spotHeight = rect.height + PADDING * 2;
    const spotRadius = Math.min(spotWidth, spotHeight, 28);

    // Decide callout position: prefer above unless target is in top 40% of screen
    const autoPos = rect.top > window.innerHeight * 0.4 ? 'above' : 'below';
    const calloutPos = def.calloutPosition === 'auto' || !def.calloutPosition ? autoPos : def.calloutPosition;

    const calloutTop = calloutPos === 'above'
        ? spotTop - 12   // anchor to bottom of callout
        : spotTop + spotHeight + 12;

    return (
        <motion.div
            key={def.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 900 }}
            onClick={onNext}
        >
            {/* Dark overlay using SVG with a hole */}
            <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <mask id="coachmark-mask">
                        <rect width="100%" height="100%" fill="white" />
                        <rect
                            x={spotLeft}
                            y={spotTop}
                            width={spotWidth}
                            height={spotHeight}
                            rx={spotRadius}
                            ry={spotRadius}
                            fill="black"
                        />
                    </mask>
                </defs>
                <rect
                    width="100%"
                    height="100%"
                    fill="rgba(15,8,12,0.78)"
                    mask="url(#coachmark-mask)"
                />
            </svg>

            {/* Pulsing glow ring around target */}
            <motion.div
                animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0.2, 0.6] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                    position: 'absolute',
                    left: spotLeft - 6,
                    top: spotTop - 6,
                    width: spotWidth + 12,
                    height: spotHeight + 12,
                    borderRadius: spotRadius + 6,
                    border: '2px solid rgba(196,104,126,0.9)',
                    boxShadow: '0 0 20px rgba(196,104,126,0.6)',
                    pointerEvents: 'none',
                }}
            />

            {/* Callout bubble */}
            <motion.div
                initial={{ opacity: 0, y: calloutPos === 'above' ? 12 : -12, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ type: 'spring' as const, damping: 24, stiffness: 320, delay: 0.12 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'absolute',
                    left: Math.max(16, Math.min(spotLeft, window.innerWidth - 320 - 16)),
                    width: Math.min(320, window.innerWidth - 32),
                    ...(calloutPos === 'above'
                        ? { bottom: window.innerHeight - calloutTop }
                        : { top: calloutTop }),
                    background: 'rgba(255,252,252,0.96)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: 20,
                    padding: '18px 20px 16px',
                    boxShadow: '0 16px 48px rgba(15,8,12,0.28), 0 4px 16px rgba(15,8,12,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
                    border: '1px solid rgba(255,255,255,0.9)',
                }}
            >
                {/* Arrow pointing to spotlight */}
                <div style={{
                    position: 'absolute',
                    left: Math.max(20, Math.min(spotLeft + spotWidth / 2 - Math.max(16, Math.min(spotLeft, window.innerWidth - 320 - 16)) - 8, 296)),
                    ...(calloutPos === 'above' ? { bottom: -8 } : { top: -8 }),
                    width: 16, height: 8,
                    overflow: 'hidden',
                }}>
                    <div style={{
                        width: 16, height: 16,
                        background: 'rgba(255,252,252,0.96)',
                        transform: `rotate(45deg) ${calloutPos === 'above' ? 'translateY(-8px)' : 'translateY(0)'}`,
                        transformOrigin: calloutPos === 'above' ? 'bottom' : 'top',
                        boxShadow: '0 2px 8px rgba(15,8,12,0.12)',
                    }} />
                </div>

                {/* Content */}
                <div className="flex items-start gap-3 mb-3">
                    <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{def.emoji}</span>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-[15px] mb-1" style={{ color: 'var(--color-text-primary)' }}>
                            {def.title}
                        </p>
                        <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                            {def.body}
                        </p>
                    </div>
                    <button
                        onClick={onSkipAll}
                        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5"
                        style={{ background: 'rgba(0,0,0,0.06)' }}
                        aria-label="Skip tour"
                    >
                        <X size={13} style={{ color: 'var(--color-text-secondary)' }} />
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    {/* Progress dots */}
                    <div className="flex gap-1.5 items-center">
                        {Array.from({ length: state.queueLength + queueIndex + 1 }).slice(0, state.queueLength + queueIndex + 1).map((_, i) => (
                            <div
                                key={i}
                                style={{
                                    width: i === queueIndex ? 16 : 6,
                                    height: 6,
                                    borderRadius: 100,
                                    background: i === queueIndex ? 'var(--color-nav-active)' : 'rgba(196,104,126,0.25)',
                                    transition: 'all 0.2s',
                                }}
                            />
                        ))}
                    </div>

                    <button
                        onClick={onNext}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-[13px]"
                        style={{
                            background: 'linear-gradient(135deg, #d4637a 0%, #c4687e 100%)',
                            color: '#fff',
                            border: 'none',
                            boxShadow: '0 4px 14px rgba(196,104,126,0.35)',
                        }}
                    >
                        Got it!
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// ─── Provider ────────────────────────────────────────────────────────────────

export const CoachmarkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [queue, setQueue]         = useState<CoachmarkDef[]>([]);
    const [spotlight, setSpotlight] = useState<SpotlightState | null>(null);
    const [queueIndex, setQueueIndex] = useState(0);
    const activeKeyRef = useRef<string | null>(null);

    const resolveSpotlight = useCallback((def: CoachmarkDef, queueLen: number) => {
        const el = document.querySelector<HTMLElement>(`[data-coachmark="${def.key}"]`);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        setSpotlight({ rect, def, queueLength: queueLen });
        activeKeyRef.current = def.key;
        Haptics.press();
        return true;
    }, []);

    const triggerCoachmark = useCallback((key: string) => {
        if (FeatureDiscovery.isCoachmarkSeen(key) || FeatureDiscovery.areAllCoachmarksSeen()) return;
        const def = COACHMARKS.find((c) => c.key === key);
        if (!def) return;
        setQueue([def]);
        setQueueIndex(0);
        resolveSpotlight(def, 1);
    }, [resolveSpotlight]);

    const triggerTour = useCallback(() => {
        if (FeatureDiscovery.areAllCoachmarksSeen()) return;
        const unseen = COACHMARKS.filter((c) => !FeatureDiscovery.isCoachmarkSeen(c.key));
        if (unseen.length === 0) return;
        setQueue(unseen);
        setQueueIndex(0);
        resolveSpotlight(unseen[0], unseen.length);
    }, [resolveSpotlight]);

    const advance = useCallback(() => {
        if (activeKeyRef.current) {
            FeatureDiscovery.markCoachmarkSeen(activeKeyRef.current);
        }
        setQueue((prev) => {
            const next = prev.slice(1);
            if (next.length === 0) {
                setSpotlight(null);
                activeKeyRef.current = null;
                setQueueIndex(0);
            } else {
                setQueueIndex((i) => i + 1);
                setTimeout(() => resolveSpotlight(next[0], next.length), 80);
            }
            return next;
        });
    }, [resolveSpotlight]);

    const dismissAll = useCallback(async () => {
        await Haptics.softTap();
        if (activeKeyRef.current) FeatureDiscovery.markCoachmarkSeen(activeKeyRef.current);
        FeatureDiscovery.markAllCoachmarksSeen();
        setQueue([]);
        setSpotlight(null);
        activeKeyRef.current = null;
        setQueueIndex(0);
    }, []);

    // Recalculate rect on scroll / resize
    useEffect(() => {
        if (!activeKeyRef.current) return;
        const recalc = () => {
            const key = activeKeyRef.current;
            if (!key) return;
            const def = COACHMARKS.find((c) => c.key === key);
            if (!def) return;
            resolveSpotlight(def, queue.length);
        };
        window.addEventListener('resize', recalc, { passive: true });
        return () => window.removeEventListener('resize', recalc);
    }, [queue.length, resolveSpotlight]);

    return (
        <CoachmarkContext.Provider value={{ triggerCoachmark, triggerTour, dismissAll }}>
            {children}
            <AnimatePresence>
                {spotlight && (
                    <Spotlight
                        key={spotlight.def.key}
                        state={spotlight}
                        queueIndex={queueIndex}
                        onNext={advance}
                        onSkipAll={dismissAll}
                    />
                )}
            </AnimatePresence>
        </CoachmarkContext.Provider>
    );
};
