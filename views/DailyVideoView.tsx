import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Clapperboard, Flame, Play, RotateCcw, Video } from 'lucide-react';
import type { BiweeklyFilm, DailyVideoClip, ViewState, VideoMomentDay, VideoMomentSettings } from '../types';
import {
    VideoMomentsService,
    videoMomentsEventTarget,
    CYCLE_DAYS,
} from '../services/videoMoments';
import { StorageService } from '../services/storage';
import { GoldShell } from '../components/premium/GoldShell';
import {
    GOLD,
    GOLD_PRESS_SPRING,
    GOLD_SOFT_SPRING,
    GoldCard,
    GoldSectionHeader,
    goldRise,
    goldStagger,
} from '../components/premium/GoldKit';
import { DailyVideoRecorder } from '../components/daily-video/DailyVideoRecorder';
import { DailyFilmStrip } from '../components/daily-video/DailyFilmStrip';
import { FilmCycleStatus } from '../components/daily-video/FilmCycleStatus';
import { FilmPlayer } from '../components/daily-video/FilmPlayer';
import { useBiweeklyCycle } from '../hooks/useBiweeklyCycle';
import { toast } from '../utils/toast';
import { feedback } from '../utils/feedback';
import '../styles/gold-daily-video.css';

const ACCENT = '#a855f7';
const ACCENT_SOFT = 'rgba(216,180,254,0.85)';

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

    const profile = useMemo(() => StorageService.getCoupleProfile(), []);
    const myName = profile.myName?.trim() || 'You';
    const partnerName = profile.partnerName?.trim() || 'Your love';

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

    const todayClip = useMemo(() => {
        const today = VideoMomentsService.getLocalDateString();
        return days.find((d) => d.date === today)?.userClip ?? null;
    }, [days]);

    const closeSheets = useCallback(() => {
        setSheet('none');
        setActiveFilm(null);
    }, []);

    // Android hardware back closes whichever cinema overlay is open.
    useEffect(() => {
        if (sheet === 'none') return;
        const handleBack = (e: Event) => { e.preventDefault(); closeSheets(); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [sheet, closeSheets]);

    const openRecorder = useCallback(() => {
        feedback.tap();
        setSheet('record');
    }, []);

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
        <GoldShell eyebrow="Daily Moments" accent={ACCENT}>
            <motion.div initial="hidden" animate="visible" variants={goldStagger} className="pt-4">
                {/* ── Tonight's scene ───────────────────────────────── */}
                <motion.div variants={goldRise}>
                    <HeroScene
                        recordedToday={recordedToday}
                        todayClip={todayClip}
                        partnerName={partnerName}
                        settings={settings}
                        onRecord={openRecorder}
                    />
                </motion.div>

                {/* ── The strip ─────────────────────────────────────── */}
                <motion.div variants={goldRise}>
                    <GoldSectionHeader label="The strip" />
                </motion.div>
                <motion.div variants={goldRise}>
                    <DailyFilmStrip
                        days={days}
                        cycleReady={currentCycleFilm?.status === 'ready'}
                    />
                    <div className="mt-1 flex items-center justify-center gap-6">
                        <LegendDot color={GOLD.primary} label={myName} />
                        <LegendDot color={ACCENT} label={partnerName} />
                    </div>
                </motion.div>

                {/* ── Cycle status ──────────────────────────────────── */}
                <motion.div variants={goldRise}>
                    <GoldSectionHeader label="This fortnight's film" />
                </motion.div>
                <motion.div variants={goldRise}>
                    <FilmCycleStatus
                        cycleStart={cycle.cycleStart}
                        cycleEnd={cycle.cycleEnd}
                        daysRemaining={cycle.daysRemaining}
                        totalDays={CYCLE_DAYS}
                        days={days}
                        film={currentCycleFilm}
                        onOpenFilm={() => currentCycleFilm && openFilm(currentCycleFilm)}
                    />
                </motion.div>

                {/* ── Past premieres ────────────────────────────────── */}
                {pastFilms.length > 0 && (
                    <>
                        <motion.div variants={goldRise}>
                            <GoldSectionHeader label="Past premieres" />
                        </motion.div>
                        <motion.div variants={goldRise} className="grid grid-cols-2 gap-3">
                            {pastFilms.map((film) => (
                                <FilmPosterCard key={film.id} film={film} onOpen={() => openFilm(film)} />
                            ))}
                        </motion.div>
                    </>
                )}

                {/* ── First-cycle note ──────────────────────────────── */}
                {!loading && films.length === 0 && pastFilms.length === 0 && (
                    <motion.div variants={goldRise} className="mt-10">
                        <GoldCard className="p-6">
                            <div className="flex flex-col items-center text-center">
                                <div
                                    className="flex w-11 h-11 items-center justify-center rounded-2xl mb-3"
                                    style={{ background: 'rgba(168,85,247,0.14)', border: '1px solid rgba(168,85,247,0.32)' }}
                                >
                                    <Clapperboard size={20} style={{ color: '#d8b4fe' }} />
                                </div>
                                <p className="font-serif text-[1.15rem] leading-tight" style={{ color: GOLD.textHigh }}>
                                    The reel is rolling
                                </p>
                                <p className="mt-2 max-w-[30ch] text-[12px] leading-relaxed" style={{ color: GOLD.textMid }}>
                                    Your first film cuts itself together on day {CYCLE_DAYS} of this
                                    cycle — five seconds at a time.
                                </p>
                            </div>
                        </GoldCard>
                    </motion.div>
                )}
            </motion.div>

            {/* Cinema overlays — portal OUTSIDE AnimatePresence (React 19:
                portals are not valid elements, AnimatePresence would drop them). */}
            {ReactDOM.createPortal(
                <AnimatePresence>
                    {sheet === 'record' && (
                        <motion.div
                            key="record-sheet"
                            className="gdv-sheet"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <motion.div
                                initial={{ y: 28, scale: 0.97 }}
                                animate={{ y: 0, scale: 1 }}
                                transition={GOLD_SOFT_SPRING}
                                className="w-full flex justify-center"
                            >
                                <DailyVideoRecorder onSaved={handleSave} onClose={closeSheets} />
                            </motion.div>
                        </motion.div>
                    )}
                    {sheet === 'film' && activeFilm && (
                        <motion.div
                            key="film-sheet"
                            className="gdv-sheet"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <motion.div
                                initial={{ y: 28, scale: 0.97 }}
                                animate={{ y: 0, scale: 1 }}
                                transition={GOLD_SOFT_SPRING}
                                className="w-full flex justify-center"
                            >
                                <FilmPlayer film={activeFilm} onClose={closeSheets} />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </GoldShell>
    );
}

/* ── Hero: tonight's scene ──────────────────────────────────────────── */

interface HeroSceneProps {
    recordedToday: boolean;
    todayClip: DailyVideoClip | null;
    partnerName: string;
    settings: VideoMomentSettings | null;
    onRecord: () => void;
}

function HeroScene({ recordedToday, todayClip, partnerName, settings, onRecord }: HeroSceneProps) {
    const dateLabel = new Date().toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });

    return (
        <div
            className="relative overflow-hidden rounded-[1.75rem] p-6"
            style={{
                background:
                    'radial-gradient(130% 100% at 82% 0%, rgba(168,85,247,0.26) 0%, transparent 52%), linear-gradient(150deg, #1f1130 0%, #140a1e 55%, #190e26 100%)',
                border: '1px solid rgba(168,85,247,0.26)',
            }}
        >
            <div className="lp-holo-sheen" />

            <div className="relative z-10">
                <div className="flex items-center justify-between gap-3">
                    <span
                        className="text-[10px] font-bold uppercase tracking-[0.3em]"
                        style={{ color: ACCENT_SOFT }}
                    >
                        Tonight&rsquo;s scene
                    </span>
                    {settings && settings.streakCount > 0 ? (
                        <span
                            className="inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase tracking-[0.14em]"
                            style={{
                                background: 'rgba(246,199,104,0.12)',
                                border: '1px solid rgba(246,199,104,0.3)',
                                color: GOLD.primary,
                            }}
                        >
                            <Flame size={10} />
                            {settings.streakCount}-day streak
                            {settings.longestStreak > settings.streakCount
                                ? ` · best ${settings.longestStreak}`
                                : ''}
                        </span>
                    ) : (
                        <span className="text-[10px] font-semibold shrink-0" style={{ color: GOLD.textLow }}>
                            {dateLabel}
                        </span>
                    )}
                </div>

                <h2
                    className="font-serif text-[1.7rem] leading-[1.08] mt-3"
                    style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                >
                    {recordedToday ? 'Tonight’s take is in the can.' : 'Five seconds of right now.'}
                </h2>
                <p className="mt-2 max-w-[36ch] text-[12.5px] leading-relaxed" style={{ color: GOLD.textMid }}>
                    {recordedToday
                        ? `Come back tomorrow night — ${partnerName}’s scenes stay sealed until the film premieres.`
                        : 'One take a day, sound on. Hold the shutter and let this evening speak for itself.'}
                </p>

                {recordedToday ? (
                    <div className="mt-5 flex items-center gap-4">
                        <TonightFrame clip={todayClip} />
                        <div className="flex-1 min-w-0">
                            <span
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] font-bold uppercase tracking-[0.16em]"
                                style={{
                                    background: 'rgba(246,199,104,0.12)',
                                    border: '1px solid rgba(246,199,104,0.3)',
                                    color: GOLD.primary,
                                }}
                            >
                                <Check size={10} strokeWidth={3} />
                                Scene saved
                            </span>
                            <p className="mt-2 text-[11.5px] leading-snug" style={{ color: GOLD.textLow }}>
                                {todayClip?.recordedAt
                                    ? `One take, kept — ${formatTimeOfDay(todayClip.recordedAt)}.`
                                    : 'One take, kept.'}
                            </p>
                            <motion.button
                                whileTap={{ scale: 0.96 }}
                                transition={GOLD_PRESS_SPRING}
                                onClick={onRecord}
                                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11.5px] font-semibold"
                                style={{
                                    background: 'rgba(255,255,255,0.07)',
                                    border: '1px solid rgba(255,255,255,0.14)',
                                    color: 'rgba(255,250,242,0.85)',
                                }}
                            >
                                <RotateCcw size={12} />
                                Retake tonight
                            </motion.button>
                        </div>
                    </div>
                ) : (
                    <div className="mt-6 flex flex-col items-center gap-3 pb-1">
                        <motion.button
                            whileTap={{ scale: 0.93 }}
                            transition={GOLD_PRESS_SPRING}
                            onClick={onRecord}
                            className="gdv-shutter"
                            aria-label="Record tonight's scene"
                        >
                            <span className="gdv-shutter__halo" />
                            <span className="gdv-shutter__ring" />
                            <span className="gdv-shutter__ring gdv-shutter__ring--inner" />
                            <span className="gdv-shutter__core">
                                <Video size={24} strokeWidth={2} />
                            </span>
                        </motion.button>
                        <p className="text-[11px]" style={{ color: GOLD.textLow }}>
                            Tap to roll — the camera holds you to five seconds
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

/** Today's saved take, mounted in a single film frame. */
function TonightFrame({ clip }: { clip: DailyVideoClip | null }) {
    const [thumb, setThumb] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let created: string | null = null;
        if (!clip) { setThumb(null); return; }
        VideoMomentsService.getThumbnailUrl(clip).then((url) => {
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
    }, [clip?.id, clip?.thumbnailId]);

    return (
        <div className="gdv-frame shrink-0">
            <div className="gdv-frame__cell">
                {thumb ? (
                    <img src={thumb} alt="Today's clip" />
                ) : (
                    <div
                        className="absolute inset-0"
                        style={{ background: 'radial-gradient(120% 90% at 30% 12%, rgba(168,85,247,0.2) 0%, transparent 60%)' }}
                    />
                )}
            </div>
        </div>
    );
}

function formatTimeOfDay(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/* ── Strip legend ───────────────────────────────────────────────────── */

function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <span
            className="inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.16em]"
            style={{ color: GOLD.textLow }}
        >
            <span
                className="w-[7px] h-[7px] rounded-full"
                style={{ background: color, boxShadow: `0 0 8px ${color}66` }}
            />
            {label}
        </span>
    );
}

/* ── Past premieres: poster wall ────────────────────────────────────── */

interface FilmPosterCardProps {
    film: BiweeklyFilm;
    onOpen: () => void;
}

function FilmPosterCard({ film, onOpen }: FilmPosterCardProps) {
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
        <motion.button
            whileTap={{ scale: 0.97 }}
            transition={GOLD_PRESS_SPRING}
            onClick={() => { feedback.tap(); onOpen(); }}
            className="lp-foil block w-full text-left"
        >
            <div
                className="relative overflow-hidden rounded-[27px]"
                style={{ aspectRatio: '3 / 4', background: 'linear-gradient(165deg, #1f1128 0%, #120a18 100%)' }}
            >
                {thumb ? (
                    <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                    <div
                        className="absolute inset-0"
                        style={{ background: 'radial-gradient(120% 90% at 30% 12%, rgba(168,85,247,0.2) 0%, transparent 60%)' }}
                    />
                )}
                <div
                    className="lp-glass absolute top-3 right-3 flex w-8 h-8 items-center justify-center rounded-full"
                    style={{ color: '#f3cd86' }}
                >
                    <Play size={12} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />
                </div>
                <div
                    className="absolute inset-x-0 bottom-0 px-4 pt-12 pb-4"
                    style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(10,5,13,0.9) 72%)' }}
                >
                    <p
                        className="font-serif text-[1.05rem] leading-tight"
                        style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                    >
                        {label}
                    </p>
                    <p
                        className="mt-1 text-[9.5px] font-bold uppercase tracking-[0.18em]"
                        style={{ color: 'rgba(246,199,104,0.7)' }}
                    >
                        {film.clipCount} {film.clipCount === 1 ? 'scene' : 'scenes'}
                    </p>
                </div>
            </div>
        </motion.button>
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
