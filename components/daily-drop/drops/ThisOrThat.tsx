/**
 * ThisOrThat — the `this_or_that` Daily Drop type.
 *
 * Two big tappable option cards. Tapping one springs it forward with a warm
 * glow, fires a weighted haptic, then commits after a brief select beat so the
 * tap feels deliberate and satisfying.
 *
 *   phase 'input'    → pick one of two; commit via onSubmit(option.id)
 *   phase 'waiting'  → my pick highlighted, the other faded; "sealed" caption
 *   phase 'revealed' → both picks, with a celebratory bloom if they match
 *
 * Built to the frozen DropTypeProps contract (../dropContract). Presentational
 * only — never renders the page header / countdown (the view owns those) and
 * never reveals the partner's pick while sealed.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DropTypeProps } from '../dropContract';
import type { DropOption } from '../../../types';
import {
  springSmooth,
  springSnappy,
  EASE_SILK,
  EASE_SOFT,
  staggerContainer,
  staggerItem,
  prefersReducedMotion,
} from '../../../utils/motion';
import { feedback } from '../../../utils/feedback';

// Warm-pink accent for selection — leans into the brand instead of the type's
// cooler catalogue hue, keeping the card light and airy.
const ACCENT = '#c0496a';
const ACCENT_SOFT = 'rgba(192, 73, 106, 0.14)';
const ACCENT_GLOW = 'rgba(192, 73, 106, 0.32)';

const COMMIT_DELAY_MS = 180;

/** Safely resolve the two options, tolerating a malformed prompt. */
function readOptions(options: DropOption[] | undefined): [DropOption, DropOption] | null {
  if (!options || options.length < 2) return null;
  return [options[0], options[1]];
}

function labelForValue(options: [DropOption, DropOption], value: string | undefined): string {
  if (!value) return '—';
  const hit = options.find((o) => o.id === value);
  return hit ? hit.label : value;
}

function emojiForValue(options: [DropOption, DropOption], value: string | undefined): string | undefined {
  if (!value) return undefined;
  return options.find((o) => o.id === value)?.emoji;
}

// ─── Option card (input phase) ────────────────────────────────────────────────

interface OptionCardProps {
  option: DropOption;
  selected: boolean;
  dimmed: boolean;
  disabled: boolean;
  reduce: boolean;
  onPick: () => void;
}

function OptionCard({ option, selected, dimmed, disabled, reduce, onPick }: OptionCardProps) {
  return (
    <motion.button
      type="button"
      variants={staggerItem}
      onClick={onPick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={option.label}
      className="bento-card spring-press relative flex flex-col items-center justify-center text-center select-none"
      animate={{
        scale: selected ? (reduce ? 1 : 1.04) : 1,
        opacity: dimmed ? 0.45 : 1,
      }}
      whileTap={disabled || reduce ? undefined : { scale: 0.97 }}
      transition={springSnappy}
      style={{
        minHeight: 168,
        padding: '1.5rem 1rem',
        borderRadius: '1.75rem',
        cursor: disabled ? 'default' : 'pointer',
        border: `1.5px solid ${selected ? ACCENT : 'transparent'}`,
        boxShadow: selected
          ? `0 16px 40px ${ACCENT_GLOW}, inset 0 1px 0 rgba(255,255,255,0.5)`
          : undefined,
      }}
    >
      {/* Warm glow wash on the selected card (opacity-animated, compositor-safe) */}
      <AnimatePresence>
        {selected && (
          <motion.span
            key="glow"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE_SOFT }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '1.75rem',
              background: `radial-gradient(120% 90% at 50% 18%, ${ACCENT_SOFT}, transparent 70%)`,
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>

      <span style={{ fontSize: 44, lineHeight: 1.1, position: 'relative', zIndex: 1 }}>
        {option.emoji ?? '🤍'}
      </span>
      <span
        className="font-semibold"
        style={{
          marginTop: 14,
          fontSize: 15.5,
          lineHeight: 1.3,
          position: 'relative',
          zIndex: 1,
          color: 'var(--color-text-primary)',
        }}
      >
        {option.label}
      </span>
    </motion.button>
  );
}

// ─── Locked recap chip (waiting / revealed mine) ─────────────────────────────

interface PickChipProps {
  name: string;
  emoji?: string;
  label: string;
  emphatic: boolean;
}

function PickChip({ name, emoji, label, emphatic }: PickChipProps) {
  return (
    <div
      className="bento-card flex flex-col items-center justify-center text-center"
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 138,
        padding: '1.25rem 0.85rem',
        borderRadius: '1.5rem',
        border: emphatic ? `1.5px solid ${ACCENT}` : '1.5px solid transparent',
        boxShadow: emphatic ? `0 14px 34px ${ACCENT_GLOW}` : undefined,
      }}
    >
      <span
        className="font-semibold uppercase"
        style={{
          fontSize: 11,
          letterSpacing: '0.06em',
          color: 'var(--color-text-secondary)',
          marginBottom: 8,
        }}
      >
        {name}
      </span>
      <span style={{ fontSize: 34, lineHeight: 1 }}>{emoji ?? '🤍'}</span>
      <span
        className="font-semibold"
        style={{
          marginTop: 10,
          fontSize: 14,
          lineHeight: 1.25,
          color: 'var(--color-text-primary)',
          wordBreak: 'break-word',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ThisOrThat({
  prompt,
  profile,
  phase,
  myResponse,
  partnerResponse,
  submitting,
  onSubmit,
}: DropTypeProps) {
  const reduce = prefersReducedMotion();
  const options = readOptions(prompt.options);

  // Local select-then-commit state for the input phase.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const milestoneFired = useRef(false);

  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);

  // ── Graceful fallback for a malformed prompt (never a dead end) ────────────
  if (!options) {
    return (
      <div className="w-full px-5 py-8 text-center">
        <p style={{ fontSize: 15, color: 'var(--color-text-secondary)' }}>
          This little choice slipped away. A fresh one arrives tomorrow.
        </p>
      </div>
    );
  }

  const title = prompt.title || 'Right now, I’d rather…';

  const handlePick = (option: DropOption) => {
    if (submitting || selectedId) return;
    setSelectedId(option.id);
    feedback.interact();
    commitTimer.current = setTimeout(() => {
      onSubmit(option.id);
    }, reduce ? 0 : COMMIT_DELAY_MS);
  };

  // ── INPUT ──────────────────────────────────────────────────────────────────
  if (phase === 'input') {
    const locked = submitting || selectedId !== null;
    return (
      <div className="w-full px-5 pt-2 pb-6">
        <motion.h2
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_SILK }}
          className="font-serif text-center"
          style={{
            fontSize: '1.55rem',
            lineHeight: 1.25,
            color: 'var(--color-text-primary)',
            marginBottom: prompt.subtitle ? 6 : 22,
          }}
        >
          {title}
        </motion.h2>

        {prompt.subtitle && (
          <p
            className="text-center"
            style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', marginBottom: 22 }}
          >
            {prompt.subtitle}
          </p>
        )}

        <motion.div
          variants={staggerContainer(0.08, 0.06)}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-3.5"
        >
          {options.map((option) => (
            <OptionCard
              key={option.id}
              option={option}
              selected={selectedId === option.id}
              dimmed={selectedId !== null && selectedId !== option.id}
              disabled={locked}
              reduce={reduce}
              onPick={() => handlePick(option)}
            />
          ))}
        </motion.div>

        <motion.p
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.28, duration: 0.4, ease: EASE_SOFT }}
          className="text-center"
          style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 20 }}
        >
          {selectedId ? 'Sealing your pick…' : 'Tap the one that’s true today'}
        </motion.p>
      </div>
    );
  }

  // ── WAITING ──────────────────────────────────────────────────────────────────
  // My pick is locked; the partner's is hidden. Show a calm recap.
  if (phase === 'waiting') {
    const myValue = myResponse?.value;
    return (
      <div className="w-full px-5 pt-2 pb-6">
        <motion.h2
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_SILK }}
          className="font-serif text-center"
          style={{ fontSize: '1.5rem', lineHeight: 1.25, color: 'var(--color-text-primary)', marginBottom: 22 }}
        >
          {title}
        </motion.h2>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={springSmooth}
          className="grid grid-cols-2 gap-3.5"
        >
          {options.map((option) => {
            const mine = option.id === myValue;
            return (
              <div
                key={option.id}
                className="bento-card flex flex-col items-center justify-center text-center"
                style={{
                  minHeight: 150,
                  padding: '1.25rem 0.9rem',
                  borderRadius: '1.75rem',
                  opacity: mine ? 1 : 0.4,
                  border: mine ? `1.5px solid ${ACCENT}` : '1.5px solid transparent',
                  boxShadow: mine ? `0 14px 34px ${ACCENT_GLOW}` : undefined,
                }}
              >
                <span style={{ fontSize: 38, lineHeight: 1.1 }}>{option.emoji ?? '🤍'}</span>
                <span
                  className="font-semibold"
                  style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.3, color: 'var(--color-text-primary)' }}
                >
                  {option.label}
                </span>
                {mine && (
                  <span
                    className="font-semibold uppercase"
                    style={{ marginTop: 8, fontSize: 10.5, letterSpacing: '0.07em', color: ACCENT }}
                  >
                    Your pick
                  </span>
                )}
              </div>
            );
          })}
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.45, ease: EASE_SOFT }}
          className="flex items-center justify-center gap-2"
          style={{ marginTop: 22 }}
        >
          <SealDot reduce={reduce} />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Sealed · waiting on {profile.partnerName}
          </span>
        </motion.div>
      </div>
    );
  }

  // ── REVEALED ────────────────────────────────────────────────────────────────
  const myValue = myResponse?.value;
  const theirValue = partnerResponse?.value;
  const matched = !!myValue && !!theirValue && myValue === theirValue;

  // The match milestone fires inside RevealedView's mount effect, using the
  // ref above so it celebrates once per reveal even across re-renders.
  return (
    <RevealedView
      options={options}
      profile={profile}
      myValue={myValue}
      theirValue={theirValue}
      matched={matched}
      reduce={reduce}
      milestoneFired={milestoneFired}
    />
  );
}

// ─── Sealed pulse dot (waiting affordance) ────────────────────────────────────

function SealDot({ reduce }: { reduce: boolean }) {
  return (
    <motion.span
      aria-hidden
      animate={reduce ? { opacity: 0.7 } : { opacity: [0.4, 1, 0.4], scale: [1, 1.18, 1] }}
      transition={reduce ? undefined : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: ACCENT,
        display: 'inline-block',
      }}
    />
  );
}

// ─── Revealed view (own component so the match milestone can fire on mount) ────

interface RevealedViewProps {
  options: [DropOption, DropOption];
  profile: { myName: string; partnerName: string };
  myValue?: string;
  theirValue?: string;
  matched: boolean;
  reduce: boolean;
  milestoneFired: MutableRefObject<boolean>;
}

function RevealedView({
  options,
  profile,
  myValue,
  theirValue,
  matched,
  reduce,
  milestoneFired,
}: RevealedViewProps) {
  useEffect(() => {
    if (matched && !milestoneFired.current) {
      milestoneFired.current = true;
      feedback.milestone();
    }
  }, [matched, milestoneFired]);

  const myLabel = labelForValue(options, myValue);
  const theirLabel = labelForValue(options, theirValue);
  const myEmoji = emojiForValue(options, myValue);
  const theirEmoji = emojiForValue(options, theirValue);
  const matchLabel = matched ? myLabel : '';

  return (
    <div className="w-full px-5 pt-2 pb-7 relative">
      {/* Match bloom — a soft warm wash behind the cards, opacity-only */}
      <AnimatePresence>
        {matched && (
          <motion.div
            key="bloom"
            aria-hidden
            initial={{ opacity: 0, scale: reduce ? 1 : 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: EASE_SILK }}
            style={{
              position: 'absolute',
              top: -30,
              left: '50%',
              width: 320,
              height: 320,
              marginLeft: -160,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${ACCENT_GLOW}, transparent 68%)`,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}
      </AnimatePresence>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <motion.h3
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_SILK }}
          className="font-serif text-center"
          style={{
            fontSize: matched ? '1.6rem' : '1.35rem',
            lineHeight: 1.3,
            color: 'var(--color-text-primary)',
            marginBottom: matched ? 4 : 20,
          }}
        >
          {matched ? (
            <>You both chose {matchLabel} 💞</>
          ) : (
            <>Two different hearts today</>
          )}
        </motion.h3>

        {matched && (
          <motion.p
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.45, ease: EASE_SOFT }}
            className="text-center"
            style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', marginBottom: 22 }}
          >
            In sync, the two of you.
          </motion.p>
        )}

        <motion.div
          variants={staggerContainer(0.1, 0.12)}
          initial="hidden"
          animate="visible"
          className="flex gap-3.5"
          style={{ alignItems: 'stretch' }}
        >
          <motion.div variants={staggerItem} style={{ display: 'flex', flex: 1, minWidth: 0 }}>
            <PickChip name="You" emoji={myEmoji} label={myLabel} emphatic={matched} />
          </motion.div>

          {/* Centre connector — heart on a match, a soft middot otherwise */}
          <motion.div
            variants={staggerItem}
            className="flex items-center justify-center"
            style={{ flex: '0 0 auto' }}
          >
            <motion.span
              animate={matched && !reduce ? { scale: [1, 1.18, 1] } : undefined}
              transition={matched && !reduce ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
              style={{ fontSize: matched ? 22 : 16, color: 'var(--color-text-secondary)', lineHeight: 1 }}
            >
              {matched ? '💞' : '·'}
            </motion.span>
          </motion.div>

          <motion.div variants={staggerItem} style={{ display: 'flex', flex: 1, minWidth: 0 }}>
            <PickChip
              name={profile.partnerName}
              emoji={theirEmoji}
              label={theirLabel}
              emphatic={matched}
            />
          </motion.div>
        </motion.div>

        {!matched && (
          <motion.p
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.34, duration: 0.45, ease: EASE_SOFT }}
            className="text-center"
            style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 20 }}
          >
            Different picks, same us — that’s half the fun.
          </motion.p>
        )}
      </div>
    </div>
  );
}

export default ThisOrThat;
