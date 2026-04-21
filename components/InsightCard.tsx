import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { DeepInsight, DeepInsightCategory, InsightTone } from '../types';
import { feedback } from '../utils/feedback';

interface InsightCardProps {
  insight: DeepInsight;
  onAction?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
}

const CATEGORY_STYLES: Record<DeepInsightCategory, { emoji: string; label: string; accentRgb: string }> = {
  deep_pattern: { emoji: '◐', label: 'Pattern', accentRgb: '139, 92, 246' },
  behavioral_reveal: { emoji: '◑', label: 'Reveal', accentRgb: '244, 114, 182' },
  trajectory: { emoji: '◈', label: 'Trajectory', accentRgb: '52, 211, 153' },
  early_warning: { emoji: '○', label: 'Check-in', accentRgb: '251, 191, 36' },
  celebration: { emoji: '✦', label: 'Celebration', accentRgb: '251, 146, 60' },
  love_language_insight: { emoji: '♡', label: 'Love Language', accentRgb: '244, 114, 182' },
  growth_nudge: { emoji: '↗', label: 'Growth', accentRgb: '147, 197, 253' },
  reciprocity: { emoji: '⇄', label: 'Reciprocity', accentRgb: '167, 139, 250' },
  ritual_observation: { emoji: '∞', label: 'Ritual', accentRgb: '110, 231, 183' },
};

const TONE_STYLES: Record<InsightTone, { borderOpacity: number }> = {
  warm: { borderOpacity: 0.2 },
  gentle: { borderOpacity: 0.15 },
  curious: { borderOpacity: 0.15 },
  celebratory: { borderOpacity: 0.25 },
};

export const InsightCard: React.FC<InsightCardProps> = ({
  insight,
  onAction,
  onDismiss,
  compact = false,
}) => {
  const style = CATEGORY_STYLES[insight.category] || CATEGORY_STYLES.deep_pattern;
  const toneStyle = TONE_STYLES[insight.tone] || TONE_STYLES.warm;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      layout
      className={`rounded-2xl overflow-hidden ${compact ? 'p-4' : 'p-5'}`}
      style={{
        background: `rgba(${style.accentRgb}, 0.06)`,
        border: `1px solid rgba(${style.accentRgb}, ${toneStyle.borderOpacity})`,
      }}
    >
      {/* Category badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={compact ? 'text-sm' : 'text-base'}>{style.emoji}</span>
          <span
            className="text-[9px] font-medium uppercase tracking-wider"
            style={{ color: `rgba(${style.accentRgb}, 0.7)` }}
          >
            {style.label}
          </span>
        </div>

        {/* Confidence indicator */}
        {!compact && insight.dataPointCount > 0 && (
          <span
            className="text-[9px] px-2 py-0.5 rounded-full"
            style={{
              background: `rgba(${style.accentRgb}, 0.08)`,
              color: `rgba(${style.accentRgb}, 0.6)`,
            }}
          >
            {insight.dataPointCount} signals
          </span>
        )}
      </div>

      {/* Insight text */}
      <p
        className={`leading-relaxed ${compact ? 'text-[13px] line-clamp-3' : 'text-[15px]'}`}
        style={{ color: 'var(--color-text-primary)', fontFamily: 'Georgia, serif' }}
      >
        {insight.insightText}
      </p>

      {/* Data reference */}
      {!compact && insight.specificDataRef && (
        <p className="text-[10px] mt-2" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
          {insight.specificDataRef}
        </p>
      )}

      {/* Suggested action */}
      {insight.suggestedAction && !compact && (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            feedback.tap();
            onAction?.();
          }}
          className="flex items-center gap-2 mt-4 px-4 py-2.5 rounded-xl text-xs font-medium"
          style={{
            background: `rgba(${style.accentRgb}, 0.1)`,
            color: `rgba(${style.accentRgb}, 0.9)`,
          }}
        >
          <span>{insight.suggestedAction.text}</span>
          <ChevronRight size={12} />
        </motion.button>
      )}
    </motion.div>
  );
};

/** Minimal whisper card for home screen */
export const InsightCardMini: React.FC<{
  insight: DeepInsight;
  onClick?: () => void;
}> = ({ insight, onClick }) => {
  const style = CATEGORY_STYLES[insight.category] || CATEGORY_STYLES.deep_pattern;

  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        feedback.tap();
        onClick?.();
      }}
      className="w-full text-left px-4 py-3 rounded-2xl"
      style={{ background: `rgba(${style.accentRgb}, 0.06)` }}
    >
      <div className="flex items-start gap-3">
        <span className="text-base mt-0.5">{style.emoji}</span>
        <div className="flex-1 min-w-0">
          <p
            className="text-[13px] leading-relaxed line-clamp-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {insight.insightText}
          </p>
          {insight.suggestedAction && (
            <p
              className="text-[11px] mt-1 font-medium flex items-center gap-1"
              style={{ color: `rgba(${style.accentRgb}, 0.7)` }}
            >
              {insight.suggestedAction.text}
              <ChevronRight size={10} />
            </p>
          )}
        </div>
      </div>
    </motion.button>
  );
};
