import React from 'react';
import { motion, type Variants } from 'framer-motion';
import type { DuetEntry } from '../../../types';
import { GOLD, GOLD_SOFT_SPRING, goldStagger } from '../GoldKit';

/**
 * The opened duet — both answers as facing letters on paper cards,
 * each signed with a thin gold rule. Letters are ordered by who
 * wrote first (first pen, second pen).
 */

interface DuetSpreadProps {
    entry: DuetEntry;
    /** Show the prompt above the letters (archive context). */
    showPrompt?: boolean;
}

const letterVariantsFor = (tilt: number): Variants => ({
    hidden: { opacity: 0, y: 24, rotateX: -26, rotate: 0 },
    visible: { opacity: 1, y: 0, rotateX: 0, rotate: tilt, transition: GOLD_SOFT_SPRING },
});

const ampersandVariants: Variants = {
    hidden: { opacity: 0, scale: 0.6 },
    visible: { opacity: 1, scale: 1, transition: GOLD_SOFT_SPRING },
};

const formatLetterDate = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

export const DuetSpread: React.FC<DuetSpreadProps> = ({ entry, showPrompt = false }) => {
    const letters = Object.entries(entry.answers)
        .sort(([, a], [, b]) => a.writtenAt.localeCompare(b.writtenAt));

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={goldStagger}
            style={{ perspective: 900 }}
        >
            {showPrompt && (
                <motion.p
                    variants={letterVariantsFor(0)}
                    className="font-serif italic text-[1.05rem] leading-snug mb-4"
                    style={{ color: GOLD.textMid, letterSpacing: '-0.01em' }}
                >
                    “{entry.prompt}”
                </motion.p>
            )}

            {letters.map(([name, answer], i) => (
                <React.Fragment key={name}>
                    {i > 0 && (
                        <motion.div variants={ampersandVariants} className="flex items-center gap-3 my-3 px-2">
                            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,199,104,0.3))' }} />
                            <span className="font-serif text-[1.1rem] leading-none" style={{ color: '#e9b765' }}>&amp;</span>
                            <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.3), transparent)' }} />
                        </motion.div>
                    )}
                    <motion.div
                        variants={letterVariantsFor(i % 2 === 0 ? -0.6 : 0.7)}
                        className="relative rounded-[1.25rem] px-5 py-5"
                        style={{
                            background: 'rgba(255,250,242,0.04)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            boxShadow: '0 14px 34px rgba(10,4,12,0.35)',
                        }}
                    >
                        <p className="font-serif text-[14.5px] leading-[1.75] whitespace-pre-wrap" style={{ color: 'rgba(255,250,242,0.88)' }}>
                            {answer.text}
                        </p>
                        <div className="mt-4 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.45), transparent)' }} />
                        <div className="mt-2.5 flex items-baseline justify-between">
                            <span className="font-serif italic text-[13.5px]" style={{ color: GOLD.light }}>
                                — {name}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: GOLD.textLow }}>
                                {i === 0 ? 'First pen' : 'Second pen'} · {formatLetterDate(answer.writtenAt)}
                            </span>
                        </div>
                    </motion.div>
                </React.Fragment>
            ))}
        </motion.div>
    );
};
