import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import { PartnerInsight, ViewState } from '../types';
import {
  PartnerIntelligenceService,
  partnerIntelligenceEventTarget,
  INSIGHT_ICONS,
  INSIGHT_LABELS,
  checkAndGenerateInsights
} from '../services/partnerIntelligence';
import { feedback } from '../utils/feedback';

interface InsightWhisperProps {
  setView: (view: ViewState) => void;
}

export const InsightWhisper: React.FC<InsightWhisperProps> = ({ setView }) => {
  const [insight, setInsight] = useState<PartnerInsight | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const loadInsight = useCallback(() => {
    const current = PartnerIntelligenceService.getCurrentInsight();
    setInsight(current);
    setIsVisible(!!current);
  }, []);

  useEffect(() => {
    // Initialize and check for new insights
    PartnerIntelligenceService.init().then(() => {
      checkAndGenerateInsights();
      loadInsight();
    });

    const handleUpdate = () => loadInsight();
    partnerIntelligenceEventTarget.addEventListener('insights-update', handleUpdate);

    return () => {
      partnerIntelligenceEventTarget.removeEventListener('insights-update', handleUpdate);
    };
  }, [loadInsight]);

  const handleDismiss = async () => {
    if (!insight) return;
    setIsDismissing(true);
    feedback.tap();

    await PartnerIntelligenceService.dismissInsight(insight.id);

    setTimeout(() => {
      setIsVisible(false);
      setIsDismissing(false);
      loadInsight();
    }, 300);
  };

  const handleView = async () => {
    if (!insight) return;
    feedback.tap();

    // Mark as seen
    await PartnerIntelligenceService.markSeen(insight.id);

    // Navigate to full insights view
    setView('partner-intelligence');
  };

  const getCategoryGradient = (category: string): string => {
    switch (category) {
      case 'emotional_state':
        return 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.15) 100%)';
      case 'connection_pattern':
        return 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(244, 114, 182, 0.15) 100%)';
      case 'meaningful_date':
        return 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(252, 211, 77, 0.15) 100%)';
      case 'appreciation':
        return 'linear-gradient(135deg, rgba(52, 211, 153, 0.15) 0%, rgba(110, 231, 183, 0.15) 100%)';
      case 'nudge':
        return 'linear-gradient(135deg, rgba(147, 197, 253, 0.15) 0%, rgba(191, 219, 254, 0.15) 100%)';
      default:
        return 'linear-gradient(135deg, rgba(156, 163, 175, 0.15) 0%, rgba(209, 213, 219, 0.15) 100%)';
    }
  };

  const getCategoryAccent = (category: string): string => {
    switch (category) {
      case 'emotional_state':
        return 'rgba(139, 92, 246, 0.6)';
      case 'connection_pattern':
        return 'rgba(244, 114, 182, 0.6)';
      case 'meaningful_date':
        return 'rgba(251, 191, 36, 0.6)';
      case 'appreciation':
        return 'rgba(52, 211, 153, 0.6)';
      case 'nudge':
        return 'rgba(147, 197, 253, 0.6)';
      default:
        return 'rgba(156, 163, 175, 0.6)';
    }
  };

  if (!insight || !isVisible) return null;

  const icon = INSIGHT_ICONS[insight.category];
  const label = INSIGHT_LABELS[insight.category];
  const gradient = getCategoryGradient(insight.category);
  const accent = getCategoryAccent(insight.category);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{
          opacity: isDismissing ? 0 : 1,
          y: isDismissing ? -20 : 0,
          scale: isDismissing ? 0.95 : 1
        }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mb-4"
      >
        <motion.div
          className="rounded-3xl p-4 relative overflow-hidden"
          style={{
            background: gradient,
            border: `1px solid ${accent}`,
            boxShadow: `0 4px 24px ${accent}`
          }}
        >
          {/* Dismiss Button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            <X size={14} style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }} />
          </motion.button>

          {/* Category Badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{icon}</span>
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}
            >
              {label}
            </span>
          </div>

          {/* Insight Text */}
          <p
            className="text-[15px] leading-relaxed mb-4 pr-6"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {insight.insightText}
          </p>

          {/* View More Button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleView}
            className="flex items-center gap-1.5 text-sm font-medium"
            style={{ color: accent }}
          >
            <span>View insights</span>
            <ChevronRight size={14} />
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// Minimal version for home screen (just the whisper text)
export const InsightWhisperMini: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
  const [insight, setInsight] = useState<PartnerInsight | null>(null);

  useEffect(() => {
    PartnerIntelligenceService.init().then(() => {
      setInsight(PartnerIntelligenceService.getCurrentInsight());
    });

    const handleUpdate = () => {
      setInsight(PartnerIntelligenceService.getCurrentInsight());
    };

    partnerIntelligenceEventTarget.addEventListener('insights-update', handleUpdate);
    return () => {
      partnerIntelligenceEventTarget.removeEventListener('insights-update', handleUpdate);
    };
  }, []);

  if (!insight) return null;

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
      style={{ background: 'rgba(var(--theme-particle-1-rgb), 0.06)' }}
    >
      <div className="flex items-start gap-3">
        <span className="text-base mt-0.5">{INSIGHT_ICONS[insight.category]}</span>
        <p
          className="text-[13px] leading-relaxed line-clamp-2"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {insight.insightText}
        </p>
      </div>
    </motion.button>
  );
};
