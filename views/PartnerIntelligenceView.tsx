import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, TrendingUp, Calendar, Heart, Bell, Check } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { ViewState, PartnerInsight, InsightCategory } from '../types';
import {
  PartnerIntelligenceService,
  partnerIntelligenceEventTarget,
  INSIGHT_ICONS,
  INSIGHT_LABELS
} from '../services/partnerIntelligence';
import { format, formatDistanceToNow } from 'date-fns';
import { feedback } from '../utils/feedback';

interface PartnerIntelligenceViewProps {
  setView: (view: ViewState) => void;
}

const CATEGORY_COLORS: Record<InsightCategory, { bg: string; accent: string; IconComponent: typeof TrendingUp }> = {
  emotional_state: {
    bg: 'rgba(139, 92, 246, 0.15)',
    accent: 'rgb(139, 92, 246)',
    IconComponent: TrendingUp
  },
  connection_pattern: {
    bg: 'rgba(244, 114, 182, 0.15)',
    accent: 'rgb(244, 114, 182)',
    IconComponent: Heart
  },
  meaningful_date: {
    bg: 'rgba(251, 191, 36, 0.15)',
    accent: 'rgb(251, 191, 36)',
    IconComponent: Calendar
  },
  appreciation: {
    bg: 'rgba(52, 211, 153, 0.15)',
    accent: 'rgb(52, 211, 153)',
    IconComponent: Sparkles
  },
  nudge: {
    bg: 'rgba(147, 197, 253, 0.15)',
    accent: 'rgb(147, 197, 253)',
    IconComponent: Bell
  }
};

const InsightCard: React.FC<{
  insight: PartnerInsight;
  onMarkSeen: (id: string) => void;
}> = ({ insight, onMarkSeen }) => {
  const config = CATEGORY_COLORS[insight.category];
  const IconComponent = config.IconComponent;
  const isSeen = !!insight.seenAt;
  const isDismissed = !!insight.dismissedAt;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-3xl p-5 relative"
      style={{
        background: config.bg,
        border: `1px solid ${config.accent}40`,
        opacity: isDismissed ? 0.5 : 1
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: `${config.accent}30` }}
          >
            <IconComponent size={14} color={config.accent} />
          </div>
          <div>
            <p
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: config.accent }}
            >
              {INSIGHT_LABELS[insight.category]}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
              {formatDistanceToNow(new Date(insight.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>

        {!isSeen && !isDismissed && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => onMarkSeen(insight.id)}
            className="p-2 rounded-full"
            style={{ background: `${config.accent}20` }}
          >
            <Check size={14} style={{ color: config.accent }} />
          </motion.button>
        )}

        {isSeen && (
          <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--color-text-secondary)' }}>
            Seen
          </span>
        )}
      </div>

      {/* Content */}
      <p
        className="text-[15px] leading-relaxed"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {insight.insightText}
      </p>

      {/* Confidence indicator */}
      <div className="mt-4 flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: config.accent, width: `${insight.confidence * 100}%` }}
            initial={{ width: 0 }}
            animate={{ width: `${insight.confidence * 100}%` }}
            transition={{ duration: 0.5, delay: 0.2 }}
          />
        </div>
        <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
          {Math.round(insight.confidence * 100)}% confidence
        </span>
      </div>
    </motion.div>
  );
};

const EmptyInsights: React.FC = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center py-16 px-6"
  >
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
      style={{ background: 'rgba(var(--theme-particle-1-rgb), 0.1)' }}
    >
      <Sparkles size={32} style={{ color: 'var(--color-text-secondary)', opacity: 0.4 }} />
    </div>
    <h3
      className="text-lg font-semibold mb-2"
      style={{ color: 'var(--color-text-primary)' }}
    >
      No insights yet
    </h3>
    <p
      className="text-sm text-center max-w-[280px]"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      Keep logging moods and using the app together. Insights appear when patterns emerge.
    </p>
  </motion.div>
);

const DataRequirement: React.FC = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center py-16 px-6"
  >
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
      style={{ background: 'rgba(251, 191, 36, 0.1)' }}
    >
      <TrendingUp size={32} style={{ color: 'rgb(251, 191, 36)', opacity: 0.6 }} />
    </div>
    <h3
      className="text-lg font-semibold mb-2"
      style={{ color: 'var(--color-text-primary)' }}
    >
      Building your story
    </h3>
    <p
      className="text-sm text-center max-w-[280px]"
      style={{ color: 'var(--color-text-secondary)' }}
    >
      Log at least 7 days of moods to unlock partner insights. You're building something meaningful.
    </p>
  </motion.div>
);

type FilterType = 'all' | InsightCategory;

export const PartnerIntelligenceView: React.FC<PartnerIntelligenceViewProps> = ({ setView }) => {
  const [insights, setInsights] = useState<PartnerInsight[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [hasEnoughData, setHasEnoughData] = useState(true);

  const loadInsights = useCallback(() => {
    setInsights(PartnerIntelligenceService.getRecentInsights(50));
    setHasEnoughData(PartnerIntelligenceService.hasEnoughData());
  }, []);

  useEffect(() => {
    PartnerIntelligenceService.init().then(loadInsights);

    const handleUpdate = () => loadInsights();
    partnerIntelligenceEventTarget.addEventListener('insights-update', handleUpdate);

    return () => {
      partnerIntelligenceEventTarget.removeEventListener('insights-update', handleUpdate);
    };
  }, [loadInsights]);

  const handleMarkSeen = async (id: string) => {
    feedback.tap();
    await PartnerIntelligenceService.markSeen(id);
  };

  const filteredInsights = filter === 'all'
    ? insights
    : insights.filter(i => i.category === filter);

  const categories: Array<{ id: FilterType; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'emotional_state', label: 'Emotional' },
    { id: 'connection_pattern', label: 'Connection' },
    { id: 'meaningful_date', label: 'Milestones' },
    { id: 'appreciation', label: 'Appreciation' },
    { id: 'nudge', label: 'Nudges' }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-full min-h-screen"
      style={{ background: 'var(--theme-bg-main)' }}
    >
      <ViewHeader
        title="Partner Insights"
        onBack={() => setView('home')}
        variant="centered"
      />

      {/* Intro Text */}
      <div className="px-4 py-3">
        <p className="text-sm text-center" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
          Quiet observations about your connection
        </p>
      </div>

      {/* Filter Pills */}
      <div className="px-4 pb-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map(cat => (
            <motion.button
              key={cat.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setFilter(cat.id)}
              className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0"
              style={{
                background: filter === cat.id
                  ? 'var(--theme-nav-center-bg-active)'
                  : 'rgba(var(--theme-particle-2-rgb), 0.1)',
                color: filter === cat.id
                  ? 'white'
                  : 'var(--color-text-secondary)'
              }}
            >
              {cat.id !== 'all' && (
                <span className="mr-1.5">{INSIGHT_ICONS[cat.id as InsightCategory]}</span>
              )}
              {cat.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto px-4 pb-8">
        {!hasEnoughData ? (
          <DataRequirement />
        ) : filteredInsights.length === 0 ? (
          <EmptyInsights />
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {filteredInsights.map(insight => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onMarkSeen={handleMarkSeen}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
};
