import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { feedback } from '../../utils/feedback';
import { useNavigation } from '../../App';
import { GOLD, GOLD_SOFT_SPRING } from './GoldKit';
import '../../styles/premium-hub.css';

/**
 * GoldShell — scaffold for every premium feature view.
 * Owns the dark aurora stage, grain, floating glass header and the
 * scroll container. Views render their content as children inside a
 * centered max-w column.
 */
interface GoldShellProps {
    eyebrow: string;
    /** Defaults to the app's history-aware goBack (pop, falling back to home). */
    onBack?: () => void;
    /** Hex accent of the feature — tints the third aurora blob. */
    accent?: string;
    rightSlot?: React.ReactNode;
    /** Skip the inner max-w column (full-bleed experiences). */
    fullBleed?: boolean;
    children: React.ReactNode;
}

export const GoldShell: React.FC<GoldShellProps> = ({ eyebrow, onBack, accent, rightSlot, fullBleed, children }) => {
    const { goBack } = useNavigation();
    const handleBack = onBack ?? goBack;
    return (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="lp-stage flex flex-col h-full min-h-screen"
    >
        {/* Ambient layers */}
        <div className="lp-aurora">
            <div className="lp-aurora__blob lp-aurora__blob--gold" />
            <div className="lp-aurora__blob lp-aurora__blob--rose" />
            <div
                className="lp-aurora__blob lp-aurora__blob--violet"
                style={accent ? { background: `radial-gradient(circle, ${accent}42 0%, transparent 65%)` } : undefined}
            />
        </div>
        <div className="lp-grain" />

        <div data-lenis-prevent className="lenis-inner relative z-10 flex-1 overflow-y-auto pb-36">
            {/* Floating header */}
            <div
                className="sticky top-0 z-30 flex items-center justify-between px-5 pb-3"
                style={{
                    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
                    background: 'linear-gradient(180deg, rgba(15,7,18,0.92) 0%, rgba(15,7,18,0.55) 60%, transparent 100%)',
                }}
            >
                <motion.button
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...GOLD_SOFT_SPRING, delay: 0.05 }}
                    whileTap={{ scale: 0.86 }}
                    onClick={() => { feedback.tap(); handleBack(); }}
                    aria-label="Go back"
                    className="lp-glass w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ color: 'rgba(255,246,230,0.85)' }}
                >
                    <ArrowLeft size={17} strokeWidth={2.4} />
                </motion.button>
                <motion.span
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...GOLD_SOFT_SPRING, delay: 0.12 }}
                    className="text-[10px] font-bold uppercase tracking-[0.4em]"
                    style={{ color: GOLD.eyebrow }}
                >
                    {eyebrow}
                </motion.span>
                <div className="w-10 h-10 flex items-center justify-center">
                    {rightSlot ?? <div className="w-10 h-10" aria-hidden="true" />}
                </div>
            </div>

            {fullBleed ? children : (
                <div className="px-5 mx-auto w-full max-w-[480px]">
                    {children}
                </div>
            )}
        </div>
    </motion.div>
    );
};
