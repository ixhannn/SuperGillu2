import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ChevronRight } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { DeepInsight, RelationshipModel, ViewState } from '../types';
import {
  PartnerIntelligenceService,
  partnerIntelligenceEventTarget,
} from '../services/partnerIntelligence';
import { RelationshipSignals, signalEventTarget } from '../services/relationshipSignals';
import { RelationshipModelService, modelEventTarget } from '../services/relationshipModel';
import { InsightEngine, insightEventTarget, checkAndGenerateDeepInsights } from '../services/insightEngine';
import { ClosenessTrajectoryViz } from '../components/ClosenessTrajectory';
import { InsightCard } from '../components/InsightCard';
import { LoveLanguageProfileViz } from '../components/LoveLanguageProfile';
import { PulseCheckSheet } from '../components/PulseCheckSheet';
import { WeeklyReflectionSheet } from '../components/WeeklyReflection';
import { feedback } from '../utils/feedback';

interface PartnerIntelligenceViewProps {
  setView: (view: ViewState) => void;
}

const getProfileNames = () => {
  try {
    const profile = JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
    return {
      myName: profile.myName || 'You',
      partnerName: profile.partnerName || 'Partner',
    };
  } catch { return { myName: 'You', partnerName: 'Partner' }; }
};

/* ── Phase Banner ────────────────────────────────────────────────── */
const PHASE_META: Record<string, { label: string; color: string; description: string }> = {
  discovering: { label: 'Discovering', color: '#93c5fd', description: 'Learning who you are together' },
  honeymoon: { label: 'Honeymoon', color: '#f472b6', description: 'Everything feels new and alive' },
  deepening: { label: 'Deepening', color: '#a78bfa', description: 'Growing into something real' },
  challenging: { label: 'Challenging', color: '#fbbf24', description: `A season of friction \u2014 that\u2019s normal` },
  renewing: { label: 'Renewing', color: '#34d399', description: 'Finding your way back to each other' },
  settling: { label: 'Settling In', color: '#93c5fd', description: 'Building a steady foundation' },
};

function PhaseBanner({ model }: { model: RelationshipModel }) {
  const meta = PHASE_META[model.currentPhase] || PHASE_META.settling;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: `rgba(${hexToRgb(meta.color)}, 0.08)` }}
    >
      <div className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
      <span className="text-xs font-medium" style={{ color: meta.color }}>{meta.label}</span>
      <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
        — {meta.description}
      </span>
    </motion.div>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

/* ── Pulse Check Prompt ──────────────────────────────────────────── */
function PulseCheckPrompt({ onOpen }: { onOpen: () => void }) {
  const hasPulsedToday = RelationshipSignals.getTodaysPulseCheck() !== null;
  if (hasPulsedToday) return null;

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => { feedback.tap(); onOpen(); }}
      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.08) 0%, rgba(147, 197, 253, 0.08) 100%)',
        border: '1px solid rgba(244, 114, 182, 0.12)',
      }}
    >
      <Heart size={18} style={{ color: '#f472b6' }} />
      <div className="flex-1 text-left">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          How did today feel?
        </p>
        <p className="text-[10px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
          A quick check-in that compounds into deeper understanding
        </p>
      </div>
      <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)', opacity: 0.3 }} />
    </motion.button>
  );
}

/* ── System Message ──────────────────────────────────────────────── */
function SystemMessageCard({ message }: { message: { text: string; emoji: string } }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="px-4 py-3 rounded-2xl text-center"
      style={{
        background: 'rgba(var(--theme-particle-2-rgb), 0.04)',
        border: '1px solid rgba(var(--theme-particle-2-rgb), 0.08)',
      }}
    >
      <span className="text-xl block mb-1">{message.emoji}</span>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {message.text}
      </p>
    </motion.div>
  );
}

/* ── Insight Stream ──────────────────────────────────────────────── */
function InsightStream({
  insights,
  onAction,
}: {
  insights: DeepInsight[];
  onAction: (insight: DeepInsight) => void;
}) {
  if (insights.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-6"
      >
        <span className="text-2xl block mb-2">◈</span>
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          Insights are building. Keep checking in and they'll start appearing.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-widest px-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
        Insights
      </p>
      <AnimatePresence mode="popLayout">
        {insights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onAction={() => onAction(insight)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ── Reciprocity Gauge ───────────────────────────────────────────── */
function ReciprocityGauge({ model }: { model: RelationshipModel }) {
  const score = model.reciprocityScore;
  const names = getProfileNames();
  const direction = model.asymmetryDirection;

  const percent = Math.round(score * 100);
  const label = percent >= 80 ? 'Balanced' : percent >= 60 ? 'Slightly asymmetric' : 'Unbalanced';
  const color = percent >= 80 ? '#34d399' : percent >= 60 ? '#fbbf24' : '#f87171';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4"
      style={{
        background: 'rgba(var(--theme-particle-2-rgb), 0.04)',
        border: '1px solid rgba(var(--theme-particle-2-rgb), 0.08)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
          Balance
        </p>
        <span className="text-[10px] font-medium" style={{ color }}>{label}</span>
      </div>

      {/* Tug bar */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] w-14 text-right" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
          {names.myName}
        </span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(var(--theme-particle-2-rgb), 0.08)' }}>
          <motion.div
            initial={{ width: '50%' }}
            animate={{ width: `${50 + (direction === 'me' ? (1 - score) * 25 : -(1 - score) * 25)}%` }}
            transition={{ duration: 0.8 }}
            className="h-full rounded-full"
            style={{ background: 'rgba(var(--theme-particle-1-rgb), 0.4)' }}
          />
        </div>
        <span className="text-[9px] w-14" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
          {names.partnerName}
        </span>
      </div>

      <p className="text-[10px] text-center" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
        How evenly you initiate, respond, and show up
      </p>
    </motion.div>
  );
}

/* ── Growth Timeline ─────────────────────────────────────────────── */
function GrowthTimeline({ insights }: { insights: DeepInsight[] }) {
  const celebrations = insights.filter(i =>
    i.category === 'celebration' && i.seenAt
  ).slice(0, 5);

  if (celebrations.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest px-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
        Growth Moments
      </p>
      <div className="relative pl-5">
        <div className="absolute left-[7px] top-2 bottom-2 w-px" style={{ background: 'rgba(52, 211, 153, 0.2)' }} />
        {celebrations.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex items-start gap-3 py-2 relative"
          >
            <div
              className="absolute -left-3 top-3 w-2.5 h-2.5 rounded-full"
              style={{ background: '#34d399', opacity: 0.6 }}
            />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {c.insightText}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ── Main View ──────────────────────────────────────────────────────── */
export const PartnerIntelligenceView: React.FC<PartnerIntelligenceViewProps> = ({ setView }) => {
  const [model, setModel] = useState<RelationshipModel | null>(null);
  const [insights, setInsights] = useState<DeepInsight[]>([]);
  const [showPulse, setShowPulse] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const names = getProfileNames();

  const refresh = useCallback(() => {
    setModel(RelationshipModelService.getModel());
    setInsights(InsightEngine.getRecentInsights(20));
  }, []);

  useEffect(() => {
    const initAll = async () => {
      await Promise.all([
        RelationshipSignals.init(),
        PartnerIntelligenceService.init(),
      ]);
      await RelationshipModelService.init();
      await InsightEngine.init();
      await RelationshipModelService.compute();
      checkAndGenerateDeepInsights();
      refresh();
      setIsReady(true);
    };
    initAll();

    const handleModelUpdate = () => refresh();
    const handleInsightUpdate = () => refresh();
    const handleSignalUpdate = () => refresh();

    modelEventTarget.addEventListener('model-update', handleModelUpdate);
    insightEventTarget.addEventListener('insight-update', handleInsightUpdate);
    signalEventTarget.addEventListener('signal-update', handleSignalUpdate);

    return () => {
      modelEventTarget.removeEventListener('model-update', handleModelUpdate);
      insightEventTarget.removeEventListener('insight-update', handleInsightUpdate);
      signalEventTarget.removeEventListener('signal-update', handleSignalUpdate);
    };
  }, [refresh]);

  const handleInsightAction = useCallback(async (insight: DeepInsight) => {
    await InsightEngine.markActedOn(insight.id);
    if (insight.suggestedAction?.targetView) {
      setView(insight.suggestedAction.targetView as ViewState);
    }
  }, [setView]);

  const handlePulseComplete = useCallback(() => {
    setShowPulse(false);
    refresh();
  }, [refresh]);

  const handleReflectionComplete = useCallback(() => {
    setShowReflection(false);
    refresh();
  }, [refresh]);

  // Mark insights as seen when scrolled into view
  useEffect(() => {
    if (!isReady) return;
    const unseen = insights.filter(i => !i.seenAt);
    if (unseen.length > 0) {
      const timer = setTimeout(() => {
        unseen.forEach(i => InsightEngine.markSeen(i.id));
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [insights, isReady]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-full min-h-screen"
      style={{ background: 'var(--theme-bg-main)' }}
    >
      <ViewHeader
        title="Love Tracker"
        onBack={() => setView('home')}
        variant="centered"
      />

      <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto px-4 pb-8">
        {!isReady ? (
          <div className="flex items-center justify-center py-16">
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-sm"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Reading your relationship...
            </motion.div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Phase Banner */}
            {model && model.dataConfidence >= 0.2 && (
              <PhaseBanner model={model} />
            )}

            {/* Closeness Trajectory */}
            <ClosenessTrajectoryViz model={model} />

            {/* Daily Pulse Prompt */}
            <PulseCheckPrompt onOpen={() => setShowPulse(true)} />

            {/* Weekly Reflection Prompt */}
            {RelationshipSignals.isReflectionTime() && !RelationshipSignals.hasReflectedThisWeek() && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { feedback.tap(); setShowReflection(true); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl"
                style={{
                  background: 'rgba(167, 139, 250, 0.06)',
                  border: '1px solid rgba(167, 139, 250, 0.12)',
                }}
              >
                <span className="text-base">📝</span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    Weekly reflection
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                    Best moment + what felt hard this week
                  </p>
                </div>
                <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)', opacity: 0.3 }} />
              </motion.button>
            )}

            {/* System message for new users */}
            {model && model.dataConfidence < 0.15 && (
              <SystemMessageCard
                message={{
                  emoji: '✦',
                  text: "Welcome to your relationship intelligence. It starts quiet — a few days of check-ins will unlock your first real insight. Every signal compounds.",
                }}
              />
            )}

            {/* Insight Stream */}
            <InsightStream
              insights={insights}
              onAction={handleInsightAction}
            />

            {/* Reciprocity */}
            {model && model.dataConfidence >= 0.3 && (
              <ReciprocityGauge model={model} />
            )}

            {/* Love Language Profiles */}
            {model && model.partners.length >= 2 && (
              <LoveLanguageProfileViz
                myProfile={model.partners[0]?.loveLanguage}
                partnerProfile={model.partners[1]?.loveLanguage}
                myName={names.myName}
                partnerName={names.partnerName}
              />
            )}

            {/* Growth Timeline */}
            <GrowthTimeline insights={InsightEngine.getAllInsights()} />
          </div>
        )}
      </div>

      {/* Bottom sheets */}
      <AnimatePresence>
        {showPulse && (
          <PulseCheckSheet
            onComplete={handlePulseComplete}
            onClose={() => setShowPulse(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showReflection && (
          <WeeklyReflectionSheet
            onComplete={handleReflectionComplete}
            onClose={() => setShowReflection(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};
