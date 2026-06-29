/**
 * Pulse.tsx — the one-tap, lowest-friction Daily Drop.
 *
 * A contained "moment": a deep near-black panel with a single soft, breathing
 * glow — the visual reuse of AuraSignal's FluidBackground (blurred mix-blend
 * blobs, NO canvas/WebGL). The whole panel is light-app-respectful by being a
 * *contained* dark surface (rounded, inset), not a full dark theme.
 *
 * Phases (DropTypeProps contract):
 *  - input    → one big breathing orb. Press-and-hold (~600ms radial charge) OR
 *               a single firm tap sends. On send: feedback.milestone() +
 *               onSubmit('pulsed'); the orb pulses outward on release.
 *  - waiting  → my orb stays softly lit/breathing; "Pulse sent 💗 — waiting…".
 *  - revealed → both glows drift together into one shared bloom; "You're both here 💞".
 *
 * Motion: transform + opacity only; reduced-motion honored throughout.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DropTypeProps } from '../dropContract';
import { DROP_META } from '../../../utils/dropEngine';
import {
  springGentle,
  springSnappy,
  EASE_SILK,
  EASE_SOFT,
  prefersReducedMotion,
} from '../../../utils/motion';
import { feedback } from '../../../utils/feedback';
import { Haptics } from '../../../services/haptics';

// ── Palette — pulse's warm pink, contained on near-black ─────────────────────
const HUE = DROP_META.pulse.hue; // 335 — warm rose/pink
const GLOW = `hsl(${HUE} 85% 64%)`;
const GLOW_SOFT = `hsla(${HUE}, 85%, 64%, 0.55)`;
const GLOW_FAINT = `hsla(${HUE}, 85%, 70%, 0.30)`;
const PARTNER_HUE = (HUE + 40) % 360; // a sister tone for the partner glow
const PARTNER_GLOW = `hsl(${PARTNER_HUE} 80% 66%)`;

const CHARGE_MS = 600;
const TICK_MS = 16;

// A contained near-black surface — the "moment" panel.
const PANEL_BG = 'radial-gradient(120% 120% at 50% 30%, #1c1320 0%, #120c16 55%, #0c080f 100%)';

// ─────────────────────────────────────────────────────────────────────────────
// Drifting blurred background blobs — direct lineage from AuraSignal's
// FluidBackground (mix-blend + blur, transform/opacity only, no canvas).
// ─────────────────────────────────────────────────────────────────────────────
interface FluidGlowProps {
  color: string;
  reduce: boolean;
  intensity?: number; // 0..1 opacity scale
}

const FluidGlow: React.FC<FluidGlowProps> = ({ color, reduce, intensity = 1 }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 1.2, ease: EASE_SOFT }}
    className="absolute inset-0 z-0 overflow-hidden pointer-events-none mix-blend-screen"
    aria-hidden
  >
    <motion.div
      animate={reduce ? { opacity: 0.4 * intensity } : {
        x: ['-8%', '8%', '-8%'],
        y: ['-6%', '8%', '-6%'],
        scale: [1, 1.18, 1],
      }}
      transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      className="absolute top-[-10%] right-[12%] w-[22rem] h-[22rem] rounded-full blur-[90px]"
      style={{ backgroundColor: color, opacity: 0.32 * intensity }}
    />
    <motion.div
      animate={reduce ? { opacity: 0.45 * intensity } : {
        x: ['8%', '-8%', '8%'],
        y: ['8%', '-8%', '8%'],
        scale: [1.15, 1, 1.15],
      }}
      transition={{ duration: 21, repeat: Infinity, ease: 'easeInOut' }}
      className="absolute bottom-[-12%] left-[10%] w-[18rem] h-[18rem] rounded-full blur-[80px]"
      style={{ backgroundColor: color, opacity: 0.4 * intensity }}
    />
  </motion.div>
);

// Shared shell for every phase: the contained dark panel.
const PulsePanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 14, scale: 0.985 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.5, ease: EASE_SILK }}
    className="relative w-full overflow-hidden rounded-[1.75rem] select-none"
    style={{
      background: PANEL_BG,
      border: '1px solid rgba(255,255,255,0.06)',
      boxShadow: `0 24px 70px ${GLOW_FAINT}, inset 0 1px 0 rgba(255,255,255,0.05)`,
      minHeight: 360,
    }}
  >
    {children}
  </motion.div>
);

// ─────────────────────────────────────────────────────────────────────────────
// INPUT — the breathing, chargeable orb.
// ─────────────────────────────────────────────────────────────────────────────
interface OrbInputProps {
  title: string;
  submitting: boolean;
  reduce: boolean;
  onCommit: () => void;
}

const OrbInput: React.FC<OrbInputProps> = ({ title, submitting, reduce, onCommit }) => {
  const [progress, setProgress] = useState(0); // 0..100
  const [released, setReleased] = useState(false); // outward pulse on send
  const [sent, setSent] = useState(false);
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const pressedAtRef = useRef(0);

  useEffect(() => () => {
    if (holdRef.current) clearInterval(holdRef.current);
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
  }, []);

  const commit = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (holdRef.current) clearInterval(holdRef.current);
    holdRef.current = null;
    setProgress(100);
    setReleased(true);
    setSent(true);
    feedback.milestone();
    // Let the outward pulse breathe before the phase swaps to 'waiting'.
    commitTimerRef.current = window.setTimeout(onCommit, reduce ? 0 : 520);
  };

  const startCharge = (e: React.PointerEvent) => {
    if (sent || submitting || firedRef.current) return;
    // Keep every subsequent move/up event targeted to the orb even when the
    // finger drifts off it during a deliberate hold — without this, a small
    // drift fires onPointerLeave and commits the pulse early.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture unsupported */ }
    feedback.tap();
    pressedAtRef.current = Date.now();
    if (reduce) return; // reduced-motion: a single firm tap commits on release
    let p = 0;
    holdRef.current = setInterval(() => {
      p += (TICK_MS / CHARGE_MS) * 100;
      const next = Math.min(100, p);
      setProgress(next);
      Haptics.longPressProgress(next / 100);
      if (next >= 100) commit();
    }, TICK_MS);
  };

  const endCharge = () => {
    if (sent || firedRef.current) return;
    if (holdRef.current) {
      clearInterval(holdRef.current);
      holdRef.current = null;
    }
    const held = Date.now() - pressedAtRef.current;
    // A short, firm tap (released before the hold completes) still sends — the
    // lowest-friction path. Reduced-motion always lands here.
    if (held < CHARGE_MS) {
      commit();
    } else {
      setProgress(0);
    }
  };

  // SVG ring geometry
  const R = 78;
  const C = 2 * Math.PI * R;

  return (
    <div className="relative z-10 flex flex-col items-center justify-center px-6 py-10 text-center">
      <p
        className="mb-1 text-[10px] uppercase tracking-[0.3em] font-bold"
        style={{ color: 'rgba(255,255,255,0.5)' }}
      >
        {DROP_META.pulse.label}
      </p>
      <h2
        className="font-serif text-2xl font-bold mb-8 px-2 max-w-[280px]"
        style={{ color: '#fff', textWrap: 'balance' }}
      >
        {title}
      </h2>

      <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
        {/* Outward release pulse — a ring that blooms out then fades */}
        <AnimatePresence>
          {released && !reduce && (
            <motion.div
              key="release-ring"
              initial={{ scale: 0.7, opacity: 0.7 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.8, ease: EASE_SILK }}
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 168,
                height: 168,
                background: `radial-gradient(circle, ${GLOW_SOFT} 0%, transparent 70%)`,
              }}
            />
          )}
        </AnimatePresence>

        {/* Ambient breathing halo behind the orb */}
        <motion.div
          animate={reduce ? { opacity: 0.5 } : { scale: [1, 1.12, 1], opacity: [0.45, 0.7, 0.45] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 200,
            height: 200,
            background: `radial-gradient(circle, ${GLOW_SOFT} 0%, transparent 68%)`,
            filter: 'blur(8px)',
          }}
          aria-hidden
        />

        {/* Charge progress ring (transform/opacity-safe: only strokeDashoffset) */}
        <svg
          width={200}
          height={200}
          viewBox="0 0 200 200"
          className="absolute -rotate-90 pointer-events-none"
          aria-hidden
        >
          <circle cx={100} cy={100} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4} />
          <circle
            cx={100}
            cy={100}
            r={R}
            fill="none"
            stroke={GLOW}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C - (C * progress) / 100}
            style={{ transition: 'stroke-dashoffset 90ms linear', filter: `drop-shadow(0 0 6px ${GLOW})` }}
          />
        </svg>

        {/* The orb itself */}
        <motion.button
          type="button"
          onPointerDown={startCharge}
          onPointerUp={endCharge}
          onPointerCancel={endCharge}
          onContextMenu={(e) => e.preventDefault()}
          disabled={submitting || sent}
          aria-label={`Send a pulse — ${title}`}
          className="relative rounded-full flex flex-col items-center justify-center spring-press"
          style={{
            width: 132,
            height: 132,
            background: `radial-gradient(circle at 38% 32%, hsl(${HUE} 90% 74%) 0%, ${GLOW} 48%, hsl(${HUE} 78% 48%) 100%)`,
            boxShadow: `0 0 ${28 + progress * 0.55}px ${GLOW_SOFT}, inset 0 2px 8px rgba(255,255,255,0.4), inset 0 -8px 16px rgba(0,0,0,0.25)`,
            border: 'none',
            cursor: sent ? 'default' : 'pointer',
            touchAction: 'none',
          }}
          animate={
            sent
              ? { scale: reduce ? 1 : [1, 1.14, 1] }
              : reduce
                ? { scale: 1 }
                : { scale: [1, 1.035, 1] }
          }
          transition={
            sent
              ? { duration: 0.55, ease: EASE_SILK }
              : { duration: 4, repeat: Infinity, ease: 'easeInOut' }
          }
          whileTap={reduce ? undefined : { scale: 0.94 }}
        >
          {/* Glossy inner sheen */}
          <span
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ background: 'linear-gradient(150deg, rgba(255,255,255,0.4) 0%, transparent 52%)' }}
            aria-hidden
          />
          <span className="relative z-10" style={{ fontSize: 40, lineHeight: 1 }}>
            {DROP_META.pulse.glyph}
          </span>
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {!sent ? (
          <motion.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-8 text-[12px] font-medium"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            {reduce ? 'Tap to send' : 'Hold to send — or a firm tap'}
          </motion.p>
        ) : (
          <motion.p
            key="sending"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE_SOFT }}
            className="mt-8 text-[13px] font-semibold"
            style={{ color: '#fff' }}
          >
            Sent 💗
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// WAITING — my orb stays softly lit/breathing; never shows partner's response.
// ─────────────────────────────────────────────────────────────────────────────
const OrbWaiting: React.FC<{ partnerName: string; reduce: boolean }> = ({ partnerName, reduce }) => (
  <div className="relative z-10 flex flex-col items-center justify-center px-6 py-12 text-center">
    <p
      className="mb-6 text-[10px] uppercase tracking-[0.3em] font-bold"
      style={{ color: 'rgba(255,255,255,0.5)' }}
    >
      Pulse sealed
    </p>

    <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
      <motion.div
        animate={reduce ? { opacity: 0.5 } : { scale: [1, 1.16, 1], opacity: [0.4, 0.62, 0.4] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 170,
          height: 170,
          background: `radial-gradient(circle, ${GLOW_SOFT} 0%, transparent 68%)`,
          filter: 'blur(6px)',
        }}
        aria-hidden
      />
      <motion.div
        animate={reduce ? { scale: 1 } : { scale: [1, 1.04, 1] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative rounded-full flex items-center justify-center"
        style={{
          width: 104,
          height: 104,
          background: `radial-gradient(circle at 38% 32%, hsl(${HUE} 90% 74%) 0%, ${GLOW} 50%, hsl(${HUE} 78% 50%) 100%)`,
          boxShadow: `0 0 32px ${GLOW_SOFT}, inset 0 2px 8px rgba(255,255,255,0.4), inset 0 -8px 16px rgba(0,0,0,0.25)`,
        }}
      >
        <span
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: 'linear-gradient(150deg, rgba(255,255,255,0.4) 0%, transparent 52%)' }}
          aria-hidden
        />
        <span className="relative z-10" style={{ fontSize: 34, lineHeight: 1 }}>
          {DROP_META.pulse.glyph}
        </span>
      </motion.div>
    </div>

    <h3 className="font-serif text-xl font-bold mt-7 mb-1.5" style={{ color: '#fff' }}>
      Pulse sent 💗
    </h3>
    <p className="text-[13px] leading-relaxed max-w-[260px]" style={{ color: 'rgba(255,255,255,0.62)' }}>
      Waiting for {partnerName || 'them'}'s pulse to find yours.
    </p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// REVEALED — two glows drift together into one shared bloom (the payoff).
// ─────────────────────────────────────────────────────────────────────────────
interface OrbRevealedProps {
  myName: string;
  partnerName: string;
  bothPulsed: boolean;
  reduce: boolean;
}

const OrbRevealed: React.FC<OrbRevealedProps> = ({ myName, partnerName, bothPulsed, reduce }) => {
  // Celebrate the union once on mount when both are truly here.
  useEffect(() => {
    if (bothPulsed) feedback.milestone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Two orbs slide from the sides into the centre, then a shared bloom swells.
  const driftDuration = reduce ? 0 : 0.9;

  return (
    <div className="relative z-10 flex flex-col items-center justify-center px-6 py-12 text-center">
      <p
        className="mb-6 text-[10px] uppercase tracking-[0.3em] font-bold"
        style={{ color: 'rgba(255,255,255,0.5)' }}
      >
        {bothPulsed ? 'Both pulsed' : 'Today’s pulse'}
      </p>

      <div className="relative flex items-center justify-center" style={{ width: 240, height: 200 }}>
        {bothPulsed ? (
          <>
            {/* Shared bloom — swells in behind the converged orbs */}
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: driftDuration * 0.7, duration: reduce ? 0.4 : 1, ease: EASE_SILK }}
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 190,
                height: 190,
                background: `radial-gradient(circle, ${GLOW_SOFT} 0%, hsla(${PARTNER_HUE},80%,66%,0.4) 45%, transparent 72%)`,
                filter: 'blur(10px)',
              }}
              aria-hidden
            />
            <motion.div
              animate={reduce ? { opacity: 0.6 } : { scale: [1, 1.08, 1], opacity: [0.5, 0.75, 0.5] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 150,
                height: 150,
                background: `radial-gradient(circle, ${GLOW_SOFT} 0%, transparent 66%)`,
              }}
              aria-hidden
            />

            {/* My orb drifts in from the left */}
            <motion.div
              initial={{ x: reduce ? 0 : -64, opacity: reduce ? 1 : 0.85, scale: 0.92 }}
              animate={{ x: -16, opacity: 1, scale: 1 }}
              transition={{ duration: driftDuration, ease: EASE_SILK }}
              className="absolute rounded-full"
              style={{
                width: 96,
                height: 96,
                background: `radial-gradient(circle at 38% 32%, hsl(${HUE} 90% 76%) 0%, ${GLOW} 52%, hsl(${HUE} 78% 50%) 100%)`,
                boxShadow: `0 0 26px ${GLOW_SOFT}, inset 0 2px 8px rgba(255,255,255,0.4)`,
                mixBlendMode: 'screen',
              }}
            />
            {/* Partner orb drifts in from the right */}
            <motion.div
              initial={{ x: reduce ? 0 : 64, opacity: reduce ? 1 : 0.85, scale: 0.92 }}
              animate={{ x: 16, opacity: 1, scale: 1 }}
              transition={{ duration: driftDuration, ease: EASE_SILK }}
              className="absolute rounded-full"
              style={{
                width: 96,
                height: 96,
                background: `radial-gradient(circle at 38% 32%, hsl(${PARTNER_HUE} 90% 78%) 0%, ${PARTNER_GLOW} 52%, hsl(${PARTNER_HUE} 78% 52%) 100%)`,
                boxShadow: `0 0 26px hsla(${PARTNER_HUE},80%,66%,0.5), inset 0 2px 8px rgba(255,255,255,0.4)`,
                mixBlendMode: 'screen',
              }}
            />
            {/* Heart that settles at the meeting point */}
            <motion.span
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: driftDuration * 0.85, ...springSnappy }}
              className="absolute z-10"
              style={{ fontSize: 30, lineHeight: 1, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }}
            >
              💞
            </motion.span>
          </>
        ) : (
          // Only one of us pulsed — graceful, never a dead end.
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE_SILK }}
            className="relative rounded-full flex items-center justify-center"
            style={{
              width: 104,
              height: 104,
              background: `radial-gradient(circle at 38% 32%, hsl(${HUE} 90% 74%) 0%, ${GLOW} 50%, hsl(${HUE} 78% 50%) 100%)`,
              boxShadow: `0 0 30px ${GLOW_SOFT}, inset 0 2px 8px rgba(255,255,255,0.4)`,
            }}
          >
            <span className="relative z-10" style={{ fontSize: 34, lineHeight: 1 }}>
              {DROP_META.pulse.glyph}
            </span>
          </motion.div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0.1 : driftDuration, duration: 0.5, ease: EASE_SOFT }}
        className="mt-8"
      >
        {bothPulsed ? (
          <>
            <h3 className="font-serif text-2xl font-bold mb-1.5" style={{ color: '#fff' }}>
              You’re both here 💞
            </h3>
            <p className="text-[13px] leading-relaxed max-w-[260px]" style={{ color: 'rgba(255,255,255,0.66)' }}>
              {myName || 'You'} and {partnerName || 'them'} reached for each other today.
            </p>
          </>
        ) : (
          <>
            <h3 className="font-serif text-xl font-bold mb-1.5" style={{ color: '#fff' }}>
              Your pulse is glowing
            </h3>
            <p className="text-[13px] leading-relaxed max-w-[260px]" style={{ color: 'rgba(255,255,255,0.62)' }}>
              You reached out today. There’s always tomorrow to meet in the middle.
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Pulse — phase router.
// ─────────────────────────────────────────────────────────────────────────────
export function Pulse({
  prompt,
  profile,
  phase,
  partnerResponse,
  submitting,
  onSubmit,
}: DropTypeProps) {
  const reduce = prefersReducedMotion();
  const { myName, partnerName } = profile;
  // Gate on the revealed phase too: the contract only exposes partnerResponse
  // when revealed, but make the seal explicit so a future caller can't leak it.
  const bothPulsed = phase === 'revealed' && !!partnerResponse && partnerResponse.value === 'pulsed';

  return (
    <div className="w-full px-1 py-1">
      <PulsePanel>
        {/* Ambient drifting glow lives behind every phase */}
        <FluidGlow color={GLOW} reduce={reduce} intensity={phase === 'revealed' && bothPulsed ? 1.15 : 0.9} />
        {phase === 'revealed' && bothPulsed && (
          <FluidGlow color={PARTNER_GLOW} reduce={reduce} intensity={0.8} />
        )}

        {phase === 'input' && (
          <OrbInput
            title={prompt.title}
            submitting={!!submitting}
            reduce={reduce}
            onCommit={() => onSubmit('pulsed')}
          />
        )}

        {phase === 'waiting' && <OrbWaiting partnerName={partnerName} reduce={reduce} />}

        {phase === 'revealed' && (
          <OrbRevealed
            myName={myName}
            partnerName={partnerName}
            bothPulsed={bothPulsed}
            reduce={reduce}
          />
        )}
      </PulsePanel>
    </div>
  );
}

export default Pulse;
