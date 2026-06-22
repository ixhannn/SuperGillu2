import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, animate, useMotionValue, type PanInfo } from 'framer-motion';
import { Lock, Stamp } from 'lucide-react';
import { GOLD, GoldCTA } from '../GoldKit';
import { feedback } from '../../../utils/feedback';
import { useNativeShell } from '../../../hooks/useNativeShell';
import '../../../styles/premium-hub.css';

/**
 * Duet Journal compose sheet — one partner's private page.
 * Portal + pan-to-dismiss follow the PremiumModal pattern: the portal
 * wraps AnimatePresence (React 19), and the sheet is panned manually
 * because drag + exit on one node breaks unmounting.
 */

interface ComposeSheetProps {
    open: boolean;
    authorName: string;
    prompt: string;
    accent: string;
    onClose: () => void;
    onSeal: (text: string) => void;
}

const MAX_CHARS = 600;
const SHEET_SPRING = { type: 'spring', stiffness: 400, damping: 41, mass: 1 } as const;

export const ComposeSheet: React.FC<ComposeSheetProps> = ({ open, authorName, prompt, accent, onClose, onSeal }) => {
    // Lift the sheet above the IME — the textarea autofocuses 420ms after the
    // sheet enters, and overlay keyboard mode does not resize the WebView.
    const { keyboardOpen, keyboardHeight } = useNativeShell();
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Fresh page each time the sheet opens; focus after the entrance settles.
    useEffect(() => {
        if (!open) return;
        setText('');
        focusTimerRef.current = setTimeout(() => textareaRef.current?.focus(), 420);
        return () => {
            if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        };
    }, [open]);

    // Hardware back closes the sheet while open.
    useEffect(() => {
        if (!open) return;
        const handleBack = (e: Event) => { e.preventDefault(); onClose(); };
        window.addEventListener('lior:hardware-back', handleBack);
        return () => window.removeEventListener('lior:hardware-back', handleBack);
    }, [open, onClose]);

    // Pan-based pull-to-dismiss, scoped to the grab zone so the
    // textarea keeps its native selection/scroll gestures.
    const sheetY = useMotionValue(0);

    useEffect(() => {
        if (!open) sheetY.set(0);
    }, [open, sheetY]);

    const handlePan = useCallback((_: unknown, info: PanInfo) => {
        sheetY.set(info.offset.y > 0 ? info.offset.y : info.offset.y * 0.06);
    }, [sheetY]);

    const handlePanEnd = useCallback((_: unknown, info: PanInfo) => {
        if (info.offset.y > 130 || info.velocity.y > 700) {
            feedback.tap();
            onClose();
        } else {
            animate(sheetY, 0, { type: 'spring', stiffness: 420, damping: 34 });
        }
    }, [onClose, sheetY]);

    const trimmed = text.trim();

    const handleSeal = useCallback(() => {
        if (!trimmed) return;
        onSeal(trimmed);
    }, [trimmed, onSeal]);

    const nearLimit = text.length >= MAX_CHARS - 60;

    return ReactDOM.createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.22 } }}
                    className="fixed inset-0 z-[200] flex items-end justify-center"
                    style={{
                        backgroundColor: 'rgba(13,7,15,0.66)',
                        backdropFilter: 'blur(18px)',
                        WebkitBackdropFilter: 'blur(18px)',
                        paddingBottom: keyboardOpen ? keyboardHeight : undefined,
                        transition: 'padding-bottom 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ y: '104%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '104%', transition: { duration: 0.3, ease: [0.4, 0, 0.7, 0.2] } }}
                        transition={SHEET_SPRING}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${authorName}'s page`}
                        className="lp-stage relative w-full max-w-[440px] overflow-hidden"
                        style={{
                            y: sheetY,
                            borderRadius: '32px 32px 0 0',
                            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Ambient layers */}
                        <div className="lp-aurora">
                            <div className="lp-aurora__blob lp-aurora__blob--gold" style={{ width: 300, height: 300, top: -120 }} />
                            <div
                                className="lp-aurora__blob lp-aurora__blob--violet"
                                style={{ width: 280, height: 280, top: 60, background: `radial-gradient(circle, ${accent}3d 0%, transparent 65%)` }}
                            />
                        </div>
                        <div className="lp-grain" />

                        {/* Gold hairline */}
                        <div className="absolute top-0 left-0 right-0 h-px z-10 bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />

                        <div className="relative z-10 px-6 pb-7">
                            {/* Grab zone — pan-to-dismiss lives here only */}
                            <motion.div
                                onPan={handlePan}
                                onPanEnd={handlePanEnd}
                                className="pt-3 pb-1"
                                style={{ touchAction: 'none' }}
                            >
                                <div className="flex justify-center mb-4">
                                    <div className="w-10 h-[5px] rounded-full" style={{ background: 'rgba(255,246,230,0.18)' }} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD.eyebrow }}>
                                        {authorName}&rsquo;s page
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em]" style={{ color: GOLD.textLow }}>
                                        <Lock size={10} />
                                        Seals on save
                                    </span>
                                </div>
                            </motion.div>

                            {/* Prompt */}
                            <p
                                className="font-serif italic mt-4 text-[1.15rem] leading-snug pl-4"
                                style={{ color: GOLD.textHigh, letterSpacing: '-0.01em', borderLeft: `2px solid ${accent}99` }}
                            >
                                {prompt}
                            </p>

                            {/* Page */}
                            <textarea
                                ref={textareaRef}
                                value={text}
                                onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                                rows={7}
                                maxLength={MAX_CHARS}
                                placeholder="Write it the way you’d say it to them…"
                                className="font-serif w-full mt-5 px-4 py-4 text-[15px] leading-relaxed rounded-2xl resize-none outline-none"
                                style={{
                                    background: 'rgba(255,250,242,0.045)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: GOLD.textHigh,
                                    caretColor: accent,
                                }}
                            />

                            <div className="mt-2 flex items-center justify-between">
                                <span className="text-[10.5px]" style={{ color: GOLD.textLow }}>
                                    Two to six honest sentences is plenty.
                                </span>
                                <span
                                    className="text-[10.5px] font-semibold tabular-nums"
                                    style={{ color: nearLimit ? GOLD.light : GOLD.textLow }}
                                >
                                    {text.length} / {MAX_CHARS}
                                </span>
                            </div>

                            <div className="mt-4">
                                <GoldCTA onClick={handleSeal} disabled={!trimmed}>
                                    <span className="inline-flex items-center justify-center gap-2">
                                        <Stamp size={16} strokeWidth={2.2} />
                                        Seal it
                                    </span>
                                </GoldCTA>
                            </div>

                            <button
                                onClick={() => { feedback.tap(); onClose(); }}
                                className="mt-1 w-full py-2.5 text-[13px] font-medium active:scale-95 transition-transform"
                                style={{ color: 'rgba(255,246,230,0.32)' }}
                            >
                                Not yet
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};
