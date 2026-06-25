import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import type { VideoMomentDay, DailyVideoClip } from '../../types';
import { VideoMomentsService } from '../../services/videoMoments';
import { GOLD } from '../premium/GoldKit';

interface DailyFilmStripProps {
    days: VideoMomentDay[];
    onSelectDay?: (day: VideoMomentDay) => void;
    cycleReady: boolean;
}

/**
 * The strip — the 14-day cycle rendered as an actual film strip.
 * Sprocket-hole rails top and bottom (CSS), one segment per day with
 * both partners' frames stacked: me (gold) above, partner (violet) below.
 * Partner frames stay gated behind a lock until the cycle's film is ready.
 */
export function DailyFilmStrip({ days, onSelectDay, cycleReady }: DailyFilmStripProps) {
    const scrollerRef = useRef<HTMLDivElement>(null);
    const todayCellRef = useRef<HTMLButtonElement>(null);
    const todayIso = VideoMomentsService.getLocalDateString();

    // Center today's segment when the strip first renders.
    useEffect(() => {
        const scroller = scrollerRef.current;
        const cell = todayCellRef.current;
        if (!scroller || !cell) return;
        scroller.scrollLeft = Math.max(0, cell.offsetLeft - (scroller.clientWidth - cell.clientWidth) / 2);
    }, [days.length]);

    return (
        <div ref={scrollerRef} className="gdv-strip -mx-5 px-5" role="list" aria-label="This cycle">
            {days.map((day, idx) => (
                <DayCell
                    key={day.date}
                    day={day}
                    index={idx}
                    isToday={day.date === todayIso}
                    cellRef={day.date === todayIso ? todayCellRef : undefined}
                    onClick={() => onSelectDay?.(day)}
                    cycleReady={cycleReady}
                />
            ))}
        </div>
    );
}

interface DayCellProps {
    day: VideoMomentDay;
    index: number;
    isToday: boolean;
    cellRef?: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    cycleReady: boolean;
}

function DayCell({ day, index, isToday, cellRef, onClick, cycleReady }: DayCellProps) {
    const date = new Date(day.date + 'T00:00:00');
    const dayNum = date.getDate();
    const weekday = date.toLocaleDateString(undefined, { weekday: 'narrow' });
    const isFuture = date.getTime() > Date.now();

    const empty = !day.userClip && !day.partnerClip;

    return (
        <motion.button
            ref={cellRef}
            role="listitem"
            type="button"
            onClick={onClick}
            className={`gdv-strip__cell${empty ? ' is-empty' : ''}${isFuture ? ' is-future' : ''}${isToday ? ' is-today' : ''}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
            disabled={empty}
        >
            <div className="gdv-strip__frames">
                <FrameSlot clip={day.userClip} owner="me" cycleReady={cycleReady} />
                <FrameSlot clip={day.partnerClip} owner="partner" cycleReady={cycleReady} />
            </div>
            <div className="gdv-strip__label">
                <span
                    className="text-[9px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: isToday ? 'rgba(246,199,104,0.8)' : GOLD.textLow }}
                >
                    {weekday}
                </span>
                <span
                    className="font-serif text-[15px] leading-none"
                    style={{ color: isToday ? GOLD.light : GOLD.textHigh }}
                >
                    {dayNum}
                </span>
            </div>
        </motion.button>
    );
}

interface FrameSlotProps {
    clip?: DailyVideoClip;
    owner: 'me' | 'partner';
    cycleReady: boolean;
}

// Warm thumbnail cache: resolved object URLs keyed by thumbnailId. Without it,
// every FrameSlot remount seeds null and resolves the thumbnail in a post-paint
// effect, so the shimmer pulse always paints first (a synchronized blink across
// the strip). Seeding from this cache lets a previously-resolved cell paint its
// frame on the first frame instead. URLs are intentionally never revoked — they
// are reused across mounts (mirrors useLiorImage's mediaValueCache).
const thumbUrlCache = new Map<string, string>();

function FrameSlot({ clip, owner, cycleReady }: FrameSlotProps) {
    const [thumb, setThumb] = useState<string | null>(
        () => (clip?.thumbnailId ? thumbUrlCache.get(clip.thumbnailId) ?? null : null),
    );

    useEffect(() => {
        let cancelled = false;
        if (!clip) { setThumb(null); return; }
        const cacheKey = clip.thumbnailId;
        if (cacheKey && thumbUrlCache.has(cacheKey)) {
            setThumb(thumbUrlCache.get(cacheKey)!);
            return;
        }
        VideoMomentsService.getThumbnailUrl(clip).then((url) => {
            if (cancelled) return;
            if (url && cacheKey) thumbUrlCache.set(cacheKey, url);
            setThumb(url);
        });
        return () => { cancelled = true; };
    }, [clip?.id, clip?.thumbnailId]);

    if (!clip) {
        return <div className={`gdv-strip__frame gdv-strip__frame--${owner} gdv-strip__frame--ghost`} />;
    }

    // Partner clips are hidden until the cycle's film is ready.
    const isPartnerGated = owner === 'partner' && !cycleReady && !clip.partnerVisibleAt;

    return (
        <div className={`gdv-strip__frame gdv-strip__frame--${owner}${isPartnerGated ? ' is-gated' : ''}`}>
            {isPartnerGated ? (
                <div className="gdv-strip__gate" aria-label="Revealed when the film is ready">
                    <Lock size={10} />
                </div>
            ) : thumb ? (
                <img src={thumb} alt="" className="gdv-strip__thumb" />
            ) : (
                <div className="gdv-strip__pulse" />
            )}
        </div>
    );
}
