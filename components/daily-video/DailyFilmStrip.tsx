import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { VideoMomentDay, DailyVideoClip } from '../../types';
import { VideoMomentsService } from '../../services/videoMoments';

interface DailyFilmStripProps {
  days: VideoMomentDay[];
  onSelectDay?: (day: VideoMomentDay) => void;
  cycleReady: boolean;
}

/**
 * Horizontal timeline of the 14-day cycle.
 * Each day renders as: user thumb + partner thumb (ghost until cycleReady).
 */
export function DailyFilmStrip({ days, onSelectDay, cycleReady }: DailyFilmStripProps) {
  return (
    <div className="dv-strip" role="list" aria-label="This cycle">
      {days.map((day, idx) => (
        <DayCell
          key={day.date}
          day={day}
          index={idx}
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
  onClick: () => void;
  cycleReady: boolean;
}

function DayCell({ day, index, onClick, cycleReady }: DayCellProps) {
  const date = new Date(day.date + 'T00:00:00');
  const dayNum = date.getDate();
  const weekday = date.toLocaleDateString(undefined, { weekday: 'narrow' });
  const isFuture = date.getTime() > Date.now();

  const empty = !day.userClip && !day.partnerClip;

  return (
    <motion.button
      role="listitem"
      type="button"
      onClick={onClick}
      className={`dv-strip__cell${empty ? ' is-empty' : ''}${isFuture ? ' is-future' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      disabled={empty}
    >
      <div className="dv-strip__frames">
        <FrameSlot clip={day.userClip} owner="me" cycleReady={cycleReady} />
        <FrameSlot clip={day.partnerClip} owner="partner" cycleReady={cycleReady} />
      </div>
      <div className="dv-strip__label">
        <span className="dv-strip__weekday">{weekday}</span>
        <span className="dv-strip__day">{dayNum}</span>
      </div>
    </motion.button>
  );
}

interface FrameSlotProps {
  clip?: DailyVideoClip;
  owner: 'me' | 'partner';
  cycleReady: boolean;
}

function FrameSlot({ clip, owner, cycleReady }: FrameSlotProps) {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!clip) { setThumb(null); return; }
    VideoMomentsService.getThumbnailUrl(clip).then((url) => {
      if (!cancelled) setThumb(url);
    });
    return () => { cancelled = true; };
  }, [clip?.id, clip?.thumbnailId]);

  if (!clip) {
    return <div className={`dv-strip__frame dv-strip__frame--ghost dv-strip__frame--${owner}`} />;
  }

  // Partner clips are hidden until the cycle's film is ready.
  const isPartnerGated = owner === 'partner' && !cycleReady && !clip.partnerVisibleAt;

  return (
    <div
      className={`dv-strip__frame dv-strip__frame--${owner}${isPartnerGated ? ' is-gated' : ''}`}
    >
      {isPartnerGated ? (
        <div className="dv-strip__gate" aria-label="Revealed when film is ready">
          <Lock size={10} />
        </div>
      ) : thumb ? (
        <img src={thumb} alt="" className="dv-strip__thumb" />
      ) : (
        <div className="dv-strip__frame-pulse" />
      )}
    </div>
  );
}
