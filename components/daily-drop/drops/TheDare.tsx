/**
 * TheDare — `the_dare` drop type.
 *
 * A tiny, real-world action (`prompt.dare`). The interaction is the antithesis
 * of a form: ONE big, satisfying "I did it" commit, plus an optional one-line
 * note. Pressing the button blooms a hand-drawn checkmark (transform + opacity
 * only) and fires `feedback.milestone()` — the dare is a small triumph.
 *
 * Phases (see ../dropContract.ts):
 *   input    → dare card + "I did it ✓" + optional note → onSubmit(note || 'Done')
 *   waiting  → "You did it 💪 — waiting on {partner}" + my note recap
 *   revealed → both confirmations / notes, celebratory-light
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import type { DropTypeProps } from '../dropContract';
import { DROP_META } from '../../../utils/dropEngine';
import {
  springSnappy,
  springGentle,
  EASE_SILK,
  EASE_SOFT,
  staggerContainer,
  staggerItem,
  prefersReducedMotion,
} from '../../../utils/motion';
import { feedback } from '../../../utils/feedback';

const HUE = DROP_META.the_dare.hue; // 350 — warm rose
const NOTE_MAX = 90;

// ── Warm rose accent derived from the type hue ──────────────────────────────
const accent = `hsl(${HUE} 72% 56%)`;
const accentDeep = `hsl(${HUE} 60% 44%)`;
const accentSoft = `hsl(${HUE} 80% 96%)`;
const accentGlow = `hsl(${HUE} 78% 60% / 0.30)`;

/** A note that resolves to nothing visible should read as a plain confirmation. */
function isPlainDone(value?: string): boolean {
  return !value || value.trim() === '' || value.trim().toLowerCase() === 'done';
}

// ── Hand-drawn checkmark that strokes itself in (transform + opacity safe) ──
function CheckmarkBloom({ play }: { play: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div
      style={{
        position: 'relative',
        width: 30,
        height: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Soft bloom behind the mark — scales/fades, never blurs in keyframes */}
      <AnimatePresence>
        {play && (
          <motion.span
            key="bloom"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={reduce ? { opacity: 0.5, scale: 1 } : { opacity: [0, 0.8, 0], scale: [0.4, 1.9, 2.4] }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.2 : 0.7, ease: EASE_SOFT }}
            style={{
              position: 'absolute',
              inset: -6,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.6)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>
      <svg viewBox="0 0 24 24" width={22} height={22} fill="none" style={{ position: 'relative', zIndex: 1 }}>
        <motion.path
          d="M5 12.5 L10 17.5 L19 6.5"
          stroke="#fff"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
          animate={play ? { pathLength: 1, opacity: 1 } : { pathLength: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.42, ease: EASE_SILK, delay: reduce ? 0 : 0.04 }}
        />
      </svg>
    </div>
  );
}

// ── A single confirmation card (used in waiting + revealed) ─────────────────
function ConfirmCard({
  name,
  value,
  tint,
  emphasis = false,
}: {
  name: string;
  value?: string;
  tint: string;
  emphasis?: boolean;
}) {
  const plain = isPlainDone(value);
  return (
    <motion.div
      variants={staggerItem}
      className="bento-card"
      style={{
        padding: '1rem 1.1rem',
        borderRadius: '1.5rem',
        background: 'var(--color-surface, #fff)',
        boxShadow: emphasis
          ? `0 10px 30px ${accentGlow}, inset 0 1px 0 rgba(255,255,255,0.6)`
          : '0 6px 20px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: plain ? 0 : '0.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: tint,
            color: '#fff',
            fontSize: 13,
            flexShrink: 0,
            boxShadow: `0 3px 10px ${accentGlow}`,
          }}
        >
          ✓
        </span>
        <span
          className="text-[13px] font-semibold"
          style={{ color: 'var(--color-text-primary)', letterSpacing: '0.01em' }}
        >
          {name}
        </span>
        <span
          className="text-[12px] font-medium"
          style={{ color: 'var(--color-text-secondary)', marginLeft: 'auto' }}
        >
          did it
        </span>
      </div>

      {!plain && (
        <p
          className="text-[14px] leading-relaxed"
          style={{ color: 'var(--color-text-primary)', fontStyle: 'italic' }}
        >
          “{value!.trim()}”
        </p>
      )}
    </motion.div>
  );
}

export function TheDare({
  prompt,
  profile,
  phase,
  myResponse,
  partnerResponse,
  submitting,
  onSubmit,
}: DropTypeProps) {
  const reduce = useReducedMotion();
  const [note, setNote] = useState('');
  const [committing, setCommitting] = useState(false);
  const committedRef = useRef(false);

  const dare = prompt.dare?.trim() || 'Do one small, kind thing for each other today.';

  // Lock guard: never let a double-tap (or a re-render mid-animation) fire twice.
  const handleDone = () => {
    if (committedRef.current || submitting) return;
    committedRef.current = true;
    setCommitting(true);
    feedback.milestone();
    const value = note.trim() || 'Done';
    // Let the checkmark bloom land before the parent swaps us into 'waiting'.
    const delay = prefersReducedMotion() ? 0 : 520;
    window.setTimeout(() => onSubmit(value, undefined), delay);
  };

  // If we somehow get stuck (parent didn't advance), release the guard so the
  // user is never stranded on a dead, disabled button.
  useEffect(() => {
    if (!committing) return;
    const t = window.setTimeout(() => {
      if (phase === 'input') {
        committedRef.current = false;
        setCommitting(false);
      }
    }, 4000);
    return () => window.clearTimeout(t);
  }, [committing, phase]);

  // ── INPUT ────────────────────────────────────────────────────────────────
  if (phase === 'input') {
    const noteCount = note.trim().length;
    const busy = committing || !!submitting;
    return (
      <motion.div
        variants={staggerContainer(0.07, 0.04)}
        initial="hidden"
        animate="visible"
        className="w-full flex flex-col items-center px-1"
        style={{ gap: '1.15rem' }}
      >
        {/* The dare card */}
        <motion.div
          variants={staggerItem}
          className="bento-card w-full"
          style={{
            position: 'relative',
            overflow: 'hidden',
            padding: '1.6rem 1.4rem',
            borderRadius: '1.75rem',
            background: `linear-gradient(160deg, ${accentSoft} 0%, var(--color-surface, #fff) 70%)`,
            boxShadow: `0 14px 36px ${accentGlow}, inset 0 1px 0 rgba(255,255,255,0.7)`,
            textAlign: 'center',
          }}
        >
          {/* gentle breathing glyph */}
          <motion.div
            aria-hidden
            animate={reduce ? undefined : { y: [0, -4, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ fontSize: 34, lineHeight: 1, marginBottom: '0.75rem' }}
          >
            {DROP_META.the_dare.glyph}
          </motion.div>

          <p
            className="text-[11px] font-bold uppercase"
            style={{ color: accentDeep, letterSpacing: '0.12em', marginBottom: '0.55rem' }}
          >
            {prompt.title || 'Today’s tiny dare'}
          </p>

          <p
            className="font-serif text-[1.3rem] leading-snug"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {dare}
          </p>
        </motion.div>

        {/* Optional one-line note */}
        <motion.div variants={staggerItem} className="w-full">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.85rem 1rem',
              borderRadius: '1.25rem',
              background: 'var(--color-surface, #fff)',
              boxShadow: 'inset 0 0 0 1.5px rgba(0,0,0,0.05), 0 4px 14px rgba(0,0,0,0.04)',
            }}
          >
            <span aria-hidden style={{ fontSize: 15, opacity: 0.7 }}>💬</span>
            <input
              type="text"
              value={note}
              maxLength={NOTE_MAX}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`Add a note for ${profile.partnerName || 'them'} (optional)`}
              aria-label="Optional note about the dare"
              className="flex-1 bg-transparent text-[14px]"
              style={{
                border: 'none',
                outline: 'none',
                color: 'var(--color-text-primary)',
                minWidth: 0,
              }}
            />
          </div>
          <AnimatePresence>
            {noteCount > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: EASE_SOFT }}
                className="text-[11px] text-right"
                style={{ color: 'var(--color-text-secondary)', paddingTop: 4, paddingRight: 6 }}
              >
                {NOTE_MAX - noteCount} left
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* The big satisfying commit */}
        <motion.button
          variants={staggerItem}
          type="button"
          onClick={handleDone}
          disabled={busy}
          aria-label="Mark the dare as done"
          className="spring-press w-full"
          whileTap={busy ? undefined : { scale: 0.97 }}
          animate={
            committing
              ? { scale: reduce ? 1 : [1, 1.04, 1] }
              : { scale: 1 }
          }
          transition={committing ? { duration: 0.5, ease: EASE_SILK } : springSnappy}
          style={{
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            padding: '1.05rem 1.5rem',
            borderRadius: '1.5rem',
            border: 'none',
            cursor: busy ? 'default' : 'pointer',
            color: '#fff',
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: '0.01em',
            background: `linear-gradient(135deg, ${accent} 0%, ${accentDeep} 100%)`,
            boxShadow: `0 12px 30px ${accentGlow}`,
            opacity: submitting && !committing ? 0.7 : 1,
          }}
        >
          <CheckmarkBloom play={committing} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={committing ? 'done' : 'do'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: EASE_SOFT }}
            >
              {committing ? 'Done!' : 'I did it'}
            </motion.span>
          </AnimatePresence>
        </motion.button>

        <motion.p
          variants={staggerItem}
          className="text-[12px] text-center"
          style={{ color: 'var(--color-text-secondary)', maxWidth: 260 }}
        >
          Sealed until {profile.partnerName || 'they'} {profile.partnerName ? 'does theirs too' : 'do theirs too'}.
        </motion.p>
      </motion.div>
    );
  }

  // ── WAITING ──────────────────────────────────────────────────────────────
  if (phase === 'waiting') {
    return (
      <motion.div
        variants={staggerContainer(0.08, 0.04)}
        initial="hidden"
        animate="visible"
        className="w-full flex flex-col items-center text-center px-2"
        style={{ gap: '1.1rem' }}
      >
        <motion.div variants={staggerItem} style={{ position: 'relative' }}>
          {/* quiet shimmer ring */}
          <motion.div
            aria-hidden
            animate={reduce ? { opacity: 0.4 } : { scale: [1, 1.18, 1], opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              inset: -14,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${accentGlow} 0%, transparent 70%)`,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              position: 'relative',
              background: `linear-gradient(135deg, ${accent} 0%, ${accentDeep} 100%)`,
              boxShadow: `0 12px 30px ${accentGlow}, inset 0 1px 0 rgba(255,255,255,0.4)`,
            }}
          >
            💪
          </div>
        </motion.div>

        <motion.h3
          variants={staggerItem}
          className="font-serif text-[1.4rem] leading-snug"
          style={{ color: 'var(--color-text-primary)' }}
        >
          You did it
        </motion.h3>

        <motion.p
          variants={staggerItem}
          className="text-[14px] leading-relaxed"
          style={{ color: 'var(--color-text-secondary)', maxWidth: 280 }}
        >
          Sealed. Now we wait on{' '}
          <span style={{ color: accentDeep, fontWeight: 700 }}>{profile.partnerName || 'them'}</span>.
        </motion.p>

        {!isPlainDone(myResponse?.value) && (
          <motion.div variants={staggerItem} className="w-full" style={{ maxWidth: 340 }}>
            <ConfirmCard
              name="Your note"
              value={myResponse?.value}
              tint={accent}
              emphasis
            />
          </motion.div>
        )}
      </motion.div>
    );
  }

  // ── REVEALED ─────────────────────────────────────────────────────────────
  const bothDone = !!myResponse && !!partnerResponse;
  return (
    <RevealedDare
      myName={profile.myName || 'You'}
      partnerName={profile.partnerName || 'Them'}
      myValue={myResponse?.value}
      partnerValue={partnerResponse?.value}
      bothDone={bothDone}
      reduce={!!reduce}
    />
  );
}

// ── Revealed payoff — celebratory-light, fires the milestone once ───────────
function RevealedDare({
  myName,
  partnerName,
  myValue,
  partnerValue,
  bothDone,
  reduce,
}: {
  myName: string;
  partnerName: string;
  myValue?: string;
  partnerValue?: string;
  bothDone: boolean;
  reduce: boolean;
}) {
  const firedRef = useRef(false);
  const celebrated = useMemo(() => bothDone, [bothDone]);

  useEffect(() => {
    if (celebrated && !firedRef.current) {
      firedRef.current = true;
      feedback.milestone();
    }
  }, [celebrated]);

  return (
    <motion.div
      variants={staggerContainer(0.09, 0.05)}
      initial="hidden"
      animate="visible"
      className="w-full flex flex-col items-center text-center px-1"
      style={{ gap: '1.15rem' }}
    >
      {/* crowning emoji with a soft, fading bloom */}
      <motion.div variants={staggerItem} style={{ position: 'relative' }}>
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.5 }}
          animate={reduce ? { opacity: 0.4, scale: 1 } : { opacity: [0, 0.7, 0], scale: [0.5, 1.8, 2.2] }}
          transition={{ duration: reduce ? 0.3 : 1.1, ease: EASE_SOFT }}
          style={{
            position: 'absolute',
            inset: -18,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${accentGlow} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springGentle}
          style={{ fontSize: 42, lineHeight: 1, position: 'relative' }}
        >
          {bothDone ? '🎉' : '💛'}
        </motion.div>
      </motion.div>

      <motion.h3
        variants={staggerItem}
        className="font-serif text-[1.45rem] leading-snug"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {bothDone ? 'You both did it!' : 'One of you showed up'}
      </motion.h3>

      <motion.p
        variants={staggerItem}
        className="text-[13.5px] leading-relaxed"
        style={{ color: 'var(--color-text-secondary)', maxWidth: 280 }}
      >
        {bothDone
          ? 'Two tiny acts, same day. That’s the whole thing — showing up for each other.'
          : 'Every little bit counts. Tomorrow’s a fresh one.'}
      </motion.p>

      <motion.div
        variants={staggerItem}
        className="w-full flex flex-col"
        style={{ gap: '0.7rem', maxWidth: 360 }}
      >
        <ConfirmCard name={myName} value={myValue} tint={accent} emphasis />
        {partnerValue !== undefined ? (
          <ConfirmCard name={partnerName} value={partnerValue} tint={accentDeep} emphasis />
        ) : (
          <motion.div
            variants={staggerItem}
            className="bento-card"
            style={{
              padding: '0.9rem 1.1rem',
              borderRadius: '1.5rem',
              background: 'var(--color-surface, #fff)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.05)',
              color: 'var(--color-text-secondary)',
              fontSize: 13,
              fontStyle: 'italic',
            }}
          >
            {partnerName} didn’t get to this one — maybe nudge them tomorrow.
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default TheDare;
