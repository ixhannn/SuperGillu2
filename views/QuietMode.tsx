import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  X, Play, Pause, SkipBack, SkipForward, Music2, Wind as WindIcon,
  Heart, CloudRain, Waves, Activity, VolumeX, Volume2, Sparkles,
} from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { ViewState, Memory } from '../types';
import { StorageService } from '../services/storage';
import { ConstellationCanvas } from '../components/ConstellationCanvas';
import { BreathingGuide } from '../components/quiet/BreathingGuide';
import { buildDemoMemories } from '../components/quiet/demoMemories';
import { SoundscapeEngine, SCENES, Soundscape, SceneMeta } from '../services/quietMode/soundscape';
import { prefersReducedMotion } from '../utils/motion';
import { feedback } from '../utils/feedback';
import { isE2EAppMode } from '../services/e2eHarness';

interface QuietModeProps {
  setView: (view: ViewState) => void;
}

// ─── Timing ──────────────────────────────────────────────────────────────────
const SLIDE_VISIBLE_MS = 9000;   // how long each memory rests on screen
const FADE_OUT_MS = 1400;        // content receding before the swap
const REDUCED_SLIDE_MS = 12000;  // calmer cadence when motion is reduced

// Scene id → lucide icon component.
const SCENE_ICON: Record<SceneMeta['icon'], React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; fill?: string }>> = {
  heart: Heart, 'cloud-rain': CloudRain, waves: Waves, activity: Activity, wind: WindIcon, 'volume-x': VolumeX,
};

// Mood → emoji (aligned with the rest of the app's mood vocabulary).
const MOOD_EMOJI: Record<string, string> = {
  love: '😍', loved: '🥰', romantic: '💕', funny: '😂', party: '🥳', happy: '😊',
  joyful: '✨', excited: '🎉', playful: '😝', peace: '😌', peaceful: '☮️', calm: '😌',
  content: '😊', grateful: '🙏', cute: '🥺', tender: '💗', thoughtful: '💭', quiet: '🤫',
};
const moodEmoji = (mood?: string): string | null => (mood ? MOOD_EMOJI[mood.toLowerCase()] ?? null : null);

/** A warm, human "X ago" — and "today" when it lands on the anniversary of the day. */
function relativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const years = Math.floor(days / 365);
  if (years >= 1) {
    const sameDay = d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    const base = `${years} ${years === 1 ? 'year' : 'years'} ago`;
    return sameDay ? `${base} today` : base;
  }
  const months = Math.floor(days / 30);
  if (months >= 1) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks >= 1) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  return `${days} days ago`;
}

export const QuietMode: React.FC<QuietModeProps> = ({ setView }) => {
  const reduced = prefersReducedMotion();
  const slideMs = reduced ? REDUCED_SLIDE_MS : SLIDE_VISIBLE_MS;

  // ── Data ───────────────────────────────────────────────────────────────────
  const [memories, setMemories] = useState<Memory[]>([]);
  const [index, setIndex] = useState(0);
  const [currentMemory, setCurrentMemory] = useState<Memory | undefined>(undefined);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [contentOpacity, setContentOpacity] = useState(0);
  // Photo-reactive ambient tint — sampled from the current image so the whole
  // room subtly takes on the mood-colour of the memory you're looking at.
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

  // ── Refs (avoid stale closures / re-creating timers) ─────────────────────────
  const engineRef = useRef<SoundscapeEngine | null>(null);
  if (!engineRef.current) engineRef.current = new SoundscapeEngine();
  const imageCacheRef = useRef<Map<string, string | null>>(new Map());
  const uiTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pinnedRef = useRef(false);
  const memoriesRef = useRef<Memory[]>([]);
  const transitioningRef = useRef(false);

  // Load + shuffle memories once ("on this day" floats to the front).
  useEffect(() => {
    let data = StorageService.getMemories().filter((m) => m.text || m.image || m.imageId || m.storagePath);
    if (data.length === 0 && isE2EAppMode()) data = buildDemoMemories();
    const ordered = orderForDrift(data);
    setMemories(ordered);
    memoriesRef.current = ordered;
    setCurrentMemory(ordered[0]);
    const engine = engineRef.current!;
    engine.setVolume(0.7);
    return () => engine.dispose();
  }, []);

  // Sample the current photo for the ambient tint.
  useEffect(() => {
    if (!currentImage) { setAccent(ROSE); return; }
    let cancelled = false;
    sampleAccent(currentImage).then((rgb) => { if (!cancelled && rgb) setAccent(rgb); });
    return () => { cancelled = true; };
  }, [currentImage]);

  // Pause audio + advancing while the tab/app is hidden; restore on return.
  useEffect(() => {
    const onVis = () => {
      const isHidden = document.hidden;
      setHidden(isHidden);
      const engine = engineRef.current;
      if (!engine) return;
      if (isHidden) void engine.suspend();
      else if (phase === 'playing') void engine.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [phase]);

  // Keep "should the UI stay pinned open" in a ref the auto-hide timer can read.
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

  // ── Slide transitions ────────────────────────────────────────────────────────
  const showSlide = useCallback(async (nextIndex: number) => {
    const mems = memoriesRef.current;
    if (mems.length === 0) return;
    transitioningRef.current = true;
    setContentOpacity(0);
    await new Promise((r) => setTimeout(r, reduced ? 700 : FADE_OUT_MS));

    const mem = mems[nextIndex];
    setIndex(nextIndex);
    setCurrentMemory(mem);
    const img = await getMemoryImage(mem);
    setCurrentImage(img);
    prefetch(mems[(nextIndex + 1) % mems.length]);

    requestAnimationFrame(() => {
      setContentOpacity(1);
      transitioningRef.current = false;
    });
  }, [getMemoryImage, prefetch, reduced]);

  const advance = useCallback((dir: 1 | -1) => {
    const mems = memoriesRef.current;
    if (mems.length === 0 || transitioningRef.current) return;
    const next = (index + dir + mems.length) % mems.length;
    void showSlide(next);
  }, [index, showSlide]);

  // Auto-advance loop — pauses on !isPlaying or while hidden, restarts per slide.
  useEffect(() => {
    if (phase !== 'playing' || !isPlaying || hidden || memories.length === 0) return;
    const t = setTimeout(() => {
      const mems = memoriesRef.current;
      void showSlide((index + 1) % mems.length);
    }, slideMs);
    return () => clearTimeout(t);
  }, [index, isPlaying, hidden, phase, memories.length, slideMs, showSlide]);

  // ── Begin (also satisfies the audio autoplay gesture) ────────────────────────
  const begin = useCallback(async () => {
    feedback.tapSilent();
    const engine = engineRef.current!;
    await engine.resume();
    engine.setScene(scene);
    setPhase('playing');
    const mems = memoriesRef.current;
    const mem = mems[0];
    setCurrentMemory(mem);
    const img = await getMemoryImage(mem);
    setCurrentImage(img);
    prefetch(mems[1]);
    requestAnimationFrame(() => setContentOpacity(1));
    revealUI();
  }, [scene, getMemoryImage, prefetch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls ──────────────────────────────────────────────────────────────────
  const exit = useCallback(() => {
    feedback.tapSilent();
    engineRef.current?.dispose();
    setView('home');
  }, [setView]);

  const togglePlay = useCallback(() => {
    feedback.tapSilent();
    setIsPlaying((p) => !p);
    revealUI();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickScene = useCallback((s: Soundscape) => {
    feedback.tapSilent();
    setSceneState(s);
    engineRef.current?.resume();
    engineRef.current?.setScene(s);
  }, []);

  const onVolume = useCallback((v: number) => {
    setVolume(v);
    engineRef.current?.setVolume(v);
  }, []);

  // ── UI auto-hide ──────────────────────────────────────────────────────────────
  const revealUI = useCallback(() => {
    setShowUI(true);
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => {
      if (!pinnedRef.current) setShowUI(false);
    }, 4500);
  }, []);

  useEffect(() => () => { if (uiTimerRef.current) clearTimeout(uiTimerRef.current); }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { exit(); }
      else if (phase === 'playing' && e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (phase === 'playing' && e.key === 'ArrowRight') { advance(1); revealUI(); }
      else if (phase === 'playing' && e.key === 'ArrowLeft') { advance(-1); revealUI(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exit, togglePlay, advance, phase, revealUI]);

  const span = useMemoSpan(memories);

  // ─────────────────────────────────────────────────────────────────────────────
  return ReactDOM.createPortal(
    <div
      onClick={revealUI}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{ background: accentGradient(accent), transition: 'background 1600ms ease' }}
    >
      <style>{KEYFRAMES}</style>

      {/* Constellation — always faintly alive behind everything */}
      <div className="absolute inset-0 z-[1]" style={{ opacity: currentImage ? 0.32 : 0.7, transition: 'opacity 1600ms ease' }}>
        <ConstellationCanvas />
      </div>

      {/* Blurred, drifting backdrop of the current photo */}
      <div className="absolute inset-0 z-[2] overflow-hidden" style={{ opacity: currentImage ? 1 : 0, transition: 'opacity 1600ms ease' }}>
        <div
          className="absolute inset-[-12%]"
          style={{
            backgroundImage: currentImage ? `url(${currentImage})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(26px) brightness(0.5) saturate(1.15)',
            willChange: 'transform',
            transform: reduced ? 'scale(1.1)' : undefined,
            animation: reduced ? undefined : 'quietDrift 28s ease-in-out infinite alternate',
          }}
        />
      </div>

      {/* Cinematic vignette + warm wash + film grain */}
      <div className="absolute inset-0 z-[3] pointer-events-none" style={{ background: 'radial-gradient(120% 90% at 50% 45%, transparent 35%, rgba(4,2,8,0.55) 100%)' }} />
      <div className="absolute inset-0 z-[3] pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(4,2,8,0.45) 0%, transparent 22%, transparent 70%, rgba(4,2,8,0.7) 100%)' }} />
      <div className="absolute inset-0 z-[3] pointer-events-none mix-blend-overlay opacity-[0.06]" style={{ backgroundImage: GRAIN_SVG, backgroundSize: '180px 180px' }} />

      {/* Breathing pacer */}
      {breathing && phase === 'playing' && <BreathingGuide />}

      {/* Content — framed photo + caption */}
      <div
        className="relative z-10 px-7 max-w-md w-full text-center flex flex-col items-center"
        style={{
          opacity: contentOpacity,
          transform: contentOpacity ? 'scale(1)' : 'scale(1.03)',
          transition: `opacity ${reduced ? 900 : 1800}ms ease, transform ${reduced ? 900 : 1800}ms cubic-bezier(0.16,1,0.3,1)`,
        }}
      >
        {currentImage && (
          <div
            className="mb-9 relative"
            style={{
              borderRadius: 6,
              padding: 10,
              background: 'linear-gradient(160deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04))',
              boxShadow: '0 30px 70px -20px rgba(0,0,0,0.75), 0 2px 0 rgba(255,255,255,0.18) inset',
              maxHeight: '48vh',
              maxWidth: '86vw',
              transform: 'rotate(-0.6deg)',
            }}
          >
            <img src={currentImage} alt={currentMemory?.text || 'A memory'} className="block w-full h-full object-contain rounded-[2px] max-h-[42vh]" />
          </div>
        )}

        {currentMemory && (
          <div className="space-y-4 max-w-sm">
            {moodEmoji(currentMemory.mood) && (
              <div className="text-3xl leading-none" style={{ filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.4))' }}>
                {moodEmoji(currentMemory.mood)}
              </div>
            )}
            {currentMemory.text && (
              <p className="font-serif text-2xl md:text-[1.7rem] text-white/95 leading-relaxed tracking-wide" style={{ textShadow: '0 2px 24px rgba(0,0,0,0.55)' }}>
                &ldquo;{currentMemory.text}&rdquo;
              </p>
            )}
            <div className="w-10 h-px bg-white/25 mx-auto" />
            <p className="text-white/55 text-[0.7rem] uppercase tracking-[0.25em] font-light">
              {relativeTime(currentMemory.date)}
              <span className="text-white/30"> · </span>
              {new Date(currentMemory.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}

        {!currentMemory && phase === 'playing' && (
          <div className="flex flex-col items-center gap-4 text-white/50">
            <Sparkles size={28} className="animate-pulse" />
            <p className="text-sm font-light">Drifting into memories…</p>
          </div>
        )}
      </div>

      {/* ── Intro overlay ────────────────────────────────────────────────── */}
      {phase === 'intro' && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center px-8 text-center" style={{ animation: 'quietFadeIn 900ms ease both' }}>
          <p className="text-white/45 text-[0.62rem] uppercase tracking-[0.4em] mb-5">Breathe</p>
          <h1 className="font-serif text-white text-5xl mb-4" style={{ textShadow: '0 4px 30px rgba(0,0,0,0.6)' }}>Quiet Mode</h1>
          <p className="text-white/65 text-sm font-light max-w-xs leading-relaxed mb-1">
            {memories.length > 0
              ? `Drift slowly back through ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}.`
              : 'Add a memory first, then drift back through them here.'}
          </p>
          {span && <p className="text-white/35 text-xs font-light mb-10">{span}</p>}
          {memories.length === 0 && <div className="mb-10" />}

          {memories.length > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); void begin(); }}
              className="group relative flex items-center gap-2.5 px-8 py-3.5 rounded-full text-white font-medium text-sm active:scale-95 transition-transform"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.28)', backdropFilter: 'blur(12px)', animation: 'quietGlow 3.6s ease-in-out infinite' }}
            >
              <Play size={16} fill="currentColor" />
              <span>Begin</span>
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); exit(); }}
              className="flex items-center gap-2 px-7 py-3 rounded-full text-white/90 text-sm bg-white/10 border border-white/20 active:scale-95 transition-transform"
            >
              <X size={16} /> Back
            </button>
          )}
        </div>
      )}

      {/* ── Floating UI ──────────────────────────────────────────────────── */}
      {phase === 'playing' && (
        <div className={`absolute inset-0 z-[50] flex flex-col justify-between pointer-events-none transition-all duration-700 ${showUI ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
          {/* Top: header */}
          <div className="pointer-events-auto">
            <ViewHeader title="Quiet Mode" onBack={exit} variant="simple" borderless />
          </div>

          {/* Bottom cluster */}
          <div className="pointer-events-auto px-5 pb-7 flex flex-col items-center gap-4">
            {/* Scene picker */}
            {showScenes && (
              <div className="w-full max-w-md flex flex-col items-center gap-3" style={{ animation: 'quietFadeIn 320ms ease both' }}>
                <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 py-1 max-w-full">
                  {SCENES.map((s) => {
                    const Icon = SCENE_ICON[s.icon];
                    const active = scene === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => pickScene(s.id)}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-full whitespace-nowrap transition-all border ${active ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/10 text-white/55'}`}
                      >
                        <Icon size={13} fill={active && s.icon === 'heart' ? 'currentColor' : 'none'} strokeWidth={1.8} />
                        <span className="text-xs font-medium">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Volume */}
                <div className="flex items-center gap-3 w-full max-w-[260px] px-2">
                  <VolumeX size={14} className="text-white/40 flex-shrink-0" />
                  <input
                    type="range" min={0} max={1} step={0.01} value={volume}
                    onChange={(e) => onVolume(parseFloat(e.target.value))}
                    aria-label="Soundscape volume"
                    className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: '#fda4af', background: `linear-gradient(to right, rgba(253,164,175,0.9) ${volume * 100}%, rgba(255,255,255,0.15) ${volume * 100}%)` }}
                  />
                  <Volume2 size={14} className="text-white/40 flex-shrink-0" />
                </div>
              </div>
            )}

            {/* Transport bar */}
            <div className="flex items-center gap-1 bg-black/35 backdrop-blur-xl p-1.5 rounded-full border border-white/10 shadow-2xl">
              <CtrlButton label="Previous memory" onClick={() => { advance(-1); revealUI(); }}><SkipBack size={18} /></CtrlButton>
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-all active:scale-90 mx-0.5"
              >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
              </button>
              <CtrlButton label="Next memory" onClick={() => { advance(1); revealUI(); }}><SkipForward size={18} /></CtrlButton>

              <div className="w-px h-5 bg-white/10 mx-1.5" />

              <CtrlButton label="Soundscape" active={showScenes} onClick={() => { feedback.tapSilent(); setShowScenes((v) => !v); revealUI(); }}>
                <Music2 size={17} />
              </CtrlButton>
              <CtrlButton label="Guided breathing" active={breathing} onClick={() => { feedback.tapSilent(); setBreathing((v) => !v); revealUI(); }}>
                <Activity size={17} />
              </CtrlButton>
            </div>

            {/* Progress + counter */}
            <div className="flex items-center gap-3 text-white/40">
              <div className="w-28 h-[2px] rounded-full overflow-hidden bg-white/10">
                <div
                  key={`${index}-${isPlaying}-${hidden}`}
                  className="h-full origin-left"
                  style={{
                    background: `rgba(${accent.r},${accent.g},${accent.b},0.9)`,
                    transform: 'scaleX(0)',
                    animation: isPlaying && !hidden ? `quietProgress ${slideMs}ms linear forwards` : 'none',
                  }}
                />
              </div>
              <span className="text-[0.62rem] tracking-widest tabular-nums">{memories.length ? index + 1 : 0}/{memories.length}</span>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
};

// Small round control button.
const CtrlButton: React.FC<{ label: string; active?: boolean; onClick: () => void; children: React.ReactNode }> = ({ label, active, onClick, children }) => (
  <button
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${active ? 'text-white bg-white/15' : 'text-white/55 hover:text-white/80'}`}
  >
    {children}
  </button>
);

/** "Across N years together" style span line for the intro. */
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
    const years = (max - min) / (365 * 86_400_000);
    if (years >= 1) return `Across ${Math.round(years)} ${Math.round(years) === 1 ? 'year' : 'years'} together`;
    const months = Math.round((max - min) / (30 * 86_400_000));
    if (months >= 1) return `Across ${months} ${months === 1 ? 'month' : 'months'}`;
    return null;
  }, [memories]);
}

// ─── Ambient tint ──────────────────────────────────────────────────────────────
interface RGB { r: number; g: number; b: number; }
const ROSE: RGB = { r: 253, g: 164, b: 175 };

/** Deep, warm base gradient tinted toward the current photo's dominant colour. */
function accentGradient(a: RGB): string {
  const top = `rgb(${Math.round(a.r * 0.22 + 14)},${Math.round(a.g * 0.22 + 8)},${Math.round(a.b * 0.22 + 12)})`;
  return `radial-gradient(125% 125% at 50% 0%, ${top} 0%, #120a11 46%, #06040a 100%)`;
}

/** Average + lightly saturate a thumbnail of the image for a pleasing accent. */
function sampleAccent(src: string): Promise<RGB | null> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const N = 16;
          const c = document.createElement('canvas');
          c.width = N; c.height = N;
          const ctx = c.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, N, N);
          const { data } = ctx.getImageData(0, 0, N, N);
          let r = 0, g = 0, b = 0, n = 0;
          let ar = 0, ag = 0, ab = 0, an = 0; // unfiltered fallback
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 8) continue; // skip transparent
            ar += data[i]; ag += data[i + 1]; ab += data[i + 2]; an++;
            // Prefer mid-tones so vignettes/highlights don't muddy the tint.
            const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (lum < 18 || lum > 240) continue;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
          }
          if (n === 0) {
            if (an === 0) return resolve(null);
            r = ar; g = ag; b = ab; n = an; // fall back to plain average
          }
          r /= n; g /= n; b /= n;
          // Gentle saturation lift toward the dominant channel.
          const avg = (r + g + b) / 3;
          const sat = 1.25;
          const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(avg + (v - avg) * sat)));
          resolve({ r: clamp(r), g: clamp(g), b: clamp(b) });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    } catch {
      resolve(null);
    }
  });
}

/** Shuffle, then float "on this day" memories (same month + day) to the front. */
function orderForDrift(data: Memory[]): Memory[] {
  const shuffled = [...data].sort(() => 0.5 - Math.random());
  const now = new Date();
  const onThisDay = (m: Memory) => {
    const d = new Date(m.date);
    return !Number.isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  const front = shuffled.filter(onThisDay);
  const rest = shuffled.filter((m) => !onThisDay(m));
  return [...front, ...rest];
}

const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const KEYFRAMES = `
@keyframes quietDrift {
  0%   { transform: scale(1.06) translate3d(-1.2%, -1%, 0); }
  100% { transform: scale(1.16) translate3d(1.4%, 1.2%, 0); }
}
@keyframes quietFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}
@keyframes quietGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(253,164,175,0.0); }
  50%      { box-shadow: 0 0 36px 2px rgba(253,164,175,0.35); }
}
@keyframes quietProgress {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
`;

export default QuietMode;
