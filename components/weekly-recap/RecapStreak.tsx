import React from 'react';
import { motion } from 'framer-motion';
import { StreakDay } from '../../types';

interface RecapStreakProps {
  days: StreakDay[];
  currentStreak: number;
  bestStreak: number;
}

export function RecapStreak({ days, currentStreak, bestStreak }: RecapStreakProps) {
  return (
    <section className="recap-streak">
      <h2 className="recap-streak__title">Your chain</h2>
      <div className="recap-streak__chain" role="list" aria-label="Streak">
        {days.map((d, i) => (
          <motion.span
            key={d.date}
            role="listitem"
            className={`recap-streak__node${d.filled ? ' is-filled' : ''}`}
            initial={{ opacity: 0, scale: 0.6 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            aria-label={`${d.date} ${d.filled ? 'filled' : 'missed'}`}
          />
        ))}
      </div>
      <p className="recap-streak__caption">
        {currentStreak > 0
          ? `${currentStreak} in a row`
          : 'Begin a new chain next week.'}
        {bestStreak > currentStreak && ` · best ${bestStreak}`}
      </p>
    </section>
  );
}
