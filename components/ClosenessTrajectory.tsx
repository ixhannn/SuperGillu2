import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ClosenessTrajectory, RelationshipModel } from '../types';

interface ClosenessTrajectoryVizProps {
  model: RelationshipModel | null;
  compact?: boolean;
}

const TRAJECTORY_META: Record<ClosenessTrajectory, {
  label: string;
  color: string;
  emoji: string;
  description: string;
}> = {
  growing: { label: 'Growing Closer', color: '#34d399', emoji: '↗', description: 'Your connection is strengthening' },
  stable: { label: 'Steady', color: '#93c5fd', emoji: '→', description: 'Consistent and grounded' },
  drifting: { label: 'Needs Attention', color: '#fbbf24', emoji: '↘', description: 'A little distance has crept in' },
  recovering: { label: 'Coming Back', color: '#a78bfa', emoji: '↗', description: 'You\'re finding your way back' },
};

function SparklineBar({ value, maxValue, delay }: { value: number; maxValue: number; delay: number }) {
  const height = Math.max(4, (value / Math.max(maxValue, 1)) * 48);
  const warmth = value / 100;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height, opacity: 1 }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className="rounded-full"
      style={{
        width: 6,
        background: `rgba(${Math.round(244 * warmth + 147 * (1 - warmth))}, ${Math.round(114 * warmth + 197 * (1 - warmth))}, ${Math.round(182 * warmth + 253 * (1 - warmth))}, ${0.3 + warmth * 0.5})`,
      }}
    />
  );
}

export const ClosenessTrajectoryViz: React.FC<ClosenessTrajectoryVizProps> = ({ model, compact = false }) => {
  if (!model) {
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
        <span className="text-2xl block mb-2">◈</span>
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Your closeness trajectory will appear after a few days of check-ins.
        </p>
      </motion.div>
    );
  }

  const trajectory = model.closenessTrajectory;
  const meta = TRAJECTORY_META[trajectory];
  const { current, d7, d30, d90 } = model.closenessScore;

  // Generate sparkline data points (simulated daily scores between windows)
  const sparklineData = useMemo(() => {
    const points: number[] = [];
    // Interpolate between d90 → d30 → d7 → current
    for (let i = 0; i < 6; i++) points.push(d90 + (d30 - d90) * (i / 6) + (Math.random() * 6 - 3));
    for (let i = 0; i < 4; i++) points.push(d30 + (d7 - d30) * (i / 4) + (Math.random() * 4 - 2));
    for (let i = 0; i < 3; i++) points.push(d7 + (current - d7) * (i / 3) + (Math.random() * 3 - 1.5));
    points.push(current);
    return points.map(p => Math.max(0, Math.min(100, Math.round(p))));
  }, [current, d7, d30, d90]);

  const maxVal = Math.max(...sparklineData, 1);

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3"
      >
        <div className="flex items-end gap-0.5 h-8">
          {sparklineData.slice(-8).map((v, i) => (
            <SparklineBar key={i} value={v} maxValue={maxVal} delay={i * 0.05} />
          ))}
        </div>
        <div>
          <span className="text-sm font-semibold" style={{ color: meta.color }}>
            {meta.emoji} {current}
          </span>
          <span className="text-[10px] ml-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
            {meta.label}
          </span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, rgba(var(--theme-particle-1-rgb), 0.05) 0%, rgba(var(--theme-particle-2-rgb), 0.03) 100%)`,
        border: '1px solid rgba(var(--theme-particle-1-rgb), 0.08)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
          Closeness
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium" style={{ color: meta.color }}>
            {meta.emoji} {meta.label}
          </span>
        </div>
      </div>

      {/* Big score */}
      <div className="flex items-end gap-4 mb-4">
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-4xl font-bold leading-none"
          style={{ fontFamily: 'Georgia, serif', color: 'var(--color-text-primary)' }}
        >
          {current}
        </motion.span>

        {/* Sparkline */}
        <div className="flex items-end gap-[3px] h-12 pb-1">
          {sparklineData.map((v, i) => (
            <SparklineBar key={i} value={v} maxValue={maxVal} delay={i * 0.04} />
          ))}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        {meta.description}
      </p>

      {/* Time windows */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '7 days', value: d7 },
          { label: '30 days', value: d30 },
          { label: '90 days', value: d90 },
        ].map(({ label, value }) => {
          const diff = current - value;
          const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
          const diffColor = diff > 0 ? '#34d399' : diff < 0 ? '#f87171' : 'var(--color-text-secondary)';

          return (
            <div key={label} className="text-center rounded-xl p-2" style={{ background: 'rgba(var(--theme-particle-2-rgb), 0.04)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'Georgia, serif' }}>
                {value}
              </p>
              <p className="text-[9px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                {label}
              </p>
              <p className="text-[10px] font-medium" style={{ color: diffColor }}>
                {diffStr}
              </p>
            </div>
          );
        })}
      </div>

      {/* Confidence */}
      {model.dataConfidence < 0.5 && (
        <p className="text-[10px] mt-3 text-center" style={{ color: 'var(--color-text-secondary)', opacity: 0.4 }}>
          Accuracy improves with more check-ins
        </p>
      )}
    </motion.div>
  );
};
