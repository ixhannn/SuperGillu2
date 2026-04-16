import { DailyVideoClip, Memory, MoodEntry, Note, WeeklyRecapStats } from '../types';
import { VideoMomentsService } from './videoMoments';

// ── Types ─────────────────────────────────────────────────────────────
interface CompilationClip {
  type: 'video' | 'image' | 'text';
  src?: string; // Video/image URL
  text?: string; // For text slides
  subtext?: string;
  duration: number; // ms to show
  transition?: 'fade' | 'slide' | 'zoom' | 'none';
}

interface CompilationOptions {
  width?: number;
  height?: number;
  fps?: number;
  transitionDuration?: number;
  backgroundColor?: string;
  includeAudio?: boolean;
  onProgress?: (progress: number) => void;
}

const DEFAULT_OPTIONS: Required<CompilationOptions> = {
  width: 1080,
  height: 1920,
  fps: 30,
  transitionDuration: 500,
  backgroundColor: '#0f0f23',
  includeAudio: true,
  onProgress: () => {}
};

// ── Canvas Drawing Helpers ────────────────────────────────────────────
const drawGradientBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: string[] = ['#1a1a2e', '#16213e', '#0f0f23']
): void => {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.5, colors[1]);
  gradient.addColorStop(1, colors[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
};

const drawTextSlide = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  subtext?: string
): void => {
  drawGradientBackground(ctx, width, height);

  // Main text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.floor(width / 12)}px system-ui, -apple-system, sans-serif`;

  const lines = wrapText(ctx, text, width * 0.8);
  const lineHeight = Math.floor(width / 10);
  const startY = height / 2 - (lines.length * lineHeight) / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, startY + i * lineHeight);
  });

  // Subtext
  if (subtext) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `${Math.floor(width / 24)}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(subtext, width / 2, startY + lines.length * lineHeight + lineHeight);
  }
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
};

const drawImageCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLVideoElement,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number = 1
): void => {
  const imgWidth = img instanceof HTMLVideoElement ? img.videoWidth : img.width;
  const imgHeight = img instanceof HTMLVideoElement ? img.videoHeight : img.height;

  const imgRatio = imgWidth / imgHeight;
  const canvasRatio = canvasWidth / canvasHeight;

  let drawWidth: number;
  let drawHeight: number;
  let offsetX: number;
  let offsetY: number;

  if (imgRatio > canvasRatio) {
    drawHeight = canvasHeight;
    drawWidth = canvasHeight * imgRatio;
    offsetX = (canvasWidth - drawWidth) / 2;
    offsetY = 0;
  } else {
    drawWidth = canvasWidth;
    drawHeight = canvasWidth / imgRatio;
    offsetX = 0;
    offsetY = (canvasHeight - drawHeight) / 2;
  }

  ctx.globalAlpha = opacity;
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  ctx.globalAlpha = 1;
};

// ── Video Compiler Service ────────────────────────────────────────────
export const VideoCompilerService = {
  /**
   * Compile monthly video from daily clips
   */
  async compileMonthlyVideo(
    month: string,
    options: CompilationOptions = {}
  ): Promise<{ blob: Blob; thumbnail: string; duration: number }> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const clips = await VideoMomentsService.getClipsForCompilation(month);

    if (clips.length === 0) {
      throw new Error('No clips available for this month');
    }

    // Build compilation sequence
    const sequence: CompilationClip[] = [];

    // Intro slide
    const [year, monthNum] = month.split('-');
    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleString('default', { month: 'long' });
    sequence.push({
      type: 'text',
      text: `${monthName} ${year}`,
      subtext: `${clips.length} moments together`,
      duration: 3000,
      transition: 'fade'
    });

    // Add each clip
    for (const clip of clips) {
      const videoUrl = await VideoMomentsService.getVideoUrl(clip);
      if (videoUrl) {
        sequence.push({
          type: 'video',
          src: videoUrl,
          duration: clip.durationMs,
          transition: 'fade'
        });
      }
    }

    // Outro slide
    sequence.push({
      type: 'text',
      text: '💕',
      subtext: 'Made with love',
      duration: 2000,
      transition: 'fade'
    });

    return this.renderSequence(sequence, opts);
  },

  /**
   * Compile weekly recap from memories, moods, notes
   */
  async compileWeeklyRecap(
    memories: Memory[],
    moods: MoodEntry[],
    notes: Note[],
    stats: WeeklyRecapStats,
    weekLabel: string,
    options: CompilationOptions = {}
  ): Promise<{ blob: Blob; thumbnail: string; duration: number }> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const sequence: CompilationClip[] = [];

    // Intro slide
    sequence.push({
      type: 'text',
      text: `Your Week`,
      subtext: weekLabel,
      duration: 2500,
      transition: 'fade'
    });

    // Stats slide
    const moodEmoji = stats.moodTrend === 'up' ? '📈' : stats.moodTrend === 'down' ? '📉' : '➡️';
    sequence.push({
      type: 'text',
      text: `${stats.memoriesCount} memories\n${stats.moodsLogged} moods logged ${moodEmoji}`,
      subtext: stats.notesCount > 0 ? `${stats.notesCount} notes shared` : undefined,
      duration: 3000,
      transition: 'slide'
    });

    // Add memories with images
    for (const memory of memories.slice(0, 10)) { // Limit to 10 memories
      if (memory.image || memory.imageId) {
        // For now, we'll just use the image URL if available
        // In a real implementation, we'd load from IDB
        sequence.push({
          type: 'image',
          src: memory.image,
          duration: 3000,
          transition: 'zoom'
        });
      } else if (memory.text) {
        sequence.push({
          type: 'text',
          text: `"${memory.text.slice(0, 100)}${memory.text.length > 100 ? '...' : ''}"`,
          subtext: new Date(memory.date).toLocaleDateString('en-US', { weekday: 'long' }),
          duration: 3000,
          transition: 'fade'
        });
      }
    }

    // Highlight notes
    for (const note of notes.slice(0, 3)) {
      sequence.push({
        type: 'text',
        text: `"${note.content.slice(0, 80)}${note.content.length > 80 ? '...' : ''}"`,
        duration: 2500,
        transition: 'slide'
      });
    }

    // Outro
    sequence.push({
      type: 'text',
      text: 'See you next week 💕',
      duration: 2000,
      transition: 'fade'
    });

    return this.renderSequence(sequence, opts);
  },

  /**
   * Core rendering engine - renders sequence to video
   */
  async renderSequence(
    sequence: CompilationClip[],
    options: Required<CompilationOptions>
  ): Promise<{ blob: Blob; thumbnail: string; duration: number }> {
    const { width, height, fps, transitionDuration, backgroundColor, onProgress } = options;

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Calculate total duration
    const totalDuration = sequence.reduce((sum, clip) => sum + clip.duration, 0) +
      (sequence.length - 1) * transitionDuration;

    // Set up MediaRecorder
    const stream = canvas.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 4000000 // 4 Mbps
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Preload all media
    const loadedMedia = await this.preloadMedia(sequence);

    // Start recording
    mediaRecorder.start(100);

    // Render frames
    let thumbnail = '';
    const startTime = performance.now();
    let currentClipIndex = 0;
    let clipStartTime = 0;

    const renderFrame = (): Promise<void> => {
      return new Promise((resolve) => {
        const render = () => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(elapsed / totalDuration, 1);
          onProgress(progress);

          // Find current clip
          let timeInSequence = 0;
          let foundClip = false;

          for (let i = 0; i < sequence.length; i++) {
            const clipEnd = timeInSequence + sequence[i].duration;
            if (elapsed < clipEnd || i === sequence.length - 1) {
              currentClipIndex = i;
              clipStartTime = timeInSequence;
              foundClip = true;
              break;
            }
            timeInSequence = clipEnd;
          }

          if (!foundClip || elapsed >= totalDuration) {
            resolve();
            return;
          }

          const clip = sequence[currentClipIndex];
          const clipElapsed = elapsed - clipStartTime;
          const clipProgress = Math.min(clipElapsed / clip.duration, 1);

          // Clear canvas
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, width, height);

          // Render current clip
          this.renderClip(ctx, clip, loadedMedia.get(currentClipIndex), width, height, clipProgress);

          // Handle transitions
          if (clip.transition !== 'none' && currentClipIndex > 0) {
            const transitionProgress = Math.min(clipElapsed / transitionDuration, 1);
            if (transitionProgress < 1) {
              // Blend with previous clip
              const prevClip = sequence[currentClipIndex - 1];
              const prevMedia = loadedMedia.get(currentClipIndex - 1);
              ctx.globalAlpha = 1 - transitionProgress;
              this.renderClip(ctx, prevClip, prevMedia, width, height, 1);
              ctx.globalAlpha = 1;
            }
          }

          // Capture thumbnail from first video frame
          if (!thumbnail && currentClipIndex > 0) {
            thumbnail = canvas.toDataURL('image/jpeg', 0.8);
          }

          requestAnimationFrame(render);
        };

        render();
      });
    };

    await renderFrame();

    // Stop recording and get blob
    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve({
          blob,
          thumbnail: thumbnail || canvas.toDataURL('image/jpeg', 0.8),
          duration: totalDuration
        });
      };
      mediaRecorder.stop();
    });
  },

  /**
   * Preload all media (images and videos)
   */
  async preloadMedia(sequence: CompilationClip[]): Promise<Map<number, HTMLImageElement | HTMLVideoElement | null>> {
    const loaded = new Map<number, HTMLImageElement | HTMLVideoElement | null>();

    await Promise.all(sequence.map(async (clip, index) => {
      if (clip.type === 'image' && clip.src) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = clip.src!;
        });
        loaded.set(index, img);
      } else if (clip.type === 'video' && clip.src) {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';

        await new Promise<void>((resolve) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => resolve();
          video.src = clip.src!;
        });
        loaded.set(index, video);
      } else {
        loaded.set(index, null);
      }
    }));

    return loaded;
  },

  /**
   * Render a single clip to canvas
   */
  renderClip(
    ctx: CanvasRenderingContext2D,
    clip: CompilationClip,
    media: HTMLImageElement | HTMLVideoElement | null,
    width: number,
    height: number,
    progress: number
  ): void {
    if (clip.type === 'text') {
      drawTextSlide(ctx, width, height, clip.text || '', clip.subtext);
    } else if (clip.type === 'image' && media instanceof HTMLImageElement) {
      drawGradientBackground(ctx, width, height);
      drawImageCover(ctx, media, width, height);
    } else if (clip.type === 'video' && media instanceof HTMLVideoElement) {
      // Seek video to current progress
      const targetTime = progress * media.duration;
      if (Math.abs(media.currentTime - targetTime) > 0.1) {
        media.currentTime = targetTime;
      }

      if (media.paused) {
        media.play().catch(() => {});
      }

      drawGradientBackground(ctx, width, height);
      drawImageCover(ctx, media, width, height);
    } else {
      // Fallback gradient
      drawGradientBackground(ctx, width, height);
    }
  },

  /**
   * Generate a preview thumbnail for a compilation
   */
  async generatePreviewThumbnail(
    clips: DailyVideoClip[],
    width: number = 400,
    height: number = 300
  ): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Draw gradient background
    drawGradientBackground(ctx, width, height);

    // Draw grid of thumbnails (up to 4)
    const thumbsToShow = clips.slice(0, 4);
    const gridSize = thumbsToShow.length <= 1 ? 1 : 2;
    const cellWidth = width / gridSize;
    const cellHeight = height / gridSize;

    for (let i = 0; i < thumbsToShow.length; i++) {
      const clip = thumbsToShow[i];
      const thumbUrl = await VideoMomentsService.getThumbnailUrl(clip);

      if (thumbUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = thumbUrl;
        });

        const x = (i % gridSize) * cellWidth;
        const y = Math.floor(i / gridSize) * cellHeight;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 4, cellWidth - 8, cellHeight - 8, 8);
        ctx.clip();
        ctx.drawImage(img, x + 4, y + 4, cellWidth - 8, cellHeight - 8);
        ctx.restore();
      }
    }

    // Add play overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 30, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(width / 2 - 8, height / 2 - 12);
    ctx.lineTo(width / 2 + 12, height / 2);
    ctx.lineTo(width / 2 - 8, height / 2 + 12);
    ctx.closePath();
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();

    return canvas.toDataURL('image/jpeg', 0.85);
  }
};
