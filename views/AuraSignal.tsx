import React, { useState, useEffect, useRef, memo } from 'react';
import { ViewState } from '../types';
import { SyncService } from '../services/sync';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check, Send } from 'lucide-react';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { StorageService } from '../services/storage';

interface AuraSignalProps {
    setView: (view: ViewState) => void;
}

interface Signal {
    id: string;
    color: string;
    glow: string;
    palette: [string, string, string];
    title: string;
    subtitle: string;
    message: string;
    afterglow: string;
}

interface SignalGroup {
    id: string;
    label: string;
    signals: Signal[];
}

const SIGNAL_GROUPS: SignalGroup[] = [
    {
        id: 'comfort',
        label: 'Comfort',
        signals: [
            {
                id: 'blue', color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.45)', palette: ['#60a5fa', '#3b82f6', '#1e40af'],
                title: 'I need a hug', subtitle: 'No fixing. Just you.',
                message: 'Feeling low and I just want your softness right now.',
                afterglow: 'A small reminder that you are my safe place.',
            },
            {
                id: 'yellow', color: '#eab308', glow: 'rgba(234, 179, 8, 0.45)', palette: ['#fde047', '#eab308', '#a16207'],
                title: 'Anxious', subtitle: 'Stay close to me.',
                message: 'My mind feels loud. Your presence would calm me down.',
                afterglow: 'You do not have to solve it. Just stay with me.',
            },
            {
                id: 'red', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.45)', palette: ['#fca5a5', '#ef4444', '#991b1b'],
                title: 'I need space', subtitle: 'Still yours. Just overwhelmed.',
                message: 'I need a little quiet, but I still want to feel your love.',
                afterglow: 'Distance from noise, not distance from us.',
            },
        ],
    },
    {
        id: 'love',
        label: 'Love',
        signals: [
            {
                id: 'green', color: '#22c55e', glow: 'rgba(34, 197, 94, 0.45)', palette: ['#86efac', '#22c55e', '#15803d'],
                title: 'Thinking of you', subtitle: 'You crossed my heart again.',
                message: 'Nothing urgent. I just wanted you to feel me thinking of you.',
                afterglow: 'A soft little thread between us.',
            },
            {
                id: 'rose', color: '#ec4899', glow: 'rgba(236, 72, 153, 0.45)', palette: ['#f9a8d4', '#ec4899', '#9d174d'],
                title: 'Miss you badly', subtitle: 'Come closer somehow.',
                message: 'The distance feels heavy tonight. I really miss you.',
                afterglow: 'Until I can hold you, let this reach you first.',
            },
            {
                id: 'violet', color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.45)', palette: ['#c4b5fd', '#8b5cf6', '#5b21b6'],
                title: 'Proud of you', subtitle: 'I see your effort.',
                message: 'I am proud of the way you are showing up, even from far away.',
                afterglow: 'You are deeply loved for who you are becoming.',
            },
        ],
    },
    {
        id: 'ritual',
        label: 'Ritual',
        signals: [
            {
                id: 'amber', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.45)', palette: ['#fcd34d', '#f59e0b', '#b45309'],
                title: 'Need your voice', subtitle: 'Call me when you can.',
                message: 'I want the comfort of hearing you, even for a minute.',
                afterglow: 'Some nights your voice is the whole medicine.',
            },
            {
                id: 'teal', color: '#14b8a6', glow: 'rgba(20, 184, 166, 0.45)', palette: ['#5eead4', '#14b8a6', '#0f766e'],
                title: 'Goodnight, love', subtitle: 'Fall asleep with me in mind.',
                message: 'Sending you my last soft thought before sleep.',
                afterglow: 'Let this be the feeling that stays beside you tonight.',
            },
        ],
    },
];

const SIGNALS: Signal[] = SIGNAL_GROUPS.flatMap((group) => group.signals);

// One easing vocabulary — every beat speaks the same motion language.
const GLIDE: [number, number, number, number] = [0.22, 1, 0.36, 1]; // entrances, washes, settles
const LIFT: [number, number, number, number] = [0.16, 1, 0.3, 1];   // the release beats
const SOFT = { type: 'spring', stiffness: 260, damping: 30 } as const; // cards, selection scale
const CHECK = { type: 'spring', stiffness: 420, damping: 28 } as const; // confirm checks

const HOLD_MS = 850;        // hold duration — long enough for anticipation to build
const RING_C = 301.59;      // 2π·48, circumference of the r=48 charge ring
// How long the send afterglow holds before returning home. Reduced-motion users
// see the afterglow almost immediately, so they wait a shorter beat (still long
// enough to read the line) instead of the full cinematic dwell.
const FINISH_MS = 3300;
const FINISH_MS_REDUCED = 1700;
// The orb / bloom origin — lifted clear of the bottom nav (≈76px + safe inset).
const ORB_BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) + 110px)';

// Calm, near-neutral glow shown before a feeling is chosen.
const GLOW_IDLE: [string, string, string] = ['#9aa3c8', '#5d63a0', '#33355f'];

// A single soft glow that pools behind the content and slowly drifts. ONE layer
// (was two), normal-blended over the near-black base (no mix-blend-mode), so a
// phone GPU just translates one cached, pre-blurred pool per frame instead of
// re-reading the backdrop to screen-blend it — the dominant on-device lag/flicker
// source. Opacity/size are lifted slightly to keep the same luminosity solo.
const GLOW_BLOBS = [
    { ci: 0, cx: 50, cy: 58, size: 56, blur: 48, op: 0.72, dx: ['-6%', '7%', '-6%'], dy: ['4%', '-6%', '4%'], sc: [1, 1.12, 1], xDur: 22, yDur: 27, scDur: 19 },
] as const;

// The living glow field. memo'd so a parent re-render (selection, send) never
// re-walks the blob tree; it only re-renders when signal/reduce change.
const GlowField = memo(function GlowField({ signal, reduce }: { signal: Signal | null; reduce: boolean }) {
    const palette = signal ? signal.palette : GLOW_IDLE;
    const lit = !!signal;
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
            {/* Near-black base */}
            <div className="absolute inset-0" style={{ background: 'radial-gradient(130% 120% at 50% 30%, #0c0c14 0%, #08080f 52%, #040406 100%)' }} />

            {/* Glow pool — inhales in as ONE composited layer on entrance */}
            <motion.div
                className="absolute inset-0"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.06 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
                transition={{ duration: reduce ? 0.25 : 0.9, ease: GLIDE }}
                style={{ willChange: 'transform' }}
            >
                {GLOW_BLOBS.map((b, i) => {
                    const color = palette[b.ci];
                    // Normal blend over near-black (NOT mix-blend-mode:screen).
                    // Screen-blending an animated, blurred layer forces the WebView
                    // to re-read the backdrop every composited frame — the dominant
                    // on-device flicker/jank source. Over a near-black base a soft
                    // colour pool at this opacity is visually ~identical, with the
                    // opacity nudged up to recover the luminosity screen gave it.
                    const op = Math.min(1, b.op * (lit ? 1.3 : 0.55));
                    return (
                        <motion.div
                            key={i} aria-hidden className="absolute rounded-full"
                            style={{ top: `calc(${b.cy}% - ${b.size / 2}vmax)`, left: `calc(${b.cx}% - ${b.size / 2}vmax)`, width: `${b.size}vmax`, height: `${b.size}vmax`, filter: `blur(${b.blur}px)`, willChange: 'transform' }}
                            initial={{ backgroundColor: color, opacity: 0, x: 0, y: 0, scale: 1 }}
                            animate={reduce
                                ? { backgroundColor: color, opacity: op }
                                : { backgroundColor: color, opacity: op, x: b.dx as unknown as string[], y: b.dy as unknown as string[], scale: b.sc as unknown as number[] }}
                            transition={{
                                backgroundColor: { duration: 0.65, ease: 'easeInOut' },
                                opacity: { duration: 0.9, ease: 'easeOut' },
                                x: { duration: b.xDur, repeat: Infinity, ease: 'easeInOut' },
                                y: { duration: b.yDur, repeat: Infinity, ease: 'easeInOut' },
                                scale: { duration: b.scDur, repeat: Infinity, ease: 'easeInOut' },
                            }}
                        />
                    );
                })}
            </motion.div>

            {/* Vignette contains the glow as a pool. (The SVG-turbulence grain
                overlay was removed — its full-screen overlay-blend rasterization
                was a continuous mobile-GPU cost for a near-imperceptible texture.) */}
            <div className="absolute inset-0" style={{ background: 'radial-gradient(116% 102% at 50% 54%, transparent 28%, rgba(4,4,7,0.55) 60%, #040406 88%)' }} />
        </div>
    );
});

// The send exhale — the gathered colour releases from the orb and flows out
// through the glow, then settles into the afterglow. One cohesive sequence.
const GlowSend = memo(function GlowSend({ signal, reduce, delivered }: { signal: Signal; reduce: boolean; delivered: boolean }) {
    const [c0, , c2] = signal.palette;
    const base = signal.color;

    const afterglow = (
        <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0.1 : 1.6, duration: 0.6 }}
        >
            <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(4,4,8,0.55), transparent 60%)' }} />
            <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={reduce ? { scale: 1, opacity: 1 } : { scale: [0, 1, 1.03, 1], opacity: 1 }}
                transition={reduce ? { duration: 0.3 } : { scale: { delay: 1.65, duration: 1.2, times: [0, 0.55, 0.78, 1], ease: GLIDE }, opacity: { delay: 1.65, duration: 0.4 } }}
                className="w-16 h-16 rounded-full flex items-center justify-center mb-6 relative"
                style={{ background: `radial-gradient(circle at 32% 28%, ${c0}, ${base} 72%)`, boxShadow: `0 0 70px ${base}` }}
            >
                <Check size={30} className="text-white" strokeWidth={2.6} />
            </motion.div>
            <p className="font-serif font-bold text-2xl text-white mb-2 relative">{delivered ? 'On its way' : 'Saved for later'}</p>
            <p className="text-sm leading-relaxed max-w-xs relative" style={{ color: 'rgba(255,255,255,0.85)' }}>{signal.afterglow}</p>
        </motion.div>
    );

    if (reduce) {
        return (
            <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
                <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 70%, ${base}, transparent 70%)`, opacity: 0.6 }} />
                {afterglow}
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
            {/* Specular — the spark of release */}
            <motion.div
                aria-hidden className="absolute rounded-full"
                style={{ left: '50%', bottom: ORB_BOTTOM, width: '22vmax', height: '22vmax', x: '-50%', y: '50%', background: 'radial-gradient(circle, #fff, transparent 60%)' }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 2, 4.4], opacity: [0, 0.85, 0] }}
                transition={{ duration: 0.42, ease: LIFT, times: [0, 0.28, 1] }}
            />
            {/* Bloom core — the colour lifts off the orb and flows outward */}
            <motion.div
                aria-hidden className="absolute rounded-full"
                style={{ left: '50%', bottom: ORB_BOTTOM, width: '16vmax', height: '16vmax', x: '-50%', y: '50%', background: `radial-gradient(circle, #fff 0%, ${c0} 30%, ${base} 62%, transparent 76%)`, filter: 'blur(6px)' }}
                initial={{ scale: 0.2, opacity: 0 }}
                animate={{ scale: [0.2, 1.5, 9], opacity: [0, 1, 0.4] }}
                transition={{ duration: 1.5, ease: LIFT, times: [0, 0.3, 1], delay: 0.14 }}
            />
            {/* Swell — the bridge: the field gently saturates */}
            <motion.div
                aria-hidden className="absolute rounded-full"
                style={{ left: '50%', bottom: ORB_BOTTOM, width: '72vmax', height: '72vmax', x: '-50%', y: '50%', background: `radial-gradient(circle, ${base} 0%, ${c2} 38%, transparent 64%)`, filter: 'blur(44px)' }}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: [0.3, 1.5], opacity: [0, 0.6, 0] }}
                transition={{ duration: 1.4, ease: 'easeOut', delay: 0.3, times: [0, 0.4, 1] }}
            />
            {afterglow}
        </div>
    );
});

export const AuraSignal: React.FC<AuraSignalProps> = ({ setView }) => {
    const reduce = useReducedMotion() ?? false;
    const [selected, setSelected] = useState<string | null>(null);
    const [activeGroup, setActiveGroup] = useState<string>(SIGNAL_GROUPS[0].id);
    const [sent, setSent] = useState(false);
    // Whether the last send went out over realtime (vs saved offline) — drives the
    // honest afterglow headline + toast.
    const [delivered, setDelivered] = useState(true);
    // Paired = part of a real cloud-synced couple. A solo user "sending" a feeling
    // would only write a local inbox entry that never reaches anyone — so route
    // them to pairing instead of faking a delivery. Read once ('solo' is the
    // explicit unpaired default; pairing doesn't change while this screen is open).
    const [isPaired] = useState(() => {
        const p = StorageService.getCoupleProfile();
        return Boolean(p.coupleId && p.coupleId !== 'solo');
    });

    // Hold is driven imperatively (rAF + refs), NEVER React state, so the
    // component does not re-render ~100×/sec during the charge (that was the lag).
    const rafRef = useRef<number | null>(null);
    const holdStartRef = useRef<number>(0);
    const sentRef = useRef(false);
    const lastHapticRef = useRef(0);
    const lastChargeRef = useRef(0);
    const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ringRef = useRef<SVGCircleElement>(null);
    const glowRef = useRef<HTMLDivElement>(null);
    const orbGlowRef = useRef<HTMLDivElement>(null);
    // The single pointer that owns the active hold — guards against a 2nd finger
    // restarting the charge, and against any other pointer's up/cancel ending it.
    const activePointerRef = useRef<number | null>(null);
    // Send outcome + title captured at fire time so the shared finishSend() reads
    // refs (not a stale closure) whether it runs from the timer or a manual tap.
    const deliveredRef = useRef(true);
    const sentTitleRef = useRef('');

    const activeSignal = SIGNALS.find((s) => s.id === selected) || null;

    useEffect(() => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current);
        activePointerRef.current = null;
    }, []);

    // Smoothstep — the charge gathers, then catches. Pure: time 0..1 → eased 0..1.
    const gather = (t: number) => t * t * (3 - 2 * t);

    // One DOM write per element per frame. No React, no animated blur.
    const paintCharge = (p: number) => {
        lastChargeRef.current = p;
        if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_C * (1 - p));
        if (glowRef.current) {
            glowRef.current.style.opacity = String(0.1 + p * 0.55);
            glowRef.current.style.transform = `translateX(-50%) scale(${0.6 + p * 0.6})`;
        }
        if (orbGlowRef.current) {
            orbGlowRef.current.style.opacity = String(0.3 + p * 0.7);
            orbGlowRef.current.style.transform = `scale(${0.9 + p * 0.4})`;
        }
    };

    // Return home + pop the confirmation toast. Shared by the auto-dismiss timer
    // and the manual tap-to-continue so neither double-navigates or leaves a stale
    // timer. Reads refs (not a captured closure) so it is safe from either caller.
    const finishSend = () => {
        if (sendTimeoutRef.current) { clearTimeout(sendTimeoutRef.current); sendTimeoutRef.current = null; }
        const title = sentTitleRef.current;
        sentRef.current = false;
        setSent(false);
        setSelected(null);
        setView('home');
        if (title) {
            // Carry a warm confirmation onto home so the return isn't hollow; be
            // honest when offline (saved, sends on reconnect).
            toast.show(
                deliveredRef.current
                    ? `“${title}” is on its way 💫`
                    : `“${title}” will send when you’re back online 💫`,
                'heart',
                4200,
            );
        }
    };

    const fireSignal = () => {
        // NOTE: tick() already sets sentRef.current = true before calling this,
        // so the guard must NOT re-check sentRef (that made every send a no-op).
        // Single-fire is enforced by tick()/startCharge()/cancelCharge().
        if (!activeSignal) return;
        const ok = SyncService.sendSignal('AURA_SIGNAL', {
            color: activeSignal.color,
            title: activeSignal.title,
            subtitle: activeSignal.subtitle,
            message: activeSignal.message,
            afterglow: activeSignal.afterglow,
        });
        deliveredRef.current = ok;
        sentTitleRef.current = activeSignal.title;
        setDelivered(ok);
        feedback.celebrate();
        setSent(true);
        sendTimeoutRef.current = setTimeout(finishSend, reduce ? FINISH_MS_REDUCED : FINISH_MS);
    };

    const tick = (now: number) => {
        const raw = Math.min(1, (now - holdStartRef.current) / HOLD_MS);
        paintCharge(reduce ? raw : gather(raw));
        // Escalating haptic ladder at 25 / 50 / 75% — each fires once per gesture.
        const ladder = raw >= 0.75 ? 3 : raw >= 0.5 ? 2 : raw >= 0.25 ? 1 : 0;
        if (ladder > lastHapticRef.current) { lastHapticRef.current = ladder; feedback.light(); }
        if (raw >= 1) {
            rafRef.current = null;
            activePointerRef.current = null;
            if (!sentRef.current) { sentRef.current = true; fireSignal(); }
            return;
        }
        rafRef.current = requestAnimationFrame(tick);
    };

    // Send via keyboard / assistive tech — the hold gesture is pointer-only, so
    // Enter/Space is the accessible equivalent (mirrors tick()'s completion).
    const keyboardSend = () => {
        if (!selected || sent || sentRef.current) return;
        if (!isPaired) { feedback.tap(); toast.show('Link with your partner to send 💞', 'heart', 3600); setView('sync'); return; }
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        paintCharge(1);
        sentRef.current = true;
        fireSignal();
    };

    const startCharge = (e: React.PointerEvent) => {
        if (!selected || sent || sentRef.current) return;
        // Single-pointer only: ignore a second finger while a charge is active and
        // ignore non-primary pointers (multi-touch could restart/cancel the hold).
        if (activePointerRef.current !== null || e.isPrimary === false) return;
        // Not paired = nowhere to send. Route to pairing instead of faking it.
        if (!isPaired) { feedback.tap(); toast.show('Link with your partner to send 💞', 'heart', 3600); setView('sync'); return; }
        // Suppress the synthetic long-press / compatibility-mouse behaviours some
        // WebViews fire on a sustained touch (they can emit a stray pointercancel
        // mid-hold). Harmless on desktop; belt-and-suspenders on Android.
        e.preventDefault();
        // Capture the pointer so a small finger drift off the 96px orb during the
        // 850ms hold does NOT fire pointerleave and silently cancel the send. This
        // is the core "I held it but nothing sent" bug on touch — made worse by
        // whileTap shrinking the orb to scale 0.94 (a finger near the edge then
        // falls outside the button). With capture, the orb keeps every move/up.
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture unsupported — degrade gracefully */ }
        activePointerRef.current = e.pointerId;
        feedback.tap();
        holdStartRef.current = performance.now();
        lastHapticRef.current = 0;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(tick);
    };

    const cancelCharge = (e?: React.PointerEvent) => {
        // Only the pointer that owns the hold can end it — ignore a stray second
        // finger's up/cancel. Synthetic/no-event calls still pass through.
        if (e && activePointerRef.current !== null && e.pointerId !== activePointerRef.current) return;
        activePointerRef.current = null;
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        if (sentRef.current || sent) return;
        lastHapticRef.current = 0;
        // Ease the charge back to empty (a "let go", not a snap) — still no state.
        const from = performance.now();
        const start = lastChargeRef.current;
        const decay = (now: number) => {
            const k = Math.min(1, (now - from) / 350);
            paintCharge(start * (1 - k));
            if (k < 1) rafRef.current = requestAnimationFrame(decay);
            else rafRef.current = null;
        };
        rafRef.current = requestAnimationFrame(decay);
    };

    const groupSignals = SIGNAL_GROUPS.find((group) => group.id === activeGroup)!.signals;

    return (
        <div className="relative min-h-full overflow-hidden select-none" style={{ background: '#050508' }}>
            <GlowField signal={activeSignal} reduce={reduce} />

            {/* Charge glow — the gathered light. Grown imperatively in the rAF loop. */}
            {activeSignal && !sent && (
                <div
                    ref={glowRef} aria-hidden
                    className="absolute left-1/2 pointer-events-none"
                    style={{
                        bottom: ORB_BOTTOM, width: '32rem', height: '32rem',
                        borderRadius: '50%', filter: 'blur(44px)',
                        background: `radial-gradient(circle, ${activeSignal.color}, transparent 65%)`,
                        opacity: 0.1, transform: 'translateX(-50%) scale(0.6)',
                        willChange: 'opacity, transform',
                    }}
                />
            )}

            {/* ── Foreground content (sinks into the bloom on send) ─────────── */}
            <div
                className="relative z-10 flex flex-col min-h-full pb-44"
                style={{
                    opacity: sent ? 0 : 1,
                    transform: sent ? 'scale(0.96)' : 'scale(1)',
                    transformOrigin: '50% 42%',
                    transition: 'opacity 0.55s ease, transform 0.7s cubic-bezier(0.16,1,0.3,1)',
                    pointerEvents: sent ? 'none' : 'auto',
                    willChange: sent ? 'transform, opacity' : 'auto',
                }}
            >
                {/* Top bar */}
                <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: GLIDE }}
                    className="flex items-center justify-between px-5 pt-5"
                >
                    <motion.button
                        onClick={() => {
                            // Cancel any in-flight charge so a stale rAF can't fire after we leave.
                            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
                            activePointerRef.current = null;
                            feedback.tap();
                            setView('home');
                        }}
                        whileTap={{ scale: 0.9 }}
                        aria-label="Go back"
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)' }}
                    >
                        <ArrowLeft size={18} className="text-white" strokeWidth={2} />
                    </motion.button>
                    <span className="text-[11px] uppercase tracking-[0.34em] font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Pulse</span>
                    <div className="w-10" />
                </motion.div>

                {/* Title */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.56, ease: GLIDE, delay: 0.05 }}
                    className="text-center mt-6 mb-7 px-8"
                >
                    <h2 className="font-serif font-bold text-[2rem] leading-tight text-white mb-2" style={{ textShadow: '0 2px 24px rgba(0,0,0,0.45)' }}>Send a feeling</h2>
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {!isPaired
                            ? 'Link with your partner to send feelings to them.'
                            : activeSignal ? 'Hold the orb below to let it reach them.' : 'Across the distance, wordlessly.'}
                    </p>
                </motion.div>

                {/* Group switcher — one segmented track with a sliding thumb */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.46, ease: GLIDE, delay: 0.1 }}
                    className="w-full max-w-sm mx-auto px-5 mb-5"
                >
                    <div
                        role="radiogroup"
                        aria-label="Feeling category"
                        className="mx-auto flex rounded-full p-1 w-fit"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
                    >
                        {SIGNAL_GROUPS.map((group) => {
                            const active = activeGroup === group.id;
                            const rep = group.signals[0].color;
                            return (
                                <button
                                    key={group.id}
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => {
                                        // Abort any in-flight charge so a stale rAF can't paint into /
                                        // fire from a now-hidden feeling when the group changes.
                                        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
                                        activePointerRef.current = null;
                                        paintCharge(0);
                                        feedback.light();
                                        setActiveGroup(group.id);
                                    }}
                                    className="relative px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.2em] font-bold whitespace-nowrap"
                                    style={{ color: active ? '#fff' : 'rgba(255,255,255,0.55)', transition: 'color 0.3s' }}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="groupThumb"
                                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                                            className="absolute inset-0 rounded-full"
                                            style={{ background: 'rgba(255,255,255,0.12)', border: `1px solid ${rep}4d` }}
                                        />
                                    )}
                                    <span className="relative z-10">{group.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Feeling options */}
                <div className="flex-1 flex flex-col justify-center gap-3 max-w-sm mx-auto w-full px-5">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeGroup}
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.22, ease: GLIDE }}
                            className="flex flex-col gap-3"
                        >
                            {groupSignals.map((signal, index) => {
                                const isSelected = selected === signal.id;
                                const isOtherSelected = selected !== null && !isSelected;
                                return (
                                    <motion.button
                                        key={signal.id}
                                        aria-pressed={isSelected}
                                        onClick={() => {
                                            if (sent) return;
                                            feedback.tap();
                                            // Stop any in-flight charge/decay before switching feelings
                                            // so a stale rAF can't paint into the new card's ring.
                                            if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
                                            activePointerRef.current = null;
                                            paintCharge(0);
                                            // Re-tapping the selected card keeps it selected (don't
                                            // deselect → the dock no longer vanishes from under a re-tap).
                                            setSelected(signal.id);
                                        }}
                                        initial={{ opacity: 0, y: 18 }}
                                        animate={{ opacity: isOtherSelected ? 0.5 : 1, scale: isSelected ? 1.02 : isOtherSelected ? 0.985 : 1, y: 0 }}
                                        transition={{ ...SOFT, delay: index * 0.06 }}
                                        whileTap={{ scale: 0.97 }}
                                        className="w-full relative overflow-hidden rounded-[1.4rem] px-4 py-[1.05rem] text-left"
                                        style={{
                                            background: 'rgba(18,18,26,0.66)',
                                            border: isSelected ? `1px solid ${signal.color}80` : '1px solid rgba(255,255,255,0.09)',
                                            boxShadow: isSelected
                                                ? `0 18px 52px -14px ${signal.glow}, inset 0 1px 0 rgba(255,255,255,0.07)`
                                                : 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(255,255,255,0.03)',
                                            transition: 'border-color 0.5s ease, box-shadow 0.5s ease, background 0.5s ease',
                                        }}
                                    >
                                        {/* (Removed for mobile-GPU perf: the per-card blur(30px) mix-blend-screen
                                            "bleeding glow" rendered on every card, plus the infinite pulse ring +
                                            orb scale on the selected one. Selection still reads clearly from the
                                            card border, the glow box-shadow, and the check badge.) */}
                                        <div className="flex items-center gap-4 relative z-10">
                                            <span className="relative flex items-center justify-center flex-shrink-0" style={{ width: 46, height: 46 }}>
                                                <span
                                                    aria-hidden className="relative rounded-full"
                                                    style={{ width: 40, height: 40, background: `radial-gradient(circle at 32% 28%, ${signal.palette[0]}, ${signal.color} 72%)`, boxShadow: `0 4px 18px ${signal.glow}, inset 0 1px 0 rgba(255,255,255,0.5)` }}
                                                />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-serif font-bold text-[1.16rem] leading-tight text-white">{signal.title}</h3>
                                                <p className="text-[0.82rem] mt-0.5 leading-snug" style={{ color: isSelected ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.5)', transition: 'color 0.4s' }}>{signal.subtitle}</p>
                                            </div>
                                            <AnimatePresence>
                                                {isSelected && (
                                                    <motion.span
                                                        key="check" aria-hidden
                                                        className="flex items-center justify-center rounded-full flex-shrink-0"
                                                        initial={{ scale: 0.4, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        exit={{ scale: 0.4, opacity: 0 }}
                                                        transition={CHECK}
                                                        style={{ width: 24, height: 24, background: signal.color, boxShadow: `0 0 16px ${signal.glow}` }}
                                                    >
                                                        <Check size={14} className="text-white" strokeWidth={3} />
                                                    </motion.span>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* ── Hold-to-send dock (lifted clear of the bottom nav) ────────── */}
            <AnimatePresence>
                {selected && !sent && activeSignal && (
                    <motion.div
                        initial={{ opacity: 0, y: 80 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 80 }}
                        transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                        className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center justify-end"
                        style={{ height: '22rem', paddingBottom: ORB_BOTTOM, background: 'linear-gradient(to top, #050508 4%, rgba(5,5,8,0.55) 38%, transparent 88%)' }}
                    >
                        <p className="mb-5 text-[11px] uppercase tracking-[0.3em] font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                            {isPaired ? 'Hold to send' : 'Tap to link first'}
                        </p>
                        <div className="relative flex items-center justify-center">
                            {/* Charge ring — stroke-dashoffset is compositor-friendly; written in rAF */}
                            <svg aria-hidden className="absolute w-32 h-32 pointer-events-none -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="3" />
                                <circle
                                    ref={ringRef} cx="50" cy="50" r="48" fill="none"
                                    stroke={activeSignal.color} strokeWidth="3" strokeLinecap="round"
                                    strokeDasharray={RING_C} strokeDashoffset={RING_C}
                                    style={{ filter: `drop-shadow(0 0 5px ${activeSignal.color})`, willChange: 'stroke-dashoffset' }}
                                />
                            </svg>
                            <motion.button
                                onPointerDown={startCharge}
                                onPointerUp={cancelCharge}
                                onPointerCancel={cancelCharge}
                                onContextMenu={(e) => e.preventDefault()}
                                onKeyDown={(e) => {
                                    // Keyboard / assistive-tech path: the hold gesture is pointer-only,
                                    // so Enter/Space sends in one activation. preventDefault stops Space
                                    // from scrolling and from firing a synthetic click.
                                    if (e.key !== 'Enter' && e.key !== ' ') return;
                                    if (e.repeat) return;
                                    e.preventDefault();
                                    keyboardSend();
                                }}
                                aria-label={isPaired ? `Hold to send “${activeSignal.title}”` : 'Link with your partner to send'}
                                whileTap={{ scale: 0.94 }}
                                className="w-24 h-24 rounded-full flex flex-col items-center justify-center text-white relative overflow-hidden"
                                style={{
                                    background: `radial-gradient(circle at 32% 28%, ${activeSignal.palette[0]}, ${activeSignal.color} 72%)`,
                                    boxShadow: `0 0 32px ${activeSignal.color}, inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 24px rgba(0,0,0,0.18)`,
                                    touchAction: 'none',
                                }}
                            >
                                {/* Inner energy — brightens as the charge gathers (rAF-driven) */}
                                <div
                                    ref={orbGlowRef} aria-hidden className="absolute inset-0 rounded-full"
                                    style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.9), transparent 70%)', filter: 'blur(4px)', opacity: 0.3, transform: 'scale(0.9)', willChange: 'opacity, transform' }}
                                />
                                <Send size={24} className="relative z-10 -mt-0.5" strokeWidth={2} />
                                <span className="text-[9px] font-bold uppercase tracking-[0.18em] mt-1 relative z-10 opacity-90">
                                    {isPaired ? 'Hold' : 'Link'}
                                </span>
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Send exhale — colour releases and flows through the glow ───── */}
            {sent && activeSignal && <GlowSend signal={activeSignal} reduce={reduce} delivered={delivered} />}

            {/* Tap-to-continue — an early exit during the ~3.3s afterglow so the
                user is never trapped waiting for the auto-return. Transparent and
                above the (pointer-events:none) bloom; a deliberate tap finishes. */}
            {sent && (
                <button
                    type="button"
                    aria-label="Continue"
                    onClick={finishSend}
                    className="absolute inset-0 z-40"
                    style={{ background: 'transparent' }}
                />
            )}
        </div>
    );
};
