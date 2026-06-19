/**
 * DailyDropCard — the Home HERO surface for the Daily Drop feature.
 *
 * One compact, full-width, state-reactive tile that replaces the old inline
 * daily-question card at the top of Home. It is the daily *pull*: there is always
 * something here that is either waiting on you, sealed and waiting on them, just
 * unsealed, settled, or gently expired. Tapping anywhere opens the full
 * `daily-drop` view — the card itself never collects input or leaks the partner's
 * answer text.
 *
 * Motion: transform + opacity only (compositor-safe), honoring prefersReducedMotion().
 * State is read from useDailyDrop(); per-type colour comes from DROP_META[hue].
 */
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Clock } from 'lucide-react';
import type { DailyDropCardProps } from './dropContract';
import { useDailyDrop, type DropUiState } from '../../hooks/useDailyDrop';
import { DROP_META } from '../../utils/dropEngine';
import { springSmooth, EASE_SOFT, prefersReducedMotion } from '../../utils/motion';
import { feedback } from '../../utils/feedback';

// ── Per-state copy + tone ────────────────────────────────────────────────────

type Tone = {
  /** Heading line shown large. */
  heading: string;
  /** Supporting line under the heading. */
  sub: string;
  /** Small affordance pill text (the "do this" hint). */
  cta?: string;
  /** Whether the seal glyph should breathe / shimmer / settle. */
  motion: 'breathe' | 'shimmer' | 'excited' | 'settled' | 'rest';
};

interface CardModel {
  glyph: string;
  label: string;
  hue: number;
  tone: Tone;
  showCountdown: boolean;
}

const RESTING_GLYPH = '🎁';
const RESTING_HUE = 335; // warm pink fallback when there's no live drop

// ── Colour helpers — warm, light, hue-driven from DROP_META ──────────────────

const glow = (hue: number, sat: number, light: number, alpha: number) =>
  `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;

// ── Component ────────────────────────────────────────────────────────────────

export function DailyDropCard({ setView }: DailyDropCardProps) {
  const drop = useDailyDrop();
  const reduce = prefersReducedMotion();

  const model = buildModel(drop);
  const { glyph, label, hue, tone, showCountdown } = model;

  const urgent = showCountdown && drop.countdown.urgent && !drop.countdown.expired;

  const open = () => {
    feedback.tap();
    setView('daily-drop');
  };

  return (
    <motion.button
      type="button"
      onClick={open}
      aria-label={`${tone.heading}. ${tone.sub}. Open today's drop.`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSmooth}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      className="bento-card spring-press relative w-full overflow-hidden rounded-[1.75rem] text-left"
      style={{
        padding: '1.05rem 1.15rem',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Soft directional wash so the tile reads as "lit from the seal" */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          background: `radial-gradient(120% 90% at 88% 18%, ${glow(hue, 78, 70, 0.16)} 0%, transparent 62%)`,
          pointerEvents: 'none',
        }}
      />

      <div className="relative flex items-center gap-3.5">
        <Seal
          glyph={glyph}
          hue={hue}
          motionMode={tone.motion}
          urgent={urgent}
          reduce={reduce}
        />

        <div className="min-w-0 flex-1">
          {/* Type label + live countdown chip */}
          <div className="mb-1 flex items-center gap-2">
            <span
              className="truncate text-[11px] font-semibold uppercase tracking-[0.07em]"
              style={{ color: glow(hue, 42, 46, 1) }}
            >
              {label}
            </span>
            {showCountdown && (
              <Countdown
                text={urgent ? 'disappears soon ⏳' : drop.countdown.compactLabel}
                urgent={urgent}
                reduce={reduce}
                hue={hue}
              />
            )}
          </div>

          {/* Headline + sub — keyed so each state crossfades, never hard-cuts */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={drop.uiState + tone.heading}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.26, ease: EASE_SOFT }}
            >
              <h3
                className="truncate font-serif text-[1.06rem] leading-snug"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {tone.heading}
              </h3>
              <p
                className="mt-0.5 truncate text-[12.5px] leading-snug"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {tone.sub}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Affordance pill / open chevron */}
        {tone.cta ? (
          <Pill text={tone.cta} hue={hue} excited={tone.motion === 'excited'} reduce={reduce} />
        ) : (
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{ background: glow(hue, 60, 96, 0.7), color: glow(hue, 40, 50, 1) }}
          >
            <ArrowUpRight size={16} strokeWidth={2.5} />
          </span>
        )}
      </div>
    </motion.button>
  );
}

// ── Seal: the breathing / shimmering "drop" object ───────────────────────────

interface SealProps {
  glyph: string;
  hue: number;
  motionMode: Tone['motion'];
  urgent: boolean;
  reduce: boolean;
}

function Seal({ glyph, hue, motionMode, urgent, reduce }: SealProps) {
  // Breathing scale loop (your_turn): subtle 1 ↔ 1.015.
  const breathe =
    motionMode === 'breathe' && !reduce
      ? { scale: [1, 1.015, 1] }
      : undefined;

  // Ring opacity behaviour per state (opacity-only → compositor safe).
  const ringAnim = reduce
    ? { opacity: 0.5 }
    : motionMode === 'excited'
      ? { opacity: [0.45, 0.95, 0.45], scale: [1, 1.06, 1] }
      : motionMode === 'breathe' || urgent
        ? { opacity: [0.32, 0.6, 0.32] }
        : motionMode === 'shimmer'
          ? { opacity: [0.28, 0.48, 0.28] }
          : { opacity: 0.36 }; // settled / rest

  const ringDuration =
    motionMode === 'excited' ? 1.5 : urgent ? 1.8 : motionMode === 'shimmer' ? 3 : 3.8;

  return (
    <motion.div
      className="relative shrink-0"
      animate={breathe}
      transition={
        breathe
          ? { duration: 4, repeat: Infinity, ease: 'easeInOut' }
          : undefined
      }
      style={{ width: 52, height: 52 }}
    >
      {/* Outer glow ring — opacity (and gentle scale on excited) only */}
      <motion.div
        aria-hidden
        animate={ringAnim}
        transition={
          reduce
            ? undefined
            : { duration: ringDuration, repeat: Infinity, ease: 'easeInOut' }
        }
        style={{
          position: 'absolute',
          inset: -8,
          borderRadius: '50%',
          background: glow(hue, 80, 68, 0.55),
          filter: 'blur(13px)',
          pointerEvents: 'none',
        }}
      />

      {/* The seal body */}
      <div
        className="relative grid h-[52px] w-[52px] place-items-center rounded-[1.05rem]"
        style={{
          background: `linear-gradient(150deg, ${glow(hue, 70, 92, 1)} 0%, ${glow(hue, 62, 84, 1)} 100%)`,
          boxShadow: `0 8px 20px ${glow(hue, 60, 55, 0.22)}, inset 0 1px 0 rgba(255,255,255,0.85)`,
        }}
      >
        {/* Wax-seal sheen */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, transparent 52%)',
            pointerEvents: 'none',
          }}
        />
        {/* Travelling shimmer for shimmer/excited states (transform only) */}
        {(motionMode === 'shimmer' || motionMode === 'excited') && !reduce && (
          <motion.span
            aria-hidden
            initial={{ x: '-130%' }}
            animate={{ x: '130%' }}
            transition={{
              duration: motionMode === 'excited' ? 1.4 : 2.6,
              repeat: Infinity,
              repeatDelay: motionMode === 'excited' ? 0.3 : 1.1,
              ease: EASE_SOFT,
            }}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: '46%',
              borderRadius: 'inherit',
              background:
                'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)',
              pointerEvents: 'none',
            }}
          />
        )}
        <span className="relative text-[24px] leading-none" style={{ zIndex: 1 }}>
          {glyph}
        </span>
      </div>
    </motion.div>
  );
}

// ── Affordance pill (Open / nudge / unseal) ──────────────────────────────────

interface PillProps {
  text: string;
  hue: number;
  excited: boolean;
  reduce: boolean;
}

function Pill({ text, hue, excited, reduce }: PillProps) {
  return (
    <motion.span
      aria-hidden
      className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-bold"
      style={{
        background: excited
          ? `linear-gradient(135deg, ${glow(hue, 72, 60, 1)} 0%, ${glow(hue, 70, 52, 1)} 100%)`
          : glow(hue, 58, 95, 0.85),
        color: excited ? '#fff' : glow(hue, 45, 42, 1),
        boxShadow: excited ? `0 5px 16px ${glow(hue, 65, 55, 0.34)}` : 'none',
        letterSpacing: '0.01em',
      }}
      animate={excited && !reduce ? { scale: [1, 1.045, 1] } : undefined}
      transition={
        excited && !reduce
          ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
          : undefined
      }
    >
      {text}
    </motion.span>
  );
}

// ── Countdown chip ───────────────────────────────────────────────────────────

interface CountdownProps {
  text: string;
  urgent: boolean;
  reduce: boolean;
  hue: number;
}

function Countdown({ text, urgent, reduce, hue }: CountdownProps) {
  return (
    <motion.span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        background: urgent ? glow(15, 78, 94, 0.9) : glow(hue, 40, 95, 0.7),
        color: urgent ? glow(8, 70, 48, 1) : glow(hue, 30, 48, 1),
      }}
      animate={urgent && !reduce ? { opacity: [1, 0.55, 1] } : undefined}
      transition={
        urgent && !reduce
          ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
          : undefined
      }
    >
      <Clock size={9} strokeWidth={2.5} />
      {text}
    </motion.span>
  );
}

// ── State → presentation model ───────────────────────────────────────────────

function buildModel(drop: ReturnType<typeof useDailyDrop>): CardModel {
  const partner = drop.profile.partnerName || 'them';

  // No live drop yet (loading / generation hiccup) → graceful resting tile.
  if (!drop.drop) {
    return {
      glyph: RESTING_GLYPH,
      label: 'Daily Drop',
      hue: RESTING_HUE,
      showCountdown: false,
      tone: {
        heading: 'Today’s drop is on its way',
        sub: 'A little something for the two of you',
        cta: 'Open',
        motion: 'breathe',
      },
    };
  }

  const meta = DROP_META[drop.drop.type];
  const base = { glyph: meta.glyph, label: meta.label, hue: meta.hue };

  const tone = toneForState(drop.uiState, partner);
  // Countdown only matters while the drop is still alive (not expired).
  const showCountdown =
    !drop.uiState.startsWith('expired') && !drop.countdown.expired;

  return { ...base, tone, showCountdown };
}

function toneForState(state: DropUiState, partner: string): Tone {
  switch (state) {
    case 'your_turn':
      return {
        heading: 'Today’s drop is waiting',
        sub: 'Tap to open and respond',
        cta: 'Open',
        motion: 'breathe',
      };

    case 'waiting':
      return {
        heading: `Sealed · waiting on ${partner} 👀`,
        sub: 'Your answer’s locked in — tap to nudge',
        motion: 'shimmer',
      };

    case 'reveal_ready':
      return {
        heading: 'Your drop unsealed ✨',
        sub: 'You both answered — tap to see',
        cta: 'Reveal',
        motion: 'excited',
      };

    case 'revealed':
      return {
        heading: 'Today’s drop',
        sub: 'You both showed up 💛 tap to revisit',
        motion: 'settled',
      };

    case 'expired_partial':
      return {
        heading: 'You showed up today 💛',
        sub: `${partner} didn’t make it — fresh one at midnight`,
        motion: 'rest',
      };

    case 'expired_missed':
      return {
        heading: 'This one drifted by',
        sub: 'No worries — tomorrow’s drop arrives at midnight',
        motion: 'rest',
      };

    case 'expired_both_missed':
      return {
        heading: 'You both let this one rest 💤',
        sub: 'A fresh drop arrives at midnight',
        motion: 'rest',
      };

    default:
      return {
        heading: 'Today’s drop',
        sub: 'Tap to open',
        cta: 'Open',
        motion: 'breathe',
      };
  }
}

export default DailyDropCard;
