/**
 * SecretWindow — the `secret_window` drop type.
 *
 * The most emotionally weighty drop in the rotation. The prompt is an intimate
 * confession stem (e.g. "Something I haven't told you yet…"). It must feel
 * *private*: a softly glowing, sealed-envelope hush rather than the playful
 * tone of the lighter types.
 *
 *   phase 'input'    → a hushed, elevated composer. Submit seals the secret.
 *   phase 'waiting'  → my secret is sealed; the text hides behind a soft blur I
 *                      can tap to peek at my own words. Partner's is NEVER shown.
 *   phase 'revealed' → both secrets unveil slowly, tenderly, in stagger, named.
 *                      feedback.milestone() fires exactly once.
 *
 * Animations are transform + opacity only and collapse gracefully under
 * prefersReducedMotion(). Haptics route through the feedback facade.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Eye, Send } from 'lucide-react';
import type { DropTypeProps } from '../dropContract';
import { DROP_META } from '../../../utils/dropEngine';
import {
  springSmooth,
  springGentle,
  EASE_SILK,
  EASE_SOFT,
  staggerContainer,
  staggerItem,
  prefersReducedMotion,
} from '../../../utils/motion';
import { feedback } from '../../../utils/feedback';

const META = DROP_META.secret_window;

/** A warm, private candle-glow built from the type hue — no hard pinks. */
const glowFrom = (hue: number, lightness: number, alpha: number): string =>
  `hsla(${hue}, 60%, ${lightness}%, ${alpha})`;

const MAX_LEN = 480;

// ─── Input phase — the hushed composer ────────────────────────────────────────

function SecretComposer({ prompt, submitting, onSubmit }: Pick<DropTypeProps, 'prompt' | 'submitting' | 'onSubmit'>) {
  const reduce = prefersReducedMotion();
  const [text, setText] = useState('');
  const [committing, setCommitting] = useState(false);
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !submitting && !committing;

  const handleSeal = () => {
    if (!canSend) return;
    setCommitting(true);
    feedback.confirm();
    // Let the seal micro-interaction breathe before handing control to the view.
    window.setTimeout(() => onSubmit(trimmed), reduce ? 0 : 360);
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE_SILK }}
      className="w-full"
    >
      {/* Private envelope surface — a touch more elevated + glowing than a plain card. */}
      <div
        className="relative overflow-hidden rounded-[1.75rem] px-6 pt-7 pb-6"
        style={{
          background:
            `radial-gradient(120% 90% at 50% 0%, ${glowFrom(META.hue, 96, 0.9)} 0%, color-mix(in srgb, var(--color-surface) 88%, transparent) 60%)`,
          border: `1px solid ${glowFrom(META.hue, 84, 0.5)}`,
          boxShadow: `0 18px 50px ${glowFrom(META.hue, 60, 0.16)}, inset 0 1px 0 rgba(255,255,255,0.9)`,
        }}
      >
        {/* Soft breathing aura behind the glyph — opacity only. */}
        <motion.div
          aria-hidden
          animate={reduce ? { opacity: 0.5 } : { opacity: [0.4, 0.66, 0.4] }}
          transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            top: -40,
            left: '50%',
            width: 200,
            height: 200,
            marginLeft: -100,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${glowFrom(META.hue, 70, 0.32)} 0%, transparent 68%)`,
            filter: 'blur(26px)',
            pointerEvents: 'none',
          }}
        />

        <div className="relative flex flex-col items-center text-center">
          <motion.div
            animate={reduce ? undefined : { y: [0, -4, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-[26px]"
            style={{
              background: `linear-gradient(150deg, ${glowFrom(META.hue, 92, 1)}, ${glowFrom(META.hue, 82, 1)})`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.85), 0 8px 22px ${glowFrom(META.hue, 60, 0.18)}`,
            }}
          >
            <span aria-hidden>{META.glyph}</span>
          </motion.div>

          <p
            className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: glowFrom(META.hue, 42, 0.85) }}
          >
            Secret Window
          </p>

          <h2
            className="font-serif text-[1.4rem] leading-snug"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {prompt.title}
          </h2>
        </div>

        {/* The confession field. */}
        <div className="relative mt-6">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            disabled={submitting || committing}
            rows={4}
            autoComplete="off"
            placeholder="Just between us…"
            className="w-full resize-none rounded-2xl px-4 py-3.5 text-[15px] leading-relaxed outline-none transition-shadow"
            style={{
              background: 'color-mix(in srgb, var(--color-surface) 94%, white)',
              border: `1px solid ${glowFrom(META.hue, 86, 0.6)}`,
              color: 'var(--color-text-primary)',
              boxShadow: `inset 0 1px 3px ${glowFrom(META.hue, 60, 0.08)}`,
            }}
          />
          <span
            className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] font-medium tabular-nums"
            style={{ color: 'var(--color-text-secondary)', opacity: trimmed.length ? 0.7 : 0 }}
          >
            {trimmed.length}/{MAX_LEN}
          </span>
        </div>

        {/* Seal button. */}
        <motion.button
          type="button"
          onClick={handleSeal}
          disabled={!canSend}
          whileTap={canSend && !reduce ? { scale: 0.97 } : undefined}
          className="spring-press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold"
          style={{
            background: canSend
              ? `linear-gradient(135deg, ${glowFrom(META.hue, 52, 1)}, ${glowFrom(META.hue, 44, 1)})`
              : 'color-mix(in srgb, var(--color-surface) 60%, #d9c7cf)',
            color: canSend ? '#fff' : 'var(--color-text-secondary)',
            boxShadow: canSend ? `0 8px 22px ${glowFrom(META.hue, 50, 0.32)}` : 'none',
            cursor: canSend ? 'pointer' : 'default',
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
          }}
        >
          {committing ? (
            <>
              <Lock size={16} strokeWidth={2.5} />
              Sealing…
            </>
          ) : (
            <>
              <Send size={16} strokeWidth={2.5} />
              Seal it
            </>
          )}
        </motion.button>

        <p
          className="mt-3 text-center text-[12px] font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          🤫 Sealed until you both share.
        </p>
      </div>
    </motion.div>
  );
}

// ─── Waiting phase — sealed, peekable recap ───────────────────────────────────

function SecretWaiting({ myResponse, partnerName }: { myResponse?: DropTypeProps['myResponse']; partnerName: string }) {
  const reduce = prefersReducedMotion();
  const [peek, setPeek] = useState(false);
  const myText = myResponse?.value?.trim() || '';

  const togglePeek = () => {
    feedback.tapSilent();
    setPeek((p) => !p);
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE_SILK }}
      className="w-full"
    >
      <div
        className="relative overflow-hidden rounded-[1.75rem] px-6 py-7 text-center"
        style={{
          background:
            `radial-gradient(120% 90% at 50% 0%, ${glowFrom(META.hue, 96, 0.85)} 0%, color-mix(in srgb, var(--color-surface) 88%, transparent) 62%)`,
          border: `1px solid ${glowFrom(META.hue, 84, 0.5)}`,
          boxShadow: `0 16px 44px ${glowFrom(META.hue, 60, 0.14)}, inset 0 1px 0 rgba(255,255,255,0.9)`,
        }}
      >
        {/* Gentle breathing seal — scale only, very subtle. */}
        <motion.div
          animate={reduce ? undefined : { scale: [1, 1.04, 1] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-[24px]"
          style={{
            background: `linear-gradient(150deg, ${glowFrom(META.hue, 92, 1)}, ${glowFrom(META.hue, 80, 1)})`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.85), 0 8px 22px ${glowFrom(META.hue, 60, 0.18)}`,
          }}
        >
          <span aria-hidden>{META.glyph}</span>
        </motion.div>

        <h2
          className="font-serif text-[1.3rem] leading-snug"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Your secret is sealed
        </h2>
        <p
          className="mx-auto mt-1.5 max-w-[260px] text-[13.5px] leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Held close, waiting on {partnerName}. It opens only when you both share.
        </p>

        {/* Peekable recap of MY own words. */}
        {myText && (
          <button
            type="button"
            onClick={togglePeek}
            aria-pressed={peek}
            aria-label={peek ? 'Hide your secret' : 'Peek at your secret'}
            className="spring-press relative mt-5 block w-full overflow-hidden rounded-2xl px-4 py-4 text-left"
            style={{
              background: 'color-mix(in srgb, var(--color-surface) 92%, white)',
              border: `1px solid ${glowFrom(META.hue, 86, 0.55)}`,
              cursor: 'pointer',
            }}
          >
            <p
              className="text-[15px] leading-relaxed transition-[filter,opacity] duration-300"
              style={{
                color: 'var(--color-text-primary)',
                filter: peek ? 'none' : 'blur(7px)',
                opacity: peek ? 1 : 0.85,
                userSelect: peek ? 'auto' : 'none',
              }}
            >
              {myText}
            </p>

            {/* Lock chip — flips to "tap to hide" hint once peeked. */}
            <AnimatePresence initial={false}>
              {!peek && (
                <motion.span
                  key="locked"
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduce ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.24, ease: EASE_SOFT }}
                  className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold"
                  style={{ color: glowFrom(META.hue, 40, 0.95) }}
                >
                  <Eye size={14} strokeWidth={2.4} />
                  Tap to peek at yours
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Revealed phase — the tender unveil ───────────────────────────────────────

interface RevealCardProps {
  name: string;
  text: string;
  mine: boolean;
}

function SecretRevealCard({ name, text, mine }: RevealCardProps) {
  return (
    <motion.div variants={staggerItem} className="w-full">
      <div
        className="relative overflow-hidden rounded-[1.5rem] px-5 py-5"
        style={{
          background: mine
            ? 'color-mix(in srgb, var(--color-surface) 92%, white)'
            : `radial-gradient(140% 120% at 0% 0%, ${glowFrom(META.hue, 95, 0.7)} 0%, color-mix(in srgb, var(--color-surface) 90%, transparent) 70%)`,
          border: `1px solid ${glowFrom(META.hue, 86, mine ? 0.4 : 0.6)}`,
          boxShadow: `0 10px 30px ${glowFrom(META.hue, 60, 0.12)}, inset 0 1px 0 rgba(255,255,255,0.85)`,
        }}
      >
        <p
          className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: glowFrom(META.hue, 44, 0.9) }}
        >
          {mine ? 'You' : name}
        </p>
        <p
          className="font-serif text-[15.5px] leading-relaxed"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {text || '—'}
        </p>
      </div>
    </motion.div>
  );
}

function SecretReveal({
  prompt,
  profile,
  myResponse,
  partnerResponse,
}: Pick<DropTypeProps, 'prompt' | 'profile' | 'myResponse' | 'partnerResponse'>) {
  const reduce = prefersReducedMotion();
  const firedRef = useRef(false);

  // The reveal is the emotional climax — celebrate once, never on re-render.
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    feedback.milestone();
  }, []);

  const myText = myResponse?.value?.trim() || '';
  const partnerText = partnerResponse?.value?.trim() || '';
  const partnerLabel = partnerResponse?.name?.trim() || profile.partnerName;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE_SILK }}
      className="w-full"
    >
      <div className="mb-5 text-center">
        <motion.div
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduce ? { duration: 0.2 } : { ...springGentle, delay: 0.05 }}
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-[26px]"
          style={{
            background: `linear-gradient(150deg, ${glowFrom(META.hue, 92, 1)}, ${glowFrom(META.hue, 80, 1)})`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.85), 0 10px 26px ${glowFrom(META.hue, 58, 0.24)}`,
          }}
        >
          <span aria-hidden>{META.glyph}</span>
        </motion.div>
        <p
          className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: glowFrom(META.hue, 42, 0.85) }}
        >
          Both shared
        </p>
        <h2
          className="font-serif text-[1.3rem] leading-snug"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {prompt.title}
        </h2>
      </div>

      {/* Slow, tender stagger — partner's first (the one you were waiting on), then yours. */}
      <motion.div
        variants={staggerContainer(reduce ? 0 : 0.22, reduce ? 0 : 0.18)}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-3"
      >
        <SecretRevealCard name={partnerLabel} text={partnerText} mine={false} />
        <SecretRevealCard name={profile.myName} text={myText} mine />
      </motion.div>

      <motion.p
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_SOFT, delay: reduce ? 0 : 0.7 }}
        className="mt-5 text-center text-[13px] font-medium leading-relaxed"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Two secrets, held safely between you. 🤍
      </motion.p>
    </motion.div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function SecretWindow({
  prompt,
  profile,
  phase,
  myResponse,
  partnerResponse,
  submitting,
  onSubmit,
}: DropTypeProps) {
  if (phase === 'revealed') {
    return (
      <SecretReveal
        prompt={prompt}
        profile={profile}
        myResponse={myResponse}
        partnerResponse={partnerResponse}
      />
    );
  }

  if (phase === 'waiting') {
    return <SecretWaiting myResponse={myResponse} partnerName={profile.partnerName} />;
  }

  return <SecretComposer prompt={prompt} submitting={submitting} onSubmit={onSubmit} />;
}

export default SecretWindow;
