import React from 'react';
import { motion } from 'framer-motion';
import type { StreakDay } from '../../types';
import { GOLD, GOLD_SOFT_SPRING, GoldSectionHeader, goldRise } from '../premium/GoldKit';

interface RecapStreakProps {
    days: StreakDay[];
    currentStreak: number;
    bestStreak: number;
}

/** The chain — each shared day minted as a gold coin on a hairline rail. */
export function RecapStreak({ days, currentStreak, bestStreak }: RecapStreakProps) {
    return (
        <motion.section
            className="grc-streak"
            variants={goldRise}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
        >
            <GoldSectionHeader label="The chain" className="mt-10 mb-3" />
            <div className="rounded-[1.6rem] p-5" style={{ background: GOLD.cardBg, border: GOLD.cardBorder }}>
                <div className="grc-streak__row" role="list" aria-label="Streak">
                    {days.map((d, i) => (
                        <motion.span
                            key={d.date}
                            role="listitem"
                            className={`grc-coin${d.filled ? ' is-filled' : ''}`}
                            initial={{ opacity: 0, scale: 0.5 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ ...GOLD_SOFT_SPRING, delay: i * 0.05 }}
                            aria-label={`${d.date} ${d.filled ? 'filled' : 'missed'}`}
                        />
                    ))}
                </div>
                <p className="mt-4 text-center font-serif text-[15px]" style={{ color: GOLD.textMid }}>
                    {currentStreak > 0
                        ? `${currentStreak} in a row`
                        : 'Begin a new chain next week.'}
                    {bestStreak > currentStreak && ` · best ${bestStreak}`}
                </p>
            </div>
        </motion.section>
    );
}
