import React, { useEffect, useRef } from 'react';
import { StorageService } from '../../../services/storage';
import { getHeirloomStatsAtDate, type HeirloomMilestone } from '../../../services/heirlooms';
import { daysTogetherFrom } from '../../../shared/dateOnly.js';
import { renderHeirloom, type HeirloomRenderData, HEIRLOOM_W, HEIRLOOM_H } from './heirloomArt';

/**
 * Render inputs for a milestone, read from the couple's real data.
 * What the mint saw on the strike day — memoryCount is pinned to the
 * strike date so the piece stays stable as new memories are added.
 */
export function buildHeirloomRenderData(m: HeirloomMilestone): HeirloomRenderData {
    const profile = StorageService.getCoupleProfile();
    const moods = StorageService.getMoodEntries().slice(-24).map((e) => e.mood);
    return {
        milestone: m,
        myName: profile.myName?.trim() || 'You',
        partnerName: profile.partnerName?.trim() || 'Your love',
        dayCount: m.kind === 'days' ? m.value : Math.max(0, daysTogetherFrom(profile.anniversaryDate, m.date)),
        moods,
        memoryCount: getHeirloomStatsAtDate(m.date).memories,
    };
}

/* ── Draw queue — one canvas per animation frame ─────────────────────
   A gallery mounts a dozen thumbs whose fonts.ready callbacks would
   otherwise all flush in ONE microtask checkpoint (fonts resolve long
   before mount), blocking the main thread mid-entrance-animation.
   Spreading draws across frames keeps every frame short. ─────────── */

const drawQueue: Array<() => void> = [];
let pumping = false;

const pumpQueue = (): void => {
    const job = drawQueue.shift();
    if (!job) {
        pumping = false;
        return;
    }
    job();
    requestAnimationFrame(pumpQueue);
};

const enqueueDraw = (job: () => void): void => {
    drawQueue.push(job);
    if (!pumping) {
        pumping = true;
        requestAnimationFrame(pumpQueue);
    }
};

/* ── Veil — frost baked into the pixels, not a CSS filter ────────────
   A tiny source render stretched up with high-quality smoothing reads
   as a heavy blur, with zero per-frame compositor filter cost and no
   readable detail to spoil the seal-breaking reveal. ──────────────── */

const VEIL_SOURCE_SCALE = 0.045;

const drawVeiled = (canvas: HTMLCanvasElement, data: HeirloomRenderData, scale: number): void => {
    const source = document.createElement('canvas');
    renderHeirloom(source, data, VEIL_SOURCE_SCALE);
    const w = Math.round(HEIRLOOM_W * scale);
    const h = Math.round(HEIRLOOM_H * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
};

/** Canvas thumbnail (deterministic, renders once fonts are ready). */
export const HeirloomThumb: React.FC<{ data: HeirloomRenderData; scale?: number; veil?: boolean }> = ({ data, scale = 0.34, veil = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let cancelled = false;
        const draw = () => {
            if (cancelled || !canvasRef.current) return;
            if (veil) drawVeiled(canvasRef.current, data, scale);
            else renderHeirloom(canvasRef.current, data, scale);
        };
        const schedule = () => {
            if (!cancelled) enqueueDraw(draw);
        };
        if (typeof document !== 'undefined' && document.fonts?.ready) {
            void document.fonts.ready.then(schedule);
        } else {
            schedule();
        }
        return () => { cancelled = true; };
    }, [data, scale, veil]);

    return (
        <canvas
            ref={canvasRef}
            className="block w-full h-auto"
            style={{ aspectRatio: `${HEIRLOOM_W} / ${HEIRLOOM_H}`, borderRadius: 'inherit' }}
            aria-label={`${data.milestone.title} — heirloom artwork`}
        />
    );
};
