import React from 'react';
import { motion } from 'framer-motion';
import { LoveLanguageProfile, LoveLanguageType } from '../types';

interface LoveLanguageProfileVizProps {
  myProfile: LoveLanguageProfile | null;
  partnerProfile: LoveLanguageProfile | null;
  myName: string;
  partnerName: string;
}

const LANGUAGE_LABELS: Record<LoveLanguageType, { short: string; emoji: string }> = {
  words_of_affirmation: { short: 'Words', emoji: '💬' },
  quality_time: { short: 'Time', emoji: '⏳' },
  acts_of_service: { short: 'Acts', emoji: '🤲' },
  physical_touch: { short: 'Touch', emoji: '🤗' },
  gifts: { short: 'Gifts', emoji: '🎁' },
};

const LANGUAGES: LoveLanguageType[] = [
  'words_of_affirmation',
  'quality_time',
  'acts_of_service',
  'physical_touch',
  'gifts',
];

function LanguageBar({
  language,
  myScore,
  partnerScore,
  myName,
  partnerName,
}: {
  language: LoveLanguageType;
  myScore: number;
  partnerScore: number;
  myName: string;
  partnerName: string;
}) {
  const { short, emoji } = LANGUAGE_LABELS[language];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{emoji}</span>
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {short}
          </span>
        </div>
      </div>

      {/* My bar */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] w-12 text-right" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
          {myName}
        </span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(var(--theme-particle-2-rgb), 0.08)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(myScore * 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: 'rgba(var(--theme-particle-1-rgb), 0.5)' }}
          />
        </div>
      </div>

      {/* Partner bar */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] w-12 text-right" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
          {partnerName}
        </span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(var(--theme-particle-2-rgb), 0.08)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(partnerScore * 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
            className="h-full rounded-full"
            style={{ background: 'rgba(244, 114, 182, 0.5)' }}
          />
        </div>
      </div>
    </div>
  );
}

export const LoveLanguageProfileViz: React.FC<LoveLanguageProfileVizProps> = ({
  myProfile,
  partnerProfile,
  myName,
  partnerName,
}) => {
  if (!myProfile && !partnerProfile) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-2xl p-5 text-center"
        style={{
          background: 'rgba(var(--theme-particle-2-rgb), 0.04)',
          border: '1px solid rgba(var(--theme-particle-2-rgb), 0.08)',
        }}
      >
        <span className="text-2xl block mb-2">💕</span>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Love language profiles build over time from your reactions, revisits, and reflections.
        </p>
      </motion.div>
    );
  }

  const avgConfidence = (
    (myProfile?.confidence || 0) + (partnerProfile?.confidence || 0)
  ) / 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5"
      style={{
        background: 'rgba(var(--theme-particle-1-rgb), 0.04)',
        border: '1px solid rgba(var(--theme-particle-1-rgb), 0.08)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
          Love Languages
        </p>
        {avgConfidence < 0.5 && (
          <span className="text-[9px] px-2 py-0.5 rounded-full" style={{
            background: 'rgba(251, 191, 36, 0.1)',
            color: 'rgba(251, 191, 36, 0.8)',
          }}>
            Still learning
          </span>
        )}
      </div>

      <div className="space-y-4">
        {LANGUAGES.map((lang) => (
          <LanguageBar
            key={lang}
            language={lang}
            myScore={myProfile?.scores[lang] || 0}
            partnerScore={partnerProfile?.scores[lang] || 0}
            myName={myName}
            partnerName={partnerName}
          />
        ))}
      </div>

      {/* Primary summary */}
      {(myProfile || partnerProfile) && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(var(--theme-particle-2-rgb), 0.08)' }}>
          {myProfile && myProfile.confidence >= 0.3 && (
            <p className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              <span style={{ color: 'var(--color-text-primary)' }}>{myName}</span> responds most to{' '}
              <span className="font-medium">{LANGUAGE_LABELS[myProfile.primary].emoji} {LANGUAGE_LABELS[myProfile.primary].short.toLowerCase()}</span>
            </p>
          )}
          {partnerProfile && partnerProfile.confidence >= 0.3 && (
            <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <span style={{ color: 'var(--color-text-primary)' }}>{partnerName}</span> responds most to{' '}
              <span className="font-medium">{LANGUAGE_LABELS[partnerProfile.primary].emoji} {LANGUAGE_LABELS[partnerProfile.primary].short.toLowerCase()}</span>
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
};
