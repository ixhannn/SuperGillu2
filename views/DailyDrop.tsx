import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Bell, Clock, Sparkles, Moon } from 'lucide-react';
import type { DropPrompt, DropType, ViewState } from '../types';
import { useDailyDrop } from '../hooks/useDailyDrop';
import { DROP_META } from '../utils/dropEngine';
import { feedback } from '../utils/feedback';
import { EASE_SILK, springSmooth, springGentle } from '../utils/motion';
import type { DropPhase, DropTypeProps } from '../components/daily-drop/dropContract';
import { ThisOrThat } from '../components/daily-drop/drops/ThisOrThat';
import { GuessMyMood } from '../components/daily-drop/drops/GuessMyMood';
import { DidTheyKnow } from '../components/daily-drop/drops/DidTheyKnow';
import { FinishMySentence } from '../components/daily-drop/drops/FinishMySentence';
import { OnThisDay } from '../components/daily-drop/drops/OnThisDay';
import { SecretWindow } from '../components/daily-drop/drops/SecretWindow';
import { TheDare } from '../components/daily-drop/drops/TheDare';
import { Pulse } from '../components/daily-drop/drops/Pulse';
import { DailyDropReveal } from '../components/daily-drop/DailyDropReveal';

interface DailyDropProps {
  setView: (view: ViewState) => void;
}

const DROP_COMPONENTS: Record<DropType, React.FC<DropTypeProps>> = {
  this_or_that: ThisOrThat,
  guess_my_mood: GuessMyMood,
  did_they_know: DidTheyKnow,
  finish_my_sentence: FinishMySentence,
  on_this_day: OnThisDay,
  secret_window: SecretWindow,
  the_dare: TheDare,
  pulse: Pulse,
};

// ── Dev-only: synthesize a plausible partner response so the reveal can be seen
// on a single device. Stripped from production builds (import.meta.env.DEV). ──
function demoPartnerValue(prompt: DropPrompt): { value: string; guess?: string } {
  switch (prompt.type) {
    case 'this_or_that':
    case 'guess_my_mood':
    case 'did_they_know': {
      const opts = prompt.options ?? [];
      return { value: opts[0]?.id ?? 'a', guess: opts[1]?.id ?? opts[0]?.id ?? 'a' };
    }
    case 'pulse':
      return { value: 'pulsed' };
    case 'finish_my_sentence':
      return { value: '…you, mostly.' };
    case 'on_this_day':
      return { value: 'I remember this so well.' };
    case 'secret_window':
      return { value: 'I’ve been wanting to tell you this for a while.' };
    case 'the_dare':
    default:
      return { value: 'Done 💛' };
  }
}

const CountdownChip: React.FC<{ label: string; urgent: boolean }> = ({ label, urgent }) => (
  <div
    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
    style={{
      color: urgent ? '#b4456b' : 'var(--color-text-secondary)',
      background: urgent ? 'rgba(233,30,140,0.10)' : 'rgba(0,0,0,0.04)',
      border: `1px solid ${urgent ? 'rgba(233,30,140,0.22)' : 'rgba(0,0,0,0.06)'}`,
    }}
  >
    <Clock size={13} strokeWidth={2.4} />
    {label}
  </div>
);

const ExpiredPanel: React.FC<{
  kind: 'partial' | 'missed' | 'both';
  partnerName: string;
  myValueLine?: string;
  onHome: () => void;
}> = ({ kind, partnerName, myValueLine, onHome }) => {
  const copy = {
    partial: { glyph: '🤍', title: 'You showed up today', body: `${partnerName} didn’t get to this one — no worries. A fresh drop lands at midnight.` },
    missed: { glyph: '🌙', title: 'This one drifted by', body: `${partnerName} answered, but today’s drop has closed. It stays sealed — catch the next one together.` },
    both: { glyph: '💤', title: 'You both let this one rest', body: 'That’s okay. A brand-new drop arrives at midnight.' },
  }[kind];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_SILK }}
      className="flex flex-col items-center text-center px-6 py-12"
    >
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        className="text-5xl mb-5"
        aria-hidden
      >
        {copy.glyph}
      </motion.div>
      <h2 className="font-serif text-2xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>{copy.title}</h2>
      <p className="text-sm leading-relaxed max-w-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>{copy.body}</p>
      {myValueLine && (
        <p className="text-sm italic mt-3 px-4 py-3 rounded-2xl max-w-xs" style={{ color: 'var(--color-text-secondary)', background: 'rgba(0,0,0,0.035)' }}>
          “{myValueLine}”
        </p>
      )}
      <button
        type="button"
        onClick={() => { feedback.tapSilent(); onHome(); }}
        className="mt-7 px-6 py-3 rounded-full text-sm font-bold spring-press"
        style={{ background: 'var(--color-text-primary)', color: 'var(--theme-bg-main, #fff)' }}
      >
        Back home
      </button>
    </motion.div>
  );
};

export const DailyDrop: React.FC<DailyDropProps> = ({ setView }) => {
  const d = useDailyDrop();
  const goHome = () => setView('home');

  const meta = d.drop ? DROP_META[d.drop.type] : null;

  const phase: DropPhase = useMemo(() => {
    if (d.uiState === 'your_turn') return 'input';
    if (d.uiState === 'revealed') return 'revealed';
    return 'waiting';
  }, [d.uiState]);

  const myValueLine = d.myResponse?.value && d.myResponse.value !== 'pulsed' ? d.myResponse.value : undefined;

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--theme-bg-main)' }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 px-5 pt-12 pb-3" style={{ background: 'linear-gradient(var(--theme-bg-main) 72%, transparent)' }}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Back"
            onClick={() => { feedback.tapSilent(); goHome(); }}
            className="h-10 w-10 flex items-center justify-center rounded-full spring-press"
            style={{ background: 'rgba(0,0,0,0.04)' }}
          >
            <ArrowLeft size={20} style={{ color: 'var(--color-text-primary)' }} />
          </button>
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.18em] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Today’s Drop</p>
            {meta && (
              <p className="text-sm font-bold flex items-center justify-center gap-1.5 mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
                <span aria-hidden>{meta.glyph}</span> {meta.label}
              </p>
            )}
          </div>
          <div className="h-10 w-10 flex items-center justify-center">
            {!d.countdown.expired && d.uiState !== 'revealed' && (
              <Sparkles size={18} style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }} />
            )}
          </div>
        </div>
        {!d.countdown.expired && (d.uiState === 'your_turn' || d.uiState === 'waiting') && (
          <div className="flex justify-center mt-3">
            <CountdownChip label={`${d.countdown.label} · disappears at midnight`} urgent={d.countdown.urgent} />
          </div>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="px-5 pb-28 relative z-10">
        {!d.ready || !d.drop ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Moon size={28} className="opacity-30 mb-3" />
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Preparing today’s drop…</p>
          </div>
        ) : d.uiState === 'expired_partial' ? (
          <ExpiredPanel kind="partial" partnerName={d.profile.partnerName} myValueLine={myValueLine} onHome={goHome} />
        ) : d.uiState === 'expired_missed' ? (
          <ExpiredPanel kind="missed" partnerName={d.profile.partnerName} onHome={goHome} />
        ) : d.uiState === 'expired_both_missed' ? (
          <ExpiredPanel kind="both" partnerName={d.profile.partnerName} onHome={goHome} />
        ) : (
          <motion.div
            key={`${d.drop.id}-${phase}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springSmooth}
          >
            {(() => {
              const Comp = DROP_COMPONENTS[d.drop.type];
              return (
                <Comp
                  prompt={d.drop.prompt}
                  profile={d.profile}
                  phase={phase}
                  myResponse={d.myResponse}
                  partnerResponse={d.partnerResponse}
                  submitting={d.submitting}
                  onSubmit={d.submit}
                  resolveMemory={d.resolveMemory}
                />
              );
            })()}

            {/* Waiting → nudge the partner */}
            {d.uiState === 'waiting' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="flex flex-col items-center mt-8"
              >
                <button
                  type="button"
                  onClick={() => { feedback.interact(); d.nudge(); }}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold spring-press"
                  style={{ background: 'rgba(233,30,140,0.10)', color: '#b4456b', border: '1px solid rgba(233,30,140,0.22)' }}
                >
                  <Bell size={16} strokeWidth={2.4} /> Nudge {d.profile.partnerName}
                </button>
                <p className="text-xs mt-3" style={{ color: 'var(--color-text-secondary)' }}>
                  Sealed until you both answer.
                </p>

                {import.meta.env.DEV && (
                  <button
                    type="button"
                    onClick={() => {
                      const { value, guess } = demoPartnerValue(d.drop!.prompt);
                      // Dev-only: write a synthetic partner response, then mark complete.
                      import('../services/storage').then(({ StorageService }) => {
                        const drop = StorageService.getTodayDrop();
                        const key = '__partner_demo';
                        const merged = {
                          ...drop,
                          responses: {
                            ...drop.responses,
                            [key]: { userKey: key, name: d.profile.partnerName || 'Partner', value, guess, createdAt: new Date().toISOString() },
                          },
                          revealedAt: new Date().toISOString(),
                        };
                        void StorageService.saveDailyDrop(merged);
                      });
                    }}
                    className="text-[10px] mt-6 opacity-40 underline"
                  >
                    dev: simulate {d.profile.partnerName || 'partner'} answering
                  </button>
                )}
              </motion.div>
            )}
          </motion.div>
        )}

        {import.meta.env.DEV && d.drop && (
          <div className="mt-10 pt-4" style={{ borderTop: '1px dashed rgba(0,0,0,0.10)' }}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-center mb-2.5" style={{ color: 'var(--color-text-secondary)', opacity: 0.55 }}>
              dev · preview any type
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {(Object.keys(DROP_META) as DropType[]).map((t) => {
                const active = d.drop!.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      feedback.tapSilent();
                      void import('../services/storage').then(({ StorageService }) => StorageService.devSetDropType(t));
                    }}
                    className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold spring-press"
                    style={{
                      background: active ? 'rgba(233,30,140,0.12)' : 'rgba(0,0,0,0.04)',
                      color: active ? '#b4456b' : 'var(--color-text-secondary)',
                      border: `1px solid ${active ? 'rgba(233,30,140,0.22)' : 'rgba(0,0,0,0.06)'}`,
                    }}
                  >
                    <span aria-hidden>{DROP_META[t].glyph}</span> {DROP_META[t].label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Reveal choreography overlay ────────────────────────── */}
      <AnimatePresence>
        {d.uiState === 'reveal_ready' && d.drop && (
          <DailyDropReveal type={d.drop.type} onComplete={d.markSeen} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default DailyDrop;
