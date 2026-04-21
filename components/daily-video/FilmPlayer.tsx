import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause } from 'lucide-react';
import { BiweeklyFilm } from '../../types';
import { VideoMomentsService } from '../../services/videoMoments';

interface FilmPlayerProps {
  film: BiweeklyFilm;
  onClose: () => void;
}

export function FilmPlayer({ film, onClose }: FilmPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    VideoMomentsService.getFilmVideoUrl(film).then((url) => {
      if (cancelled) {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
        return;
      }
      createdUrl = url;
      setVideoUrl(url);
    });
    return () => {
      cancelled = true;
      if (createdUrl && createdUrl.startsWith('blob:')) URL.revokeObjectURL(createdUrl);
    };
  }, [film.id, film.videoId]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const title = formatTitle(film.cycleStart, film.cycleEnd);

  return (
    <motion.div
      className="film-player"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button className="film-player__close" onClick={onClose} aria-label="Close">
        <X size={22} />
      </button>
      <div className="film-player__stage" onClick={toggle}>
        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            className="film-player__video"
            playsInline
            onLoadedData={() => setLoaded(true)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
        )}
        <AnimatePresence>
          {!isPlaying && loaded && (
            <motion.div
              className="film-player__play-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="film-player__play-btn">
                <Play size={30} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="film-player__meta">
        <h2 className="film-player__title">{title}</h2>
        <p className="film-player__sub">
          {film.clipCount} {film.clipCount === 1 ? 'clip' : 'clips'} · {formatDuration(film.durationMs)}
        </p>
      </div>
    </motion.div>
  );
}

function formatTitle(cycleStart: string, cycleEnd: string): string {
  const s = new Date(cycleStart + 'T00:00:00');
  const e = new Date(cycleEnd + 'T00:00:00');
  const startLabel = s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}
