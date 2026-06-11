import React from 'react';
import { motion } from 'framer-motion';
import type { RecapHighlight as RecapHighlightData } from '../../types';
import { GOLD, GoldSectionHeader, goldRise } from '../premium/GoldKit';
import { liftAccent } from './goldPalette';

interface RecapHighlightProps {
    highlight: RecapHighlightData;
}

/** Moment of the week — a magazine feature card with an accent spine. */
export function RecapHighlight({ highlight }: RecapHighlightProps) {
    const accent = liftAccent(highlight.accentColor);

    return (
        <motion.section
            className="grc-highlight"
            variants={goldRise}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
        >
            <GoldSectionHeader label="Moment of the week" className="mt-10 mb-3" />
            <div
                className="relative overflow-hidden rounded-[1.6rem] py-5 pl-6 pr-5"
                style={{ background: GOLD.cardBg, border: GOLD.cardBorder }}
            >
                <span
                    aria-hidden="true"
                    className="absolute left-0 top-5 bottom-5 w-[2.5px] rounded-full"
                    style={{ background: `linear-gradient(180deg, ${accent}, transparent)` }}
                />
                <h2
                    className="font-serif text-[1.45rem] leading-snug"
                    style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                >
                    {highlight.title}
                </h2>
                {highlight.body && highlight.body !== highlight.title && (
                    <p className="mt-2 text-[13px] leading-relaxed" style={{ color: GOLD.textMid }}>
                        {highlight.body}
                    </p>
                )}
                {highlight.date && (
                    <p className="mt-3.5 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: GOLD.textLow }}>
                        {new Date(highlight.date).toLocaleDateString(undefined, {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                        })}
                    </p>
                )}
            </div>
        </motion.section>
    );
}
