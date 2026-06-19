/**
 * FinishMySentence — the `finish_my_sentence` Daily Drop type.
 *
 * A journal-like completion drop. The prompt carries a `sentenceStem` lead-in
 * (e.g. "Lately I keep thinking about…"); each partner finishes it in their own
 * words, sealed until both have written.
 *
 * Implements the frozen DropTypeProps contract (../dropContract):
 *   • input    → show the stem (serif) + a textarea to complete it; commit on submit.
 *   • waiting  → my completion is locked; calm "sealed, waiting on {partner}" recap.
 *   • revealed → both completions stacked as "{stem} {their text}", labelled by name.
 *
 * Motion is transform + opacity only and respects prefersReducedMotion().
 * Haptics route through the feedback facade.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, PenLine } from 'lucide-react';
import type { DropTypeProps } from '../dropContract';
import type { DropResponse } from '../../../types';
import {
  springSmooth,
  springSnappy,
  EASE_SILK,
  staggerContainer,
  staggerItem,
  prefersReducedMotion,
} from '../../../utils/motion';
import { feedback } from '../../../utils/feedback';

const CHAR_LIMIT = 200;
const HUE = 200; // matches DROP_META.finish_my_sentence.hue — cool ink-blue accent

/** Cool ink-blue accent derived from the type hue, kept soft for the warm/light shell. */
const accentSoft = `hsl(${HUE} 70% 52%)`;
const accentWash = `hsl(${HUE} 78% 96%)`;

/** A single finished line, rendered journal-style: stem in italic + the completion. */
function CompletedLine({ stem, text }: { stem: string; text: string }) {
  return (
    <p
      className="font-serif text-[1.0625rem] leading-relaxed"
      style={{ color: 'var(--color-text-primary)' }}
    >
      <span className="italic" style={{ color: 'var(--color-text-secondary)' }}>
        {stem}
      </span>{' '}
      <span style={{ fontWeight: 500 }}>{text}</span>
    </p>
  );
}

export function FinishMySentence({
  prompt,
  profile,
  phase,
  myResponse,
  partnerResponse,
  submitting,
  onSubmit,
}: DropTypeProps) {
  const reduce = prefersReducedMotion();
  const stem = prompt.sentenceStem ?? prompt.title;

  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const canSubmit = trimmed.length > 0 && !submitting;
  const remaining = CHAR_LIMIT - draft.length;

  const handleSubmit = () => {
    if (!canSubmit) return;
    feedback.confirm();
    onSubmit(trimmed);
  };

  // ── REVEALED — both completions, journal-like, stacked ──────────────────────
  if (phase === 'revealed') {
    const mine: DropResponse | undefined = myResponse;
    const theirs: DropResponse | undefined = partnerResponse;
    const lines: Array<{ key: string; name: string; text: string; me: boolean }> = [];
    if (mine?.value) lines.push({ key: 'me', name: profile.myName, text: mine.value, me: true });
    if (theirs?.value) {
      lines.push({
        key: 'partner',
        name: theirs.name || profile.partnerName,
        text: theirs.value,
        me: false,
      });
    }

    return (
      <motion.div
        className="w-full px-1 pt-1 pb-2"
        variants={staggerContainer(0.1, 0.05)}
        initial={reduce ? false : 'hidden'}
        animate="visible"
        onAnimationComplete={() => feedback.tapSilent()}
      >
        <motion.div variants={staggerItem} className="text-center mb-6">
          <h3
            className="font-serif text-[1.5rem] leading-snug"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {stem}
          </h3>
          <p className="text-[13px] mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            Two of you, same opening line.
          </p>
        </motion.div>

        <div className="flex flex-col gap-3.5">
          {lines.map((line) => (
            <motion.div
              key={line.key}
              variants={staggerItem}
              className="bento-card rounded-[1.5rem] px-5 py-5 text-left"
              style={{
                boxShadow: '0 8px 26px rgba(0,0,0,0.06)',
                borderLeft: `3px solid ${line.me ? accentSoft : 'var(--color-lior-500, #c0496a)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2.5">
                <span
                  className="text-[11px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: line.me ? accentSoft : 'var(--color-lior-500, #c0496a)' }}
                >
                  {line.name}
                </span>
              </div>
              <CompletedLine stem={stem} text={line.text} />
            </motion.div>
          ))}
        </div>

        {lines.length < 2 && (
          <motion.p
            variants={staggerItem}
            className="text-center text-[12px] mt-5"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            One of you let the page stay blank — that's okay.
          </motion.p>
        )}
      </motion.div>
    );
  }

  // ── WAITING — my completion locked; sealed, waiting on partner ───────────────
  if (phase === 'waiting') {
    const myText = myResponse?.value ?? trimmed;
    return (
      <motion.div
        className="w-full px-1 pt-1 pb-2"
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE_SILK }}
      >
        <div className="text-center mb-5">
          <h3
            className="font-serif text-[1.5rem] leading-snug"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Sealed.
          </h3>
        </div>

        <div
          className="bento-card rounded-[1.75rem] px-5 py-6 text-left relative overflow-hidden"
          style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.07)' }}
        >
          {/* soft breathing ink wash — opacity only */}
          <motion.div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(120% 80% at 85% 0%, ${accentWash} 0%, transparent 60%)`,
            }}
            animate={reduce ? { opacity: 0.6 } : { opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Lock size={13} strokeWidth={2.5} style={{ color: accentSoft }} />
              <span
                className="text-[11px] font-bold uppercase tracking-[0.08em]"
                style={{ color: accentSoft }}
              >
                Your words
              </span>
            </div>
            <CompletedLine stem={stem} text={myText} />
          </div>
        </div>

        <p
          className="text-center text-[13px] mt-5 leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Tucked away until {profile.partnerName} finishes theirs.
        </p>
      </motion.div>
    );
  }

  // ── INPUT — show stem prominently, collect my completion ─────────────────────
  return (
    <motion.div
      className="w-full px-1 pt-1 pb-2"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE_SILK }}
    >
      <div className="text-center mb-5">
        <motion.div
          className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded-full"
          style={{ background: accentWash, color: accentSoft }}
          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springSmooth}
        >
          <PenLine size={13} strokeWidth={2.5} />
          <span className="text-[11px] font-bold uppercase tracking-[0.08em]">
            Finish the line
          </span>
        </motion.div>

        <h3
          className="font-serif text-[1.6rem] leading-snug px-2"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {stem}
        </h3>
      </div>

      <div
        className="bento-card rounded-[1.75rem] px-4 py-4"
        style={{ boxShadow: '0 8px 26px rgba(0,0,0,0.06)' }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, CHAR_LIMIT))}
          maxLength={CHAR_LIMIT}
          rows={3}
          placeholder="…keep it going, in your own words."
          aria-label={`Finish the sentence: ${stem}`}
          className="w-full resize-none bg-transparent outline-none font-serif text-[1.0625rem] leading-relaxed placeholder:font-sans placeholder:text-[14px]"
          style={{ color: 'var(--color-text-primary)' }}
          autoFocus
        />
        <div className="flex items-center justify-end mt-1">
          <span
            className="text-[11px] font-medium tabular-nums"
            style={{
              color:
                remaining <= 20
                  ? 'var(--color-lior-500, #c0496a)'
                  : 'var(--color-text-secondary)',
            }}
          >
            {remaining}
          </span>
        </div>
      </div>

      <motion.button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        whileTap={canSubmit && !reduce ? { scale: 0.97 } : undefined}
        animate={{ opacity: canSubmit ? 1 : 0.55 }}
        transition={springSnappy}
        className="spring-press w-full mt-5 px-6 py-4 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2"
        style={{
          background: 'linear-gradient(135deg, #c0496a 0%, #b34563 100%)',
          color: '#fff',
          border: 'none',
          boxShadow: canSubmit ? '0 8px 24px rgba(196,104,126,0.35)' : 'none',
          cursor: canSubmit ? 'pointer' : 'default',
          letterSpacing: '0.01em',
        }}
      >
        {submitting ? 'Sealing…' : 'Seal my answer'}
      </motion.button>

      <p
        className="text-center text-[12px] mt-3.5"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {profile.partnerName} won't see it until they finish theirs.
      </p>
    </motion.div>
  );
}

export default FinishMySentence;
