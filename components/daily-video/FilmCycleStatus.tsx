import React from 'react';
import { motion } from 'framer-motion';
import { Film, Sparkles } from 'lucide-react';
import { BiweeklyFilm, VideoMomentDay } from '../../types';

interface FilmCycleStatusProps {
  cycleStart: string;
  cycleEnd: string;
  daysRemaining: number;
  totalDays: number;
  days: VideoMomentDay[];
  film?: BiweeklyFilm | null;
  onOpenFilm?: () => void;
}

export function FilmCycleStatus({
  cycleStart,
  cycleEnd,
  daysRemaining,
  totalDays,
  days,
  film,
  onOpenFilm,
}: FilmCycleStatusProps) {
  const recordedDays = days.filter((d) => d.userClip || d.partnerClip).length;
  const progress = Math.min(1, recordedDays / totalDays);

  const startLabel = formatRange(cycleStart);
  const endLabel = formatRange(cycleEnd);

  const isGenerating = film?.status === 'generating';
  const isReady = film?.status === 'ready';

  return (
    <motion.div
      className="dv-cycle"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="dv-cycle__head">
        <div>
          <p className="dv-cycle__eyebrow">This cycle</p>
          <h3 className="dv-cycle__title">
            {startLabel} – {endLabel}
          </h3>
        </div>
        {isReady ? (
          <button className="dv-cycle__film-cta" onClick={onOpenFilm}>
            <Film size={16} />
            <span>Watch film</span>
          </button>
        ) : isGenerating ? (
          <span className="dv-cycle__status dv-cycle__status--gen">
            <Sparkles size={14} /> Compiling…
          </span>
        ) : (
          <span className="dv-cycle__status">
            {daysRemaining === 0
              ? 'Final day'
              : daysRemaining === 1
                ? '1 day to go'
                : `${daysRemaining} days to go`}
          </span>
        )}
      </div>

      <div
        className="dv-cycle__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalDays}
        aria-valuenow={recordedDays}
      >
        <motion.div
          className="dv-cycle__bar-fill"
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <p className="dv-cycle__meta">
        {recordedDays} / {totalDays} days captured
      </p>
    </motion.div>
  );
}

function formatRange(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
