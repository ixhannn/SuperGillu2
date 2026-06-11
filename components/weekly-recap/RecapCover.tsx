import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { RecapPalette } from '../../types';
import { GOLD, goldRise, goldStagger } from '../premium/GoldKit';
import { deriveDuotone } from './goldPalette';

interface RecapCoverProps {
    headline: string;
    dateRange: string;
    names: [string, string];
    palette: RecapPalette;
}

/**
 * The issue cover — full-bleed, giant serif headline, byline, and the
 * week's palette reinterpreted as a duotone glow on the dark stage.
 */
export function RecapCover({ headline, dateRange, names, palette }: RecapCoverProps) {
    const duo = useMemo(() => deriveDuotone(palette), [palette]);

    return (
        <motion.section
            className="grc-cover grc-bleed"
            initial="hidden"
            animate="visible"
            variants={goldStagger}
        >
            <div
                className="grc-cover__glow"
                aria-hidden="true"
                style={{
                    background: `radial-gradient(95% 70% at 50% 0%, ${duo.glow} 0%, transparent 72%), radial-gradient(55% 38% at 8% 42%, ${duo.soft} 0%, transparent 70%)`,
                }}
            />

            <motion.p
                variants={goldRise}
                className="relative text-[10px] font-bold uppercase tracking-[0.3em]"
                style={{ color: GOLD.eyebrow }}
            >
                Issue · {dateRange}
            </motion.p>

            <motion.h1
                variants={goldRise}
                className="grc-cover__headline relative font-serif mt-4"
                style={{ color: GOLD.textHigh }}
            >
                {headline}
            </motion.h1>

            <motion.div variants={goldRise} className="grc-rule relative mt-6" aria-hidden="true" />

            <motion.div variants={goldRise} className="relative mt-4 flex items-end justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: GOLD.textMid }}>
                    {names[0]} <span style={{ color: duo.accent }}>&</span> {names[1]}
                </p>
                <p className="shrink-0 text-[9.5px] font-bold uppercase tracking-[0.22em]" style={{ color: duo.accent }}>
                    The {palette.id} issue
                </p>
            </motion.div>
        </motion.section>
    );
}
