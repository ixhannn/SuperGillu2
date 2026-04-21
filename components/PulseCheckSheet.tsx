import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import { RelationshipSignals } from '../services/relationshipSignals';
import { feedback } from '../utils/feedback';

interface PulseCheckSheetProps {
  onComplete?: () => void;
  onClose?: () => void;
}

const SCORE_OPTIONS: Array<{ value: 1 | 2 | 3 | 4 | 5; emoji: string; label: string }> = [
  { value: 1, emoji: '😔', label: 'Rough' },
  { value: 2, emoji: '😐', label: 'Off' },
  { value: 3, emoji: '🙂', label: 'Okay' },
  { value: 4, emoji: '😊', label: 'Good' },
  { value: 5, emoji: '🥰', label: 'Amazing' },
];

export const PulseCheckSheet: React.FC<PulseCheckSheetProps> = ({ onComplete, onClose }) => {
  const [step, setStep] = useState<'score' | 'note' | 'gratitude' | 'done'>('score');
  const [selectedScore, setSelectedScore] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [note, setNote] = useState('');
  const [gratitude, setGratitude] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const question = RelationshipSignals.getNextPulseQuestion();

  const handleScoreSelect = useCallback((score: 1 | 2 | 3 | 4 | 5) => {
    feedback.tap();
    setSelectedScore(score);
    setTimeout(() => setStep('note'), 300);
  }, []);

  const handleNoteSubmit = useCallback(() => {
    feedback.tap();
    setStep('gratitude');
  }, []);

  const handleComplete = useCallback(async () => {
    if (!selectedScore || isSubmitting) return;
    setIsSubmitting(true);
    feedback.tap();

    try {
      await RelationshipSignals.recordPulseCheck(selectedScore, note || undefined);

      if (gratitude.trim()) {
        const profile = JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
        const partnerUserId = profile.partnerUserId || 'partner';
        await RelationshipSignals.recordGratitude(gratitude.trim(), partnerUserId);
      }

      setStep('done');
      setTimeout(() => onComplete?.(), 1200);
    } catch {
      setIsSubmitting(false);
    }
  }, [selectedScore, note, gratitude, isSubmitting, onComplete]);

  const alreadyDone = RelationshipSignals.getTodaysPulseCheck() !== null;
  if (alreadyDone) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className="w-full max-w-lg rounded-t-3xl overflow-hidden"
        style={{ background: 'var(--theme-bg-main)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(var(--theme-particle-2-rgb), 0.2)' }} />
        </div>

        {/* Close */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full"
          style={{ background: 'rgba(var(--theme-particle-2-rgb), 0.08)' }}
        >
          <X size={16} style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }} />
        </motion.button>

        <div className="px-6 pb-8 pt-4">
          <AnimatePresence mode="wait">
            {/* Step 1: Score */}
            {step === 'score' && (
              <motion.div
                key="score"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-center"
              >
                <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                  Daily Pulse
                </p>
                <h3 className="text-lg font-semibold mb-6" style={{ color: 'var(--color-text-primary)', fontFamily: 'Georgia, serif' }}>
                  {question}
                </h3>

                <div className="flex justify-center gap-3">
                  {SCORE_OPTIONS.map((opt) => (
                    <motion.button
                      key={opt.value}
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.1 }}
                      onClick={() => handleScoreSelect(opt.value)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all"
                      style={{
                        background: selectedScore === opt.value
                          ? 'rgba(var(--theme-particle-1-rgb), 0.15)'
                          : 'rgba(var(--theme-particle-2-rgb), 0.05)',
                        border: selectedScore === opt.value
                          ? '2px solid rgba(var(--theme-particle-1-rgb), 0.3)'
                          : '2px solid transparent',
                      }}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {opt.label}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Optional note */}
            {step === 'note' && (
              <motion.div
                key="note"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <p className="text-[10px] uppercase tracking-widest mb-2 text-center" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                  Optional
                </p>
                <h3 className="text-base font-semibold mb-4 text-center" style={{ color: 'var(--color-text-primary)' }}>
                  Want to say why?
                </h3>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="One line is enough..."
                  maxLength={120}
                  rows={2}
                  className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none"
                  style={{
                    background: 'rgba(var(--theme-particle-2-rgb), 0.06)',
                    border: '1px solid rgba(var(--theme-particle-2-rgb), 0.1)',
                    color: 'var(--color-text-primary)',
                  }}
                />
                <div className="flex gap-3 mt-4">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleNoteSubmit}
                    className="flex-1 py-3 rounded-2xl text-sm font-medium"
                    style={{
                      background: 'rgba(var(--theme-particle-2-rgb), 0.06)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    Skip
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleNoteSubmit}
                    className="flex-1 py-3 rounded-2xl text-sm font-semibold"
                    style={{
                      background: 'var(--theme-nav-center-bg-active)',
                      color: 'white',
                    }}
                  >
                    Next
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Micro-gratitude */}
            {step === 'gratitude' && (
              <motion.div
                key="gratitude"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <p className="text-[10px] uppercase tracking-widest mb-2 text-center" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                  Micro-Gratitude
                </p>
                <h3 className="text-base font-semibold mb-4 text-center" style={{ color: 'var(--color-text-primary)' }}>
                  One thing they did today?
                </h3>
                <textarea
                  value={gratitude}
                  onChange={(e) => setGratitude(e.target.value)}
                  placeholder="Made me laugh, checked on me, listened..."
                  maxLength={100}
                  rows={2}
                  className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none"
                  style={{
                    background: 'rgba(var(--theme-particle-2-rgb), 0.06)',
                    border: '1px solid rgba(var(--theme-particle-2-rgb), 0.1)',
                    color: 'var(--color-text-primary)',
                  }}
                />
                <div className="flex gap-3 mt-4">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleComplete}
                    className="flex-1 py-3 rounded-2xl text-sm font-medium"
                    style={{
                      background: 'rgba(var(--theme-particle-2-rgb), 0.06)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    Skip
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleComplete}
                    disabled={isSubmitting}
                    className="flex-1 py-3 rounded-2xl text-sm font-semibold"
                    style={{
                      background: 'var(--theme-nav-center-bg-active)',
                      color: 'white',
                      opacity: isSubmitting ? 0.6 : 1,
                    }}
                  >
                    Done
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Done */}
            {step === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6"
              >
                <motion.span
                  className="text-4xl block mb-3"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 10 }}
                >
                  ✨
                </motion.span>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  Logged. Your relationship map is growing.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
