import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Film, Sparkles } from 'lucide-react';
import type { BiweeklyFilm, VideoMomentDay } from '../../types';
import { GOLD, GOLD_PRESS_SPRING } from '../premium/GoldKit';
import { feedback } from '../../utils/feedback';

interface FilmCycleStatusProps {
    cycleStart: string;
    cycleEnd: string;
    daysRemaining: number;
    totalDays: number;
    days: VideoMomentDay[];
    film?: BiweeklyFilm | null;
    onOpenFilm?: () => void;
}

const REEL_RADIUS = 46;
const REEL_CIRCUMFERENCE = 2 * Math.PI * REEL_RADIUS;
const SPOKE_COUNT = 5;
const SPOKES = Array.from({ length: SPOKE_COUNT }, (_, i) => {
    const angle = (i / SPOKE_COUNT) * Math.PI * 2 - Math.PI / 2;
    return {
        cx: 54 + Math.cos(angle) * 19,
        cy: 54 + Math.sin(angle) * 19,
    };
});

/**
 * Cycle status as a film reel — the outer gold ring fills as scenes
 * accumulate; the reel itself spins while the film is being spliced,
 * and a gold CTA appears on premiere night.
 */
export function FilmCycleStatus({
    cycleStart,
    cycleEnd,
    daysRemaining,
    totalDays,
    days,
    film,
    onOpenFilm,
}: FilmCycleStatusProps) {
    const reducedMotion = useReducedMotion();
    const recordedDays = days.filter((d) => d.userClip || d.partnerClip).length;
    const progress = Math.min(1, recordedDays / totalDays);

    const startLabel = formatRange(cycleStart);
    const endLabel = formatRange(cycleEnd);

    const isGenerating = film?.status === 'generating';
    const isReady = film?.status === 'ready';

    return (
        <div
            className="relative overflow-hidden rounded-[1.6rem] p-5"
            style={{ background: GOLD.cardBg, border: '1px solid rgba(168,85,247,0.2)' }}
        >
            <div
                className="lp-float absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.16) 0%, transparent 70%)' }}
            />

            <div className="relative z-10 flex items-center gap-5">
                <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={totalDays}
                    aria-valuenow={recordedDays}
                    aria-label="Scenes captured this cycle"
                    className="shrink-0"
                >
                    <svg
                        width="104"
                        height="104"
                        viewBox="0 0 108 108"
                        className={isGenerating ? 'gdv-reel gdv-reel--spinning' : 'gdv-reel'}
                    >
                        <defs>
                            <linearGradient id="gdv-reel-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#f6c768" />
                                <stop offset="100%" stopColor="#d99c3e" />
                            </linearGradient>
                        </defs>
                        <circle cx="54" cy="54" r={REEL_RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                        <motion.circle
                            cx="54"
                            cy="54"
                            r={REEL_RADIUS}
                            fill="none"
                            stroke="url(#gdv-reel-gold)"
                            strokeWidth="5"
                            strokeLinecap="round"
                            strokeDasharray={REEL_CIRCUMFERENCE}
                            initial={{ strokeDashoffset: REEL_CIRCUMFERENCE }}
                            animate={{ strokeDashoffset: REEL_CIRCUMFERENCE * (1 - progress) }}
                            transition={reducedMotion ? { duration: 0 } : { duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                            transform="rotate(-90 54 54)"
                        />
                        <g className="gdv-reel__wheel">
                            <circle cx="54" cy="54" r="33" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.1)" />
                            {SPOKES.map((s) => (
                                <circle
                                    key={`${s.cx}-${s.cy}`}
                                    cx={s.cx}
                                    cy={s.cy}
                                    r="7.5"
                                    fill="rgba(8,4,12,0.55)"
                                    stroke="rgba(255,255,255,0.08)"
                                />
                            ))}
                            <circle cx="54" cy="54" r="6.5" fill="rgba(246,199,104,0.16)" stroke="rgba(246,199,104,0.45)" />
                        </g>
                    </svg>
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: GOLD.textLow }}>
                        {startLabel} – {endLabel}
                    </p>
                    <p
                        className="mt-1.5 font-serif text-[1.4rem] leading-tight"
                        style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                    >
                        {recordedDays} of {totalDays} scenes
                    </p>
                    {isGenerating ? (
                        <p
                            className="gdv-flicker mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold"
                            style={{ color: '#d8b4fe' }}
                        >
                            <Sparkles size={12} />
                            Splicing your film…
                        </p>
                    ) : isReady ? (
                        <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: GOLD.textMid }}>
                            Premiere night — your film is ready.
                        </p>
                    ) : (
                        <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: GOLD.textMid }}>
                            {daysRemaining === 0
                                ? 'Final day of shooting'
                                : daysRemaining === 1
                                    ? '1 day of shooting left'
                                    : `${daysRemaining} days of shooting left`}
                        </p>
                    )}
                </div>
            </div>

            {isReady && (
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    transition={GOLD_PRESS_SPRING}
                    onClick={() => { feedback.tap(); onOpenFilm?.(); }}
                    className="lp-cta relative z-10 mt-4 w-full h-[48px] rounded-xl font-bold text-[14px] inline-flex items-center justify-center gap-2"
                    style={{
                        background: `linear-gradient(135deg, ${GOLD.primary} 0%, ${GOLD.deep} 100%)`,
                        color: GOLD.inkOnGold,
                        boxShadow: '0 12px 32px rgba(246,199,104,0.26), inset 0 1px 0 rgba(255,246,222,0.45)',
                    }}
                >
                    <Film size={16} strokeWidth={2.2} />
                    Watch the film
                </motion.button>
            )}
        </div>
    );
}

function formatRange(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
