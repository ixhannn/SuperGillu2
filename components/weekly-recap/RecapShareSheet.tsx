import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Copy, Share2, Download, Check } from 'lucide-react';
import { WeeklyRecap } from '../../types';
import { toast } from '../../utils/toast';

interface RecapShareSheetProps {
  recap: WeeklyRecap;
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

export function RecapShareSheet({ recap, onClose }: RecapShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildSummary(recap));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.show('Could not copy', 'error');
    }
  };

  const handleDownload = async () => {
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

  return (
    <motion.div
      className="recap-share"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="recap-share__sheet"
        initial={{ y: 50 }}
        animate={{ y: 0 }}
        exit={{ y: 50 }}
        style={{ backgroundColor: recap.palette.base, color: recap.palette.textOnBase }}
      >
        <button className="recap-share__close" onClick={onClose} aria-label="Close">
          <X size={22} />
        </button>
        <p className="recap-share__label" style={{ color: recap.palette.muted }}>Share recap</p>
        <h3 className="recap-share__headline">{recap.tagline}</h3>

        <div className="recap-share__actions">
          <button className="recap-share__btn" onClick={handleCopy} disabled={busy}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
            <span>{copied ? 'Copied' : 'Copy summary'}</span>
          </button>
          <button className="recap-share__btn" onClick={handleDownload} disabled={busy}>
            <Download size={18} />
            <span>Save image</span>
          </button>
          <button
            className="recap-share__btn recap-share__btn--primary"
            onClick={handleShare}
            disabled={busy}
            style={{ background: recap.palette.accent, color: recap.palette.base }}
          >
            <Share2 size={18} />
            <span>Share…</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
