import React, { useEffect, useRef, useState } from 'react';
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
    /** Primary accent — electric rose (modern), not antique amber. */
    primary: '#ff5c7c',
    light: '#ff8fa6',
    deep: '#e23d60',
    /** Text on the primary gradient. */
    inkOnGold: '#ffffff',
    /** Champagne — reserved for the literal brand mark (crown, the word "Gold"). */
    brand: '#e8c97d',
    textHigh: 'rgba(255,251,250,0.95)',
    textMid: 'rgba(255,248,248,0.52)',
    textLow: 'rgba(255,248,248,0.36)',
    eyebrow: 'rgba(255,255,255,0.55)',
    cardBg: 'linear-gradient(150deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.018) 100%)',
    cardBorder: '1px solid rgba(255,255,255,0.07)',
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

/**
 * Aurora parallax: drifts the ambient blob layer at a fraction of the
 * page scroll so the stage reads as a deeper plane than the content.
 * Transform-only writes, rAF-throttled, disabled for reduced motion.
 */
export const useAuroraParallax = (factor = -0.12): React.RefObject<HTMLDivElement | null> => {
    const layerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const wrapper = document.querySelector<HTMLElement>('.lenis-wrapper');
        if (!wrapper) return;

        let raf = 0;
        const apply = () => {
            raf = 0;
            const el = layerRef.current;
            if (el) el.style.transform = `translate3d(0, ${Math.round(wrapper.scrollTop * factor)}px, 0)`;
        };
        const onScroll = () => {
            if (!raf) raf = requestAnimationFrame(apply);
        };
        wrapper.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            wrapper.removeEventListener('scroll', onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [factor]);

    return layerRef;
};

/** Bold sentence-case section title — modern, no micro-uppercase. */
export const GoldSectionHeader: React.FC<{ label: string; className?: string }> = ({ label, className }) => (
    <div className={`flex items-baseline gap-3 ${className ?? 'mt-10 mb-4'}`}>
        <span className="font-serif text-[17px] font-bold tracking-[-0.01em]" style={{ color: GOLD.textHigh }}>
            {label}
        </span>
        <div className="flex-1 h-px self-center" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.12), transparent)' }} />
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
                : `linear-gradient(135deg, ${GOLD.primary} 0%, #8b5cf6 100%)`,
            color: disabled ? 'rgba(255,246,230,0.3)' : GOLD.inkOnGold,
            boxShadow: disabled ? 'none' : '0 12px 36px rgba(255,92,124,0.3), inset 0 1px 0 rgba(255,255,255,0.3)',
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
                        style={{ background: 'linear-gradient(150deg, #1a1822 0%, #0d0c13 100%)' }}
                    >
                        <div
                            className="flex w-12 h-12 items-center justify-center rounded-2xl mb-4"
                            style={{ background: 'rgba(232,201,125,0.13)', border: '1px solid rgba(232,201,125,0.35)' }}
                        >
                            <Crown size={22} strokeWidth={1.8} style={{ color: GOLD.brand }} />
                        </div>
                        <p className="font-serif text-[1.2rem] leading-tight" style={{ color: GOLD.textHigh }}>{title}</p>
                        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: GOLD.textMid }}>{sub}</p>
                        <motion.button
                            whileTap={{ scale: 0.96 }}
                            transition={GOLD_PRESS_SPRING}
                            onClick={() => { feedback.tap(); setPaywallOpen(true); }}
                            className="lp-cta mt-5 w-full h-[46px] rounded-xl font-bold text-[13.5px] inline-flex items-center justify-center gap-2"
                            style={{
                                background: `linear-gradient(135deg, ${GOLD.primary} 0%, #8b5cf6 100%)`,
                                color: GOLD.inkOnGold,
                                boxShadow: '0 10px 28px rgba(255,92,124,0.28)',
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
