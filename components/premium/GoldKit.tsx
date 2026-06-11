import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { Crown, Lock } from 'lucide-react';
import { PremiumModal, type PremiumFeatureContext } from '../PremiumModal';
import { feedback } from '../../utils/feedback';
import '../../styles/premium-hub.css';

/**
 * LIOR GOLD — shared design kit for every premium surface.
 * All premium views import these constants so the whole wing
 * shares ONE motion signature. Do not redefine springs locally.
 */

export const GOLD = {
    primary: '#f6c768',
    light: '#f3cd86',
    deep: '#d99c3e',
    inkOnGold: '#23120a',
    textHigh: 'rgba(255,250,242,0.94)',
    textMid: 'rgba(255,246,230,0.5)',
    textLow: 'rgba(255,246,230,0.38)',
    eyebrow: 'rgba(246,199,104,0.8)',
    cardBg: 'linear-gradient(150deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.018) 100%)',
    cardBorder: '1px solid rgba(255,255,255,0.08)',
} as const;

export const GOLD_SOFT_SPRING = { type: 'spring', stiffness: 280, damping: 32, mass: 0.9 } as const;
export const GOLD_PRESS_SPRING = { type: 'spring', stiffness: 560, damping: 30 } as const;

export const goldStagger: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

export const goldRise: Variants = {
    hidden: { opacity: 0, y: 26, scale: 0.985 },
    visible: { opacity: 1, y: 0, scale: 1, transition: GOLD_SOFT_SPRING },
};

/** Eyebrow label + gold hairline — section divider used across all gold views. */
export const GoldSectionHeader: React.FC<{ label: string; className?: string }> = ({ label, className }) => (
    <div className={`flex items-center gap-3 ${className ?? 'mt-10 mb-4'}`}>
        <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD.eyebrow }}>
            {label}
        </span>
        <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.25), transparent)' }} />
    </div>
);

/** Glass card on the dark stage. Pass a tint for an accent border. */
export const GoldCard: React.FC<{
    tint?: string;
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}> = ({ tint, className, style, children }) => (
    <div
        className={`relative overflow-hidden rounded-[1.6rem] ${className ?? 'p-5'}`}
        style={{
            background: GOLD.cardBg,
            border: tint ? `1px solid ${tint}33` : GOLD.cardBorder,
            ...style,
        }}
    >
        {children}
    </div>
);

/** Primary gold CTA with the shimmer sweep. */
export const GoldCTA: React.FC<{
    onClick: () => void;
    children: React.ReactNode;
    disabled?: boolean;
    className?: string;
}> = ({ onClick, children, disabled, className }) => (
    <motion.button
        whileTap={disabled ? undefined : { scale: 0.97 }}
        transition={GOLD_PRESS_SPRING}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className={`lp-cta w-full h-[54px] rounded-2xl font-bold text-[15px] tracking-wide ${className ?? ''}`}
        style={{
            background: disabled
                ? 'rgba(255,255,255,0.08)'
                : `linear-gradient(135deg, ${GOLD.primary} 0%, ${GOLD.deep} 100%)`,
            color: disabled ? 'rgba(255,246,230,0.3)' : GOLD.inkOnGold,
            boxShadow: disabled ? 'none' : '0 12px 36px rgba(246,199,104,0.28), inset 0 1px 0 rgba(255,246,222,0.45)',
        }}
    >
        {children}
    </motion.button>
);

/**
 * Premium gate. When `locked`, children render blurred and inert under a
 * gold unlock panel that opens the paywall. When unlocked, renders children.
 */
export const GoldGate: React.FC<{
    locked: boolean;
    title?: string;
    sub?: string;
    featureContext?: PremiumFeatureContext;
    children: React.ReactNode;
}> = ({ locked, title = 'A Gold experience', sub = 'Unlock Lior Gold to open this for the two of you.', featureContext = 'generic', children }) => {
    const [paywallOpen, setPaywallOpen] = useState(false);
    const [unlockedLive, setUnlockedLive] = useState(false);

    // Unlock in place the moment the paywall (anywhere in the app) grants
    // premium — the parent's `locked` prop may lag until its next re-read.
    useEffect(() => {
        const handleChange = () => setUnlockedLive(true);
        window.addEventListener('lior:premium-changed', handleChange);
        return () => window.removeEventListener('lior:premium-changed', handleChange);
    }, []);

    if (!locked || unlockedLive) return <>{children}</>;

    return (
        <div className="relative">
            <div aria-hidden="true" style={{ filter: 'blur(14px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.55 }}>
                {children}
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-6">
                <motion.div
                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={GOLD_SOFT_SPRING}
                    className="lp-foil w-full max-w-[320px]"
                >
                    <div
                        className="flex flex-col items-center text-center px-6 py-7 rounded-[27px]"
                        style={{ background: 'linear-gradient(150deg, #221026 0%, #160a18 100%)' }}
                    >
                        <div
                            className="flex w-12 h-12 items-center justify-center rounded-2xl mb-4"
                            style={{ background: 'rgba(246,199,104,0.15)', border: '1px solid rgba(246,199,104,0.4)' }}
                        >
                            <Crown size={22} strokeWidth={1.8} style={{ color: GOLD.primary }} />
                        </div>
                        <p className="font-serif text-[1.2rem] leading-tight" style={{ color: GOLD.textHigh }}>{title}</p>
                        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: GOLD.textMid }}>{sub}</p>
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={GOLD_PRESS_SPRING}
                            onClick={() => { feedback.tap(); setPaywallOpen(true); }}
                            className="lp-cta mt-5 w-full h-[46px] rounded-xl font-bold text-[13.5px] inline-flex items-center justify-center gap-2"
                            style={{
                                background: `linear-gradient(135deg, ${GOLD.primary} 0%, ${GOLD.deep} 100%)`,
                                color: GOLD.inkOnGold,
                                boxShadow: '0 10px 28px rgba(246,199,104,0.26)',
                            }}
                        >
                            <Lock size={13} strokeWidth={2.4} />
                            Unlock Lior Gold
                        </motion.button>
                    </div>
                </motion.div>
            </div>
            <PremiumModal isOpen={paywallOpen} onClose={() => setPaywallOpen(false)} featureContext={featureContext} />
        </div>
    );
};
