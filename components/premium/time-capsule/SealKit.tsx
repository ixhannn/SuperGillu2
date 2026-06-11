import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GOLD } from '../GoldKit';
import type { TimeCapsule } from '../../../types';

/**
 * Shared visual primitives for the Future Letters (time capsule) view:
 * wax seal, countdown ring, envelope flap and the crack burst.
 */

export const ACCENT = '#f59e0b';
export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntil(iso: string) {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS));
}

export function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function progressFor(capsule: TimeCapsule) {
    const start = new Date(capsule.createdAt).getTime();
    const end = new Date(capsule.unlockDate).getTime();
    if (end <= start) return 100;
    return Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
}

export function sunrisesAway(iso: string) {
    const days = daysUntil(iso);
    return days === 1 ? 'One sunrise away' : `${days} sunrises away`;
}

/* ── Crack burst (lp-burst pattern from views/Premium.tsx) ──────────── */

const BURST_PARTICLES = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const dist = 58 + (i % 5) * 15;
    return {
        dx: `${Math.round(Math.cos(angle) * dist)}px`,
        dy: `${Math.round(Math.sin(angle) * dist * 0.85)}px`,
        delay: `${(i % 6) * 0.035}s`,
    };
});

export const UnlockBurst: React.FC = () => (
    <div className="lp-burst">
        {BURST_PARTICLES.map((p, i) => (
            <span
                key={i}
                className="lp-burst__p"
                style={{ '--dx': p.dx, '--dy': p.dy, animationDelay: p.delay } as React.CSSProperties}
            />
        ))}
    </div>
);

/* ── Wax seal ───────────────────────────────────────────────────────── */

const WAX_BG = 'radial-gradient(circle at 33% 28%, #fbd98a 0%, #eab348 22%, #c97f1d 52%, #93540e 80%, #7a430b 100%)';
const WAX_SHADOW = 'inset 0 2px 4px rgba(255,235,190,0.45), inset 0 -3px 6px rgba(60,30,5,0.55), 0 4px 14px rgba(0,0,0,0.45), 0 0 18px rgba(245,158,11,0.22)';

export const WaxSeal: React.FC<{ initial: string; size?: number }> = ({ initial, size = 52 }) => (
    <div
        className="relative flex items-center justify-center rounded-full"
        style={{ width: size, height: size, background: WAX_BG, boxShadow: WAX_SHADOW }}
    >
        {/* Wax drips at the rim */}
        <span
            aria-hidden="true"
            className="absolute rounded-full"
            style={{ width: size * 0.2, height: size * 0.2, top: '-5%', left: '13%', background: WAX_BG, boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
        />
        <span
            aria-hidden="true"
            className="absolute rounded-full"
            style={{ width: size * 0.15, height: size * 0.15, bottom: '1%', right: '-3%', background: WAX_BG, boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
        />
        {/* Embossed inner ring */}
        <span
            aria-hidden="true"
            className="absolute rounded-full pointer-events-none"
            style={{ inset: size * 0.11, border: '1px solid rgba(110,62,12,0.55)', boxShadow: 'inset 0 1px 1px rgba(255,226,160,0.35)' }}
        />
        <span
            className="font-serif select-none"
            style={{
                fontSize: size * 0.42,
                lineHeight: 1,
                color: 'rgba(84,44,8,0.9)',
                textShadow: '0 1px 0 rgba(255,228,168,0.45), 0 -1px 1px rgba(46,20,0,0.55)',
            }}
        >
            {initial}
        </span>
    </div>
);

/* ── Countdown ring around the seal (createdAt → unlockDate) ────────── */

export const CountdownRing: React.FC<{
    progress: number;
    ready?: boolean;
    size?: number;
    children: React.ReactNode;
}> = ({ progress, ready, size = 78, children }) => {
    const reducedMotion = useReducedMotion();
    const radius = size / 2 - 4;
    const frac = Math.max(0.02, Math.min(1, progress / 100));

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={ready ? GOLD.primary : ACCENT}
                    strokeWidth={3}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{ filter: 'drop-shadow(0 0 5px rgba(245,158,11,0.45))' }}
                    initial={reducedMotion ? { pathLength: frac } : { pathLength: 0 }}
                    whileInView={{ pathLength: frac }}
                    viewport={{ once: true, margin: '-30px' }}
                    transition={reducedMotion ? { duration: 0 } : { duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">{children}</div>
        </div>
    );
};

/* ── Envelope flap for list cards ───────────────────────────────────── */

export const EnvelopeFlap: React.FC<{ id: string; height?: number }> = ({ id, height = 64 }) => (
    <svg
        className="absolute inset-x-0 top-0 w-full pointer-events-none"
        style={{ height }}
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        aria-hidden="true"
    >
        <defs>
            <linearGradient id={`lf-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,221,160,0.14)" />
                <stop offset="100%" stopColor="rgba(120,72,28,0.1)" />
            </linearGradient>
        </defs>
        {/* Soft shadow the flap casts on the envelope body */}
        <polygon points="0,0 100,0 50,34" fill="rgba(0,0,0,0.22)" />
        <polygon points="0,0 100,0 50,32" fill={`url(#lf-${id})`} />
        <polyline points="0,0 50,32 100,0" fill="none" stroke="rgba(0,0,0,0.34)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
);
