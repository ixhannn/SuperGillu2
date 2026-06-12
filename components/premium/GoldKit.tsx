import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { Crown, Lock } from 'lucide-react';
import { PremiumModal, type PremiumFeatureContext } from '../PremiumModal';
import { feedback } from '../../utils/feedback';
import { scheduleIdleTask } from '../../utils/scheduler';
import '../../styles/premium-hub.css';

/**
 * LIOR GOLD — shared design kit for every premium surface.
 * All premium views import these constants so the whole wing
 * shares ONE motion signature. Do not redefine springs locally.
 */

export const GOLD = {
    /** Primary accent — electric rose (modern), not antique amber. */
    primary: '#ff5c7c',
    light: '#ff8fa6',
    deep: '#e23d60',
    /** Text on the primary gradient. */
    inkOnGold: '#ffffff',
    /** Champagne — reserved for the literal brand mark (crown, the word "Gold"). */
    brand: '#e8c97d',
    textHigh: 'rgba(255,251,250,0.95)',
    textMid: 'rgba(255,248,248,0.52)',
    textLow: 'rgba(255,248,248,0.36)',
    eyebrow: 'rgba(255,255,255,0.55)',
    cardBg: 'linear-gradient(150deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.018) 100%)',
    cardBorder: '1px solid rgba(255,255,255,0.07)',
} as const;

export const GOLD_SOFT_SPRING = { type: 'spring', stiffness: 280, damping: 32, mass: 0.9 } as const;
export const GOLD_PRESS_SPRING = { type: 'spring', stiffness: 560, damping: 30 } as const;

export const goldStagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

export const goldRise: Variants = {
    hidden: { opacity: 0, y: 26, scale: 0.985 },
    visible: { opacity: 1, y: 0, scale: 1, transition: GOLD_SOFT_SPRING },
};

/**
 * Aurora parallax: drifts the ambient blob layer at a fraction of the
 * page scroll so the stage reads as a deeper plane than the content.
 * Transform-only writes, rAF-throttled, disabled for reduced motion.
 */
export const useAuroraParallax = (factor = -0.12): React.RefObject<HTMLDivElement | null> => {
    const layerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const wrapper = document.querySelector<HTMLElement>('.lenis-wrapper');
        if (!wrapper) return;

        let raf = 0;
        const apply = () => {
            raf = 0;
            const el = layerRef.current;
            if (el) el.style.transform = `translate3d(0, ${Math.round(wrapper.scrollTop * factor)}px, 0)`;
        };
        const onScroll = () => {
            if (!raf) raf = requestAnimationFrame(apply);
        };
        wrapper.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            wrapper.removeEventListener('scroll', onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [factor]);

    return layerRef;
};

/* ── Starfield ───────────────────────────────────────────────────────
   One 360px canvas tile, drawn once per app life and repeated as a
   background-image across the whole backdrop (the GPU tiles it for
   free). Twinkle rides a handful of CSS sparks — compositor-only. */

let starTileURL: string | null = null;

const buildStarTile = (): string => {
    if (starTileURL) return starTileURL;
    const SIZE = 360;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE * 2;
    canvas.height = SIZE * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.scale(2, 2);

    // Seeded so every visit renders the same sky.
    let seed = 0x5f3759df;
    const rng = () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const TINTS = ['#fff7ea', '#fff7ea', '#fff7ea', '#ffd9e1', '#e8c97d', '#c4b5fd'];
    for (let i = 0; i < 54; i++) {
        const x = rng() * SIZE;
        const y = rng() * SIZE;
        const r = 0.3 + rng() * 1.1;
        const tint = TINTS[Math.floor(rng() * TINTS.length)];
        ctx.globalAlpha = 0.18 + rng() * 0.5;
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    // A few brighter stars with a soft halo
    for (let i = 0; i < 7; i++) {
        const x = rng() * SIZE;
        const y = rng() * SIZE;
        const tint = TINTS[Math.floor(rng() * TINTS.length)];
        const halo = ctx.createRadialGradient(x, y, 0, x, y, 5);
        halo.addColorStop(0, tint);
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 0.9, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    starTileURL = canvas.toDataURL('image/png');
    return starTileURL;
};

/** Deterministic spark positions (percent coords across the backdrop). */
const SPARKS: Array<{ left: string; top: string; delay: string; scale: number }> = [
    { left: '12%', top: '6%', delay: '0s', scale: 1 },
    { left: '82%', top: '11%', delay: '1.3s', scale: 0.8 },
    { left: '64%', top: '3%', delay: '2.6s', scale: 1.1 },
    { left: '28%', top: '17%', delay: '0.8s', scale: 0.7 },
    { left: '90%', top: '26%', delay: '3.4s', scale: 0.9 },
    { left: '7%', top: '34%', delay: '1.9s', scale: 1 },
    { left: '46%', top: '44%', delay: '2.9s', scale: 0.8 },
    { left: '74%', top: '58%', delay: '0.4s', scale: 1.05 },
    { left: '18%', top: '70%', delay: '3.9s', scale: 0.85 },
    { left: '58%', top: '86%', delay: '1.6s', scale: 0.75 },
];

/** Static star tile + twinkling sparks. Mount inside `.lp-backdrop`. */
export const StarField: React.FC = () => {
    const [tile, setTile] = useState<string>('');
    // The tile build ends in a synchronous PNG encode (~tens of ms on
    // low-end devices) — defer past first paint so the entrance springs
    // never hitch. Stars fading in a beat late reads as intentional.
    useEffect(() => scheduleIdleTask(() => setTile(buildStarTile()), { timeout: 800 }), []);
    if (!tile) return null;
    return (
        <div className="lp-stars" style={{ backgroundImage: `url(${tile})`, backgroundSize: '360px 360px' }} aria-hidden="true">
            {SPARKS.map((s, i) => (
                <span
                    key={i}
                    className="lp-star-spark"
                    style={{ left: s.left, top: s.top, animationDelay: s.delay, transform: `scale(${s.scale})` }}
                />
            ))}
        </div>
    );
};

/* ── Pointer tilt — shared 3D card hover/touch response ─────────────── */

export interface CardTilt {
    rotateX: ReturnType<typeof useSpring>;
    rotateY: ReturnType<typeof useSpring>;
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
}

export const useCardTilt = (maxX = 7, maxY = 9, disabled = false): CardTilt => {
    const mx = useMotionValue(0.5);
    const my = useMotionValue(0.5);
    const rotateX = useSpring(useTransform(my, [0, 1], [maxX, -maxX]), { stiffness: 170, damping: 18 });
    const rotateY = useSpring(useTransform(mx, [0, 1], [-maxY, maxY]), { stiffness: 170, damping: 18 });
    const rectRef = useRef<DOMRect | null>(null);

    const onPointerEnter = (e: React.PointerEvent<HTMLElement>) => {
        if (disabled) return;
        rectRef.current = e.currentTarget.getBoundingClientRect();
    };
    const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
        if (disabled) return;
        const rect = rectRef.current ?? e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - rect.left) / rect.width);
        my.set((e.clientY - rect.top) / rect.height);
    };
    const onPointerLeave = () => {
        rectRef.current = null;
        mx.set(0.5);
        my.set(0.5);
    };

    return { rotateX, rotateY, onPointerEnter, onPointerMove, onPointerLeave };
};

/** Bold sentence-case section title — modern, no micro-uppercase. */
export const GoldSectionHeader: React.FC<{ label: string; className?: string }> = ({ label, className }) => (
    <div className={`flex items-baseline gap-3 ${className ?? 'mt-10 mb-4'}`}>
        <span className="font-serif text-[17px] font-bold tracking-[-0.01em]" style={{ color: GOLD.textHigh }}>
            {label}
        </span>
        <div className="flex-1 h-px self-center" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
    </div>
);

/** Glass card on the dark stage. Pass a tint for an accent border. */
export const GoldCard: React.FC<{
    tint?: string;
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}> = ({ tint, className, style, children }) => (
    <div
        className={`relative overflow-hidden rounded-[1.6rem] ${className ?? 'p-5'}`}
        style={{
            background: GOLD.cardBg,
            border: tint ? `1px solid ${tint}33` : GOLD.cardBorder,
            ...style,
        }}
    >
        {children}
    </div>
);

/** Primary gold CTA with the shimmer sweep. */
export const GoldCTA: React.FC<{
    onClick: () => void;
    children: React.ReactNode;
    disabled?: boolean;
    className?: string;
}> = ({ onClick, children, disabled, className }) => (
    <motion.button
        whileTap={disabled ? undefined : { scale: 0.97 }}
        transition={GOLD_PRESS_SPRING}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className={`lp-cta w-full h-[54px] rounded-2xl font-bold text-[15px] tracking-wide ${className ?? ''}`}
        style={{
            background: disabled
                ? 'rgba(255,255,255,0.08)'
                : `linear-gradient(135deg, ${GOLD.primary} 0%, #8b5cf6 100%)`,
            color: disabled ? 'rgba(255,246,230,0.3)' : GOLD.inkOnGold,
            boxShadow: disabled ? 'none' : '0 12px 36px rgba(255,92,124,0.3), inset 0 1px 0 rgba(255,255,255,0.3)',
        }}
    >
        {children}
    </motion.button>
);

/**
 * Premium gate. When `locked`, children render blurred and inert under a
 * gold unlock panel that opens the paywall. When unlocked, renders children.
 */
export const GoldGate: React.FC<{
    locked: boolean;
    title?: string;
    sub?: string;
    featureContext?: PremiumFeatureContext;
    children: React.ReactNode;
}> = ({ locked, title = 'A Gold experience', sub = 'Unlock Lior Gold to open this for the two of you.', featureContext = 'generic', children }) => {
    const [paywallOpen, setPaywallOpen] = useState(false);
    const [unlockedLive, setUnlockedLive] = useState(false);

    // Unlock in place the moment the paywall (anywhere in the app) grants
    // premium — the parent's `locked` prop may lag until its next re-read.
    useEffect(() => {
        const handleChange = () => setUnlockedLive(true);
        window.addEventListener('lior:premium-changed', handleChange);
        return () => window.removeEventListener('lior:premium-changed', handleChange);
    }, []);

    if (!locked || unlockedLive) return <>{children}</>;

    return (
        <div className="relative">
            <div aria-hidden="true" style={{ filter: 'blur(14px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.55 }}>
                {children}
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-6">
                <motion.div
                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={GOLD_SOFT_SPRING}
                    className="lp-foil w-full max-w-[320px]"
                >
                    <div
                        className="flex flex-col items-center text-center px-6 py-7 rounded-[27px]"
                        style={{ background: 'linear-gradient(150deg, #1a1822 0%, #0d0c13 100%)' }}
                    >
                        <div
                            className="flex w-12 h-12 items-center justify-center rounded-2xl mb-4"
                            style={{ background: 'rgba(232,201,125,0.13)', border: '1px solid rgba(232,201,125,0.35)' }}
                        >
                            <Crown size={22} strokeWidth={1.8} style={{ color: GOLD.brand }} />
                        </div>
                        <p className="font-serif text-[1.2rem] leading-tight" style={{ color: GOLD.textHigh }}>{title}</p>
                        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: GOLD.textMid }}>{sub}</p>
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={GOLD_PRESS_SPRING}
                            onClick={() => { feedback.tap(); setPaywallOpen(true); }}
                            className="lp-cta mt-5 w-full h-[46px] rounded-xl font-bold text-[13.5px] inline-flex items-center justify-center gap-2"
                            style={{
                                background: `linear-gradient(135deg, ${GOLD.primary} 0%, #8b5cf6 100%)`,
                                color: GOLD.inkOnGold,
                                boxShadow: '0 10px 28px rgba(255,92,124,0.28)',
                            }}
                        >
                            <Lock size={13} strokeWidth={2.4} />
                            Unlock Lior Gold
                        </motion.button>
                    </div>
                </motion.div>
            </div>
            <PremiumModal isOpen={paywallOpen} onClose={() => setPaywallOpen(false)} featureContext={featureContext} />
        </div>
    );
};
