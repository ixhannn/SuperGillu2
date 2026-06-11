import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, animate, useMotionValue, type PanInfo } from 'framer-motion';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import type { WeeklyRecap } from '../../types';
import { toast } from '../../utils/toast';
import { feedback } from '../../utils/feedback';
import { GOLD, GOLD_PRESS_SPRING } from '../premium/GoldKit';
import { deriveDuotone } from './goldPalette';

interface RecapShareSheetProps {
    recap: WeeklyRecap;
    open: boolean;
    onClose: () => void;
}

function buildSummary(recap: WeeklyRecap): string {
    const { tagline, stats, weekStart, weekEnd } = recap;
    const lines: string[] = [
        `✦ ${tagline}`,
        `Week of ${weekStart} – ${weekEnd}`,
        '',
    ];
    if (stats.memoriesCount > 0) lines.push(`${stats.memoriesCount} memories`);
    if (stats.dailyClipsCount > 0) lines.push(`${stats.dailyClipsCount} clips`);
    if (stats.bothRecordedDays > 0) lines.push(`${stats.bothRecordedDays} shared days`);
    if (stats.moodsLogged > 0) lines.push(`mood ${stats.avgMoodScore}/5 · trend ${stats.moodTrend}`);
    lines.push('');
    lines.push('— Lior');
    return lines.join('\n');
}

/**
 * Renders a simple PNG card via canvas. No external dep.
 * 1080x1350 (portrait), readable on socials.
 */
async function renderPngCard(recap: WeeklyRecap): Promise<Blob | null> {
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const { palette, tagline, stats, weekStart, weekEnd } = recap;

    // Base
    ctx.fillStyle = palette.base;
    ctx.fillRect(0, 0, W, H);

    // Vignette (linear approximation of the radial we can't fully replicate)
    const vignette = ctx.createRadialGradient(W / 2, 0, 20, W / 2, H / 2, H);
    vignette.addColorStop(0, palette.accent + '26');
    vignette.addColorStop(1, palette.base + '00');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    // Eyebrow
    ctx.fillStyle = palette.muted;
    ctx.font = '500 32px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${weekStart} – ${weekEnd}`, 80, 180);

    // Headline
    ctx.fillStyle = palette.textOnBase;
    ctx.font = '700 96px Georgia, "Times New Roman", serif';
    wrapText(ctx, tagline, 80, 320, W - 160, 112);

    // Stats block
    const y0 = 720;
    ctx.font = '600 46px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillStyle = palette.accent;
    const statLines = [
        `${stats.memoriesCount} memories`,
        `${stats.dailyClipsCount} clips`,
        `${stats.bothRecordedDays} shared days`,
    ];
    statLines.forEach((line, i) => {
        ctx.fillText(line, 80, y0 + i * 72);
    });

    // Signature
    ctx.fillStyle = palette.muted;
    ctx.font = '500 30px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.fillText('Lior · Weekly Recap', 80, H - 100);

    return new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png', 0.95);
    });
}

function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
) {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            ctx.fillText(line, x, cy);
            line = word;
            cy += lineHeight;
        } else {
            line = test;
        }
    });
    if (line) ctx.fillText(line, x, cy);
}

function formatIssueRange(weekStart: string, weekEnd: string): string {
    const fmt = (iso: string) => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

// Sheet entrance/snap springs — copied from the PremiumModal sheet pattern.
const SHEET_SPRING = { type: 'spring', stiffness: 400, damping: 41, mass: 1 } as const;

/** Share sheet — the gold bottom sheet (portal + pan-to-dismiss + hardware back). */
export function RecapShareSheet({ recap, open, onClose }: RecapShareSheetProps) {
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);
    const duo = useMemo(() => deriveDuotone(recap.palette), [recap.palette]);

    useEffect(() => {
        if (!open) return;
        const handleBack = (e: Event) => { e.preventDefault(); onClose(); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [open, onClose]);

    // Pan-based pull-to-dismiss (drag + exit on the same node breaks
    // AnimatePresence unmounting, so the sheet is panned manually).
    const sheetY = useMotionValue(0);

    // A close mid-pan would leave sheetY offset and the next open would
    // start displaced — style motion values win over `animate` targets.
    useEffect(() => {
        if (!open) sheetY.set(0);
    }, [open, sheetY]);

    const handlePan = useCallback((_: unknown, info: PanInfo) => {
        sheetY.set(info.offset.y > 0 ? info.offset.y : info.offset.y * 0.06);
    }, [sheetY]);

    const handlePanEnd = useCallback((_: unknown, info: PanInfo) => {
        if (info.offset.y > 130 || info.velocity.y > 700) {
            feedback.tap();
            onClose();
        } else {
            animate(sheetY, 0, { type: 'spring', stiffness: 420, damping: 34 });
        }
    }, [onClose, sheetY]);

    const handleCopy = async () => {
        feedback.tap();
        try {
            await navigator.clipboard.writeText(buildSummary(recap));
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            toast.show('Could not copy', 'error');
        }
    };

    const handleDownload = async () => {
        feedback.tap();
        setBusy(true);
        try {
            const blob = await renderPngCard(recap);
            if (!blob) {
                toast.show('Could not render card', 'error');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lior-recap-${recap.weekStart}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } finally {
            setBusy(false);
        }
    };

    const handleShare = async () => {
        feedback.tap();
        setBusy(true);
        try {
            const blob = await renderPngCard(recap);
            if (!blob) { toast.show('Could not render card', 'error'); return; }
            const file = new File([blob], `lior-recap-${recap.weekStart}.png`, { type: 'image/png' });
            const canShare = (navigator as Navigator & { canShare?: (data?: ShareData) => boolean }).canShare;
            if (canShare && canShare({ files: [file] })) {
                await navigator.share({ files: [file], text: buildSummary(recap) });
            } else if (navigator.share) {
                await navigator.share({ text: buildSummary(recap) });
            } else {
                handleDownload();
            }
        } catch {
            /* user cancelled */
        } finally {
            setBusy(false);
        }
    };

    // Portal OUTSIDE AnimatePresence: React 19 portals are not valid elements,
    // so AnimatePresence would silently drop a portal child and render nothing.
    return ReactDOM.createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.22 } }}
                    className="fixed inset-0 z-[200] flex items-end justify-center"
                    style={{ backgroundColor: 'rgba(13,7,15,0.66)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ y: '104%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '104%', transition: { duration: 0.3, ease: [0.4, 0, 0.7, 0.2] } }}
                        transition={SHEET_SPRING}
                        onPan={handlePan}
                        onPanEnd={handlePanEnd}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Share weekly story"
                        className="lp-stage relative w-full max-w-[440px] overflow-hidden"
                        style={{
                            y: sheetY,
                            borderRadius: '32px 32px 0 0',
                            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                            touchAction: 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Ambient layers */}
                        <div className="lp-aurora">
                            <div className="lp-aurora__blob lp-aurora__blob--gold" style={{ width: 300, height: 300, top: -120 }} />
                            <div
                                className="lp-aurora__blob lp-aurora__blob--rose"
                                style={{ width: 280, height: 280, background: `radial-gradient(circle, ${duo.glow} 0%, transparent 65%)` }}
                            />
                        </div>
                        <div className="lp-grain" />

                        {/* Gold hairline */}
                        <div className="absolute top-0 left-0 right-0 h-px z-10 bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />

                        <div className="relative z-10 px-6 pt-3 pb-7">
                            {/* Drag handle */}
                            <div className="flex justify-center mb-4">
                                <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(255,246,230,0.18)' }} />
                            </div>

                            <motion.button
                                whileTap={{ scale: 0.86 }}
                                transition={GOLD_PRESS_SPRING}
                                onClick={() => { feedback.tap(); onClose(); }}
                                aria-label="Close"
                                className="lp-glass absolute top-4 right-5 w-9 h-9 rounded-full flex items-center justify-center"
                                style={{ color: 'rgba(255,246,230,0.7)' }}
                            >
                                <X size={15} strokeWidth={2.4} />
                            </motion.button>

                            {/* Issue masthead */}
                            <div className="mb-6 pr-10">
                                <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD.eyebrow }}>
                                    Share this issue
                                </p>
                                <h3
                                    className="mt-2.5 font-serif text-[1.55rem] leading-tight"
                                    style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                                >
                                    {recap.tagline}
                                </h3>
                                <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: duo.accent }}>
                                    Issue · {formatIssueRange(recap.weekStart, recap.weekEnd)}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-2">
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={handleCopy}
                                    disabled={busy}
                                    className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-left disabled:opacity-50"
                                    style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.07)' }}
                                >
                                    <span
                                        className="flex w-9 h-9 shrink-0 items-center justify-center rounded-xl"
                                        style={{ background: 'rgba(246,199,104,0.12)', border: '1px solid rgba(246,199,104,0.28)', color: GOLD.primary }}
                                    >
                                        {copied ? <Check size={15} strokeWidth={2.6} /> : <Copy size={15} />}
                                    </span>
                                    <span className="text-[13.5px] font-semibold" style={{ color: GOLD.textHigh }}>
                                        {copied ? 'Copied' : 'Copy summary'}
                                    </span>
                                </motion.button>

                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={handleDownload}
                                    disabled={busy}
                                    className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-left disabled:opacity-50"
                                    style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.07)' }}
                                >
                                    <span
                                        className="flex w-9 h-9 shrink-0 items-center justify-center rounded-xl"
                                        style={{ background: 'rgba(246,199,104,0.12)', border: '1px solid rgba(246,199,104,0.28)', color: GOLD.primary }}
                                    >
                                        <Download size={15} />
                                    </span>
                                    <span className="text-[13.5px] font-semibold" style={{ color: GOLD.textHigh }}>
                                        Save image
                                    </span>
                                </motion.button>

                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={handleShare}
                                    disabled={busy}
                                    className="lp-cta mt-1 w-full h-[54px] rounded-2xl font-bold text-[15px] tracking-wide inline-flex items-center justify-center gap-2 disabled:opacity-60"
                                    style={{
                                        background: `linear-gradient(135deg, ${GOLD.primary} 0%, ${GOLD.deep} 100%)`,
                                        color: GOLD.inkOnGold,
                                        boxShadow: '0 12px 36px rgba(246,199,104,0.28), inset 0 1px 0 rgba(255,246,222,0.45)',
                                    }}
                                >
                                    <Share2 size={16} strokeWidth={2.4} />
                                    Share…
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
