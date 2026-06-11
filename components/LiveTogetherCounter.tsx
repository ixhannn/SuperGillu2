import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Calendar, ChevronRight } from 'lucide-react';
import { buildLiveTogether, buildRelationshipStats } from '../shared/relationshipStats.js';
import { springSmooth } from '../utils/motion';

interface LiveTogetherCounterProps {
    anniversaryDate: string;
    onOpenCountdowns?: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * "Our time together" — a living counter whose seconds tick in real time.
 *
 * Isolated as its own component on purpose: it re-renders once per second, so it
 * must NOT live inside the large Home tree (that would re-render the whole page
 * every tick). It also pauses while the tab is hidden and resyncs on return, so
 * it never burns battery in the background or shows a frozen time on resume.
 */
export const LiveTogetherCounter: React.FC<LiveTogetherCounterProps> = ({ anniversaryDate, onOpenCountdowns }) => {
    const stats = useMemo(() => buildRelationshipStats(anniversaryDate), [anniversaryDate]);
    const [now, setNow] = useState(() => new Date());
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const tick = () => setNow(new Date());
        const start = () => {
            if (intervalRef.current) return;
            tick(); // resync immediately
            intervalRef.current = setInterval(tick, 1000);
        };
        const stop = () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
        const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            stop();
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    const live = useMemo(() => buildLiveTogether(anniversaryDate, now), [anniversaryDate, now]);
    if (!live || !stats) return null;

    // Calendar cascade with leading zeros dropped (a 3-month couple sees
    // "3 mo · 28 d", not "0 yr · 3 mo · 28 d").
    const cascade = [
        { value: live.years, unit: live.years === 1 ? 'yr' : 'yrs' },
        { value: live.months, unit: 'mo' },
        { value: live.days, unit: live.days === 1 ? 'day' : 'days' },
    ];
    const firstNonZero = cascade.findIndex((s) => s.value > 0);
    const visibleCascade = firstNonZero === -1 ? [] : cascade.slice(firstNonZero);

    const clock = `${pad2(live.hours)}:${pad2(live.minutes)}:${pad2(live.seconds)}`;
    const ariaLabel = visibleCascade.length
        ? `Together for ${visibleCascade.map((s) => `${s.value} ${s.unit}`).join(', ')}`
        : 'Your first day together';

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springSmooth}
            className="relative overflow-hidden rounded-[1.75rem] p-5 mb-5 z-10"
            style={{
                background: 'linear-gradient(160deg, rgba(255,255,255,0.92) 0%, rgba(255,241,244,0.9) 100%)',
                border: '1px solid rgba(244,63,94,0.12)',
                boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 12px 36px -12px rgba(244,63,94,0.18), 0 4px 12px -6px rgba(232,160,176,0.12)',
            }}
            aria-label={ariaLabel}
        >
            {/* Soft decorative glow */}
            <div
                className="absolute -right-10 -top-12 w-40 h-40 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(251,113,133,0.14), transparent 70%)' }}
            />

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-3.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 flex items-center gap-1.5">
                        <Sparkles size={12} className="text-lior-400" /> Our time together
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-lior-400 opacity-70 animate-ping" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-lior-500" />
                        </span>
                        <span className="text-[9px] font-semibold uppercase tracking-widest text-lior-400/80">live</span>
                    </span>
                </div>

                {/* Calendar cascade */}
                {visibleCascade.length > 0 ? (
                    <div className="flex items-end gap-3 mb-1">
                        {visibleCascade.map((seg) => (
                            <div key={seg.unit} className="flex items-baseline gap-1">
                                <span className="text-4xl font-bold tracking-tight text-gray-800 leading-none tabular-nums">{seg.value}</span>
                                <span className="text-xs font-semibold text-gray-400">{seg.unit}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="mb-1">
                        <span className="text-3xl font-bold tracking-tight text-gray-800 leading-none">Day one</span>
                    </div>
                )}

                {/* Live ticking clock — the heartbeat of the card */}
                <div
                    aria-hidden="true"
                    className="text-2xl font-bold tabular-nums text-lior-500 leading-none mt-1"
                    style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}
                >
                    {clock}
                </div>

                {/* Divider */}
                <div className="h-px my-4" style={{ background: 'linear-gradient(90deg, rgba(244,63,94,0.12), transparent)' }} />

                {/* Footer: origin + next milestone */}
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-gray-500 flex items-center gap-1.5 min-w-0">
                        <Calendar size={12} className="text-lior-400 flex-shrink-0" />
                        <span className="truncate">Began on a {stats.weekday}</span>
                    </span>
                    {stats.nextMilestone && (
                        <button
                            type="button"
                            onClick={onOpenCountdowns}
                            className="flex items-center gap-1 text-[11px] font-semibold text-lior-500 flex-shrink-0 spring-press"
                            aria-label={`${stats.nextMilestone.title} in ${stats.nextMilestone.daysUntil} days`}
                        >
                            {stats.nextMilestone.title}
                            <span className="text-lior-400">· {stats.nextMilestone.daysUntil === 0 ? 'today!' : `${stats.nextMilestone.daysUntil}d`}</span>
                            <ChevronRight size={13} className="text-lior-300" />
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
