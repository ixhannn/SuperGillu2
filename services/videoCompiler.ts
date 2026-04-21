/**
 * Bi-weekly Film Compiler.
 *
 * Takes a cycle's clips and renders a single Blob that is:
 *   [title card 2.0s]
 *     → for each day with >=1 clip:
 *         userClip (5s, 0.3s in-dissolve, 0.3s out-dissolve)
 *         partnerClip (5s, 0.3s in-dissolve, 0.3s out-dissolve)
 *     → [closing collage 2.0s]
 *
 * Render target: 720x1280 @ 30fps, H.264 or WebM.
 * Audio: mute original clip audio; bed is a single ambient track.
 *
 * Implementation notes:
 *  - We draw every frame to an OffscreenCanvas and capture a stream.
 *  - Each clip is played back via a hidden <video> element; on every frame
 *    we `drawImage` that element onto the canvas, applying fade alpha.
 *  - The ambient track is muxed in via a MediaStreamAudioDestinationNode
 *    added to the captured stream.
 *  - If MediaRecorder / OffscreenCanvas isn't available we return null so
 *    the caller can fall back to a slideshow renderer (future).
 */

import { BiweeklyFilm, DailyVideoClip, VideoMomentDay } from '../types';
import { VideoMomentsService } from './videoMoments';
import { AmbientMusicService } from './ambientMusic';

const OUTPUT_W = 720;
const OUTPUT_H = 1280;
const FPS = 30;
const CLIP_DURATION_MS = 5000;
const DISSOLVE_MS = 300;
const TITLE_MS = 2000;
const COLLAGE_MS = 2200;

export type CompilerProgress = (ratio: number, message: string) => void;

export interface CompileOptions {
  cycleStart: string;
  cycleEnd: string;
  days: VideoMomentDay[];
  coupleNames?: [string, string];
  musicTrackId?: string;
  moodBucket?: 'warm' | 'quiet' | 'playful' | 'contemplative' | 'intense' | 'tender';
  onProgress?: CompilerProgress;
}

export interface CompileResult {
  videoBlob: Blob;
  thumbnailBlob: Blob | null;
  durationMs: number;
  clipCount: number;
  musicTrackId?: string;
}

/**
 * Compile a 14-day cycle into a single Blob. Returns null if the platform
 * cannot render (very old browsers / no MediaRecorder).
 */
export async function compileCycle(options: CompileOptions): Promise<CompileResult | null> {
  const { days, coupleNames, onProgress } = options;

  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
    return null;
  }

  // ── Ordered clip list: pair user+partner per day ──
  const orderedClips: DailyVideoClip[] = [];
  for (const d of days) {
    if (d.userClip) orderedClips.push(d.userClip);
    if (d.partnerClip) orderedClips.push(d.partnerClip);
  }

  if (orderedClips.length === 0) return null;

  // Estimate total duration
  const bodyMs = orderedClips.length * CLIP_DURATION_MS;
  const totalMs = TITLE_MS + bodyMs + COLLAGE_MS;

  // ── Canvas + recording stream ──
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_W;
  canvas.height = OUTPUT_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const stream = canvas.captureStream(FPS);

  // ── Audio graph: bed only ──
  const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
  let audioCtx: AudioContext | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let track = AmbientMusicService.pickForCycle({
    cycleStart: options.cycleStart,
    preferredId: options.musicTrackId,
    moodBucket: options.moodBucket,
  });

  if (AudioCtx) {
    audioCtx = new AudioCtx();
    destination = audioCtx.createMediaStreamDestination();
    const buffer = await AmbientMusicService.loadBuffer(track, audioCtx);
    if (buffer) {
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.6;
      source.connect(gain).connect(destination);
      // Fade in/out
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.6, audioCtx.currentTime + 1.2);
      gain.gain.setValueAtTime(0.6, audioCtx.currentTime + totalMs / 1000 - 1.2);
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + totalMs / 1000);
      source.start();
    }
    destination.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  }

  // ── Recorder ──
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 3_500_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const finished: Promise<Blob> = new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(250);

  // ── Pre-fetch video blob URLs for each clip ──
  onProgress?.(0.02, 'Preparing clips…');
  const blobUrls: (string | null)[] = await Promise.all(
    orderedClips.map(async (c) => {
      const blob = await VideoMomentsService.getVideoBlob(c);
      return blob ? URL.createObjectURL(blob) : null;
    }),
  );

  // ── Title card ──
  await renderTitleCard(ctx, {
    cycleStart: options.cycleStart,
    cycleEnd: options.cycleEnd,
    coupleNames: coupleNames ?? ['You', 'Them'],
  });
  onProgress?.(0.05, 'Opening…');

  // ── Play each clip with soft dissolves ──
  for (let i = 0; i < orderedClips.length; i += 1) {
    const url = blobUrls[i];
    if (!url) continue;
    await renderClipWithDissolve(ctx, url);
    onProgress?.(0.05 + (0.85 * (i + 1)) / orderedClips.length, `Clip ${i + 1} of ${orderedClips.length}`);
  }

  // ── Closing collage ──
  await renderCollage(ctx, orderedClips);
  onProgress?.(0.95, 'Finishing…');

  // Small tail to let recorder flush
  await wait(250);
  recorder.stop();
  const videoBlob = await finished;

  // Cleanup blob URLs
  blobUrls.forEach((u) => { if (u) URL.revokeObjectURL(u); });
  if (audioCtx) { try { await audioCtx.close(); } catch {} }

  // Thumbnail = first real clip frame (or title card)
  const thumbnailBlob = await extractFirstFrameThumbnail(videoBlob).catch(() => null);

  onProgress?.(1, 'Done');
  return {
    videoBlob,
    thumbnailBlob,
    durationMs: totalMs,
    clipCount: orderedClips.length,
    musicTrackId: track.id,
  };
}

// ── Rendering helpers ──────────────────────────────────────────────────

function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function renderTitleCard(
  ctx: CanvasRenderingContext2D,
  opts: { cycleStart: string; cycleEnd: string; coupleNames: [string, string] },
): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < TITLE_MS) {
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / TITLE_MS);
    // Smooth fade in + out using a triangular envelope
    const alpha = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;

    ctx.fillStyle = '#0D0B12';
    ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FBEFEF';
    ctx.textAlign = 'center';

    ctx.font = '500 34px Georgia, serif';
    ctx.fillText('A fortnight, together', OUTPUT_W / 2, OUTPUT_H / 2 - 40);

    ctx.font = '300 20px -apple-system, Inter, sans-serif';
    ctx.fillStyle = '#B7A9A6';
    ctx.fillText(formatRange(opts.cycleStart, opts.cycleEnd), OUTPUT_W / 2, OUTPUT_H / 2 + 10);

    ctx.font = '300 18px -apple-system, Inter, sans-serif';
    ctx.fillText(`${opts.coupleNames[0]} & ${opts.coupleNames[1]}`, OUTPUT_W / 2, OUTPUT_H / 2 + 56);

    ctx.globalAlpha = 1;

    await waitFrame();
  }
}

async function renderClipWithDissolve(
  ctx: CanvasRenderingContext2D,
  blobUrl: string,
): Promise<void> {
  const video = document.createElement('video');
  video.src = blobUrl;
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.muted = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Clip load failed'));
  });

  video.currentTime = 0;
  await video.play().catch(() => {});

  const start = performance.now();
  while (performance.now() - start < CLIP_DURATION_MS) {
    const elapsed = performance.now() - start;
    const alpha =
      elapsed < DISSOLVE_MS
        ? elapsed / DISSOLVE_MS
        : elapsed > CLIP_DURATION_MS - DISSOLVE_MS
          ? (CLIP_DURATION_MS - elapsed) / DISSOLVE_MS
          : 1;

    // Black backdrop
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);

    // Letterboxed aspect-fit draw
    drawVideoCover(ctx, video);

    // Fade overlay (multiply against current frame by fading black layer)
    if (alpha < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - alpha})`;
      ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);
    }

    await waitFrame();
  }

  video.pause();
  video.src = '';
  video.load();
}

async function renderCollage(ctx: CanvasRenderingContext2D, clips: DailyVideoClip[]): Promise<void> {
  // Load thumbnails for up to 9 slots in a 3x3 grid
  const slots = 9;
  const subset = clips.slice(-slots);
  const thumbUrls: (string | null)[] = await Promise.all(
    subset.map((c) => VideoMomentsService.getThumbnailUrl(c)),
  );
  const imgs: (HTMLImageElement | null)[] = await Promise.all(
    thumbUrls.map(async (url) => {
      if (!url) return null;
      return new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }),
  );

  const cols = 3;
  const rows = Math.ceil(slots / cols);
  const gap = 14;
  const margin = 48;
  const availW = OUTPUT_W - margin * 2 - gap * (cols - 1);
  const availH = OUTPUT_H - margin * 3 - gap * (rows - 1);
  const cellW = availW / cols;
  const cellH = availH / rows;

  const start = performance.now();
  while (performance.now() - start < COLLAGE_MS) {
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / COLLAGE_MS);
    const alpha = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;

    ctx.fillStyle = '#0D0B12';
    ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);

    ctx.globalAlpha = alpha;

    for (let i = 0; i < subset.length; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = margin + col * (cellW + gap);
      const y = margin + row * (cellH + gap);
      const img = imgs[i];
      if (img) {
        drawImageCover(ctx, img, x, y, cellW, cellH);
      } else {
        ctx.fillStyle = '#1A1720';
        ctx.fillRect(x, y, cellW, cellH);
      }
    }

    ctx.fillStyle = '#FBEFEF';
    ctx.textAlign = 'center';
    ctx.font = '400 24px Georgia, serif';
    ctx.fillText('— together —', OUTPUT_W / 2, OUTPUT_H - margin - 8);

    ctx.globalAlpha = 1;

    await waitFrame();
  }

  // cleanup thumb urls
  thumbUrls.forEach((u) => { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); });
}

function drawVideoCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement) {
  const vw = video.videoWidth || OUTPUT_W;
  const vh = video.videoHeight || OUTPUT_H;
  drawSourceCover(ctx, video as CanvasImageSource, vw, vh, 0, 0, OUTPUT_W, OUTPUT_H);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  drawSourceCover(ctx, img, img.naturalWidth, img.naturalHeight, dx, dy, dw, dh);
}

function drawSourceCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const srcRatio = sw / sh;
  const dstRatio = dw / dh;
  let cropW = sw;
  let cropH = sh;
  let cropX = 0;
  let cropY = 0;
  if (srcRatio > dstRatio) {
    cropW = sh * dstRatio;
    cropX = (sw - cropW) / 2;
  } else {
    cropH = sw / dstRatio;
    cropY = (sh - cropH) / 2;
  }
  ctx.drawImage(source, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
}

function formatRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sLbl = s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const eLbl = e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${sLbl} – ${eLbl}`;
}

function waitFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function extractFirstFrameThumbnail(videoBlob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.onloadeddata = () => {
      video.currentTime = 0.2;
    };
    video.onseeked = () => {
      const c = document.createElement('canvas');
      c.width = 360;
      c.height = 640;
      const cx = c.getContext('2d');
      if (!cx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      drawSourceCover(cx, video, video.videoWidth, video.videoHeight, 0, 0, 360, 640);
      c.toBlob((blob) => {
        URL.revokeObjectURL(url);
        resolve(blob);
      }, 'image/jpeg', 0.82);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  });
}

// ── High-level convenience ────────────────────────────────────────────
export const VideoCompilerService = {
  async generateFilm(options: CompileOptions): Promise<BiweeklyFilm | null> {
    // Mark as generating so UI can show a spinner
    const existing = await VideoMomentsService.getFilmForCycle(options.cycleStart);
    const base: BiweeklyFilm = existing ?? {
      id: cryptoRandomId(),
      coupleId: 'local',
      cycleStart: options.cycleStart,
      cycleEnd: options.cycleEnd,
      durationMs: 0,
      clipCount: 0,
      generatedAt: new Date().toISOString(),
      status: 'generating',
      progress: 0,
    };
    await VideoMomentsService.upsertFilm({ ...base, status: 'generating', progress: 0 });

    try {
      const result = await compileCycle({
        ...options,
        onProgress: async (ratio) => {
          await VideoMomentsService.upsertFilm({
            ...base,
            status: 'generating',
            progress: ratio,
          });
          options.onProgress?.(ratio, '');
        },
      });

      if (!result) {
        await VideoMomentsService.upsertFilm({ ...base, status: 'failed', progress: 0 });
        return null;
      }

      const saved = await VideoMomentsService.saveFilmBlob(
        options.cycleStart,
        result.videoBlob,
        result.thumbnailBlob,
        result.durationMs,
        result.clipCount,
        result.musicTrackId,
      );
      return saved;
    } catch (err) {
      await VideoMomentsService.upsertFilm({ ...base, status: 'failed', progress: 0 });
      throw err;
    }
  },
};

function cryptoRandomId(): string {
  try {
    // Prefer crypto.randomUUID when available
    const anyCrypto = (globalThis as any).crypto;
    if (anyCrypto?.randomUUID) return anyCrypto.randomUUID();
  } catch {
    // ignore
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
