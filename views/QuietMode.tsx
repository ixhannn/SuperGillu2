import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  Play, Pause, SkipBack, SkipForward, Music2, Wind as WindIcon,
  Heart, CloudRain, Waves, Activity, VolumeX, Volume2, Sparkles, ImagePlus,
} from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { ViewState, Memory } from '../types';
import { StorageService } from '../services/storage';
import { BreathingGuide } from '../components/quiet/BreathingGuide';
import { AmbientBackdrop } from '../components/quiet/AmbientBackdrop';
import { buildDemoMemories } from '../components/quiet/demoMemories';
import { RGB, ROSE, moodColor, rgbStr, mixRGB } from '../components/quiet/ambient';
import { SoundscapeEngine, SCENES, Soundscape, SceneMeta } from '../services/quietMode/soundscape';
import { prefersReducedMotion } from '../utils/motion';
import { feedback } from '../utils/feedback';
import { isE2EAppMode } from '../services/e2eHarness';

interface QuietModeProps {
  setView: (view: ViewState) => void;
}

// ─── Timing ──────────────────────────────────────────────────────────────────
const SLIDE_VISIBLE_MS = 9000;
const FADE_OUT_MS = 1400;
const REDUCED_SLIDE_MS = 12000;

const SCENE_ICON: Record<SceneMeta['icon'], React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; fill?: string }>> = {
  heart: Heart, 'cloud-rain': CloudRain, waves: Waves, activity: Activity, wind: WindIcon, 'volume-x': VolumeX,
};

const titleCase = (s?: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const DAY = 86_400_000;
function sameMonthDay(a: Date, b: Date): boolean {
  return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** A warm, human "X ago". Future/very-recent dates defer to the month-year line. */
function relativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / DAY);
  if (days < 7) return ''; // "this week" feels like a timestamp — let the date carry it
  const years = Math.floor(days / 365);
  if (years >= 1) return `${years} ${years === 1 ? 'year' : 'years'} ago`;
  const months = Math.floor(days / 30);
  if (months >= 1) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
}
function monthYear(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Quote font size adapts to length (and whether it's the hero, photo-less, layout). */
function quoteClass(len: number, hero: boolean): string {
  if (hero) {
    if (len <= 70) return 'text-[2rem] md:text-[2.4rem] leading-[1.28]';
    if (len <= 140) return 'text-[1.6rem] md:text-[1.95rem] leading-[1.34]';
    if (len <= 240) return 'text-[1.3rem] md:text-[1.55rem] leading-[1.42]';
    return 'text-[1.12rem] md:text-[1.3rem] leading-[1.5]';
  }
  if (len <= 90) return 'text-[1.4rem] md:text-[1.62rem] leading-[1.4]';
  if (len <= 180) return 'text-[1.18rem] md:text-[1.36rem] leading-[1.5]';
  return 'text-[1.04rem] md:text-[1.16rem] leading-[1.55]';
}

/** Live reduced-motion preference (reacts to a mid-session OS change). */
function useReducedMotionLive(): boolean {
  const [reduced, setReduced] = useState(() => prefersReducedMotion());
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

const MEASURE = 340; // one editorial column the photo + quote + divider share

export const QuietMode: React.FC<QuietModeProps> = ({ setView }) => {
  const reduced = useReducedMotionLive();
  const slideMs = reduced ? REDUCED_SLIDE_MS : SLIDE_VISIBLE_MS;

  // ── Data ───────────────────────────────────────────────────────────────────
  const [memories, setMemories] = useState<Memory[]>([]);
  const [index, setIndex] = useState(0);
  const [currentMemory, setCurrentMemory] = useState<Memory | undefined>(undefined);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [contentOpacity, setContentOpacity] = useState(0);
  const [accent, setAccent] = useState<RGB>(ROSE);
  const [hidden, setHidden] = useState(false);

  // ── Experience state ─────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<'intro' | 'playing'>('intro');
  const [isPlaying, setIsPlaying] = useState(true);
  const [scene, setSceneState] = useState<Soundscape>('love');
  const [volume, setVolume] = useState(0.7);
  const [breathing, setBreathing] = useState(false);
  const [showScenes, setShowScenes] = useState(false);
  const [showUI, setShowUI] = useState(true);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const engineRef = useRef<SoundscapeEngine | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const imageCacheRef = useRef<Map<string, string | null>>(new Map());
  const accentCacheRef = useRef<Map<string, RGB>>(new Map());
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pinnedRef = useRef(false);
  const memoriesRef = useRef<Memory[]>([]);
  const currentIndexRef = useRef(0);
  const transitioningRef = useRef(false);
  const beginningRef = useRef(false);

  const multi = memories.length > 1;

  // Load + order memories once ("on this day" floats to the front).
  useEffect(() => {
    let data = StorageService.getMemories().filter((m) => m.text || m.image || m.imageId || m.storagePath);
    if (data.length === 0 && isE2EAppMode()) {
      const variant = new URLSearchParams(window.location.search).get('quiet');
      let demo = buildDemoMemories();
      if (variant === 'empty') demo = [];
      else if (variant === 'single') demo = demo.slice(0, 1);
      else if (variant === 'text') demo = demo.map((m) => ({ ...m, image: undefined }));
      data = demo;
    }
    const ordered = orderForDrift(data);
    setMemories(ordered);
    memoriesRef.current = ordered;
    setCurrentMemory(ordered[0]);
  }, []);

  // Audio engine lifecycle — created and disposed per mount (StrictMode-safe).
  useEffect(() => {
    const engine = new SoundscapeEngine();
    engineRef.current = engine;
    engine.setVolume(0.7);
    return () => { engine.dispose(); engineRef.current = null; };
  }, []);

  // Modal semantics: hide the app behind from AT + tab order, manage focus.
  useEffect(() => {
    const root = document.getElementById('root');
    const prevFocus = document.activeElement as HTMLElement | null;
    root?.setAttribute('aria-hidden', 'true');
    try { root?.setAttribute('inert', ''); } catch { /* older browsers */ }
    dialogRef.current?.focus();
    return () => {
      root?.removeAttribute('aria-hidden');
      try { root?.removeAttribute('inert'); } catch { /* noop */ }
      prevFocus?.focus?.();
    };
  }, []);

  // The blurred photo bleed shown by AmbientBackdrop. We promote `currentImage`
  // into it ONLY once the image has decoded (below), so on a photo→photo advance
  // (where hasPhoto stays true and the wrapper's opacity crossfade never fires)
  // the CSS background-image is never swapped to an undecoded/half-painted frame.
  const [bleedImage, setBleedImage] = useState<string | null>(null);

  // Accent = sampled from the photo, or derived from the mood when there's none.
  useEffect(() => {
    if (!currentImage) { setAccent(moodColor(currentMemory?.mood)); setBleedImage(null); return; }
    const id = currentMemory?.id;
    if (id && accentCacheRef.current.has(id)) {
      setAccent(accentCacheRef.current.get(id)!);
      // Accent was cached ⇒ this image was decoded on a prior pass ⇒ it is in the
      // browser cache, so promoting it immediately won't show an undecoded frame.
      setBleedImage(currentImage);
      return;
    }
    let cancelled = false;
    const img = new Image();
    // Only force a CORS fetch for true remote URLs; data:/blob: are same-origin.
    if (/^https?:/i.test(currentImage)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const rgb = sampleFromImage(img);
      if (rgb) { if (id) accentCacheRef.current.set(id, rgb); setAccent(rgb); }
      // On failure keep the prior accent (don't snap to mood mid-show).
      // Decoded now — safe to promote to the bleed without a half-painted frame.
      setBleedImage(currentImage);
    };
    img.onerror = () => {
      // Couldn't decode for sampling — still advance the bleed to the current
      // slide (never leave a stale previous photo); CSS retries the load itself.
      if (!cancelled) setBleedImage(currentImage);
    };
    img.src = currentImage;
    return () => { cancelled = true; img.onload = null; img.onerror = null; img.src = ''; };
  }, [currentImage, currentMemory]);

  // Pause audio + advancing while hidden; restore the prior state on return.
  useEffect(() => {
    const onVis = () => {
      const isHidden = document.hidden;
      setHidden(isHidden);
      const engine = engineRef.current;
      if (!engine) return;
      if (isHidden) void engine.suspend();
      else if (phase === 'playing' && isPlaying && scene !== 'off') void engine.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [phase, isPlaying, scene]);

  useEffect(() => { pinnedRef.current = showScenes || !isPlaying || phase === 'intro'; }, [showScenes, isPlaying, phase]);

  // ── Image resolution (cached + prefetched) ───────────────────────────────────
  const getMemoryImage = useCallback(async (mem?: Memory): Promise<string | null> => {
    if (!mem) return null;
    if (mem.image) return mem.image;
    if (!mem.imageId && !mem.storagePath) return null;
    const cache = imageCacheRef.current;
    if (cache.has(mem.id)) return cache.get(mem.id)!;
    try {
      const data = await StorageService.getImage(mem.imageId || '', undefined, mem.storagePath);
      cache.set(mem.id, data || null);
      return data || null;
    } catch {
      cache.set(mem.id, null);
      return null;
    }
  }, []);
  const prefetch = useCallback((mem?: Memory) => { void getMemoryImage(mem); }, [getMemoryImage]);

  // ── UI auto-hide ──────────────────────────────────────────────────────────────
  const revealUI = useCallback(() => {
    setShowUI(true);
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => { if (!pinnedRef.current) setShowUI(false); }, 4500);
  }, []);
  useEffect(() => () => { if (uiTimerRef.current) clearTimeout(uiTimerRef.current); }, []);

  // ── Slide transitions ────────────────────────────────────────────────────────
  const showSlide = useCallback(async (nextIndex: number) => {
    const mems = memoriesRef.current;
    if (mems.length === 0 || transitioningRef.current) return;
    transitioningRef.current = true;
    try {
      setContentOpacity(0);
      await new Promise((r) => setTimeout(r, reduced ? 600 : FADE_OUT_MS));

      currentIndexRef.current = nextIndex;
      setIndex(nextIndex);
      const mem = mems[nextIndex];
      setCurrentMemory(mem);
      const img = await getMemoryImage(mem);
      setCurrentImage(img);
      if (mems.length > 1) prefetch(mems[(nextIndex + 1) % mems.length]);

      await new Promise((r) => requestAnimationFrame(() => r(null)));
      setContentOpacity(1);
    } finally {
      transitioningRef.current = false; // never let the show brick on a throw
    }
  }, [getMemoryImage, prefetch, reduced]);

  const advance = useCallback((dir: 1 | -1) => {
    const mems = memoriesRef.current;
    if (mems.length <= 1 || transitioningRef.current) return;
    const next = (currentIndexRef.current + dir + mems.length) % mems.length;
    void showSlide(next);
  }, [showSlide]);

  // Auto-advance — only with 2+ memories, paused on !isPlaying / hidden / mid-transition.
  useEffect(() => {
    if (phase !== 'playing' || !isPlaying || hidden || memories.length <= 1) return;
    const t = setTimeout(() => {
      if (transitioningRef.current) return;
      void showSlide((currentIndexRef.current + 1) % memoriesRef.current.length);
    }, slideMs);
    return () => clearTimeout(t);
  }, [index, isPlaying, hidden, phase, memories.length, slideMs, showSlide]);

  // ── Begin (also satisfies the audio autoplay gesture) ────────────────────────
  const begin = useCallback(async () => {
    if (beginningRef.current) return;
    beginningRef.current = true;
    feedback.tapSilent();
    const engine = engineRef.current;
    if (engine) {
      if (scene !== 'off') await engine.resume();
      engine.setScene(scene);
    }
    setPhase('playing');
    const mems = memoriesRef.current;
    currentIndexRef.current = 0;
    const mem = mems[0];
    setCurrentMemory(mem);
    const img = await getMemoryImage(mem);
    setCurrentImage(img);
    if (mems.length > 1) prefetch(mems[1]);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    setContentOpacity(1);
    revealUI();
  }, [scene, getMemoryImage, prefetch, revealUI]);

  // ── Controls ──────────────────────────────────────────────────────────────────
  const exit = useCallback(() => {
    feedback.tapSilent();
    engineRef.current?.dispose();
    setView('home');
  }, [setView]);

  const togglePlay = useCallback(() => { feedback.tapSilent(); setIsPlaying((p) => !p); revealUI(); }, [revealUI]);
  const pickScene = useCallback((s: Soundscape) => {
    feedback.tapSilent();
    setSceneState(s);
    const engine = engineRef.current;
    if (!engine) return;
    if (s === 'off') { engine.setScene('off'); void engine.suspend(); }
    else { void engine.resume(); engine.setScene(s); }
  }, []);
  const onVolume = useCallback((v: number) => { setVolume(v); engineRef.current?.setVolume(v); }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      revealUI();
      if (e.key === 'Escape') exit();
      else if (phase === 'playing' && e.key === ' ') { e.preventDefault(); if (multi) togglePlay(); }
      else if (phase === 'playing' && e.key === 'ArrowRight') advance(1);
      else if (phase === 'playing' && e.key === 'ArrowLeft') advance(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exit, togglePlay, advance, phase, revealUI, multi]);

  const span = useMemoSpan(memories);
  const empty = memories.length === 0;
  const hasPhoto = !!currentImage;
  const accentLight = mixRGB(accent, { r: 255, g: 255, b: 255 }, 0.42);
  const onThisDay = currentMemory ? (() => {
    const d = new Date(currentMemory.date);
    return !Number.isNaN(d.getTime()) && sameMonthDay(d, new Date());
  })() : false;
  const timeLine = currentMemory ? [relativeTime(currentMemory.date), monthYear(currentMemory.date)].filter(Boolean).join(' · ') : '';
  const announcement = currentMemory
    ? `${currentMemory.text || 'A quiet moment'}${currentMemory.mood ? `. ${titleCase(currentMemory.mood)}` : ''}${timeLine ? `. ${timeLine}` : ''}`
    : '';

  // ─────────────────────────────────────────────────────────────────────────────
  return ReactDOM.createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Quiet Mode"
      tabIndex={-1}
      onClick={revealUI}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden select-none outline-none"
      style={{ background: '#050308' }}
    >
      <style>{KEYFRAMES}</style>

      <AmbientBackdrop accent={accent} image={bleedImage} reduced={reduced} photoActive={phase === 'playing'} />

      {/* Screen-reader announcement of the current memory */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {phase === 'playing' ? announcement : ''}
      </div>

      {breathing && phase === 'playing' && <BreathingGuide reduced={reduced} />}

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {phase === 'playing' && currentMemory && (
        <div
          aria-hidden="true"
          className="relative z-10 px-7 w-full flex flex-col items-center text-center"
          style={{
            opacity: contentOpacity,
            transform: reduced ? 'none' : (contentOpacity ? 'translateY(0) scale(1)' : 'translateY(8px) scale(1.02)'),
            transition: reduced
              ? 'opacity 500ms ease'
              : `opacity ${1700}ms ease, transform ${1700}ms cubic-bezier(0.16,1,0.3,1)`,
          }}
        >
          {hasPhoto && (
            <div className="mb-9 relative" style={{ width: `min(80vw, ${MEASURE}px)` }}>
              {/* Premium accent halo — the photo glows in its own colour */}
              <div
                aria-hidden
                className="absolute inset-[-24%] pointer-events-none"
                style={{
                  background: `radial-gradient(closest-side, ${rgbStr(accentLight, 0.5)} 0%, ${rgbStr(accent, 0.22)} 46%, transparent 76%)`,
                  transition: 'background 1800ms ease',
                  animation: reduced ? undefined : 'quietHalo 7s ease-in-out infinite',
                }}
              />
              <div
                className="relative overflow-hidden"
                style={{
                  aspectRatio: '4 / 5', borderRadius: 20,
                  boxShadow: `0 50px 110px -42px rgba(0,0,0,0.92), 0 0 90px -16px ${rgbStr(accent, 0.5)}`,
                  transition: 'box-shadow 1800ms ease',
                }}
              >
                <img
                  key={index}
                  src={currentImage!}
                  alt=""
                  onError={() => { if (currentMemory) imageCacheRef.current.set(currentMemory.id, null); setCurrentImage(null); }}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ animation: reduced ? undefined : `quietPlate ${slideMs}ms ease-out both`, willChange: 'transform' }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ borderRadius: 20, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 -72px 84px -44px rgba(0,0,0,0.55)' }}
                />
              </div>
            </div>
          )}

          {/* Caption — restrained, with a soft scrim for guaranteed contrast */}
          <div className="relative" style={{ maxWidth: MEASURE }}>
            <div className="absolute pointer-events-none" style={{ inset: '-34px -44px', background: 'radial-gradient(62% 60% at 50% 50%, rgba(4,3,8,0.5), transparent 76%)' }} />

            {onThisDay && (
              <p className="relative mb-4 text-[0.6rem] uppercase tracking-[0.42em] font-light" style={{ color: rgbStr(accentLight, 0.85) }}>
                On this day
              </p>
            )}

            {!hasPhoto && currentMemory.text && (
              <span className="absolute left-1/2 -translate-x-1/2 font-serif pointer-events-none" style={{ top: '-3.4rem', fontSize: '8rem', lineHeight: 1, color: rgbStr(accentLight, 0.15) }}>
                &ldquo;
              </span>
            )}

            {currentMemory.text ? (
              <p
                className={`relative font-serif text-white/95 tracking-wide ${quoteClass(currentMemory.text.length, !hasPhoto)}`}
                style={{ textShadow: hasPhoto ? '0 2px 30px rgba(0,0,0,0.65)' : `0 2px 30px rgba(0,0,0,0.6), 0 0 34px ${rgbStr(accent, 0.18)}`, display: '-webkit-box', WebkitLineClamp: hasPhoto ? 5 : 9, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {hasPhoto ? `“${currentMemory.text}”` : currentMemory.text}
              </p>
            ) : (
              <p className="relative font-serif italic text-white/70 text-xl">A quiet moment</p>
            )}

            <div className="relative mt-6 mb-3 w-10 h-px mx-auto" style={{ background: rgbStr(accentLight, 0.6), boxShadow: `0 0 10px ${rgbStr(accentLight, 0.7)}` }} />

            {currentMemory.mood && (
              <p className="relative font-serif italic text-white/72" style={{ fontSize: '0.96rem' }}>{titleCase(currentMemory.mood)}</p>
            )}
            {timeLine && (
              <p className="relative mt-1.5 text-white/35 text-[0.6rem] uppercase tracking-[0.28em] font-light">{timeLine}</p>
            )}
          </div>
        </div>
      )}

      {phase === 'playing' && !currentMemory && (
        <div className="relative z-10 flex flex-col items-center gap-4 text-white/55">
          <Sparkles size={26} className={reduced ? '' : 'animate-pulse'} aria-hidden />
          <p className="text-sm font-light tracking-wide">Drifting into memories…</p>
        </div>
      )}

      {/* ── Intro / empty state ───────────────────────────────────────────── */}
      {phase === 'intro' && (
        <div
          className="relative z-[60] flex flex-col items-center justify-center px-9 text-center"
          style={{ maxWidth: 430, paddingBottom: '8vh', animation: reduced ? undefined : 'quietFadeIn 1000ms ease both' }}
        >
          {empty && (
            <span aria-hidden className="absolute font-serif pointer-events-none" style={{ top: '-1.5rem', left: '50%', transform: 'translateX(-50%)', fontSize: '13rem', lineHeight: 1, color: rgbStr(accentLight, 0.06) }}>
              &amp;
            </span>
          )}
          <p className="relative text-white/35 text-[0.56rem] uppercase tracking-[0.5em] mb-6">{empty ? 'Quiet Mode' : 'Breathe'}</p>
          <h1
            className="relative font-serif text-white text-[3.1rem] leading-[1.04] mb-5"
            style={{ textShadow: '0 4px 36px rgba(0,0,0,0.6)', letterSpacing: '-0.01em', textWrap: 'balance', maxWidth: 360 }}
          >
            {empty ? 'Your memories will live here' : 'Quiet Mode'}
          </h1>
          <p className="relative text-white/65 text-[0.95rem] font-light leading-relaxed mb-1" style={{ maxWidth: 300 }}>
            {empty
              ? 'Add a few moments together — then come back to drift slowly through them, one breath at a time.'
              : `Drift slowly back through ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}.`}
          </p>
          {!empty && span && <p className="relative text-white/35 text-xs font-light">{span}</p>}

          <div className="relative mt-10 flex flex-col items-center gap-5">
            {empty ? (
              <>
                <div className="relative">
                  <div
                    aria-hidden
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ width: 260, height: 140, background: `radial-gradient(closest-side, ${rgbStr(accent, 0.5)} 0%, transparent 72%)`, filter: 'blur(8px)', animation: reduced ? undefined : 'quietHalo 4.2s ease-in-out infinite' }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); feedback.tapSilent(); setView('add-memory'); }}
                    className="relative flex items-center gap-2.5 px-8 py-4 rounded-full text-white font-medium text-sm active:scale-95 transition-transform"
                    style={{ background: rgbStr(accent, 0.24), border: `1px solid ${rgbStr(accentLight, 0.5)}`, backdropFilter: 'blur(12px)', boxShadow: `0 0 44px ${rgbStr(accent, 0.34)}` }}
                  >
                    <ImagePlus size={16} aria-hidden /> Add a memory
                  </button>
                </div>
                <button onClick={(e) => { e.stopPropagation(); exit(); }} className="text-white/45 text-xs tracking-wide py-2 px-3 active:scale-95 transition-transform">
                  Maybe later
                </button>
              </>
            ) : (
              <div className="relative">
                <div
                  aria-hidden
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ width: 240, height: 132, background: `radial-gradient(closest-side, ${rgbStr(accent, 0.5)} 0%, transparent 72%)`, filter: 'blur(6px)', animation: reduced ? undefined : 'quietHalo 4.2s ease-in-out infinite' }}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); void begin(); }}
                  className="group relative flex items-center gap-2.5 px-9 py-4 rounded-full text-white font-medium text-sm active:scale-95 transition-transform"
                  style={{ background: 'rgba(255,255,255,0.12)', border: `1px solid ${rgbStr(accentLight, 0.45)}`, backdropFilter: 'blur(12px)', boxShadow: `0 0 38px -6px ${rgbStr(accent, 0.45)}` }}
                >
                  <Play size={15} fill="currentColor" aria-hidden />
                  <span>Begin</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Floating UI ───────────────────────────────────────────────────── */}
      {phase === 'playing' && (
        <div className={`absolute inset-0 z-[50] flex flex-col justify-between pointer-events-none transition-all duration-700 ${showUI ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
          <div className="pointer-events-auto">
            <ViewHeader title="Quiet Mode" onBack={exit} variant="simple" borderless />
          </div>

          <div className="pointer-events-auto px-5 pb-7 flex flex-col items-center gap-4">
            {/* Scene picker */}
            {showScenes && (
              <div className="w-full max-w-md flex flex-col items-center gap-3" style={{ animation: reduced ? undefined : 'quietFadeIn 320ms ease both' }} role="group" aria-label="Soundscape">
                <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 py-1 max-w-full">
                  {SCENES.map((s) => {
                    const Icon = SCENE_ICON[s.icon];
                    const active = scene === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => pickScene(s.id)}
                        aria-pressed={active}
                        className={`flex items-center gap-2 px-4 min-h-[44px] rounded-full whitespace-nowrap transition-all border ${active ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/10 text-white/55'}`}
                      >
                        <Icon size={13} fill={active && s.icon === 'heart' ? 'currentColor' : 'none'} strokeWidth={1.8} />
                        <span className="text-xs font-medium">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 w-full max-w-[260px] px-2">
                  <VolumeX size={14} className="text-white/40 flex-shrink-0" aria-hidden />
                  <input
                    type="range" min={0} max={1} step={0.01} value={volume}
                    onChange={(e) => onVolume(parseFloat(e.target.value))}
                    aria-label="Soundscape volume"
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: '#fda4af', background: `linear-gradient(to right, rgba(253,164,175,0.9) ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%)` }}
                  />
                  <Volume2 size={14} className="text-white/40 flex-shrink-0" aria-hidden />
                </div>
              </div>
            )}

            {/* Transport bar */}
            <div className="flex items-center gap-1 bg-black/30 backdrop-blur-xl p-1.5 rounded-full border border-white/[0.08] shadow-2xl">
              {multi && (
                <>
                  <CtrlButton label="Previous memory" onClick={() => { advance(-1); revealUI(); }}><SkipBack size={18} /></CtrlButton>
                  <button
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                    className="w-12 h-12 rounded-full border border-white/25 text-white flex items-center justify-center transition-all active:scale-90 mx-0.5 hover:bg-white/10"
                  >
                    {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" className="ml-0.5" />}
                  </button>
                  <CtrlButton label="Next memory" onClick={() => { advance(1); revealUI(); }}><SkipForward size={18} /></CtrlButton>
                  <div className="w-px h-5 bg-white/[0.08] mx-1.5" />
                </>
              )}
              <CtrlButton label="Soundscape" active={showScenes} onClick={() => { feedback.tapSilent(); setShowScenes((v) => !v); revealUI(); }}>
                <Music2 size={17} />
              </CtrlButton>
              <CtrlButton label="Guided breathing" active={breathing} onClick={() => { feedback.tapSilent(); setBreathing((v) => !v); revealUI(); }}>
                <Activity size={17} />
              </CtrlButton>
            </div>

            {/* Progress + counter (only with 2+ memories) */}
            {multi && (
              <div className="flex items-center gap-3 text-white/40">
                <div className="w-28 h-[2px] rounded-full overflow-hidden bg-white/10">
                  <div
                    key={`${index}-${isPlaying}-${hidden}`}
                    className="h-full origin-left"
                    style={{
                      background: rgbStr(accentLight, 0.9),
                      transform: 'scaleX(0)',
                      animation: isPlaying && !hidden && !reduced ? `quietProgress ${slideMs}ms linear forwards` : 'none',
                    }}
                  />
                </div>
                <span className="text-[0.62rem] tracking-widest tabular-nums">{index + 1}/{memories.length}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
};

// Small round control button — 44px hit target (WCAG 2.5.5).
const CtrlButton: React.FC<{ label: string; active?: boolean; onClick: () => void; children: React.ReactNode }> = ({ label, active, onClick, children }) => (
  <button
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 ${active ? 'text-white bg-white/15' : 'text-white/55 hover:text-white/85'}`}
  >
    {children}
  </button>
);

/** "Across N years together" span line for the intro. */
function useMemoSpan(memories: Memory[]): string | null {
  return React.useMemo(() => {
    if (memories.length < 2) return null;
    let min = Infinity, max = -Infinity;
    for (const m of memories) {
      const t = new Date(m.date).getTime();
      if (Number.isNaN(t)) continue;
      if (t < min) min = t;
      if (t > max) max = t;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    const years = (max - min) / (365 * DAY);
    if (years >= 1) return `Across ${Math.round(years)} ${Math.round(years) === 1 ? 'year' : 'years'} together`;
    const months = Math.round((max - min) / (30 * DAY));
    if (months >= 1) return `Across ${months} ${months === 1 ? 'month' : 'months'}`;
    return null;
  }, [memories]);
}

/** Average + lightly saturate a loaded image into a pleasing accent colour. */
function sampleFromImage(img: HTMLImageElement): RGB | null {
  try {
    const N = 16;
    const c = document.createElement('canvas');
    c.width = N; c.height = N;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, N, N);
    const { data } = ctx.getImageData(0, 0, N, N);
    let r = 0, g = 0, b = 0, n = 0;
    let ar = 0, ag = 0, ab = 0, an = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      ar += data[i]; ag += data[i + 1]; ab += data[i + 2]; an++;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum < 18 || lum > 240) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    if (n === 0) { if (an === 0) return null; r = ar; g = ag; b = ab; n = an; }
    r /= n; g /= n; b /= n;
    const avg = (r + g + b) / 3;
    const sat = 1.3;
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(avg + (v - avg) * sat)));
    return { r: clamp(r), g: clamp(g), b: clamp(b) };
  } catch {
    return null; // tainted canvas (CORS) — caller keeps the prior accent
  }
}

/** Uniform Fisher–Yates shuffle, then float "on this day" memories to the front. */
function orderForDrift(data: Memory[]): Memory[] {
  const a = [...data];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const now = new Date();
  const onDay = (m: Memory) => {
    const d = new Date(m.date);
    return !Number.isNaN(d.getTime()) && sameMonthDay(d, now);
  };
  return [...a.filter(onDay), ...a.filter((m) => !onDay(m))];
}

const KEYFRAMES = `
@keyframes quietFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
@keyframes quietHalo {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 0.85; }
}
@keyframes quietProgress {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
@keyframes quietPlate {
  from { transform: scale(1); }
  to   { transform: scale(1.05); }
}
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
`;

export default QuietMode;
