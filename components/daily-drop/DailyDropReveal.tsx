/**
 * DailyDropReveal — the unseal CHOREOGRAPHY overlay.
 *
 * A short (~1.6s) full-bleed payoff moment played once when a drop becomes
 * `reveal_ready`. It renders NO answer content — it is pure transition theatre:
 * the sealed shape (the type's glyph) breathes, then "cracks" open, a colored
 * bloom (hue from DROP_META[type].hue) radiates and fades, and we hand off to
 * the view via onComplete().
 *
 * Motion contract (motionExperience.assert.mjs): transform + opacity ONLY in
 * keyframes — never width/height/filter/blur in a keyframe. The blur is a static
 * style; the bloom GROWS via `scale`, not by animating its radius. Honors
 * prefersReducedMotion() with a calm ~300ms fade-to-onComplete.
 *
 * AuraSignal-style soft glow: blur + mix-blend-screen on near-black, no canvas.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { DropType } from '../../types';
import { DROP_META } from '../../utils/dropEngine';
import { EASE_SILK, EASE_SOFT, prefersReducedMotion } from '../../utils/motion';
import { feedback } from '../../utils/feedback';
import type { DailyDropRevealProps } from './dropContract';

// Total wall-clock budget for the full choreography before onComplete fires.
const FULL_DURATION_MS = 1600;
const REDUCED_DURATION_MS = 300;
// When (within the full sequence) the seal visibly cracks open.
const CRACK_AT_MS = 560;
// When the bloom reaches its warm peak — the haptic milestone lands here.
const BLOOM_PEAK_MS = 1020;

/** Build the two tones of the bloom from the type's signature hue. */
function bloomTones(hue: number): { core: string; halo: string } {
  return {
    core: `hsl(${hue}, 90%, 72%)`,
    halo: `hsl(${(hue + 18) % 360}, 85%, 60%)`,
  };
}

export function DailyDropReveal({ type, onComplete }: DailyDropRevealProps) {
  const meta = DROP_META[type] ?? DROP_META.pulse;
  const { core, halo } = bloomTones(meta.hue);

  const reduced = prefersReducedMotion();
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Single source of truth for "this moment is over" — guarded so a late timer
  // or a double-mount can never fire onComplete twice.
  useEffect(() => {
    doneRef.current = false;
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onCompleteRef.current();
    };

    const timers: number[] = [];
    timers.push(window.setTimeout(finish, reduced ? REDUCED_DURATION_MS : FULL_DURATION_MS));

    if (!reduced) {
      // Tactile beats mirror the visual ones: a weighted "crack", a milestone bloom.
      timers.push(window.setTimeout(() => feedback.interact(), CRACK_AT_MS));
      timers.push(window.setTimeout(() => feedback.milestone(), BLOOM_PEAK_MS));
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [reduced, type]);

  // ── Reduced motion: a single calm fade, no theatre ────────────────────────
  if (reduced) {
    return (
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: REDUCED_DURATION_MS / 1000, times: [0, 0.35, 0.7, 1], ease: EASE_SOFT }}
        style={overlayStyle}
      >
        <div
          style={{
            width: 132,
            height: 132,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${core} 0%, ${halo} 55%, transparent 72%)`,
            filter: 'blur(28px)',
            mixBlendMode: 'screen',
            opacity: 0.85,
          }}
        />
        <span style={glyphStyle}>{meta.glyph}</span>
      </motion.div>
    );
  }

  // Convert ms beats into the proportional `times` array framer-motion wants.
  const t = (ms: number) => ms / FULL_DURATION_MS;

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 1, 0] }}
      transition={{ duration: FULL_DURATION_MS / 1000, times: [0, 0.12, t(CRACK_AT_MS), 0.85, 1], ease: EASE_SOFT }}
      style={overlayStyle}
    >
      {/* ── The colored bloom: starts as a pinpoint, radiates outward via scale,
            then dissolves. Static blur + screen blend = AuraSignal soft glow. ── */}
      <motion.div
        initial={{ scale: 0.15, opacity: 0 }}
        animate={{ scale: [0.15, 0.3, 1.55, 2.2], opacity: [0, 0, 0.95, 0] }}
        transition={{
          duration: FULL_DURATION_MS / 1000,
          times: [0, t(CRACK_AT_MS), t(BLOOM_PEAK_MS), 1],
          ease: EASE_SILK,
        }}
        style={{
          position: 'absolute',
          width: 260,
          height: 260,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${core} 0%, ${halo} 48%, transparent 70%)`,
          filter: 'blur(40px)',
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          willChange: 'transform, opacity',
        }}
      />

      {/* ── A second, slower halo ring for depth — same hue family, softer. ── */}
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 0.5, 2.4, 3.1], opacity: [0, 0, 0.4, 0] }}
        transition={{
          duration: FULL_DURATION_MS / 1000,
          times: [0, t(CRACK_AT_MS), t(BLOOM_PEAK_MS + 120), 1],
          ease: EASE_SILK,
        }}
        style={{
          position: 'absolute',
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${halo} 0%, transparent 68%)`,
          filter: 'blur(64px)',
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          willChange: 'transform, opacity',
        }}
      />

      {/* ── The sealed shape: a soft disc that breathes, tightens, then the glyph
            "cracks" — splits apart and lifts away as the bloom takes over. ── */}
      <motion.div
        initial={{ scale: 0.86, opacity: 0 }}
        animate={{ scale: [0.86, 1, 1.04, 0.94, 1.18], opacity: [0, 1, 1, 1, 0] }}
        transition={{
          duration: FULL_DURATION_MS / 1000,
          times: [0, 0.18, 0.32, t(CRACK_AT_MS), t(BLOOM_PEAK_MS)],
          ease: EASE_SOFT,
        }}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          willChange: 'transform, opacity',
        }}
      >
        {/* Seal disc — a warm wax-seal coin behind the glyph. */}
        <div
          style={{
            position: 'absolute',
            width: 108,
            height: 108,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 40px ${halo}`,
            border: '1px solid rgba(255,255,255,0.16)',
          }}
        />

        {/* Top crack-half of the glyph — lifts up and tilts as it opens. */}
        <motion.span
          initial={{ y: 0, rotate: 0, opacity: 1 }}
          animate={{ y: [0, 0, -14, -34], rotate: [0, 0, -5, -11], opacity: [1, 1, 1, 0] }}
          transition={{
            duration: FULL_DURATION_MS / 1000,
            times: [0, t(CRACK_AT_MS - 40), t(CRACK_AT_MS + 120), t(BLOOM_PEAK_MS)],
            ease: EASE_SILK,
          }}
          style={{ ...glyphHalfStyle, clipPath: 'inset(0 0 50% 0)' }}
        >
          {meta.glyph}
        </motion.span>

        {/* Bottom crack-half — drops down and tilts the other way. */}
        <motion.span
          initial={{ y: 0, rotate: 0, opacity: 1 }}
          animate={{ y: [0, 0, 14, 34], rotate: [0, 0, 5, 11], opacity: [1, 1, 1, 0] }}
          transition={{
            duration: FULL_DURATION_MS / 1000,
            times: [0, t(CRACK_AT_MS - 40), t(CRACK_AT_MS + 120), t(BLOOM_PEAK_MS)],
            ease: EASE_SILK,
          }}
          style={{ ...glyphHalfStyle, clipPath: 'inset(50% 0 0 0)' }}
        >
          {meta.glyph}
        </motion.span>
      </motion.div>
    </motion.div>
  );
}

// ── Static styles (no animated properties here) ─────────────────────────────

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // Near-black with a soft vignette so the colored bloom reads as light.
  background:
    'radial-gradient(circle at 50% 46%, #1b1418 0%, #0d0a0c 62%, #070506 100%)',
  overflow: 'hidden',
  pointerEvents: 'none',
};

const glyphStyle: CSSProperties = {
  position: 'relative',
  fontSize: 56,
  lineHeight: 1,
  zIndex: 1,
  filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.45))',
};

const glyphHalfStyle: CSSProperties = {
  position: 'absolute',
  fontSize: 56,
  lineHeight: 1,
  zIndex: 1,
  willChange: 'transform, opacity',
  filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.45))',
};

export default DailyDropReveal;
