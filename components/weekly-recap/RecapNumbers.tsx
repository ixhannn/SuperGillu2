import React, { useEffect, useRef, useState } from 'react';
import { motion, animate, useInView, useReducedMotion } from 'framer-motion';
import type { RecapStat } from '../../types';
import { GOLD, GoldSectionHeader, goldRise } from '../premium/GoldKit';
import { liftAccent } from './goldPalette';

interface RecapNumbersProps {
    stats: RecapStat[];
}

/** Count-up number — same pattern as the Premium hub's AnimatedNumber. */
const AnimatedNumber: React.FC<{ value: number; className?: string; style?: React.CSSProperties }> = ({ value, className, style }) => {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true, margin: '-30px' });
    const reducedMotion = useReducedMotion();
    const [display, setDisplay] = useState(0);

    useEffect(() => {
        if (!inView) return;
        if (reducedMotion) {
            setDisplay(value);
            return;
        }
        const controls = animate(0, value, {
            duration: 1.5,
            ease: [0.22, 1, 0.36, 1],
            onUpdate: (v) => setDisplay(Math.round(v)),
        });
        return () => controls.stop();
    }, [inView, value, reducedMotion]);

    return <span ref={ref} className={className} style={style}>{display.toLocaleString()}</span>;
};

/**
 * By the numbers — oversized serif stats in an asymmetric editorial grid,
 * each row separated by a hairline gold divider.
 */
export function RecapNumbers({ stats }: RecapNumbersProps) {
    return (
        <section className="grc-numbers">
            <GoldSectionHeader label="By the numbers" className="mt-10 mb-1" />
            <div>
                {stats.map((stat, i) => (
                    <motion.div
                        key={`${stat.label}-${i}`}
                        className="grc-numbers__row"
                        variants={goldRise}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-60px' }}
                    >
                        <span className="grc-numbers__value font-serif" style={{ color: stat.accent ? liftAccent(stat.accent) : GOLD.textHigh }}>
                            <AnimatedNumber value={stat.value} />
                            {stat.suffix && (
                                <span className="font-serif text-[1.4rem]" style={{ color: GOLD.textMid }}>
                                    {stat.suffix}
                                </span>
                            )}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: GOLD.textLow }}>
                            {stat.label}
                        </span>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
