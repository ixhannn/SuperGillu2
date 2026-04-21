import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, RefreshCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { ViewState, WeeklyRecap, RecapSection } from '../types';
import { useWeeklyRecapData } from '../hooks/useWeeklyRecapData';
import { useRecapPalette } from '../hooks/useRecapPalette';
import { WeeklyRecapService } from '../services/weeklyRecap';
import { ViewHeader } from '../components/ViewHeader';
import { RecapCover } from '../components/weekly-recap/RecapCover';
import { RecapNumbers } from '../components/weekly-recap/RecapNumbers';
import { RecapMoodJourney } from '../components/weekly-recap/RecapMoodJourney';
import { RecapHighlight } from '../components/weekly-recap/RecapHighlight';
import { RecapHeadline } from '../components/weekly-recap/RecapHeadline';
import { RecapCarousel } from '../components/weekly-recap/RecapCarousel';
import { RecapPrompt } from '../components/weekly-recap/RecapPrompt';
import { RecapStreak } from '../components/weekly-recap/RecapStreak';
import { RecapFilmStrip } from '../components/weekly-recap/RecapFilmStrip';
import { RecapInsight } from '../components/weekly-recap/RecapInsight';
import { RecapShareSheet } from '../components/weekly-recap/RecapShareSheet';

interface WeeklyRecapViewProps {
  setView: (view: ViewState) => void;
}

function addWeeks(weekStart: string, delta: number): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + delta * 7);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function WeeklyRecapView({ setView }: WeeklyRecapViewProps) {
  const thisWeek = useMemo(() => WeeklyRecapService.getWeekStart(), []);
  const [weekStart, setWeekStart] = useState<string>(thisWeek);
  const [showShare, setShowShare] = useState(false);

  const { recap, loading, error, build } = useWeeklyRecapData({ weekStart });
  const { style } = useRecapPalette(recap?.palette ?? null);

  const isCurrent = weekStart === thisWeek;
  const canGoForward = weekStart < thisWeek;

  useEffect(() => {
    // Rebuild if user swaps weeks
    void build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  return (
    <div className="recap-view" style={style}>
      <ViewHeader
        title="Weekly Story"
        onBack={() => setView('home')}
        rightSlot={
          recap ? (
            <button
              className="recap-view__share"
              onClick={() => setShowShare(true)}
              aria-label="Share recap"
            >
              <Share2 size={18} />
            </button>
          ) : undefined
        }
      />

      <div className="recap-view__nav">
        <button
          className="recap-view__nav-btn"
          onClick={() => setWeekStart((w) => addWeeks(w, -1))}
          aria-label="Previous week"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="recap-view__nav-label">
          {isCurrent ? 'This week' : formatLabel(weekStart)}
        </span>
        <button
          className="recap-view__nav-btn"
          onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          disabled={!canGoForward}
          aria-label="Next week"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="recap-view__body">
        {loading && <RecapSkeleton />}
        {error && (
          <div className="recap-view__error">
            <p>{error}</p>
            <button className="recap-view__retry" onClick={() => build(true)}>
              <RefreshCcw size={16} /> Try again
            </button>
          </div>
        )}
        {!loading && !error && recap && <RecapDocument recap={recap} />}
      </div>

      <AnimatePresence>
        {showShare && recap && (
          <RecapShareSheet recap={recap} onClose={() => setShowShare(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function RecapDocument({ recap }: { recap: WeeklyRecap }) {
  return (
    <article className="recap-doc" aria-label="Weekly recap">
      {recap.sections.map((section, i) => (
        <RecapSectionRenderer key={`${section.kind}-${i}`} section={section} />
      ))}
    </article>
  );
}

function RecapSectionRenderer({ section }: { section: RecapSection }) {
  switch (section.kind) {
    case 'cover':
      return (
        <RecapCover
          headline={section.headline}
          dateRange={section.dateRange}
          names={section.names}
          palette={section.palette}
        />
      );
    case 'headline':
      return <RecapHeadline memory={section.memory} palette={section.palette} />;
    case 'carousel':
      return <RecapCarousel memories={section.memories} palette={section.palette} />;
    case 'numbers':
      return <RecapNumbers stats={section.stats} />;
    case 'moodJourney':
      return (
        <RecapMoodJourney
          points={section.points}
          insight={section.insight}
          palette={section.palette}
        />
      );
    case 'highlight':
      return <RecapHighlight highlight={section.highlight} />;
    case 'prompt':
      return <RecapPrompt text={section.text} promptType={section.promptType} />;
    case 'streak':
      return (
        <RecapStreak
          days={section.days}
          currentStreak={section.currentStreak}
          bestStreak={section.bestStreak}
        />
      );
    case 'filmStrip':
      return <RecapFilmStrip clips={section.clips} />;
    case 'insight':
      return (
        <RecapInsight
          text={section.text}
          label={section.label}
          variant={section.variant}
        />
      );
    default:
      return null;
  }
}

function RecapSkeleton() {
  return (
    <motion.div
      className="recap-skeleton"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="recap-skeleton__cover" />
      <div className="recap-skeleton__row" />
      <div className="recap-skeleton__row" />
      <div className="recap-skeleton__row recap-skeleton__row--wide" />
    </motion.div>
  );
}

function formatLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default WeeklyRecapView;
