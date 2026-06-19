/**
 * OnThisDay.tsx — the `on_this_day` Daily Drop type.
 *
 * A memory from the couple's story resurfaces. Both partners leave a note about
 * what it brings back; the notes stay sealed until both have written, then the
 * memory blooms with both reflections underneath it — tender and nostalgic.
 *
 * Built to the frozen DropTypeProps contract (../dropContract). Presentational
 * only: it never touches storage, it just calls `onSubmit(text.trim())`.
 *
 *   phase 'input'    → memory card + "What does this bring back?" textarea
 *   phase 'waiting'  → memory + my note locked; "waiting on {partner}"
 *   phase 'revealed' → memory on top, both notes labeled underneath
 *
 * Animations are transform/opacity only and honour prefersReducedMotion().
 */
import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Clock, Lock } from 'lucide-react';
import type { DropTypeProps, DropMemory } from '../dropContract';
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

const META = DROP_META.on_this_day;

/** Warm accent derived from the type hue, used for soft tints + glows. */
const accent = (s: number, l: number, a = 1) => `hsla(${META.hue}, ${s}%, ${l}%, ${a})`;

const MAX_NOTE = 280;

// ─── "X years ago today" from an ISO/date string ─────────────────────────────

function yearsAgoLabel(dateIso?: string): string | null {
  if (!dateIso) return null;
  const then = new Date(dateIso);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - then.getFullYear();
  // If we haven't reached the anniversary month/day yet this year, step back one.
  const beforeAnniversary =
    now.getMonth() < then.getMonth() ||
    (now.getMonth() === then.getMonth() && now.getDate() < then.getDate());
  if (beforeAnniversary) years -= 1;

  if (years >= 1) return `${years} ${years === 1 ? 'year' : 'years'} ago today`;

  const months =
    (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  if (months >= 1) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  return 'Earlier this year';
}

function isUsableSrc(src?: string): src is string {
  return typeof src === 'string' && src.trim().length > 0;
}

// ─── Resurfaced memory card ──────────────────────────────────────────────────

interface MemoryCardProps {
  memory: DropMemory | null;
  reduce: boolean;
}

function MemoryCard({ memory, reduce }: MemoryCardProps) {
  const title = memory?.title?.trim() || 'A memory from your story';
  const text = memory?.text?.trim();
  const ago = yearsAgoLabel(memory?.date);
  const hasImage = isUsableSrc(memory?.image);
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = hasImage && !imgFailed;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springSmooth}
      className="bento-card overflow-hidden"
      style={{
        borderRadius: '1.75rem',
        padding: 0,
        boxShadow: '0 18px 44px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.5)',
      }}
    >
      {/* Image / soft gradient placeholder — fixed-height media band */}
      <div
        className="relative w-full"
        style={{
          height: 168,
          background: showImage
            ? undefined
            : `linear-gradient(135deg, ${accent(70, 88)} 0%, ${accent(60, 78)} 55%, ${accent(45, 70)} 100%)`,
        }}
      >
        {showImage ? (
          <img
            src={memory!.image as string}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            draggable={false}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.span
              aria-hidden
              animate={reduce ? undefined : { y: [0, -5, 0] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{ fontSize: 46, lineHeight: 1, filter: 'saturate(1.05)' }}
            >
              {META.glyph}
            </motion.span>
          </div>
        )}

        {/* legibility veil under the badge */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{
            height: 64,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.20), transparent)',
          }}
        />

        {/* "X years ago today" badge */}
        {ago && (
          <div
            className="absolute left-3.5 top-3.5 flex items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{
              background: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
            }}
          >
            <Clock size={12} strokeWidth={2.5} style={{ color: accent(55, 42) }} />
            <span
              className="text-[11px] font-bold"
              style={{ color: accent(50, 32), letterSpacing: '0.01em' }}
            >
              {ago}
            </span>
          </div>
        )}
      </div>

      {/* Title + text */}
      <div className="px-5 pb-5 pt-4">
        <h3
          className="font-serif text-[1.2rem] leading-snug"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {title}
        </h3>
        {text ? (
          <p
            className="mt-1.5 text-[13.5px] leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {text}
          </p>
        ) : (
          !memory && (
            <p
              className="mt-1.5 text-[13.5px] leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              One of your moments came back around. Sit with it for a second.
            </p>
          )
        )}
      </div>
    </motion.div>
  );
}

// ─── A labeled note bubble (used in the reveal) ──────────────────────────────

interface NoteBubbleProps {
  name: string;
  text: string;
  mine: boolean;
}

function NoteBubble({ name, text, mine }: NoteBubbleProps) {
  return (
    <motion.div variants={staggerItem} className="flex flex-col gap-1.5">
      <span
        className="px-1 text-[11px] font-bold uppercase"
        style={{ color: mine ? accent(45, 45) : 'var(--color-text-secondary)', letterSpacing: '0.06em' }}
      >
        {name}
      </span>
      <div
        className="rounded-[1.25rem] px-4 py-3.5"
        style={{
          background: mine ? accent(72, 92) : 'rgba(255,255,255,0.66)',
          border: `1px solid ${mine ? accent(60, 82) : 'rgba(0,0,0,0.05)'}`,
          boxShadow: '0 6px 18px rgba(0,0,0,0.05)',
        }}
      >
        <p
          className="text-[14px] leading-relaxed"
          style={{ color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}
        >
          {text}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function OnThisDay({
  prompt,
  profile,
  phase,
  myResponse,
  partnerResponse,
  submitting,
  onSubmit,
  resolveMemory,
}: DropTypeProps) {
  const reduce = prefersReducedMotion();

  const memory = useMemo<DropMemory | null>(() => {
    if (!prompt.memoryId || !resolveMemory) return null;
    try {
      return resolveMemory(prompt.memoryId);
    } catch {
      return null;
    }
  }, [prompt.memoryId, resolveMemory]);

  const [note, setNote] = useState('');
  const trimmed = note.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const commit = () => {
    if (!canSubmit) return;
    feedback.confirm();
    onSubmit(trimmed);
  };

  // ── REVEALED — memory on top, both notes underneath ────────────────────────
  if (phase === 'revealed') {
    const mine = myResponse?.value?.trim();
    const theirs = partnerResponse?.value?.trim();

    return (
      <div className="w-full px-1 pb-2">
        <MemoryCard memory={memory} reduce={reduce} />

        <motion.div
          variants={staggerContainer(0.1, 0.12)}
          initial={reduce ? false : 'hidden'}
          animate="visible"
          className="mt-5 flex flex-col gap-3.5"
        >
          <motion.p
            variants={staggerItem}
            className="px-1 text-center text-[12.5px] font-medium"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            What it brought back, for both of you
          </motion.p>

          {mine && <NoteBubble name={profile.myName || 'You'} text={mine} mine />}
          {theirs && (
            <NoteBubble name={profile.partnerName || 'Them'} text={theirs} mine={false} />
          )}

          {!mine && !theirs && (
            <motion.p
              variants={staggerItem}
              className="px-1 text-center text-[13px] leading-relaxed"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              You both let the memory speak for itself.
            </motion.p>
          )}
        </motion.div>
      </div>
    );
  }

  // ── WAITING — memory + my note locked, sealed on partner ───────────────────
  if (phase === 'waiting') {
    const mine = myResponse?.value?.trim();
    return (
      <div className="w-full px-1 pb-2">
        <MemoryCard memory={memory} reduce={reduce} />

        {mine && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springSmooth, delay: 0.05 }}
            className="mt-5"
          >
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <Lock size={13} strokeWidth={2.5} style={{ color: accent(48, 50) }} />
              <span
                className="text-[11px] font-bold uppercase"
                style={{ color: accent(45, 42), letterSpacing: '0.06em' }}
              >
                Your note — sealed
              </span>
            </div>
            <div
              className="rounded-[1.25rem] px-4 py-3.5"
              style={{
                background: accent(72, 92),
                border: `1px solid ${accent(60, 82)}`,
                boxShadow: '0 6px 18px rgba(0,0,0,0.05)',
              }}
            >
              <p
                className="text-[14px] leading-relaxed"
                style={{ color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}
              >
                {mine}
              </p>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.18, duration: 0.5, ease: EASE_SILK }}
          className="mt-5 flex items-center justify-center gap-2 px-2 text-center"
        >
          <motion.span
            aria-hidden
            animate={reduce ? undefined : { opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{ fontSize: 15, lineHeight: 1 }}
          >
            🕰️
          </motion.span>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Sealed — waiting on{' '}
            <span style={{ color: accent(48, 44), fontWeight: 700 }}>
              {profile.partnerName || 'them'}
            </span>
            . Their note appears once you’ve both shared.
          </p>
        </motion.div>
      </div>
    );
  }

  // ── INPUT — memory + "What does this bring back?" textarea ──────────────────
  return (
    <div className="w-full px-1 pb-2">
      <MemoryCard memory={memory} reduce={reduce} />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springSmooth, delay: 0.08 }}
        className="mt-5"
      >
        <label
          htmlFor="onthisday-note"
          className="mb-2 block px-1 font-serif text-[1.05rem] leading-snug"
          style={{ color: 'var(--color-text-primary)' }}
        >
          What does this bring back?
        </label>

        <div
          className="rounded-[1.25rem] p-1"
          style={{
            background: 'rgba(255,255,255,0.6)',
            border: `1px solid ${accent(55, 82)}`,
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          <textarea
            id="onthisday-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
            placeholder={`A feeling, a detail, where you were…`}
            rows={4}
            disabled={submitting}
            className="w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none"
            style={{ color: 'var(--color-text-primary)' }}
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between px-1.5">
          <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            Only revealed once you’ve both written
          </span>
          <span
            className="text-[11px] tabular-nums"
            style={{ color: trimmed.length > MAX_NOTE - 30 ? accent(60, 50) : 'var(--color-text-secondary)' }}
          >
            {trimmed.length}/{MAX_NOTE}
          </span>
        </div>

        <motion.button
          type="button"
          onClick={commit}
          disabled={!canSubmit}
          className="spring-press mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-bold text-[15px]"
          whileTap={canSubmit ? { scale: 0.97 } : undefined}
          transition={springSnappy}
          style={{
            background: canSubmit
              ? `linear-gradient(135deg, ${accent(58, 56)} 0%, ${accent(48, 48)} 100%)`
              : 'rgba(0,0,0,0.06)',
            color: canSubmit ? '#fff' : 'var(--color-text-secondary)',
            border: 'none',
            boxShadow: canSubmit ? `0 8px 22px ${accent(55, 50, 0.34)}` : 'none',
            cursor: canSubmit ? 'pointer' : 'default',
            letterSpacing: '0.01em',
            opacity: submitting ? 0.7 : 1,
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
          }}
        >
          {submitting ? 'Sealing…' : 'Seal my note'}
          {!submitting && <ArrowRight size={16} strokeWidth={2.5} />}
        </motion.button>
      </motion.div>
    </div>
  );
}

export default OnThisDay;
