import React from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { feedback } from '../../utils/feedback';
import { useNavigation } from '../../App';
import { GOLD, GOLD_SOFT_SPRING, StarField, useAuroraParallax } from './GoldKit';
import '../../styles/premium-hub.css';

/**
 * GoldShell — scaffold for every premium feature view.
 *
 * The app's Layout owns vertical scrolling (Lenis drives the page), so the
 * shell renders in normal flow: a FIXED ambient backdrop (dark stage +
 * aurora + grain), a FIXED glass pill header (the vh-shell pattern), and
 * the content flowing in the page scroll beneath them. No nested vertical
 * scrollers — they starve Lenis of gestures and freeze the page.
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
    const auroraRef = useAuroraParallax();

    // Portaled to body like the app's vh-shell: lenis-content has
    // contain:paint, so a fixed header rendered inline would anchor to the
    // scroll content and ride away with it. Gold views are overlay routes
    // (never kept alive hidden), so mounting tracks visibility exactly.
    const header = (
        <div className="lp-shell-header">
            <motion.button
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...GOLD_SOFT_SPRING, delay: 0.05 }}
                whileTap={{ scale: 0.86 }}
                onClick={() => { feedback.tap(); handleBack(); }}
                aria-label="Go back"
                className="lp-glass w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ color: 'rgba(255,246,230,0.85)' }}
            >
                <ArrowLeft size={17} strokeWidth={2.4} />
            </motion.button>
            <motion.span
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...GOLD_SOFT_SPRING, delay: 0.12 }}
                className="text-[10px] font-bold uppercase tracking-[0.4em] text-center truncate"
                style={{ color: GOLD.eyebrow }}
            >
                {eyebrow}
            </motion.span>
            <div className="w-10 h-10 flex items-center justify-center shrink-0">
                {rightSlot ?? <div className="w-10 h-10" aria-hidden="true" />}
            </div>
        </div>
    );

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative w-full min-h-screen"
            style={{ background: '#09090e', color: 'rgba(255,251,250,0.94)' }}
        >
            {/* Fixed ambient backdrop — the page scrolls natively above it */}
            <div className="lp-backdrop lp-stage" aria-hidden="true">
                <StarField />
                <div className="lp-aurora" ref={auroraRef}>
                    <div className="lp-aurora__blob lp-aurora__blob--gold" />
                    <div className="lp-aurora__blob lp-aurora__blob--rose" />
                    <div
                        className="lp-aurora__blob lp-aurora__blob--violet"
                        style={accent ? { background: `radial-gradient(circle, ${accent}42 0%, transparent 65%)` } : undefined}
                    />
                </div>
                <div className="lp-grain" />
            </div>

            {/* Fixed glass pill header — escapes contain:paint via portal */}
            {typeof document !== 'undefined' && ReactDOM.createPortal(header, document.body)}
            <div className="lp-shell-spacer" aria-hidden="true" />

            <div className="relative z-10 pb-10">
                {fullBleed ? children : (
                    <div className="px-5 mx-auto w-full max-w-[480px]">
                        {children}
                    </div>
                )}
            </div>
        </motion.div>
    );
};
