import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Gold wax-seal medallion for the Duet Journal.
 * Rendered as two clipped halves so the seal can visibly crack apart
 * during the reveal ceremony (transform/opacity only).
 */

interface WaxSealProps {
    /** Single letter pressed into the wax (partner initial). */
    initial: string;
    /** Diameter in px. */
    size?: number;
    /** When true, the two halves fly apart and fade. */
    cracked?: boolean;
}

const SealFace: React.FC<{ initial: string; size: number }> = ({ initial, size }) => (
    <div
        className="relative rounded-full flex items-center justify-center"
        style={{
            width: size,
            height: size,
            background: 'radial-gradient(circle at 32% 28%, #fdeec9 0%, #f6c768 30%, #d99c3e 62%, #8a5a22 100%)',
            boxShadow: '0 8px 22px rgba(246,199,104,0.35), inset 0 1px 2px rgba(255,246,222,0.75), inset 0 -3px 6px rgba(82,46,9,0.5)',
        }}
    >
        {/* Irregular wax drips along the edge */}
        <span
            aria-hidden="true"
            className="absolute rounded-full"
            style={{
                width: size * 0.18,
                height: size * 0.18,
                left: -size * 0.05,
                bottom: size * 0.12,
                background: 'radial-gradient(circle at 35% 30%, #f3cd86, #b9803a)',
                boxShadow: 'inset 0 -1px 2px rgba(82,46,9,0.45)',
            }}
        />
        <span
            aria-hidden="true"
            className="absolute rounded-full"
            style={{
                width: size * 0.12,
                height: size * 0.12,
                right: -size * 0.03,
                top: size * 0.16,
                background: 'radial-gradient(circle at 35% 30%, #f6c768, #a8702c)',
                boxShadow: 'inset 0 -1px 1px rgba(82,46,9,0.4)',
            }}
        />
        {/* Embossed inner ring */}
        <div
            aria-hidden="true"
            className="absolute rounded-full"
            style={{ inset: size * 0.12, border: '1px solid rgba(112,66,18,0.55)', boxShadow: 'inset 0 1px 1px rgba(255,242,205,0.4)' }}
        />
        <span
            className="font-serif select-none"
            style={{
                fontSize: size * 0.4,
                lineHeight: 1,
                color: '#5b3812',
                textShadow: '0 1px 0 rgba(255,242,205,0.55)',
                letterSpacing: '-0.02em',
            }}
        >
            {initial}
        </span>
    </div>
);

export const WaxSeal: React.FC<WaxSealProps> = ({ initial, size = 56, cracked = false }) => {
    const reducedMotion = useReducedMotion();

    const restPose = { x: 0, y: 0, rotate: 0, opacity: 1 };
    const leftPose = reducedMotion
        ? { x: 0, y: 0, rotate: 0, opacity: 0 }
        : { x: -size * 0.45, y: size * 0.18, rotate: -26, opacity: 0 };
    const rightPose = reducedMotion
        ? { x: 0, y: 0, rotate: 0, opacity: 0 }
        : { x: size * 0.45, y: size * 0.1, rotate: 22, opacity: 0 };
    const crackTransition = { duration: reducedMotion ? 0.15 : 0.55, ease: [0.22, 1, 0.36, 1] as const };

    return (
        <div className="relative" style={{ width: size, height: size }} role="img" aria-label={cracked ? 'Seal broken' : 'Sealed'}>
            <motion.div
                className="absolute inset-0"
                initial={false}
                animate={cracked ? leftPose : restPose}
                transition={crackTransition}
                style={{ clipPath: 'inset(-25% 50% -25% -25%)' }}
            >
                <SealFace initial={initial} size={size} />
            </motion.div>
            <motion.div
                className="absolute inset-0"
                initial={false}
                animate={cracked ? rightPose : restPose}
                transition={crackTransition}
                style={{ clipPath: 'inset(-25% -25% -25% 50%)' }}
            >
                <SealFace initial={initial} size={size} />
            </motion.div>
        </div>
    );
};
