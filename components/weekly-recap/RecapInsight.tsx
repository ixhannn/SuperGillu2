import React from 'react';
import { motion } from 'framer-motion';
import { GOLD, goldRise } from '../premium/GoldKit';

interface RecapInsightProps {
    text: string;
    label: string;
    variant: 'paragraph' | 'prompt';
}

/** Pull-quote insight — a giant serif quotation mark over a glass card. */
export function RecapInsight({ text, label, variant }: RecapInsightProps) {
    return (
        <motion.section
            className={`grc-insight grc-insight--${variant}`}
            variants={goldRise}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
        >
            <div
                className="relative mt-10 overflow-hidden rounded-[1.75rem] px-6 pt-10 pb-6"
                style={{
                    background: GOLD.cardBg,
                    border: variant === 'prompt' ? '1px solid rgba(246,199,104,0.22)' : GOLD.cardBorder,
                }}
            >
                <span className="grc-insight__mark font-serif" aria-hidden="true">“</span>
                <p className="relative text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD.eyebrow }}>
                    {label}
                </p>
                <p
                    className="relative mt-3 font-serif text-[1.3rem] leading-snug"
                    style={{ color: GOLD.textHigh, letterSpacing: '-0.015em' }}
                >
                    {text}
                </p>
            </div>
        </motion.section>
    );
}
