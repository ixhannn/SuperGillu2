import React from 'react';
import { motion } from 'framer-motion';
import { RecapStat } from '../../types';

interface RecapNumbersProps {
  stats: RecapStat[];
}

/**
 * Numbers as typography moments — not a dashboard. Each stat gets its own
 * line, centered, the value is the hero, the label is a whisper.
 */
export function RecapNumbers({ stats }: RecapNumbersProps) {
  return (
    <section className="recap-numbers">
      {stats.map((stat, i) => (
        <motion.div
          key={`${stat.label}-${i}`}
          className="recap-numbers__row"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, delay: i * 0.08 }}
        >
          <span
            className="recap-numbers__value"
            style={{ color: stat.accent ?? 'currentColor' }}
          >
            {stat.value}
            {stat.suffix ?? ''}
          </span>
          <span className="recap-numbers__label">{stat.label}</span>
        </motion.div>
      ))}
    </section>
  );
}
