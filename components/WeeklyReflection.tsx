import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send } from 'lucide-react';
import { RelationshipSignals } from '../services/relationshipSignals';
import { feedback } from '../utils/feedback';

interface WeeklyReflectionProps {
  onComplete?: () => void;
  onClose?: () => void;
}

export const WeeklyReflectionSheet: React.FC<WeeklyReflectionProps> = ({ onComplete, onClose }) => {
  const [step, setStep] = useState<'best' | 'hard' | 'done'>('best');
  const [bestMoment, setBestMoment] = useState('');
  const [hardThing, setHardThing] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!bestMoment.trim() || isSubmitting) return;
    setIsSubmitting(true);
    feedback.tap();

    try {
      await RelationshipSignals.recordReflection(bestMoment.trim(), hardThing.trim() || undefined);
      setStep('done');
      setTimeout(() => onComplete?.(), 1200);
    } catch {
      setIsSubmitting(false);
    }
  }, [bestMoment, hardThing, isSubmitting, onComplete]);

  // Only show Fri-Sun, and only if not already done this week
  if (!RelationshipSignals.isReflectionTime() || RelationshipSignals.hasReflectedThisWeek()) {
    return null;
  }

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
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(var(--theme-particle-2-rgb), 0.2)' }} />
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full"
          style={{ background: 'rgba(var(--theme-particle-2-rgb), 0.08)' }}
        >
          <X size={16} style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }} />
        </motion.button>

        <div className="px-6 pb-8 pt-4">
          <p className="text-[10px] uppercase tracking-widest mb-1 text-center" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
            Weekly Reflection
          </p>

          <AnimatePresence mode="wait">
            {step === 'best' && (
              <motion.div
                key="best"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <h3 className="text-base font-semibold mb-4 text-center" style={{ color: 'var(--color-text-primary)', fontFamily: 'Georgia, serif' }}>
                  What was the best moment this week?
                </h3>
                <textarea
                  value={bestMoment}
                  onChange={(e) => setBestMoment(e.target.value)}
                  placeholder="The thing that made you feel closest..."
                  maxLength={300}
                  rows={3}
                  className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none"
                  style={{
                    background: 'rgba(var(--theme-particle-2-rgb), 0.06)',
                    border: '1px solid rgba(var(--theme-particle-2-rgb), 0.1)',
                    color: 'var(--color-text-primary)',
                  }}
                  autoFocus
                />
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { if (bestMoment.trim()) { feedback.tap(); setStep('hard'); } }}
                  disabled={!bestMoment.trim()}
                  className="w-full py-3 mt-4 rounded-2xl text-sm font-semibold"
                  style={{
                    background: bestMoment.trim() ? 'var(--theme-nav-center-bg-active)' : 'rgba(var(--theme-particle-2-rgb), 0.1)',
                    color: bestMoment.trim() ? 'white' : 'var(--color-text-secondary)',
                  }}
                >
                  Next
                </motion.button>
              </motion.div>
            )}

            {step === 'hard' && (
              <motion.div
                key="hard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <h3 className="text-base font-semibold mb-4 text-center" style={{ color: 'var(--color-text-primary)', fontFamily: 'Georgia, serif' }}>
                  What felt hard this week?
                </h3>
                <p className="text-xs text-center mb-3" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                  This is optional and just for you. Naming it helps.
                </p>
                <textarea
                  value={hardThing}
                  onChange={(e) => setHardThing(e.target.value)}
                  placeholder="Something that felt unresolved, heavy, or distant..."
                  maxLength={300}
                  rows={3}
                  className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none"
                  style={{
                    background: 'rgba(var(--theme-particle-2-rgb), 0.06)',
                    border: '1px solid rgba(var(--theme-particle-2-rgb), 0.1)',
                    color: 'var(--color-text-primary)',
                  }}
                  autoFocus
                />
                <div className="flex gap-3 mt-4">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSubmit}
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
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2"
                    style={{
                      background: 'var(--theme-nav-center-bg-active)',
                      color: 'white',
                      opacity: isSubmitting ? 0.6 : 1,
                    }}
                  >
                    <Send size={14} />
                    Done
                  </motion.button>
                </div>
              </motion.div>
            )}

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
                  📝
                </motion.span>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  Reflected. These compound into deeper insights over time.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
