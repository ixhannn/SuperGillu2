import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play } from 'lucide-react';
import type { BiweeklyFilm } from '../../types';
import { VideoMomentsService } from '../../services/videoMoments';
import { feedback } from '../../utils/feedback';
import { GOLD, GOLD_PRESS_SPRING } from '../premium/GoldKit';
import { useTapOrigin } from '../../hooks/useTapOrigin';

interface FilmPlayerProps {
    film: BiweeklyFilm;
    onClose: () => void;
}

/**
 * The screening room. Playback logic is untouched — chrome restaged
 * in the gold language (glass close chip, serif title card).
 */
export function FilmPlayer({ film, onClose }: FilmPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [posterUrl, setPosterUrl] = useState<string | undefined>(undefined);
    const [isPlaying, setIsPlaying] = useState(false);
    const [loaded, setLoaded] = useState(false);
    // Grow the screening box OUT OF the tapped film clip instead of from screen
    // centre. The hook falls back to centre under reduced motion / no fresh tap.
    const { ref: cinemaRef, origin } = useTapOrigin<HTMLDivElement>(true);

    useEffect(() => {
        let cancelled = false;
        let createdUrl: string | null = null;
        let createdPoster: string | null = null;
        VideoMomentsService.getFilmVideoUrl(film).then((url) => {
            if (cancelled) {
                if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
                return;
            }
            createdUrl = url;
            setVideoUrl(url);
        });
        // A poster covers the gap between the URL resolving and the first frame
        // decoding, so the cinema stage shows the film's own thumbnail instead of
        // an empty dark gradient. Optional — a missing thumbnail is a no-op.
        VideoMomentsService.getFilmThumbnailUrl(film).then((url) => {
            if (cancelled) {
                if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
                return;
            }
            createdPoster = url;
            setPosterUrl(url ?? undefined);
        }).catch(() => { /* poster is best-effort */ });
        return () => {
            cancelled = true;
            if (createdUrl && createdUrl.startsWith('blob:')) URL.revokeObjectURL(createdUrl);
            if (createdPoster && createdPoster.startsWith('blob:')) URL.revokeObjectURL(createdPoster);
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
            ref={cinemaRef}
            className="gdv-cinema"
            style={{ transformOrigin: origin }}
            initial={{ scale: 0.88, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 380, mass: 0.8 }}
        >
            <div className="gdv-cinema__stage cursor-pointer" onClick={toggle}>
                {videoUrl && (
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        poster={posterUrl}
                        className="gdv-cinema__video"
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
                            key="play-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <div
                                className="lp-glass flex w-[78px] h-[78px] items-center justify-center rounded-full"
                                style={{ color: '#f3cd86', border: '1px solid rgba(246,199,104,0.4)' }}
                            >
                                <Play size={28} fill="currentColor" strokeWidth={0} style={{ marginLeft: 3 }} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="gdv-cinema__hairline" />

            <div className="gdv-cinema__chrome-top">
                <span
                    className="text-[10px] font-bold uppercase tracking-[0.3em]"
                    style={{ color: GOLD.eyebrow }}
                >
                    A Lior film
                </span>
                <motion.button
                    whileTap={{ scale: 0.86 }}
                    transition={GOLD_PRESS_SPRING}
                    onClick={() => { feedback.tap(); onClose(); }}
                    aria-label="Close"
                    className="lp-glass w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ color: 'rgba(255,246,230,0.85)' }}
                >
                    <X size={18} strokeWidth={2.2} />
                </motion.button>
            </div>

            <div className="gdv-cinema__bottom">
                <h2
                    className="font-serif text-[1.45rem] leading-tight"
                    style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                >
                    {title}
                </h2>
                <p
                    className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: 'rgba(246,199,104,0.7)' }}
                >
                    {film.clipCount} {film.clipCount === 1 ? 'scene' : 'scenes'} · {formatDuration(film.durationMs)}
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
