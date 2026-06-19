/**
 * DidTheyKnow.tsx — the `did_they_know` Daily Drop type.
 *
 * A playful two-step "how well do you know each other" game:
 *   input    → Step 1: pick MY real answer · Step 2: guess MY PARTNER's answer,
 *              then onSubmit(myAnswerId, guessId).
 *   waiting  → my answer is sealed; calm recap + "waiting on {partner}".
 *   revealed → both real answers, plus a light/teasing verdict on whether my
 *              guess of THEM landed.
 *
 * Built to the frozen DropTypeProps contract (../dropContract). Presentational
 * only — never touches storage, never leaks the partner's answer while sealed.
 * Motion is transform + opacity only and honours prefers-reduced-motion.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Lock, ArrowRight } from 'lucide-react';

import type { DropTypeProps } from '../dropContract';
import type { DropOption } from '../../../types';
import { DROP_META } from '../../../utils/dropEngine';
import {
  springSmooth,
  springSnappy,
  EASE_SILK,
  staggerContainer,
  staggerItem,
  prefersReducedMotion,
} from '../../../utils/motion';
import { feedback } from '../../../utils/feedback';

const HUE = DROP_META.did_they_know.hue; // 245 — soft periwinkle/indigo

// ── Palette helpers — warm/light tints derived from the type hue ────────────
const tint = (l: number, a = 1) => `hsla(${HUE}, 62%, ${l}%, ${a})`;
const ACCENT = `hsl(${HUE}, 70%, 58%)`;
const ACCENT_SOFT = tint(96, 1);
const ACCENT_RING = tint(58, 0.32);

type Step = 'mine' | 'guess';

interface OptionTileProps {
  option: DropOption;
  selected: boolean;
  disabled?: boolean;
  onPick: (id: string) => void;
}

/** A single tappable answer chip — springs forward when chosen. */
function OptionTile({ option, selected, disabled, onPick }: OptionTileProps) {
  const reduce = prefersReducedMotion();
  return (
    <motion.button
      type="button"
      variants={staggerItem}
      disabled={disabled}
      onClick={() => onPick(option.id)}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      animate={
        reduce
          ? undefined
          : { scale: selected ? 1.02 : 1, transition: springSnappy }
      }
      className="spring-press relative flex w-full items-center gap-3 rounded-[1.25rem] px-4 py-3.5 text-left"
      style={{
        background: selected ? ACCENT_SOFT : 'var(--color-surface, #fff)',
        border: `1.5px solid ${selected ? ACCENT_RING : 'rgba(0,0,0,0.06)'}`,
        boxShadow: selected
          ? `0 10px 26px ${tint(58, 0.18)}`
          : '0 2px 10px rgba(0,0,0,0.04)',
        cursor: disabled ? 'default' : 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
      aria-pressed={selected}
    >
      {option.emoji && (
        <span className="text-[1.5rem] leading-none" aria-hidden>
          {option.emoji}
        </span>
      )}
      <span
        className="flex-1 text-[15px] font-semibold leading-snug"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {option.label}
      </span>

      {/* Selection check — fades/pops in, never animates layout */}
      <AnimatePresence>
        {selected && (
          <motion.span
            key="check"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            transition={springSnappy}
            className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ background: ACCENT, color: '#fff' }}
          >
            <Check size={14} strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** Small read-only chip used in recap / reveal rows. */
function AnswerChip({
  option,
  emphasis,
}: {
  option?: DropOption;
  emphasis?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[14px] font-semibold"
      style={{
        background: emphasis ? ACCENT_SOFT : 'rgba(0,0,0,0.04)',
        border: `1px solid ${emphasis ? ACCENT_RING : 'rgba(0,0,0,0.05)'}`,
        color: 'var(--color-text-primary)',
      }}
    >
      {option?.emoji && (
        <span className="text-[1.05rem] leading-none" aria-hidden>
          {option.emoji}
        </span>
      )}
      {option?.label ?? '—'}
    </span>
  );
}

export function DidTheyKnow({
  prompt,
  profile,
  phase,
  myResponse,
  partnerResponse,
  submitting,
  onSubmit,
}: DropTypeProps) {
  const reduce = prefersReducedMotion();
  const options = useMemo<DropOption[]>(() => prompt.options ?? [], [prompt.options]);
  const byId = useMemo(
    () => new Map(options.map((o) => [o.id, o])),
    [options],
  );

  const [step, setStep] = useState<Step>('mine');
  const [mine, setMine] = useState<string | null>(null);
  const [guess, setGuess] = useState<string | null>(null);

  // ── INPUT ─────────────────────────────────────────────────────────────────
  if (phase === 'input') {
    const onPickMine = (id: string) => {
      feedback.interact();
      setMine(id);
    };
    const onPickGuess = (id: string) => {
      feedback.interact();
      setGuess(id);
    };

    const advance = () => {
      if (!mine) return;
      feedback.tap();
      setStep('guess');
    };
    const back = () => {
      feedback.tapSilent();
      setStep('mine');
    };
    const commit = () => {
      if (!mine || !guess || submitting) return;
      feedback.confirm();
      onSubmit(mine, guess);
    };

    const onMine = step === 'mine';

    return (
      <div className="w-full px-1">
        {/* Step pips */}
        <div className="mb-5 flex items-center justify-center gap-2" aria-hidden>
          {(['mine', 'guess'] as const).map((s) => {
            const active = s === step;
            const done = s === 'mine' && step === 'guess';
            return (
              <motion.span
                key={s}
                animate={reduce ? undefined : { scale: active ? 1 : 0.85 }}
                transition={springSmooth}
                className="h-1.5 rounded-full"
                style={{
                  width: active ? 28 : 16,
                  background: active || done ? ACCENT : 'rgba(0,0,0,0.12)',
                  transition: 'width 0.3s var(--lior-ease-silk, ease)',
                }}
              />
            );
          })}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: onMine ? 0 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: onMine ? -24 : 24 }}
            transition={{ duration: 0.28, ease: EASE_SILK }}
          >
            {/* Eyebrow */}
            <p
              className="mb-1 text-center text-[12px] font-bold uppercase tracking-[0.14em]"
              style={{ color: ACCENT }}
            >
              {onMine ? 'Your answer' : `Guess ${profile.partnerName}'s`}
            </p>

            {/* Question */}
            <h2
              className="mb-1.5 text-center font-serif text-[1.5rem] leading-snug"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {prompt.title}
            </h2>
            <p
              className="mx-auto mb-6 max-w-[280px] text-center text-[13px] leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {onMine
                ? 'Pick the one that’s truest for you.'
                : `Now the fun part — which would ${profile.partnerName} pick?`}
            </p>

            {/* Options */}
            <motion.div
              key={`opts-${step}`}
              variants={staggerContainer(0.05, 0.04)}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-2.5"
            >
              {options.map((o) => (
                <OptionTile
                  key={o.id}
                  option={o}
                  selected={(onMine ? mine : guess) === o.id}
                  onPick={onMine ? onPickMine : onPickGuess}
                />
              ))}
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {/* Commit row */}
        <div className="mt-7 flex items-center gap-3">
          {!onMine && (
            <button
              type="button"
              onClick={back}
              className="spring-press rounded-2xl px-4 py-3.5 text-[14px] font-semibold"
              style={{
                background: 'rgba(0,0,0,0.04)',
                color: 'var(--color-text-secondary)',
                border: '1px solid rgba(0,0,0,0.05)',
              }}
            >
              Back
            </button>
          )}

          <motion.button
            type="button"
            onClick={onMine ? advance : commit}
            disabled={onMine ? !mine : !guess || submitting}
            whileTap={
              (onMine ? mine : guess) && !submitting ? { scale: 0.97 } : undefined
            }
            className="spring-press flex flex-1 items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[15px] font-bold"
            style={{
              background:
                (onMine ? mine : guess) && !submitting
                  ? `linear-gradient(135deg, ${ACCENT} 0%, hsl(${HUE + 18}, 72%, 60%) 100%)`
                  : 'rgba(0,0,0,0.08)',
              color: (onMine ? mine : guess) && !submitting ? '#fff' : 'rgba(0,0,0,0.32)',
              boxShadow:
                (onMine ? mine : guess) && !submitting
                  ? `0 8px 22px ${tint(58, 0.32)}`
                  : 'none',
              border: 'none',
              transition: 'background 0.25s ease, color 0.25s ease, box-shadow 0.25s ease',
            }}
          >
            {onMine ? (
              <>
                Next
                <ArrowRight size={16} strokeWidth={2.5} />
              </>
            ) : submitting ? (
              'Sealing…'
            ) : (
              <>
                Lock it in
                <Lock size={15} strokeWidth={2.5} />
              </>
            )}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── WAITING ─────────────────────────────────────────────────────────────────
  if (phase === 'waiting') {
    const myAnswer = myResponse ? byId.get(myResponse.value) : undefined;
    const myGuess = myResponse?.guess ? byId.get(myResponse.guess) : undefined;

    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE_SILK }}
        className="w-full px-1"
      >
        <div
          className="bento-card relative overflow-hidden rounded-[1.75rem] p-6"
          style={{ background: ACCENT_SOFT, border: `1px solid ${ACCENT_RING}` }}
        >
          {/* breathing seal mark */}
          <motion.div
            aria-hidden
            animate={reduce ? undefined : { scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: '#fff', boxShadow: `0 8px 22px ${tint(58, 0.22)}` }}
          >
            <Lock size={22} strokeWidth={2.4} style={{ color: ACCENT }} />
          </motion.div>

          <h3
            className="mb-1 text-center font-serif text-[1.25rem] leading-snug"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Sealed.
          </h3>
          <p
            className="mx-auto mb-5 max-w-[260px] text-center text-[13.5px] leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Your answer’s in — and so is your guess. Waiting on{' '}
            <strong style={{ color: 'var(--color-text-primary)' }}>
              {profile.partnerName}
            </strong>{' '}
            to play.
          </p>

          {/* Calm recap — only MY side, never the partner's */}
          <div
            className="rounded-[1.25rem] p-4"
            style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.05)' }}
          >
            <p
              className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {prompt.title}
            </p>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[12.5px] font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  You said
                </span>
                <AnswerChip option={myAnswer} emphasis />
              </div>
              <div
                className="flex items-center justify-between gap-2 border-t pt-2.5"
                style={{ borderColor: 'rgba(0,0,0,0.05)' }}
              >
                <span
                  className="text-[12.5px] font-medium"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Your guess for them
                </span>
                <AnswerChip option={myGuess} />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── REVEALED ─────────────────────────────────────────────────────────────────
  // Both responses present. Verdict is about whether I read THEM right:
  // my guess of their answer (myResponse.guess) vs their real answer (partnerResponse.value).
  const myAnswer = myResponse ? byId.get(myResponse.value) : undefined;
  const myGuess = myResponse?.guess ? byId.get(myResponse.guess) : undefined;
  const theirAnswer = partnerResponse ? byId.get(partnerResponse.value) : undefined;
  const theirGuess = partnerResponse?.guess ? byId.get(partnerResponse.guess) : undefined;

  const iKnewThem =
    !!myResponse?.guess &&
    !!partnerResponse?.value &&
    myResponse.guess === partnerResponse.value;
  const theyKnewMe =
    !!partnerResponse?.guess &&
    !!myResponse?.value &&
    partnerResponse.guess === myResponse.value;

  // Fire the celebration once, on mount of the revealed verdict, only on a match.
  const [celebrated] = useState(() => {
    if (iKnewThem) feedback.milestone();
    else feedback.confirm();
    return true;
  });
  void celebrated;

  const verdictTitle = iKnewThem ? 'You knew them ✅' : 'Not quite 😅';
  const verdictSub = iKnewThem
    ? `You called it — ${profile.partnerName} really did pick that.`
    : theirAnswer
      ? `You guessed ${myGuess?.label ?? '—'}, but they went with ${theirAnswer.label}.`
      : `${profile.partnerName} surprised you on this one.`;

  return (
    <motion.div
      variants={reduce ? undefined : staggerContainer(0.08, 0.05)}
      initial={reduce ? { opacity: 0 } : 'hidden'}
      animate={reduce ? { opacity: 1 } : 'visible'}
      transition={reduce ? { duration: 0.3 } : undefined}
      className="w-full px-1"
    >
      {/* Question */}
      <motion.p
        variants={reduce ? undefined : staggerItem}
        className="mb-1 text-center text-[12px] font-bold uppercase tracking-[0.14em]"
        style={{ color: ACCENT }}
      >
        Did they know?
      </motion.p>
      <motion.h2
        variants={reduce ? undefined : staggerItem}
        className="mb-6 text-center font-serif text-[1.4rem] leading-snug"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {prompt.title}
      </motion.h2>

      {/* Verdict banner — the payoff, warm + teasing, never harsh */}
      <motion.div
        variants={reduce ? undefined : staggerItem}
        className="bento-card mb-5 overflow-hidden rounded-[1.5rem] p-5 text-center"
        style={{
          background: iKnewThem
            ? `linear-gradient(135deg, ${tint(96)} 0%, ${tint(92)} 100%)`
            : 'var(--color-surface, #fff)',
          border: `1.5px solid ${iKnewThem ? ACCENT_RING : 'rgba(0,0,0,0.06)'}`,
          boxShadow: iKnewThem ? `0 14px 34px ${tint(58, 0.2)}` : '0 4px 16px rgba(0,0,0,0.05)',
        }}
      >
        <motion.div
          aria-hidden
          animate={
            reduce || !iKnewThem
              ? undefined
              : { scale: [1, 1.12, 1], rotate: [0, -6, 6, 0] }
          }
          transition={{ duration: 0.7, ease: EASE_SILK }}
          className="mb-1 text-[2rem] leading-none"
        >
          {iKnewThem ? '🎯' : '🙈'}
        </motion.div>
        <h3
          className="mb-1 font-serif text-[1.2rem]"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {verdictTitle}
        </h3>
        <p
          className="mx-auto max-w-[280px] text-[13px] leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {verdictSub}
        </p>
      </motion.div>

      {/* Both real answers, side by side */}
      <motion.div
        variants={reduce ? undefined : staggerItem}
        className="grid grid-cols-2 gap-3"
      >
        {/* Mine */}
        <div
          className="bento-card flex flex-col items-center rounded-[1.5rem] p-4 text-center"
          style={{ background: 'var(--color-surface, #fff)', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          <span
            className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {profile.myName}
          </span>
          <span className="mb-1.5 text-[2rem] leading-none" aria-hidden>
            {myAnswer?.emoji ?? '💭'}
          </span>
          <span
            className="text-[14px] font-semibold leading-snug"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {myAnswer?.label ?? '—'}
          </span>
        </div>

        {/* Theirs */}
        <div
          className="bento-card flex flex-col items-center rounded-[1.5rem] p-4 text-center"
          style={{ background: 'var(--color-surface, #fff)', border: '1px solid rgba(0,0,0,0.06)' }}
        >
          <span
            className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {profile.partnerName}
          </span>
          <span className="mb-1.5 text-[2rem] leading-none" aria-hidden>
            {theirAnswer?.emoji ?? '💭'}
          </span>
          <span
            className="text-[14px] font-semibold leading-snug"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {theirAnswer?.label ?? '—'}
          </span>
        </div>
      </motion.div>

      {/* The flip side: did THEY read me right? Keep it light. */}
      {partnerResponse?.guess && (
        <motion.p
          variants={reduce ? undefined : staggerItem}
          className="mt-4 text-center text-[12.5px] leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {theyKnewMe ? (
            <>
              And {profile.partnerName} guessed yours too — you two are in sync 💞
            </>
          ) : (
            <>
              {profile.partnerName} guessed{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>
                {theirGuess?.label ?? '—'}
              </strong>{' '}
              for you. Something to tease them about later 😉
            </>
          )}
        </motion.p>
      )}
    </motion.div>
  );
}

export default DidTheyKnow;
