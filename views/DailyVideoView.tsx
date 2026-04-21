import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Film, Flame, Calendar } from 'lucide-react';
import { ViewState, BiweeklyFilm, VideoMomentDay, VideoMomentSettings } from '../types';
import {
  VideoMomentsService,
  videoMomentsEventTarget,
  CYCLE_DAYS,
} from '../services/videoMoments';
import { ViewHeader } from '../components/ViewHeader';
import { DailyVideoRecorder } from '../components/daily-video/DailyVideoRecorder';
import { DailyFilmStrip } from '../components/daily-video/DailyFilmStrip';
import { FilmCycleStatus } from '../components/daily-video/FilmCycleStatus';
import { FilmPlayer } from '../components/daily-video/FilmPlayer';
import { useBiweeklyCycle } from '../hooks/useBiweeklyCycle';
import { toast } from '../utils/toast';
import { feedback } from '../utils/feedback';

interface DailyVideoViewProps {
  setView: (view: ViewState) => void;
}

type Sheet = 'none' | 'record' | 'film';

export function DailyVideoView({ setView }: DailyVideoViewProps) {
  const cycle = useBiweeklyCycle();
  const [days, setDays] = useState<VideoMomentDay[]>([]);
  const [films, setFilms] = useState<BiweeklyFilm[]>([]);
  const [settings, setSettings] = useState<VideoMomentSettings | null>(null);
  const [recordedToday, setRecordedToday] = useState(false);
  const [sheet, setSheet] = useState<Sheet>('none');
  const [activeFilm, setActiveFilm] = useState<BiweeklyFilm | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [cycleDays, allFilms, s, already] = await Promise.all([
      VideoMomentsService.getClipsForCycle(new Date(cycle.cycleStart + 'T00:00:00')),
      VideoMomentsService.getAllFilms(),
      VideoMomentsService.getSettings(),
      VideoMomentsService.hasRecordedToday(),
    ]);
    setDays(cycleDays);
    setFilms(allFilms);
    setSettings(s);
    setRecordedToday(already);
    setLoading(false);

    void VideoMomentsService.ensureFilmsUpToDate().catch((err) => {
      console.error('Failed to generate missing biweekly films', err);
    });
  }, [cycle.cycleStart]);

  useEffect(() => {
    void refresh();
    const handler = () => { void refresh(); };
    videoMomentsEventTarget.addEventListener('video-moments-update', handler);
    return () => videoMomentsEventTarget.removeEventListener('video-moments-update', handler);
  }, [refresh]);

  const currentCycleFilm = useMemo(
    () => films.find((f) => f.cycleStart === cycle.cycleStart) ?? null,
    [films, cycle.cycleStart],
  );

  const handleSave = async (result: { blob: Blob; durationMs: number }) => {
    try {
      await VideoMomentsService.recordClip(result.blob, result.durationMs);
      feedback.success();
      toast.show('Today’s clip saved', 'success');
      setSheet('none');
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save clip';
      toast.show(msg, 'error');
    }
  };

  const openFilm = (film: BiweeklyFilm) => {
    if (film.status !== 'ready') return;
    setActiveFilm(film);
    setSheet('film');
  };

  const pastFilms = useMemo(
    () => films.filter((f) => f.cycleStart !== cycle.cycleStart && f.status === 'ready'),
    [films, cycle.cycleStart],
  );

  return (
    <div className="dv-view">
      <ViewHeader title="10 Seconds Daily" onBack={() => setView('home')} />

      <div className="dv-view__body">
        {settings && settings.streakCount > 0 && (
          <motion.div
            className="dv-streak"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Flame size={16} />
            <span>{settings.streakCount} day streak</span>
            {settings.longestStreak > settings.streakCount && (
              <span className="dv-streak__best">best {settings.longestStreak}</span>
            )}
          </motion.div>
        )}

        <motion.section
          className={`dv-today${recordedToday ? ' is-done' : ''}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="dv-today__head">
            <p className="dv-today__eyebrow">Today</p>
            <h2 className="dv-today__title">
              {recordedToday ? 'You’ve captured today.' : 'Five seconds of right now.'}
            </h2>
            <p className="dv-today__sub">
              {recordedToday
                ? 'Come back tomorrow. Partner clips reveal when your film is ready.'
                : 'Hold the button for 5 seconds. Audio stays on. One take a day.'}
            </p>
          </div>
          {!recordedToday ? (
            <button className="dv-today__record" onClick={() => setSheet('record')}>
              <Video size={18} />
              <span>Record today</span>
            </button>
          ) : (
            <button className="dv-today__retake" onClick={() => setSheet('record')}>
              Replace today’s clip
            </button>
          )}
        </motion.section>

        <FilmCycleStatus
          cycleStart={cycle.cycleStart}
          cycleEnd={cycle.cycleEnd}
          daysRemaining={cycle.daysRemaining}
          totalDays={CYCLE_DAYS}
          days={days}
          film={currentCycleFilm}
          onOpenFilm={() => currentCycleFilm && openFilm(currentCycleFilm)}
        />

        <section className="dv-section">
          <div className="dv-section__head">
            <Calendar size={15} />
            <h3>This cycle’s timeline</h3>
          </div>
          <DailyFilmStrip
            days={days}
            cycleReady={currentCycleFilm?.status === 'ready'}
          />
        </section>

        {pastFilms.length > 0 && (
          <section className="dv-section">
            <div className="dv-section__head">
              <Film size={15} />
              <h3>Past films</h3>
            </div>
            <div className="dv-past">
              {pastFilms.map((film) => (
                <FilmCard key={film.id} film={film} onOpen={() => openFilm(film)} />
              ))}
            </div>
          </section>
        )}

        {!loading && films.length === 0 && pastFilms.length === 0 && (
          <motion.p
            className="dv-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Your first film compiles on day {CYCLE_DAYS} of this cycle.
          </motion.p>
        )}
      </div>

      <AnimatePresence>
        {sheet === 'record' && (
          <motion.div
            key="record-sheet"
            className="dv-sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <DailyVideoRecorder onSaved={handleSave} onClose={() => setSheet('none')} />
          </motion.div>
        )}
        {sheet === 'film' && activeFilm && (
          <motion.div
            key="film-sheet"
            className="dv-sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <FilmPlayer film={activeFilm} onClose={() => { setSheet('none'); setActiveFilm(null); }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FilmCardProps {
  film: BiweeklyFilm;
  onOpen: () => void;
}

function FilmCard({ film, onOpen }: FilmCardProps) {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    VideoMomentsService.getFilmThumbnailUrl(film).then((url) => {
      if (cancelled) {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
        return;
      }
      created = url;
      setThumb(url);
    });
    return () => {
      cancelled = true;
      if (created && created.startsWith('blob:')) URL.revokeObjectURL(created);
    };
  }, [film.id, film.thumbnailId]);

  const label = formatCycleLabel(film.cycleStart, film.cycleEnd);

  return (
    <button className="dv-past__card" onClick={onOpen}>
      <div className="dv-past__thumb">
        {thumb ? (
          <img src={thumb} alt="" />
        ) : (
          <div className="dv-past__thumb-placeholder" />
        )}
        <div className="dv-past__overlay">
          <Film size={18} />
        </div>
      </div>
      <div className="dv-past__meta">
        <p className="dv-past__label">{label}</p>
        <p className="dv-past__sub">
          {film.clipCount} {film.clipCount === 1 ? 'clip' : 'clips'}
        </p>
      </div>
    </button>
  );
}

function formatCycleLabel(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sLbl = s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const eLbl = e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${sLbl} – ${eLbl}`;
}

export default DailyVideoView;
