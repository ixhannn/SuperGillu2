/**
 * GuessMyMood.tsx — the `guess_my_mood` Daily Drop type.
 *
 * Two-beat intimacy: first you name your own weather ("how are you, really?"),
 * then you try to read your partner's. The payoff is the side-by-side reveal —
 * a little 🎯 when you read them perfectly, a gentle truth when you didn't.
 *
 * Built to the frozen DropTypeProps contract (../dropContract). Presentational
 * only: collects input and calls onSubmit(myMoodId, guessMoodId); never touches
 * storage and never leaks the partner's mood while sealed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Lock } from 'lucide-react';
import type { DropTypeProps } from '../dropContract';
import type { DropOption } from '../../../types';
import {
  springSmooth,
  springSnappy,
  springGentle,
  EASE_SILK,
  staggerContainer,
  staggerItem,
  prefersReducedMotion,
} from '../../../utils/motion';
import { feedback } from '../../../utils/feedback';
import { DROP_META } from '../../../utils/dropEngine';

const HUE = DROP_META.guess_my_mood.hue; // 320 — warm magenta/pink

// Soft, theme-coherent accent tints derived from the type hue. Kept as inline
// rgba/hsl so the chip glow stays warm regardless of the active accent theme.
const accentSoft = `hsl(${HUE} 78% 62%)`;
const accentDeep = `hsl(${HUE} 64% 50%)`;
const tintBg = `hsla(${HUE}, 80%, 60%, 0.10)`;
const tintBorder = `hsla(${HUE}, 70%, 55%, 0.45)`;
const tintGlow = `hsla(${HUE}, 82%, 60%, 0.28)`;

type Step = 'mine' | 'guess';

/** Find an option by id, tolerant of stale/missing data. */
function findMood(options: DropOption[], id?: string): DropOption | undefined {
  if (!id) return undefined;
  return options.find((o) => o.id === id);
}

// ─── Mood chip ───────────────────────────────────────────────────────────────

interface MoodChipProps {
  mood: DropOption;
  selected: boolean;
  disabled?: boolean;
  onPick: () => void;
}

function MoodChip({ mood, selected, disabled, onPick }: MoodChipProps) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      variants={staggerItem}
      onClick={disabled ? undefined : onPick}
      disabled={disabled}
      whileTap={disabled || reduce ? undefined : { scale: 0.94 }}
      animate={
        reduce
          ? undefined
          : { scale: selected ? 1.04 : 1, y: selected ? -2 : 0 }
      }
      transition={springSnappy}
      className="spring-press relative flex flex-col items-center justify-center gap-1.5 rounded-[1.25rem] py-4 px-2"
      style={{
        background: selected ? tintBg : 'var(--color-surface, rgba(255,255,255,0.6))',
        border: `1.5px solid ${selected ? tintBorder : 'rgba(0,0,0,0.06)'}`,
        boxShadow: selected
          ? `0 10px 26px ${tintGlow}, inset 0 1px 0 rgba(255,255,255,0.5)`
          : '0 2px 8px rgba(0,0,0,0.04)',
        cursor: disabled ? 'default' : 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
      aria-pressed={selected}
      aria-label={mood.label}
    >
      <span style={{ fontSize: 30, lineHeight: 1 }}>{mood.emoji}</span>
      <span
        className="text-[12.5px] font-semibold leading-tight"
        style={{ color: selected ? accentDeep : 'var(--color-text-secondary)' }}
      >
        {mood.label}
      </span>
      <AnimatePresence>
        {selected && (
          <motion.span
            initial={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
            transition={springSnappy}
            className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full"
            style={{
              width: 20,
              height: 20,
              background: `linear-gradient(135deg, ${accentSoft}, ${accentDeep})`,
              boxShadow: `0 4px 10px ${tintGlow}`,
            }}
          >
            <Check size={12} strokeWidth={3} color="#fff" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ─── Large mood medallion (waiting + reveal) ──────────────────────────────────

interface MedallionProps {
  mood?: DropOption;
  name: string;
  emphasis?: boolean;
  caption?: string;
}

function MoodMedallion({ mood, name, emphasis, caption }: MedallionProps) {
  return (
    <div className="flex flex-1 flex-col items-center text-center gap-2">
      <div
        className="flex items-center justify-center rounded-[1.5rem]"
        style={{
          width: 78,
          height: 78,
          background: emphasis ? tintBg : 'rgba(0,0,0,0.035)',
          border: `1.5px solid ${emphasis ? tintBorder : 'rgba(0,0,0,0.06)'}`,
          boxShadow: emphasis
            ? `0 12px 30px ${tintGlow}, inset 0 1px 0 rgba(255,255,255,0.5)`
            : 'inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      >
        <span style={{ fontSize: 40, lineHeight: 1 }}>{mood?.emoji ?? '🫥'}</span>
      </div>
      <span
        className="text-[15px] font-bold leading-tight"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {mood?.label ?? 'Unspoken'}
      </span>
      <span
        className="text-[11.5px] font-medium uppercase tracking-wide"
        style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.05em' }}
      >
        {caption ?? name}
      </span>
    </div>
  );
}

// ─── Stepper dots ─────────────────────────────────────────────────────────────

function StepDots({ step }: { step: Step }) {
  const active = step === 'mine' ? 0 : 1;
  return (
    <div className="flex items-center justify-center gap-1.5" aria-hidden>
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          animate={{
            width: i === active ? 22 : 7,
            opacity: i === active ? 1 : 0.4,
          }}
          transition={springSmooth}
          className="block h-[7px] rounded-full"
          style={{
            background: i === active ? accentDeep : 'var(--color-text-secondary)',
          }}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GuessMyMood({
  prompt,
  profile,
  phase,
  myResponse,
  partnerResponse,
  submitting,
  onSubmit,
}: DropTypeProps) {
  const reduce = useReducedMotion();
  const options = useMemo<DropOption[]>(() => prompt.options ?? [], [prompt.options]);

  const [step, setStep] = useState<Step>('mine');
  const [myMood, setMyMood] = useState<string | null>(null);
  const [guessMood, setGuessMood] = useState<string | null>(null);

  // Did my guess land on their actual mood? (only meaningful once revealed)
  const readPerfectly =
    phase === 'revealed' &&
    !!myResponse?.guess &&
    !!partnerResponse?.value &&
    myResponse.guess === partnerResponse.value;

  // Fire the celebration once, only on a perfect read. Hook stays at top level
  // (above the phase early-returns) so hook order is stable across phases.
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (readPerfectly && !celebratedRef.current) {
      celebratedRef.current = true;
      if (prefersReducedMotion()) feedback.confirm();
      else feedback.milestone();
    }
  }, [readPerfectly]);

  // ── Graceful fallback for a malformed/empty prompt (never a dead end) ───────
  // Placed after all hooks so hook order stays stable across every phase. A
  // mood check-in needs at least two moods to be meaningful; fewer than that
  // and the input step would render an empty grid with a permanently disabled
  // 'Next' button, trapping the user. Mirrors ThisOrThat's fallback.
  if (options.length < 2) {
    return (
      <div className="w-full px-5 py-8 text-center">
        <p style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}>
          This little check-in slipped away. A fresh one arrives tomorrow.
        </p>
      </div>
    );
  }

  // ── INPUT: two-step pick (my mood → guess partner's) ───────────────────────
  if (phase === 'input') {
    const onMine = (id: string) => {
      if (submitting) return;
      feedback.tap();
      setMyMood(id);
    };
    const onGuess = (id: string) => {
      if (submitting) return;
      feedback.tap();
      setGuessMood(id);
    };
    const goNext = () => {
      if (!myMood || submitting) return;
      feedback.interact();
      setStep('guess');
    };
    const goBack = () => {
      if (submitting) return;
      feedback.tapSilent();
      setStep('mine');
    };
    const commit = () => {
      if (!myMood || !guessMood || submitting) return;
      feedback.confirm();
      onSubmit(myMood, guessMood);
    };

    const headline =
      step === 'mine' ? 'How are you, really?' : `Now guess ${profile.partnerName}'s`;
    const sub =
      step === 'mine'
        ? prompt.title
        : `If you had to read ${profile.partnerName} right now…`;
    const activeSel = step === 'mine' ? myMood : guessMood;
    const onPick = step === 'mine' ? onMine : onGuess;

    return (
      <div className="w-full px-1 py-1">
        <StepDots step={step} />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: step === 'guess' ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: step === 'guess' ? -24 : 24 }}
            transition={{ duration: 0.32, ease: EASE_SILK }}
          >
            <div className="mt-5 text-center">
              <h2
                className="font-serif text-[1.5rem] leading-snug"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {headline}
              </h2>
              <p
                className="mt-1.5 text-[13.5px] leading-relaxed"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {sub}
              </p>
            </div>

            {/* Tiny recap of my own mood while guessing — grounds the guess */}
            {step === 'guess' && myMood && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springSmooth}
                className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5"
                style={{ background: tintBg, border: `1px solid ${tintBorder}` }}
              >
                <span style={{ fontSize: 16 }}>{findMood(options, myMood)?.emoji}</span>
                <span
                  className="text-[12px] font-semibold"
                  style={{ color: accentDeep }}
                >
                  You're feeling {findMood(options, myMood)?.label.toLowerCase()}
                </span>
              </motion.div>
            )}

            <motion.div
              variants={staggerContainer(0.045, 0.04)}
              initial="hidden"
              animate="visible"
              className="mt-5 grid grid-cols-3 gap-2.5"
            >
              {options.map((mood) => (
                <MoodChip
                  key={mood.id}
                  mood={mood}
                  selected={activeSel === mood.id}
                  disabled={submitting}
                  onPick={() => onPick(mood.id)}
                />
              ))}
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {/* Footer controls */}
        <div className="mt-6 flex items-center gap-3">
          {step === 'guess' && (
            <motion.button
              type="button"
              onClick={goBack}
              disabled={submitting}
              whileTap={reduce ? undefined : { scale: 0.96 }}
              className="spring-press rounded-2xl px-4 py-3.5 text-[14px] font-semibold"
              style={{
                background: 'rgba(0,0,0,0.04)',
                color: 'var(--color-text-secondary)',
                border: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Back
            </motion.button>
          )}

          <motion.button
            type="button"
            onClick={step === 'mine' ? goNext : commit}
            disabled={(step === 'mine' ? !myMood : !guessMood) || submitting}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            className="spring-press flex flex-1 items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[15px] font-bold"
            style={{
              background:
                (step === 'mine' ? myMood : guessMood) && !submitting
                  ? `linear-gradient(135deg, ${accentSoft} 0%, ${accentDeep} 100%)`
                  : 'rgba(0,0,0,0.08)',
              color:
                (step === 'mine' ? myMood : guessMood) && !submitting
                  ? '#fff'
                  : 'var(--color-text-secondary)',
              border: 'none',
              boxShadow:
                (step === 'mine' ? myMood : guessMood) && !submitting
                  ? `0 8px 22px ${tintGlow}`
                  : 'none',
              opacity: submitting ? 0.7 : 1,
              transition: 'background 0.25s ease, box-shadow 0.25s ease, color 0.25s ease',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {step === 'mine' ? (
              <>
                Next
                <ArrowRight size={16} strokeWidth={2.5} />
              </>
            ) : submitting ? (
              'Sealing…'
            ) : (
              <>
                Seal it
                <Check size={16} strokeWidth={2.75} />
              </>
            )}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── WAITING: my mood locked, guess kept private ────────────────────────────
  if (phase === 'waiting') {
    const mine = findMood(options, myResponse?.value);
    return (
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springGentle}
        className="w-full px-1 py-2 text-center"
      >
        <h2
          className="font-serif text-[1.4rem] leading-snug"
          style={{ color: 'var(--color-text-primary)' }}
        >
          You named it.
        </h2>
        <p
          className="mx-auto mt-1.5 max-w-[260px] text-[13.5px] leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Your mood — and your read on {profile.partnerName} — are sealed.
        </p>

        <motion.div
          animate={reduce ? undefined : { scale: [1, 1.015, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="mx-auto mt-6 flex w-fit flex-col items-center gap-3 rounded-[1.75rem] px-9 py-7"
          style={{
            background: tintBg,
            border: `1.5px solid ${tintBorder}`,
            boxShadow: `0 14px 36px ${tintGlow}, inset 0 1px 0 rgba(255,255,255,0.5)`,
          }}
        >
          <span style={{ fontSize: 48, lineHeight: 1 }}>{mine?.emoji ?? '💗'}</span>
          <span
            className="text-[16px] font-bold"
            style={{ color: accentDeep }}
          >
            {mine?.label ?? 'Sealed'}
          </span>
          <span
            className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.06em' }}
          >
            <Lock size={11} strokeWidth={2.5} />
            Your guess is hidden
          </span>
        </motion.div>

        <div
          className="mx-auto mt-7 flex w-fit items-center gap-2 rounded-full px-4 py-2"
          style={{ background: 'rgba(0,0,0,0.04)' }}
        >
          <motion.span
            animate={reduce ? undefined : { opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="block h-2 w-2 rounded-full"
            style={{ background: accentSoft }}
          />
          <span
            className="text-[13px] font-semibold"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Waiting on {profile.partnerName}
          </span>
        </div>
      </motion.div>
    );
  }

  // ── REVEALED: both moods side by side + the read verdict ────────────────────
  const mine = findMood(options, myResponse?.value);
  const theirs = findMood(options, partnerResponse?.value);
  const myGuess = findMood(options, myResponse?.guess);

  return (
    <motion.div
      variants={staggerContainer(0.1, 0.05)}
      initial="hidden"
      animate="visible"
      className="w-full px-1 py-2"
    >
      <motion.div variants={staggerItem} className="text-center">
        <h2
          className="font-serif text-[1.45rem] leading-snug"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {readPerfectly ? 'You read them perfectly' : "Here's how you both felt"}
        </h2>
      </motion.div>

      {/* Side by side moods */}
      <motion.div
        variants={staggerItem}
        className="mt-6 flex items-start justify-center gap-3"
      >
        <MoodMedallion mood={mine} name="You" emphasis caption="You" />
        <div
          className="mt-7 text-[13px] font-bold"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          &
        </div>
        <MoodMedallion
          mood={theirs}
          name={profile.partnerName}
          emphasis
          caption={profile.partnerName}
        />
      </motion.div>

      {/* Verdict card */}
      <motion.div
        variants={staggerItem}
        className="mt-7 rounded-[1.5rem] px-5 py-5 text-center"
        style={{
          background: readPerfectly ? tintBg : 'rgba(0,0,0,0.035)',
          border: `1.5px solid ${readPerfectly ? tintBorder : 'rgba(0,0,0,0.06)'}`,
          boxShadow: readPerfectly
            ? `0 14px 34px ${tintGlow}, inset 0 1px 0 rgba(255,255,255,0.5)`
            : 'none',
        }}
      >
        {readPerfectly ? (
          <>
            <motion.div
              initial={reduce ? { opacity: 0 } : { scale: 0, rotate: -20 }}
              animate={reduce ? { opacity: 1 } : { scale: 1, rotate: 0 }}
              transition={{ ...springSnappy, delay: 0.15 }}
              style={{ fontSize: 38, lineHeight: 1 }}
            >
              🎯
            </motion.div>
            <p
              className="mt-2 text-[14.5px] font-semibold leading-relaxed"
              style={{ color: accentDeep }}
            >
              You guessed {profile.partnerName} was feeling{' '}
              {theirs?.label.toLowerCase() ?? 'exactly this'} — and you were right.
            </p>
          </>
        ) : (
          <p
            className="text-[14px] leading-relaxed"
            style={{ color: 'var(--color-text-primary)' }}
          >
            You guessed{' '}
            <span style={{ fontWeight: 700, color: accentDeep }}>
              {myGuess?.label ?? 'something'}
            </span>{' '}
            — {profile.partnerName} was{' '}
            <span style={{ fontWeight: 700, color: accentDeep }}>
              {theirs?.label.toLowerCase() ?? 'somewhere else'}
            </span>
            . A little closer tomorrow. 💗
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}

export default GuessMyMood;
