import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { Archive, Heart, LockKeyhole, Mail, MailOpen, PenLine, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { ViewHeader } from '../components/ViewHeader';
import { useNativeShell } from '../hooks/useNativeShell';
import { StorageService, storageEventTarget } from '../services/storage';
import { Envelope, ViewState } from '../types';
import { feedback } from '../utils/feedback';
import { generateId } from '../utils/ids';

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055 } },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.38, ease: [0.16, 1, 0.3, 1] as const } },
};

interface OpenWhenProps {
  setView: (view: ViewState) => void;
}

const ENVELOPE_COLORS = [
  { bg: 'bg-red-500/12', text: 'text-red-600', bgOnly: 'bg-red-500/12', accent: '#d95872', surface: 'rgba(255,238,242,0.88)', seal: 'rgba(217,88,114,0.22)' },
  { bg: 'bg-pink-500/12', text: 'text-pink-600', bgOnly: 'bg-pink-500/12', accent: '#c95f91', surface: 'rgba(255,239,248,0.88)', seal: 'rgba(201,95,145,0.22)' },
  { bg: 'bg-purple-500/12', text: 'text-purple-600', bgOnly: 'bg-purple-500/12', accent: '#8f64c8', surface: 'rgba(246,240,255,0.88)', seal: 'rgba(143,100,200,0.22)' },
  { bg: 'bg-orange-500/12', text: 'text-orange-600', bgOnly: 'bg-orange-500/12', accent: '#c87a35', surface: 'rgba(255,244,228,0.88)', seal: 'rgba(200,122,53,0.22)' },
  { bg: 'bg-rose-500/12', text: 'text-rose-600', bgOnly: 'bg-rose-500/12', accent: '#c95370', surface: 'rgba(255,238,243,0.88)', seal: 'rgba(201,83,112,0.22)' },
];

const LETTER_IDEAS = ['you miss me', 'you need courage', 'you feel proud', 'you had a hard day'];

const cleanPrompt = (value: string) => value.replace(/^open\s+when\s*/i, '').trim();
const DEFAULT_ENVELOPE_COLOR = `${ENVELOPE_COLORS[1].bg} ${ENVELOPE_COLORS[1].text}`;

const getEnvelopeColorParts = (color?: string) => {
  const [bgClass = ENVELOPE_COLORS[1].bg, textClass = ENVELOPE_COLORS[1].text] = (
    typeof color === 'string' && color.trim() ? color : DEFAULT_ENVELOPE_COLOR
  ).split(/\s+/);

  return { bgClass, textClass };
};

const getEnvelopeTone = (textClass: string) => (
  ENVELOPE_COLORS.find((color) => color.text === textClass) ?? ENVELOPE_COLORS[1]
);

const getMomentText = (label: string) => cleanPrompt(label) || label;

const formatOpenedDate = (value?: string) => {
  if (!value) return 'Just opened';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Opened';
  return `Opened ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
};

const formatCountLabel = (count: number, singular: string, plural = `${singular}s`) => (
  `${count} ${count === 1 ? singular : plural}`
);

const EnvelopeCard: React.FC<{
  envelope: Envelope;
  onOpen: (envelope: Envelope) => void;
  onDelete: (id: string, event: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ envelope: env, onOpen, onDelete }) => {
  const { bgClass, textClass } = getEnvelopeColorParts(env.color);
  const tone = getEnvelopeTone(textClass);
  const isOpened = !env.isLocked;
  const momentText = getMomentText(env.label);

  const handleOpen = () => {
    feedback.tap();
    onOpen(env);
  };

  const handleKeyboardOpen = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    handleOpen();
  };

  return (
    <motion.article
      layout
      variants={staggerItem}
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyboardOpen}
      className="group relative overflow-hidden rounded-[2rem] p-4 spring-press focus-visible:ring-2 focus-visible:ring-lior-500/60 focus-visible:ring-offset-2"
      style={{
        background: isOpened
          ? 'linear-gradient(135deg, rgba(255,255,255,0.88), rgba(250,245,255,0.74))'
          : 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(255,245,235,0.78))',
        border: '1px solid rgba(255,255,255,0.82)',
        boxShadow: isOpened
          ? '0 12px 30px rgba(143,100,200,0.10), inset 0 1px 0 rgba(255,255,255,0.92)'
          : '0 16px 34px rgba(200,104,126,0.13), inset 0 1px 0 rgba(255,255,255,0.94)',
      }}
    >
      <div className="absolute -right-10 -top-14 h-32 w-32 rounded-full opacity-70 blur-2xl" style={{ background: tone.seal }} />

      <div className="relative flex items-center gap-4">
        <div className="relative h-[86px] w-[112px] shrink-0">
          <div
            className={`absolute inset-x-1 bottom-1 top-4 rounded-[1.35rem] ${bgClass}`}
            style={{
              backgroundColor: tone.surface,
              border: '1px solid rgba(255,255,255,0.78)',
              boxShadow: '0 12px 24px rgba(155,123,132,0.10), inset 0 1px 0 rgba(255,255,255,0.82)',
            }}
          />
          <div
            className="absolute inset-x-2 top-5 h-11 rounded-t-[1.2rem]"
            style={{
              background: `linear-gradient(145deg, rgba(255,255,255,0.42), ${tone.seal})`,
              clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            }}
          />
          <div
            className="absolute left-1/2 top-[45px] flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full"
            style={{
              background: isOpened ? 'rgba(255,255,255,0.78)' : tone.accent,
              color: isOpened ? tone.accent : '#fff',
              border: '1px solid rgba(255,255,255,0.62)',
              boxShadow: '0 8px 18px rgba(155,83,112,0.18), inset 0 1px 0 rgba(255,255,255,0.32)',
            }}
          >
            {isOpened ? <MailOpen size={17} className={textClass} /> : <LockKeyhole size={16} />}
          </div>
          <div className={`absolute bottom-2 left-4 right-4 h-1.5 rounded-full ${bgClass}`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em]"
              style={{
                background: isOpened ? 'rgba(143,100,200,0.10)' : 'rgba(201,95,145,0.10)',
                color: isOpened ? '#7d55ad' : tone.accent,
              }}
            >
              {isOpened ? <MailOpen size={12} /> : <LockKeyhole size={12} />}
              {isOpened ? 'Opened' : 'Sealed'}
            </span>
          </div>

          <h3 className="mt-2 text-[17px] font-extrabold leading-snug" style={{ color: 'var(--color-text-primary)' }}>
            Open when {momentText}
          </h3>

          <p className="mt-1.5 text-[12px] font-semibold leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            {isOpened ? formatOpenedDate(env.openedAt) : 'Waiting quietly for the exact moment.'}
          </p>
        </div>

        <button
          type="button"
          aria-label={`Delete ${env.label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => onDelete(env.id, event)}
          className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full active:scale-90 transition-transform"
          style={{
            background: 'rgba(255,255,255,0.62)',
            color: 'rgba(157,77,95,0.68)',
            border: '1px solid rgba(255,255,255,0.72)',
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.article>
  );
};

export const OpenWhen: React.FC<OpenWhenProps> = ({ setView }) => {
  const { keyboardOpen, keyboardHeight } = useNativeShell();
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isCreating) return;
    const timer = setTimeout(() => labelInputRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, [isCreating]);

  useEffect(() => {
    const load = () => setEnvelopes(StorageService.getEnvelopes());
    load();
    storageEventTarget.addEventListener('storage-update', load);
    return () => storageEventTarget.removeEventListener('storage-update', load);
  }, []);

  const counts = useMemo(() => envelopes.reduce(
    (summary, envelope) => {
      if (envelope.isLocked) summary.sealed += 1;
      else summary.opened += 1;
      return summary;
    },
    { sealed: 0, opened: 0 },
  ), [envelopes]);

  const currentLetter = envelopes.find((envelope) => envelope.id === readingId);
  const prompt = cleanPrompt(label);
  const canSeal = !!prompt && !!content.trim();
  const modalPaddingBottom = keyboardOpen ? keyboardHeight + 20 : 'calc(env(safe-area-inset-bottom, 0px) + 20px)';

  const openComposer = () => {
    feedback.tap();
    setIsCreating(true);
  };

  const handleSave = () => {
    const body = content.trim();
    if (!prompt || !body) return;

    const colorObj = ENVELOPE_COLORS[Math.floor(Math.random() * ENVELOPE_COLORS.length)];
    const newEnvelope: Envelope = {
      id: generateId(),
      label: `Open when ${prompt}`,
      content: body,
      color: `${colorObj.bg} ${colorObj.text}`,
      isLocked: true,
    };

    StorageService.saveEnvelope(newEnvelope);
    feedback.celebrate();
    setEnvelopes((previous) => [newEnvelope, ...previous]);
    setIsCreating(false);
    setLabel('');
    setContent('');
  };

  const handleDelete = (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDeleteTarget(id);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    StorageService.deleteEnvelope(deleteTarget);
    setEnvelopes((previous) => previous.filter((envelope) => envelope.id !== deleteTarget));
    if (readingId === deleteTarget) setReadingId(null);
    setDeleteTarget(null);
  };

  const openEnvelope = (envelope: Envelope) => {
    setReadingId(envelope.id);
    if (!envelope.isLocked) return;

    const updated = { ...envelope, isLocked: false, openedAt: new Date().toISOString() };
    StorageService.saveEnvelope(updated);
    setEnvelopes((previous) => previous.map((candidate) => (candidate.id === envelope.id ? updated : candidate)));
  };

  return (
    <div className="min-h-screen pb-32">
      <ViewHeader
        title="Open When"
        subtitle="A private mailbox for future feelings"
        onBack={() => setView('home')}
        variant="simple"
        rightSlot={
          <button
            type="button"
            onClick={openComposer}
            aria-label="Write an Open When letter"
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-white active:scale-95 transition-transform"
            style={{ background: 'var(--theme-nav-center-bg-active)', boxShadow: '0 10px 24px rgba(196,104,126,0.24)' }}
          >
            <Plus size={20} />
          </button>
        }
      />

      <div className="px-5 pt-3">
        <section
          className="relative mb-5 overflow-hidden rounded-[2rem] p-5"
          style={{
            background: 'linear-gradient(145deg, rgba(255,250,245,0.92), rgba(255,238,246,0.78) 58%, rgba(246,240,255,0.76))',
            border: '1px solid rgba(255,255,255,0.82)',
            boxShadow: '0 18px 42px rgba(200,104,126,0.14), inset 0 1px 0 rgba(255,255,255,0.92)',
          }}
        >
          <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full blur-3xl" style={{ background: 'rgba(244,114,182,0.20)' }} />
          <div className="absolute -bottom-16 left-6 h-32 w-32 rounded-full blur-3xl" style={{ background: 'rgba(251,191,36,0.14)' }} />

          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.62)', color: '#b85d78', border: '1px solid rgba(255,255,255,0.70)' }}>
                <Archive size={13} />
                <span className="text-[10px] font-extrabold uppercase tracking-[0.14em]">Keepsake mailbox</span>
              </div>

              <h2 className="max-w-[14rem] text-[1.7rem] font-extrabold leading-[1.05]" style={{ color: 'var(--color-text-primary)' }}>
                {counts.sealed ? `${formatCountLabel(counts.sealed, 'letter')} waiting` : 'Letters for the moments words matter'}
              </h2>

              <p className="mt-3 max-w-[17rem] text-[13px] font-semibold leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                Seal a tiny note for a mood, a hard day, a win, or whenever they need you close.
              </p>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={openComposer}
              className="shrink-0 rounded-[1.35rem] px-4 py-3 text-white"
              style={{ background: 'var(--theme-nav-center-bg-active)', boxShadow: '0 12px 26px rgba(196,104,126,0.24)' }}
            >
              <span className="flex items-center gap-2 text-[13px] font-extrabold">
                <PenLine size={16} />
                Write
              </span>
            </motion.button>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-2.5">
            {[
              ['Sealed', counts.sealed],
              ['Opened', counts.opened],
              ['Total', envelopes.length],
            ].map(([statLabel, value]) => (
              <div
                key={statLabel}
                className="rounded-2xl px-3 py-3 text-center"
                style={{ background: 'rgba(255,255,255,0.54)', border: '1px solid rgba(255,255,255,0.64)' }}
              >
                <p className="text-[18px] font-extrabold leading-none" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.10em]" style={{ color: 'var(--color-text-secondary)' }}>{statLabel}</p>
              </div>
            ))}
          </div>
        </section>

        {envelopes.length > 0 ? (
          <motion.div className="space-y-3.5" variants={staggerContainer} initial="hidden" animate="show">
            {envelopes.map((envelope) => (
              <EnvelopeCard
                key={envelope.id}
                envelope={envelope}
                onOpen={openEnvelope}
                onDelete={handleDelete}
              />
            ))}
          </motion.div>
        ) : (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-[2rem] px-6 py-9 text-center"
            style={{
              background: 'rgba(255,255,255,0.62)',
              border: '1px dashed rgba(196,104,126,0.28)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72)',
            }}
          >
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[1.75rem]" style={{ background: 'rgba(255,238,246,0.9)', color: '#c95f91', boxShadow: '0 16px 32px rgba(201,95,145,0.14)' }}>
              <Mail size={34} />
            </div>
            <h3 className="text-[1.35rem] font-extrabold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
              Your mailbox is empty
            </h3>
            <p className="mx-auto mt-2 max-w-[17rem] text-[13px] font-semibold leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Start with one note they can open when the day asks for extra love.
            </p>
            <button
              type="button"
              onClick={openComposer}
              className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 text-[13px] font-extrabold text-white active:scale-95 transition-transform"
              style={{ background: 'var(--theme-nav-center-bg-active)', boxShadow: '0 10px 24px rgba(196,104,126,0.22)' }}
            >
              <Plus size={17} />
              Write first letter
            </button>
          </motion.section>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete letter?"
        message="This removes the sealed note from your shared mailbox."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <AnimatePresence>
        {isCreating && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center px-5 pt-8"
            style={{
              background: 'rgba(45,31,37,0.36)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              paddingBottom: modalPaddingBottom,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="w-full max-w-md overflow-hidden rounded-[2rem]"
              style={{
                background: 'linear-gradient(180deg, rgba(255,252,250,0.96), rgba(255,246,250,0.94))',
                border: '1px solid rgba(255,255,255,0.86)',
                boxShadow: '0 28px 70px rgba(45,31,37,0.24), inset 0 1px 0 rgba(255,255,255,0.95)',
              }}
              initial={{ opacity: 0, y: 34, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 22, scale: 0.98 }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="p-5">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,238,246,0.9)', color: '#c95f91' }}>
                      <PenLine size={19} />
                    </div>
                    <h3 className="text-xl font-extrabold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                      Seal a letter
                    </h3>
                    <p className="mt-1 text-[12px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                      Pick the moment, then write what they need to hear.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    aria-label="Close letter composer"
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:scale-95 transition-transform"
                    style={{ background: 'rgba(255,255,255,0.72)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.78)' }}
                  >
                    <X size={22} />
                  </button>
                </div>

                <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-secondary)' }}>
                  Moment
                </label>
                <div
                  className="mb-3 flex items-center gap-2 rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.68)', border: '1px solid rgba(196,104,126,0.16)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.74)' }}
                >
                  <span className="shrink-0 text-[14px] font-extrabold" style={{ color: '#c95f91' }}>Open when</span>
                  <input
                    ref={labelInputRef}
                    type="text"
                    placeholder="you miss me"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    inputMode="text"
                    enterKeyHint="next"
                    autoCapitalize="sentences"
                    autoCorrect="on"
                    className="w-full bg-transparent text-[16px] font-bold outline-none focus:outline-none"
                    style={{ color: 'var(--color-text-primary)' }}
                  />
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {LETTER_IDEAS.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => { feedback.tap(); setLabel(idea); }}
                      className="rounded-full px-3 py-2 text-[11px] font-bold active:scale-95 transition-transform"
                      style={{ background: 'rgba(201,95,145,0.09)', color: '#a64f74', border: '1px solid rgba(201,95,145,0.11)' }}
                    >
                      {idea}
                    </button>
                  ))}
                </div>

                <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-secondary)' }}>
                  Letter
                </label>
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  className="mb-4 h-48 w-full resize-none rounded-[1.35rem] p-4 text-[16px] leading-relaxed outline-none focus:ring-2 focus:ring-lior-500/30"
                  placeholder="Write the words you want waiting for them..."
                  inputMode="text"
                  enterKeyHint="done"
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck
                  style={{
                    background: 'rgba(255,255,255,0.72)',
                    border: '1px solid rgba(196,104,126,0.16)',
                    color: 'var(--color-text-primary)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.76)',
                  }}
                />

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSeal}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-extrabold text-white active:scale-[0.98] disabled:opacity-45 disabled:shadow-none transition-all"
                  style={{ background: 'var(--theme-nav-center-bg-active)', boxShadow: '0 12px 28px rgba(196,104,126,0.24)' }}
                >
                  <Sparkles size={17} />
                  Seal envelope
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {readingId && currentLetter && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col"
            style={{
              background: 'linear-gradient(180deg, rgba(255,248,250,0.97), rgba(246,240,255,0.96))',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-6">
              <button
                type="button"
                onClick={() => setReadingId(null)}
                aria-label="Close letter"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:scale-95 transition-transform"
                style={{ background: 'rgba(255,255,255,0.78)', color: 'var(--color-text-secondary)', border: '1px solid rgba(255,255,255,0.82)', boxShadow: '0 8px 20px rgba(155,123,132,0.10)' }}
              >
                <X size={22} />
              </button>
              <span className="rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ background: 'rgba(255,255,255,0.72)', color: '#b85d78', border: '1px solid rgba(255,255,255,0.80)' }}>
                {formatOpenedDate(currentLetter.openedAt)}
              </span>
            </div>

            <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto px-5 pb-8 pt-4">
              <motion.article
                initial={{ opacity: 0, y: 22, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.99 }}
                transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                className="relative min-h-[70vh] overflow-hidden rounded-[2rem] p-6"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,253,247,0.98), rgba(255,248,238,0.95))',
                  border: '1px solid rgba(255,255,255,0.82)',
                  boxShadow: '0 22px 56px rgba(155,123,132,0.16), inset 0 1px 0 rgba(255,255,255,0.96)',
                }}
              >
                <div className="absolute inset-x-0 top-0 h-3" style={{ background: 'linear-gradient(90deg, #f9a8d4, #fbcfe8, #fde68a, #ddd6fe)' }} />
                <div className="absolute -right-12 -top-10 h-32 w-32 rounded-full blur-3xl" style={{ background: 'rgba(249,168,212,0.18)' }} />

                <div className="relative">
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: 'rgba(201,95,145,0.10)', color: '#c95f91' }}>
                    <MailOpen size={22} />
                  </div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-secondary)' }}>
                    Open when
                  </p>
                  <h2 className="mt-2 text-[1.75rem] font-extrabold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                    {getMomentText(currentLetter.label)}
                  </h2>
                  <div className="my-6 h-px" style={{ background: 'linear-gradient(90deg, rgba(201,95,145,0.26), transparent)' }} />
                  <div className="whitespace-pre-wrap text-[17px] leading-[1.75]" style={{ color: 'var(--color-text-primary)' }}>
                    {currentLetter.content}
                  </div>
                  <div className="mt-12 flex justify-center" style={{ color: '#c95f91' }}>
                    <Heart fill="currentColor" size={24} />
                  </div>
                </div>
              </motion.article>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
