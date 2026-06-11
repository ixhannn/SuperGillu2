import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Gem, Lock, Share2, X } from 'lucide-react';
import type { ViewState } from '../types';
import { StorageService } from '../services/storage';
import {
    HEIRLOOM_STYLE_LABELS,
    buildHeirloomSchedule,
    collectHeirloom,
    getCollectedHeirloomIds,
    getHeirloomStatsAtDate,
    isHeirloomFree,
    scheduleNextHeirloomStrikeNotification,
    type HeirloomMilestone,
    type HeirloomStrikeStats,
} from '../services/heirlooms';
import { renderHeirloom, type HeirloomRenderData, HEIRLOOM_W, HEIRLOOM_H } from '../components/premium/heirlooms/heirloomArt';
import { GoldShell } from '../components/premium/GoldShell';
import { GOLD, GOLD_PRESS_SPRING, GOLD_SOFT_SPRING, goldRise, goldStagger } from '../components/premium/GoldKit';
import { PremiumModal } from '../components/PremiumModal';
import { daysTogetherFrom } from '../shared/dateOnly.js';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';

const ACCENT = '#e8c97d';

interface HeirloomsViewProps {
    setView: (view: ViewState) => void;
}

/* ── Canvas thumbnail (deterministic, renders once fonts are ready) ─── */

const HeirloomThumb: React.FC<{ data: HeirloomRenderData; full?: boolean }> = ({ data, full }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let cancelled = false;
        const draw = () => {
            if (cancelled || !canvasRef.current) return;
            renderHeirloom(canvasRef.current, data, full ? 1 : 0.34);
        };
        if (typeof document !== 'undefined' && document.fonts?.ready) {
            void document.fonts.ready.then(draw);
        } else {
            draw();
        }
        return () => { cancelled = true; };
    }, [data, full]);

    return (
        <canvas
            ref={canvasRef}
            className="block w-full h-auto"
            style={{ aspectRatio: `${HEIRLOOM_W} / ${HEIRLOOM_H}`, borderRadius: 'inherit' }}
            aria-label={`${data.milestone.title} — heirloom artwork`}
        />
    );
};

/* ── Share / save straight from a freshly rendered canvas ───────────── */

const exportHeirloom = async (data: HeirloomRenderData, mode: 'share' | 'save'): Promise<void> => {
    const canvas = document.createElement('canvas');
    renderHeirloom(canvas, data, 2);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
    if (!blob) {
        toast.show('Could not render the artwork', 'error');
        return;
    }
    const filename = `lior-heirloom-${data.milestone.id}.png`;
    const file = new File([blob], filename, { type: 'image/png' });

    if (mode === 'share' && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], text: `${data.milestone.title} — ${data.myName} & ${data.partnerName}` });
            return;
        } catch {
            /* user cancelled — fall through to download */
        }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast.show('Saved to your downloads', 'success');
};

/* ── The wax seal (CSS-only medallion) ──────────────────────────────── */

/** `still` drops the breathing loop — used for the ceremony's split halves. */
const WaxSeal: React.FC<{ size?: number; still?: boolean }> = ({ size = 84, still }) => (
    <div
        className={`${still ? '' : 'lp-emblem '}relative flex items-center justify-center rounded-full`}
        style={{
            width: size,
            height: size,
            background: 'radial-gradient(circle at 36% 30%, #f3dca4 0%, #e8c97d 38%, #a8853e 100%)',
            boxShadow: '0 14px 34px rgba(232,201,125,0.3), inset 0 2px 4px rgba(255,250,230,0.7), inset 0 -4px 8px rgba(80,56,16,0.45)',
        }}
    >
        <Gem size={Math.round(size * 0.34)} strokeWidth={1.8} style={{ color: '#4a3713' }} />
    </div>
);

/* ── Plaque — edition line, engraving, stats at the strike ──────────── */

const formatStrikeStats = (stats: HeirloomStrikeStats): string => {
    if (stats.memories === 0 && stats.voiceSeconds === 0) {
        return 'Struck before the first memory was kept.';
    }
    const parts = [`${stats.memories} ${stats.memories === 1 ? 'memory' : 'memories'}`];
    if (stats.voiceSeconds >= 60) {
        const minutes = Math.round(stats.voiceSeconds / 60);
        parts.push(`${minutes} minute${minutes === 1 ? '' : 's'} of voice`);
    } else if (stats.voiceSeconds > 0) {
        parts.push(`${stats.voiceSeconds} seconds of voice`);
    }
    return `By this day: ${parts.join(', ')}`;
};

const HeirloomPlaque: React.FC<{ milestone: HeirloomMilestone; delay?: number }> = ({ milestone, delay = 0 }) => {
    const statsLine = useMemo(() => formatStrikeStats(getHeirloomStatsAtDate(milestone.date)), [milestone]);
    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...GOLD_SOFT_SPRING, delay }}
            className="lq mt-3 rounded-[1.2rem] px-5 py-4 text-center"
        >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
                {HEIRLOOM_STYLE_LABELS[milestone.style]} · 1 of 1 · No. {String(milestone.strikeNo).padStart(3, '0')}
            </p>
            <p className="font-serif italic mt-2 text-[13.5px] leading-snug" style={{ color: 'rgba(255,251,250,0.88)' }}>
                “{milestone.engraving}”
            </p>
            <p className="mt-2 text-[11px]" style={{ color: GOLD.textLow }}>
                {statsLine}
            </p>
        </motion.div>
    );
};

/* ── Main view ──────────────────────────────────────────────────────── */

export const HeirloomsView: React.FC<HeirloomsViewProps> = (_props) => {
    const profile = useMemo(() => StorageService.getCoupleProfile(), []);
    const myName = profile.myName?.trim() || 'You';
    const partnerName = profile.partnerName?.trim() || 'Your love';

    const schedule = useMemo(() => buildHeirloomSchedule(), []);
    const [collected, setCollected] = useState<Set<string>>(() => getCollectedHeirloomIds());
    const [isPremium, setIsPremium] = useState(() => !!profile.isPremium);
    const [paywallOpen, setPaywallOpen] = useState(false);
    const [ceremony, setCeremony] = useState<HeirloomMilestone | null>(null);
    const [sealBroken, setSealBroken] = useState(false);
    const [artReady, setArtReady] = useState(false);
    const [viewer, setViewer] = useState<HeirloomMilestone | null>(null);
    const [exporting, setExporting] = useState(false);

    const reduceMotion = useMemo(
        () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        [],
    );

    useEffect(() => {
        const onChange = () => setIsPremium(true);
        window.addEventListener('lior:premium-changed', onChange);
        return () => window.removeEventListener('lior:premium-changed', onChange);
    }, []);

    // Ceremony staging: the seal splits first, then the artwork springs in.
    useEffect(() => {
        if (!sealBroken) {
            setArtReady(false);
            return;
        }
        if (reduceMotion) {
            setArtReady(true);
            return;
        }
        const timer = window.setTimeout(() => setArtReady(true), 560);
        return () => window.clearTimeout(timer);
    }, [sealBroken, reduceMotion]);

    // Best effort: a local notification on the morning of the next strike.
    useEffect(() => {
        void scheduleNextHeirloomStrikeNotification(schedule.next);
    }, [schedule]);

    // Hardware back closes whichever overlay is up.
    useEffect(() => {
        if (!ceremony && !viewer) return;
        const handleBack = (e: Event) => {
            e.preventDefault();
            setCeremony(null);
            setSealBroken(false);
            setViewer(null);
        };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [ceremony, viewer]);

    const renderDataFor = useCallback((m: HeirloomMilestone): HeirloomRenderData => {
        const moods = StorageService.getMoodEntries().slice(-24).map((e) => e.mood);
        return {
            milestone: m,
            myName,
            partnerName,
            dayCount: m.kind === 'days' ? m.value : Math.max(0, daysTogetherFrom(profile.anniversaryDate, m.date)),
            moods,
            // What the mint saw on the strike day — keeps the piece stable
            // as new memories are added afterwards.
            memoryCount: getHeirloomStatsAtDate(m.date).memories,
        };
    }, [myName, partnerName, profile.anniversaryDate]);

    const openSealed = useCallback((m: HeirloomMilestone) => {
        feedback.tap();
        if (!isHeirloomFree(m) && !isPremium) {
            setPaywallOpen(true);
            return;
        }
        setSealBroken(false);
        setCeremony(m);
    }, [isPremium]);

    const breakSeal = useCallback(() => {
        if (!ceremony || sealBroken) return;
        feedback.celebrate();
        setSealBroken(true);
        collectHeirloom(ceremony.id);
        setCollected(getCollectedHeirloomIds());
    }, [ceremony, sealBroken]);

    const handleExport = useCallback(async (m: HeirloomMilestone, mode: 'share' | 'save') => {
        if (exporting) return;
        feedback.tap();
        setExporting(true);
        try {
            await exportHeirloom(renderDataFor(m), mode);
        } finally {
            setExporting(false);
        }
    }, [exporting, renderDataFor]);

    const hasSchedule = schedule.arrived.length > 0 || schedule.next !== null;
    const openedCount = useMemo(
        () => schedule.arrived.filter((m) => collected.has(m.id)).length,
        [schedule, collected],
    );

    /* ── Overlays (portal rule: AnimatePresence INSIDE the portal) ──── */

    const overlays = typeof document !== 'undefined' && ReactDOM.createPortal(
        <>
            <AnimatePresence>
                {ceremony && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.22 } }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${ceremony.title} heirloom`}
                        className="fixed inset-0 z-[190] flex flex-col items-center justify-center overflow-y-auto px-7 py-16"
                        style={{ background: 'rgba(7,6,10,0.93)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
                    >
                        <motion.button
                            whileTap={{ scale: 0.86 }}
                            onClick={() => { feedback.tap(); setCeremony(null); setSealBroken(false); }}
                            aria-label="Close"
                            className="lp-glass absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center"
                            style={{ color: 'rgba(255,248,248,0.85)', top: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}
                        >
                            <X size={17} strokeWidth={2.4} />
                        </motion.button>

                        {!sealBroken ? (
                            <motion.button
                                key="sealed"
                                initial={{ opacity: 0, scale: 0.86, y: 24 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 1.06, transition: { duration: 0.18 } }}
                                transition={GOLD_SOFT_SPRING}
                                onClick={breakSeal}
                                className="my-auto flex flex-col items-center text-center"
                            >
                                <WaxSeal size={108} />
                                <p className="font-serif mt-8 text-[1.7rem] font-bold leading-tight" style={{ color: 'rgba(255,251,250,0.97)', letterSpacing: '-0.02em' }}>
                                    {ceremony.title}
                                </p>
                                <p className="mt-2 text-[13.5px]" style={{ color: 'rgba(255,248,248,0.5)' }}>
                                    Struck {ceremony.dateLabel} · No. {String(ceremony.strikeNo).padStart(3, '0')}
                                </p>
                                <p className="mt-7 text-[13px] font-bold tracking-wide" style={{ color: ACCENT }}>
                                    Tap the seal to open it
                                </p>
                            </motion.button>
                        ) : !artReady ? (
                            /* Stage one: the wax splits, the halves drift apart */
                            <div key="split" className="my-auto flex flex-col items-center text-center" aria-hidden="true">
                                <div className="relative" style={{ width: 108, height: 108 }}>
                                    <motion.div
                                        className="absolute inset-0"
                                        style={{ clipPath: 'inset(0 50% 0 0)', willChange: 'transform' }}
                                        initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                                        animate={{ x: -62, y: 12, rotate: -26, opacity: 0 }}
                                        transition={GOLD_SOFT_SPRING}
                                    >
                                        <WaxSeal size={108} still />
                                    </motion.div>
                                    <motion.div
                                        className="absolute inset-0"
                                        style={{ clipPath: 'inset(0 0 0 50%)', willChange: 'transform' }}
                                        initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                                        animate={{ x: 62, y: -12, rotate: 26, opacity: 0 }}
                                        transition={GOLD_SOFT_SPRING}
                                    >
                                        <WaxSeal size={108} still />
                                    </motion.div>
                                </div>
                                <motion.div
                                    initial={{ opacity: 1 }}
                                    animate={{ opacity: 0 }}
                                    transition={GOLD_SOFT_SPRING}
                                    className="flex flex-col items-center"
                                >
                                    <p className="font-serif mt-8 text-[1.7rem] font-bold leading-tight" style={{ color: 'rgba(255,251,250,0.97)', letterSpacing: '-0.02em' }}>
                                        {ceremony.title}
                                    </p>
                                    <p className="mt-2 text-[13.5px]" style={{ color: 'rgba(255,248,248,0.5)' }}>
                                        Struck {ceremony.dateLabel} · No. {String(ceremony.strikeNo).padStart(3, '0')}
                                    </p>
                                    <p className="mt-7 text-[13px] font-bold tracking-wide" style={{ color: ACCENT }}>
                                        Tap the seal to open it
                                    </p>
                                </motion.div>
                            </div>
                        ) : (
                            /* Stage two: the artwork springs in, then the plaque */
                            <motion.div
                                key="revealed"
                                initial={{ opacity: 0, scale: 0.88, rotateX: 14 }}
                                animate={{ opacity: 1, scale: 1, rotateX: 0 }}
                                transition={{ ...GOLD_SOFT_SPRING, delay: 0.1 }}
                                className="my-auto w-full max-w-[330px]"
                                style={{ perspective: 1000 }}
                            >
                                <div className="lp-burst" aria-hidden="true">
                                    {Array.from({ length: 16 }, (_, i) => {
                                        const angle = (i / 16) * Math.PI * 2;
                                        return (
                                            <span
                                                key={i}
                                                className="lp-burst__p"
                                                style={{
                                                    '--dx': `${Math.round(Math.cos(angle) * (90 + (i % 4) * 22))}px`,
                                                    '--dy': `${Math.round(Math.sin(angle) * (76 + (i % 3) * 20))}px`,
                                                    animationDelay: `${(i % 5) * 0.03}s`,
                                                } as React.CSSProperties}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="lp-foil">
                                    <div className="overflow-hidden rounded-[26px]">
                                        <HeirloomThumb data={renderDataFor(ceremony)} full />
                                    </div>
                                </div>
                                <HeirloomPlaque milestone={ceremony} delay={0.42} />
                                <div className="mt-4 flex gap-2.5">
                                    <motion.button
                                        whileTap={{ scale: 0.96 }}
                                        transition={GOLD_PRESS_SPRING}
                                        onClick={() => void handleExport(ceremony, 'share')}
                                        className="lp-cta flex-1 h-[50px] rounded-2xl font-bold text-[14px] inline-flex items-center justify-center gap-2"
                                        style={{ background: `linear-gradient(135deg, ${GOLD.primary} 0%, #8b5cf6 100%)`, color: '#ffffff', boxShadow: '0 10px 28px rgba(255,92,124,0.3)' }}
                                    >
                                        <Share2 size={15} strokeWidth={2.4} />
                                        Share it
                                    </motion.button>
                                    <motion.button
                                        whileTap={{ scale: 0.96 }}
                                        transition={GOLD_PRESS_SPRING}
                                        onClick={() => void handleExport(ceremony, 'save')}
                                        aria-label="Save image"
                                        className="lp-glass w-[50px] h-[50px] rounded-2xl flex items-center justify-center"
                                        style={{ color: 'rgba(255,248,248,0.85)' }}
                                    >
                                        <Download size={17} strokeWidth={2.2} />
                                    </motion.button>
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {viewer && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.2 } }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${viewer.title} heirloom`}
                        className="fixed inset-0 z-[190] flex flex-col items-center justify-center overflow-y-auto px-7 py-16"
                        style={{ background: 'rgba(7,6,10,0.93)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
                        onClick={() => { feedback.tap(); setViewer(null); }}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: 18 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={GOLD_SOFT_SPRING}
                            className="my-auto w-full max-w-[330px]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="lp-foil">
                                <div className="overflow-hidden rounded-[26px]">
                                    <HeirloomThumb data={renderDataFor(viewer)} full />
                                </div>
                            </div>
                            <HeirloomPlaque milestone={viewer} delay={0.12} />
                            <div className="mt-4 flex gap-2.5">
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={() => void handleExport(viewer, 'share')}
                                    className="lp-cta flex-1 h-[50px] rounded-2xl font-bold text-[14px] inline-flex items-center justify-center gap-2"
                                    style={{ background: `linear-gradient(135deg, ${GOLD.primary} 0%, #8b5cf6 100%)`, color: '#ffffff', boxShadow: '0 10px 28px rgba(255,92,124,0.3)' }}
                                >
                                    <Share2 size={15} strokeWidth={2.4} />
                                    Share it
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={() => void handleExport(viewer, 'save')}
                                    aria-label="Save image"
                                    className="lp-glass w-[50px] h-[50px] rounded-2xl flex items-center justify-center"
                                    style={{ color: 'rgba(255,248,248,0.85)' }}
                                >
                                    <Download size={17} strokeWidth={2.2} />
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={() => { feedback.tap(); setViewer(null); }}
                                    aria-label="Close"
                                    className="lp-glass w-[50px] h-[50px] rounded-2xl flex items-center justify-center"
                                    style={{ color: 'rgba(255,248,248,0.85)' }}
                                >
                                    <X size={17} strokeWidth={2.2} />
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>,
        document.body,
    );

    return (
        <GoldShell eyebrow="Heirlooms" accent={ACCENT}>
            <motion.div initial="hidden" animate="visible" variants={goldStagger}>
                {/* ── Hero ──────────────────────────────────────────── */}
                <motion.div variants={goldRise} className="flex flex-col items-center text-center pt-7 pb-8">
                    <div className="lp-emblem mb-6">
                        <div
                            className="relative flex items-center justify-center w-[76px] h-[76px] rounded-[24px]"
                            style={{
                                background: 'linear-gradient(140deg, #e8c97d 0%, #a8853e 100%)',
                                boxShadow: '0 22px 60px rgba(232,201,125,0.3), inset 0 1px 0 rgba(255,250,230,0.5)',
                            }}
                        >
                            <Gem size={34} strokeWidth={1.6} style={{ color: '#3d2d0f' }} />
                        </div>
                    </div>
                    <h1 className="font-serif font-bold leading-[1.05]" style={{ fontSize: 'clamp(2.1rem, 8.6vw, 2.5rem)', letterSpacing: '-0.025em', color: GOLD.textHigh }}>
                        Struck on the days
                        <br />
                        <span className="lp-shimmer-text">that matter</span>
                    </h1>
                    <p className="mt-4 max-w-[31ch] text-[14px] leading-relaxed" style={{ color: GOLD.textMid }}>
                        A piece of art, made from your real life, arrives on every milestone. No two couples ever strike the same one.
                    </p>
                </motion.div>

                {!hasSchedule && (
                    <motion.div variants={goldRise} className="lq rounded-[1.6rem] p-6 text-center">
                        <p className="font-serif text-[1.2rem]" style={{ color: GOLD.textHigh }}>Set your anniversary first</p>
                        <p className="mt-2 text-[12.5px]" style={{ color: GOLD.textMid }}>
                            Heirlooms are struck from the day your story began — add it in your profile and the mint starts working.
                        </p>
                    </motion.div>
                )}

                {/* ── Next strike ───────────────────────────────────── */}
                {schedule.next && (
                    <>
                        <motion.div variants={goldRise} className="mb-4 flex items-baseline gap-3">
                            <span className="font-serif text-[17px] font-bold tracking-[-0.01em]" style={{ color: GOLD.textHigh }}>
                                Being struck now
                            </span>
                            <div className="flex-1 h-px self-center" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
                        </motion.div>

                        <motion.div
                            variants={goldRise}
                            className="lq lq--sheen relative overflow-hidden rounded-[1.8rem] p-6"
                            style={{ background: 'linear-gradient(135deg, rgba(232,201,125,0.13) 0%, rgba(255,255,255,0.02) 60%)' }}
                        >
                            <Gem size={130} strokeWidth={1} className="lq-ghost" style={{ color: ACCENT }} aria-hidden="true" />
                            <div className="relative z-10 flex items-center gap-5">
                                <WaxSeal size={72} />
                                <div className="min-w-0">
                                    <p className="font-serif text-[1.35rem] font-bold leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.015em' }}>
                                        {schedule.next.title}
                                    </p>
                                    <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: GOLD.textMid }}>
                                        {schedule.next.daysUntil === 0
                                            ? 'Arrives today.'
                                            : schedule.next.daysUntil === 1
                                                ? 'Arrives tomorrow.'
                                                : `Arrives in ${schedule.next.daysUntil} days — ${schedule.next.dateLabel}.`}
                                    </p>
                                </div>
                            </div>
                            {/* How far between the last strike and this one */}
                            <div className="relative z-10 mt-5" aria-hidden="true">
                                <div className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                    <motion.div
                                        className="h-full w-full rounded-full"
                                        style={{ transformOrigin: 'left', background: `linear-gradient(90deg, ${ACCENT} 0%, #ff8fa6 100%)` }}
                                        initial={{ scaleX: reduceMotion ? schedule.progressToNext : 0 }}
                                        whileInView={{ scaleX: schedule.progressToNext }}
                                        viewport={{ once: true, amount: 0.4 }}
                                        transition={GOLD_SOFT_SPRING}
                                    />
                                </div>
                            </div>
                        </motion.div>

                        {schedule.horizon.length > 0 && (
                            <motion.div variants={goldRise} className="mt-3 flex flex-col gap-2">
                                {schedule.horizon.map((m) => (
                                    <div key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ACCENT, opacity: 0.6 }} aria-hidden="true" />
                                        <span className="flex-1 text-[13px] font-semibold" style={{ color: 'rgba(255,251,250,0.75)' }}>{m.title}</span>
                                        <span className="text-[11.5px]" style={{ color: GOLD.textLow }}>{m.dateLabel}</span>
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </>
                )}

                {/* ── The gallery ───────────────────────────────────── */}
                {schedule.arrived.length > 0 && (
                    <>
                        <motion.div variants={goldRise} className="mt-10 mb-4 flex items-baseline gap-3">
                            <span className="font-serif text-[17px] font-bold tracking-[-0.01em]" style={{ color: GOLD.textHigh }}>
                                Your gallery
                            </span>
                            <div className="flex-1 h-px self-center" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
                            <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: GOLD.textLow }}>
                                {openedCount} of {schedule.arrived.length} strikes opened
                            </span>
                        </motion.div>

                        <motion.div variants={goldRise} className="grid grid-cols-2 gap-3">
                            {schedule.arrived.map((m) => {
                                const isCollected = collected.has(m.id);
                                const locked = !isHeirloomFree(m) && !isPremium;
                                return (
                                    <motion.button
                                        key={m.id}
                                        whileTap={{ scale: 0.97 }}
                                        transition={GOLD_PRESS_SPRING}
                                        onClick={() => {
                                            if (isCollected) { feedback.tap(); setViewer(m); }
                                            else openSealed(m);
                                        }}
                                        className="lq lq-press relative overflow-hidden rounded-[1.3rem] text-left"
                                    >
                                        {isCollected ? (
                                            <div className="p-1.5">
                                                <div className="overflow-hidden rounded-[0.95rem]">
                                                    <HeirloomThumb data={renderDataFor(m)} />
                                                </div>
                                                <div className="px-2 pt-2 pb-1.5">
                                                    <p className="text-[12px] font-semibold truncate" style={{ color: 'rgba(255,251,250,0.9)' }}>{m.title}</p>
                                                    <p className="text-[10px] mt-0.5" style={{ color: GOLD.textLow }}>No. {String(m.strikeNo).padStart(3, '0')}</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                className="flex flex-col items-center justify-center text-center px-3"
                                                style={{ aspectRatio: '3 / 4.35', background: 'linear-gradient(160deg, rgba(232,201,125,0.08) 0%, rgba(255,255,255,0.015) 70%)' }}
                                            >
                                                <WaxSeal size={58} />
                                                <p className="mt-3.5 text-[12.5px] font-semibold leading-tight" style={{ color: 'rgba(255,251,250,0.9)' }}>{m.title}</p>
                                                <p className="mt-1 text-[10px]" style={{ color: GOLD.textLow }}>{m.dateLabel}</p>
                                                <p className="mt-3 inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-wide" style={{ color: ACCENT }}>
                                                    {locked && <Lock size={10} strokeWidth={2.6} />}
                                                    {locked ? 'Gold opens it' : 'Sealed — tap to open'}
                                                </p>
                                            </div>
                                        )}
                                    </motion.button>
                                );
                            })}
                        </motion.div>
                    </>
                )}

                <motion.div variants={goldRise} className="mt-9 text-center">
                    <p className="text-[11.5px] leading-relaxed mx-auto max-w-[34ch]" style={{ color: GOLD.textLow }}>
                        Every heirloom is yours to keep — share it, print it, frame it. The first one is on us; Gold opens every strike, past and future.
                    </p>
                </motion.div>
            </motion.div>

            {overlays}
            <PremiumModal isOpen={paywallOpen} onClose={() => setPaywallOpen(false)} featureContext="generic" />
        </GoldShell>
    );
};
