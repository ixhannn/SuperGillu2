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
import { renderHeirloom, HEIRLOOM_W, type HeirloomRenderData } from '../components/premium/heirlooms/heirloomArt';
import { HeirloomThumb, buildHeirloomRenderData } from '../components/premium/heirlooms/HeirloomThumb';
import { GoldShell } from '../components/premium/GoldShell';
import { GOLD, GOLD_PRESS_SPRING, GOLD_SOFT_SPRING, goldRise, goldStagger, useCardTilt } from '../components/premium/GoldKit';
import { PremiumModal } from '../components/PremiumModal';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';

const ACCENT = '#e8c97d';

interface HeirloomsViewProps {
    setView: (view: ViewState) => void;
}

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

/* ── Veiled face — the artwork glowing through frosted glass ────────── */

/** Color grade per art style: dark fields get their glow amplified;
    the cream letterpress is DIMMED instead — brightening near-white
    paper would clip it and drown the text above. */
const veilFilterFor = (style: HeirloomMilestone['style'], locked: boolean): string => {
    if (style === 'letterpress') {
        return locked ? 'saturate(1.05) brightness(0.56)' : 'saturate(1.1) brightness(0.68)';
    }
    return locked ? 'saturate(1.35) brightness(1.1)' : 'saturate(1.45) brightness(1.32)';
};

const SealedFace: React.FC<{
    data: HeirloomRenderData;
    locked: boolean;
    sealSize?: number;
    scale?: number;
    aspect?: string;
    children?: React.ReactNode;
}> = ({ data, locked, sealSize = 52, scale = 0.22, aspect = '3 / 4', children }) => (
    <div className="lp-veil w-full" style={{ aspectRatio: aspect, borderRadius: 'inherit' }}>
        <div
            className="lp-veil__art"
            style={{ filter: veilFilterFor(data.milestone.style, locked) }}
            aria-hidden="true"
        >
            <HeirloomThumb data={data} scale={scale} veil />
        </div>
        <div className="lp-veil__scrim" aria-hidden="true" />
        <span className="lp-style-chip absolute top-2.5 left-2.5 z-10">
            {HEIRLOOM_STYLE_LABELS[data.milestone.style]}
        </span>
        <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-3"
            style={{ background: 'radial-gradient(64% 60% at 50% 50%, rgba(7,6,10,0.5) 0%, rgba(7,6,10,0.26) 56%, transparent 80%)' }}
        >
            <WaxSeal size={sealSize} />
            {children}
        </div>
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

    // Stable render-data identities — thumbnails draw once per milestone,
    // not once per re-render (the gallery now shows a canvas in EVERY card).
    const renderDataCache = useRef(new Map<string, HeirloomRenderData>());
    const renderDataFor = useCallback((m: HeirloomMilestone): HeirloomRenderData => {
        const cache = renderDataCache.current;
        let data = cache.get(m.id);
        if (!data) {
            data = buildHeirloomRenderData(m);
            cache.set(m.id, data);
        }
        return data;
    }, []);

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

    // Marquee: the newest opened piece in full glory — or, before anything
    // is opened, the oldest sealed strike glowing through its veil.
    const marquee = useMemo(() => {
        const newestCollected = schedule.arrived.find((m) => collected.has(m.id));
        if (newestCollected) return newestCollected;
        return [...schedule.arrived].reverse().find((m) => !collected.has(m.id)) ?? null;
    }, [schedule, collected]);
    const marqueeIsSealed = !!marquee && !collected.has(marquee.id);
    const tilt = useCardTilt(6, 8, reduceMotion);

    // Crisp on high-DPI: back the marquee canvas with enough device pixels
    // for its ~330 CSS px display width (the art bakes in its own caption).
    const marqueeScale = useMemo(() => {
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        return Math.min(1, (330 * dpr) / HEIRLOOM_W);
    }, []);

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
                                        <HeirloomThumb data={renderDataFor(ceremony)} scale={1} />
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
                                    <HeirloomThumb data={renderDataFor(viewer)} scale={1} />
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
                <motion.div variants={goldRise} className="flex flex-col items-center text-center pt-6 pb-7">
                    <h1 className="font-serif font-bold leading-[1.05]" style={{ fontSize: 'clamp(2.1rem, 8.6vw, 2.5rem)', letterSpacing: '-0.025em', color: GOLD.textHigh }}>
                        Struck on the days
                        <br />
                        <span className="lp-shimmer-text">that matter</span>
                    </h1>
                    <p className="mt-3.5 max-w-[31ch] text-[14px] leading-relaxed" style={{ color: GOLD.textMid }}>
                        A piece of art, made from your real life, arrives on every milestone. No two couples ever strike the same one.
                    </p>
                </motion.div>

                {/* ── Marquee — the art itself leads the page ───────── */}
                {marquee && (
                    <motion.div variants={goldRise} className="mb-9" style={{ perspective: 1100 }}>
                        <motion.div
                            onPointerEnter={tilt.onPointerEnter}
                            onPointerMove={tilt.onPointerMove}
                            onPointerLeave={tilt.onPointerLeave}
                            style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY, transformStyle: 'preserve-3d' }}
                            className="lp-foil mx-auto w-full max-w-[330px]"
                        >
                            <motion.button
                                whileTap={{ scale: 0.985 }}
                                transition={GOLD_PRESS_SPRING}
                                onClick={() => {
                                    if (marqueeIsSealed) openSealed(marquee);
                                    else { feedback.tap(); setViewer(marquee); }
                                }}
                                className="relative block w-full overflow-hidden rounded-[26px] text-left"
                            >
                                {marqueeIsSealed ? (
                                    <SealedFace
                                        data={renderDataFor(marquee)}
                                        locked={!isHeirloomFree(marquee) && !isPremium}
                                        sealSize={96}
                                        scale={0.45}
                                    >
                                        <p className="font-serif mt-5 text-[1.45rem] font-bold leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.015em' }}>
                                            {marquee.title}
                                        </p>
                                        <p className="mt-1.5 text-[12px]" style={{ color: GOLD.textMid }}>
                                            Struck {marquee.dateLabel} · No. {String(marquee.strikeNo).padStart(3, '0')}
                                        </p>
                                        <p className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-bold tracking-wide" style={{ color: ACCENT }}>
                                            {!isHeirloomFree(marquee) && !isPremium && <Lock size={11} strokeWidth={2.6} />}
                                            {!isHeirloomFree(marquee) && !isPremium ? 'Gold breaks the seal' : 'Tap to break the seal'}
                                        </p>
                                    </SealedFace>
                                ) : (
                                    <>
                                        <HeirloomThumb data={renderDataFor(marquee)} scale={marqueeScale} />
                                        {/* The canvas captions itself — chrome stays on the top edge */}
                                        <div className="absolute inset-x-0 top-0 flex items-start justify-between px-3 pt-3">
                                            <span className="lp-style-chip">
                                                {HEIRLOOM_STYLE_LABELS[marquee.style]} · No. {String(marquee.strikeNo).padStart(3, '0')}
                                            </span>
                                            <span
                                                className="text-[10px] font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-full"
                                                style={{ color: ACCENT, background: 'rgba(10,8,14,0.55)', border: '1px solid rgba(232,201,125,0.32)' }}
                                            >
                                                View
                                            </span>
                                        </div>
                                    </>
                                )}
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}

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
                                <WaxSeal size={68} />
                                <div className="min-w-0 flex-1">
                                    <p className="font-serif text-[1.3rem] font-bold leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.015em' }}>
                                        {schedule.next.title}
                                    </p>
                                    <div className="mt-1.5 flex items-baseline gap-2">
                                        {schedule.next.daysUntil <= 1 ? (
                                            <span className="font-serif text-[1.9rem] font-bold leading-none" style={{ color: '#f3dca4' }}>
                                                {schedule.next.daysUntil === 0 ? 'Today' : 'Tomorrow'}
                                            </span>
                                        ) : (
                                            <>
                                                <span className="font-serif text-[2.1rem] font-bold leading-none" style={{ color: '#f3dca4' }}>
                                                    {schedule.next.daysUntil.toLocaleString()}
                                                </span>
                                                <span className="text-[12.5px] font-medium" style={{ color: GOLD.textMid }}>
                                                    days away
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                                        <span className="lp-style-chip">
                                            {HEIRLOOM_STYLE_LABELS[schedule.next.style]} · No. {String(schedule.next.strikeNo).padStart(3, '0')}
                                        </span>
                                        <span className="text-[11px]" style={{ color: GOLD.textLow }}>
                                            {schedule.next.dateLabel}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {/* How far between the last strike and this one */}
                            <div className="relative z-10 mt-5" aria-hidden="true">
                                <div className="relative h-[3px] w-full rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                    <motion.div
                                        className="absolute inset-y-0 left-0 rounded-full"
                                        style={{
                                            width: `${Math.max(2, schedule.progressToNext * 100)}%`,
                                            transformOrigin: 'left',
                                            background: `linear-gradient(90deg, ${ACCENT} 0%, #ff8fa6 100%)`,
                                        }}
                                        initial={{ scaleX: reduceMotion ? 1 : 0 }}
                                        whileInView={{ scaleX: 1 }}
                                        viewport={{ once: true, amount: 0.4 }}
                                        transition={GOLD_SOFT_SPRING}
                                    />
                                    {/* Comet head riding the leading edge */}
                                    <motion.span
                                        className="absolute top-1/2 w-[7px] h-[7px] rounded-full"
                                        style={{
                                            left: `calc(${Math.max(2, schedule.progressToNext * 100)}% - 4px)`,
                                            translateY: '-50%',
                                            background: '#ffe9b8',
                                            boxShadow: '0 0 12px 2px rgba(232,201,125,0.8)',
                                        }}
                                        initial={{ opacity: reduceMotion ? 1 : 0, scale: reduceMotion ? 1 : 0.4 }}
                                        whileInView={{ opacity: 1, scale: 1 }}
                                        viewport={{ once: true, amount: 0.4 }}
                                        transition={{ ...GOLD_SOFT_SPRING, delay: reduceMotion ? 0 : 0.34 }}
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
                                                    <p className="text-[10px] mt-0.5" style={{ color: GOLD.textLow }}>
                                                        {HEIRLOOM_STYLE_LABELS[m.style]} · No. {String(m.strikeNo).padStart(3, '0')}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <SealedFace data={renderDataFor(m)} locked={locked} sealSize={52} aspect="3 / 4.35">
                                                <p className="mt-3 text-[12.5px] font-semibold leading-tight" style={{ color: 'rgba(255,251,250,0.92)' }}>{m.title}</p>
                                                <p className="mt-1 text-[10px]" style={{ color: 'rgba(255,248,248,0.5)' }}>{m.dateLabel}</p>
                                                <p className="mt-2.5 inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-wide" style={{ color: ACCENT }}>
                                                    {locked && <Lock size={10} strokeWidth={2.6} />}
                                                    {locked ? 'Gold opens it' : 'Sealed — tap to open'}
                                                </p>
                                            </SealedFace>
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
