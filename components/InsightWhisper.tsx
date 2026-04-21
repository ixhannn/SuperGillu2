import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import { DeepInsight, PartnerInsight, ViewState } from '../types';
import {
  PartnerIntelligenceService,
  partnerIntelligenceEventTarget,
  INSIGHT_ICONS,
  INSIGHT_LABELS,
  checkAndGenerateInsights
} from '../services/partnerIntelligence';
import { InsightEngine, insightEventTarget, checkAndGenerateDeepInsights } from '../services/insightEngine';
import { RelationshipSignals } from '../services/relationshipSignals';
import { RelationshipModelService } from '../services/relationshipModel';
import { InsightCardMini } from './InsightCard';
import { feedback } from '../utils/feedback';

interface InsightWhisperProps {
  setView: (view: ViewState) => void;
}

const CATEGORY_ACCENTS: Record<string, { gradient: string; accent: string }> = {
  deep_pattern: {
    gradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(167, 139, 250, 0.12) 100%)',
    accent: 'rgba(139, 92, 246, 0.6)',
  },
  behavioral_reveal: {
    gradient: 'linear-gradient(135deg, rgba(244, 114, 182, 0.12) 0%, rgba(251, 146, 60, 0.12) 100%)',
    accent: 'rgba(244, 114, 182, 0.6)',
  },
  trajectory: {
    gradient: 'linear-gradient(135deg, rgba(52, 211, 153, 0.12) 0%, rgba(110, 231, 183, 0.12) 100%)',
    accent: 'rgba(52, 211, 153, 0.6)',
  },
  early_warning: {
    gradient: 'linear-gradient(135deg, rgba(251, 191, 36, 0.12) 0%, rgba(252, 211, 77, 0.12) 100%)',
    accent: 'rgba(251, 191, 36, 0.6)',
  },
  celebration: {
    gradient: 'linear-gradient(135deg, rgba(251, 146, 60, 0.12) 0%, rgba(252, 211, 77, 0.12) 100%)',
    accent: 'rgba(251, 146, 60, 0.6)',
  },
  love_language_insight: {
    gradient: 'linear-gradient(135deg, rgba(244, 114, 182, 0.12) 0%, rgba(167, 139, 250, 0.12) 100%)',
    accent: 'rgba(244, 114, 182, 0.6)',
  },
  growth_nudge: {
    gradient: 'linear-gradient(135deg, rgba(147, 197, 253, 0.12) 0%, rgba(191, 219, 254, 0.12) 100%)',
    accent: 'rgba(147, 197, 253, 0.6)',
  },
  reciprocity: {
    gradient: 'linear-gradient(135deg, rgba(167, 139, 250, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%)',
    accent: 'rgba(167, 139, 250, 0.6)',
  },
};

const CATEGORY_EMOJI: Record<string, string> = {
  deep_pattern: '◐',
  behavioral_reveal: '◑',
  trajectory: '◈',
  early_warning: '○',
  celebration: '✦',
  love_language_insight: '♡',
  growth_nudge: '↗',
  reciprocity: '⇄',
  ritual_observation: '∞',
};

export const InsightWhisper: React.FC<InsightWhisperProps> = ({ setView }) => {
  const [deepInsight, setDeepInsight] = useState<DeepInsight | null>(null);
  const [legacyInsight, setLegacyInsight] = useState<PartnerInsight | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const loadInsight = useCallback(async () => {
    // Prefer deep insights from the new engine
    const deep = InsightEngine.getUnseenInsight();
    if (deep) {
      setDeepInsight(deep);
      setLegacyInsight(null);
      setIsVisible(true);
      return;
    }

    // Fall back to legacy insights
    const legacy = PartnerIntelligenceService.getCurrentInsight();
    if (legacy) {
      setLegacyInsight(legacy);
      setDeepInsight(null);
      setIsVisible(true);
      return;
    }

    setIsVisible(false);
  }, []);

  useEffect(() => {
    const initAll = async () => {
      await RelationshipSignals.init();
      await RelationshipModelService.init();
      await InsightEngine.init();
      await PartnerIntelligenceService.init();
      checkAndGenerateDeepInsights();
      checkAndGenerateInsights();
      loadInsight();
    };
    initAll();

    const handleUpdate = () => loadInsight();
    insightEventTarget.addEventListener('insight-update', handleUpdate);
    partnerIntelligenceEventTarget.addEventListener('insights-update', handleUpdate);

    return () => {
      insightEventTarget.removeEventListener('insight-update', handleUpdate);
      partnerIntelligenceEventTarget.removeEventListener('insights-update', handleUpdate);
    };
  }, [loadInsight]);

  const handleDismiss = async () => {
    setIsDismissing(true);
    feedback.tap();

    if (deepInsight) {
      await InsightEngine.dismiss(deepInsight.id);
    } else if (legacyInsight) {
      await PartnerIntelligenceService.dismissInsight(legacyInsight.id);
    }

    setTimeout(() => {
      setIsVisible(false);
      setIsDismissing(false);
      loadInsight();
    }, 300);
  };

  const handleView = async () => {
    feedback.tap();

    if (deepInsight) {
      await InsightEngine.markSeen(deepInsight.id);
    } else if (legacyInsight) {
      await PartnerIntelligenceService.markSeen(legacyInsight.id);
    }

    setView('partner-intelligence');
  };

  if (!isVisible) return null;

  // Deep insight rendering
  if (deepInsight) {
    const cat = CATEGORY_ACCENTS[deepInsight.category] || CATEGORY_ACCENTS.deep_pattern;
    const emoji = CATEGORY_EMOJI[deepInsight.category] || '◐';

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
              background: cat.gradient,
              border: `1px solid ${cat.accent}`,
              boxShadow: `0 4px 24px ${cat.accent}`
            }}
          >
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.1)' }}
            >
              <X size={14} style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }} />
            </motion.button>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{emoji}</span>
              <span
                className="text-[9px] font-medium uppercase tracking-wider"
                style={{ color: cat.accent }}
              >
                Relationship Insight
              </span>
            </div>

            <p
              className="text-[15px] leading-relaxed mb-3 pr-6"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'Georgia, serif' }}
            >
              {deepInsight.insightText}
            </p>

            {deepInsight.suggestedAction && (
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
                💡 {deepInsight.suggestedAction.text}
              </p>
            )}

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleView}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: cat.accent }}
            >
              <span>See all insights</span>
              <ChevronRight size={14} />
            </motion.button>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Legacy insight rendering (backward compatibility)
  if (legacyInsight) {
    const icon = INSIGHT_ICONS[legacyInsight.category];
    const label = INSIGHT_LABELS[legacyInsight.category];

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
        case 'emotional_state': return 'rgba(139, 92, 246, 0.6)';
        case 'connection_pattern': return 'rgba(244, 114, 182, 0.6)';
        case 'meaningful_date': return 'rgba(251, 191, 36, 0.6)';
        case 'appreciation': return 'rgba(52, 211, 153, 0.6)';
        case 'nudge': return 'rgba(147, 197, 253, 0.6)';
        default: return 'rgba(156, 163, 175, 0.6)';
      }
    };

    const gradient = getCategoryGradient(legacyInsight.category);
    const accent = getCategoryAccent(legacyInsight.category);

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
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.1)' }}
            >
              <X size={14} style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }} />
            </motion.button>

            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{icon}</span>
              <span
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}
              >
                {label}
              </span>
            </div>

            <p
              className="text-[15px] leading-relaxed mb-4 pr-6"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {legacyInsight.insightText}
            </p>

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
  }

  return null;
};

// Minimal version for home screen
export const InsightWhisperMini: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
  const [deepInsight, setDeepInsight] = useState<DeepInsight | null>(null);
  const [legacyInsight, setLegacyInsight] = useState<PartnerInsight | null>(null);

  useEffect(() => {
    const initAll = async () => {
      await RelationshipSignals.init();
      await RelationshipModelService.init();
      await InsightEngine.init();
      await PartnerIntelligenceService.init();

      const deep = InsightEngine.getUnseenInsight() || InsightEngine.getRecentInsights(1)[0];
      if (deep) {
        setDeepInsight(deep);
        return;
      }
      setLegacyInsight(PartnerIntelligenceService.getCurrentInsight());
    };
    initAll();

    const handleUpdate = async () => {
      const deep = InsightEngine.getUnseenInsight() || InsightEngine.getRecentInsights(1)[0];
      if (deep) {
        setDeepInsight(deep);
        setLegacyInsight(null);
        return;
      }
      setLegacyInsight(PartnerIntelligenceService.getCurrentInsight());
    };

    insightEventTarget.addEventListener('insight-update', handleUpdate);
    partnerIntelligenceEventTarget.addEventListener('insights-update', handleUpdate);
    return () => {
      insightEventTarget.removeEventListener('insight-update', handleUpdate);
      partnerIntelligenceEventTarget.removeEventListener('insights-update', handleUpdate);
    };
  }, []);

  if (deepInsight) {
    return <InsightCardMini insight={deepInsight} onClick={onClick} />;
  }

  if (!legacyInsight) return null;

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
        <span className="text-base mt-0.5">{INSIGHT_ICONS[legacyInsight.category]}</span>
        <p
          className="text-[13px] leading-relaxed line-clamp-2"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {legacyInsight.insightText}
        </p>
      </div>
    </motion.button>
  );
};
