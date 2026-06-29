import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, Sparkles } from 'lucide-react';
import { feedback } from '../../utils/feedback';
import { GOLD, GOLD_PRESS_SPRING, GOLD_SOFT_SPRING, GoldSectionHeader, goldRise } from '../premium/GoldKit';

interface RecapPromptProps {
    text: string;
    promptType: 'shared_mood' | 'gap' | 'milestone' | 'general';
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
    shared_mood: <Sparkles size={12} />,
    gap: <MessageCircle size={12} />,
    milestone: <Sparkles size={12} />,
    general: <MessageCircle size={12} />,
};

const TYPE_LABELS: Record<string, string> = {
    shared_mood: 'Shared moment',
    gap: 'Check in',
    milestone: 'Milestone',
    general: 'For you both',
};

/** A letter to next week — the prompt restaged as gold stationery. */
export function RecapPrompt({ text, promptType }: RecapPromptProps) {
    const [reply, setReply] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = () => {
        if (!reply.trim()) return;
        feedback.tap();
        setSubmitted(true);
        // Future: save reply as a Note via StorageService
    };

    return (
        <motion.section
            className="grc-prompt"
            variants={goldRise}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
        >
            <GoldSectionHeader label="For next week" className="mt-10 mb-3" />

            <div className="lp-foil">
                <div
                    className="rounded-[27px] px-5 py-6"
                    style={{ background: 'linear-gradient(150deg, #221026 0%, #160a18 100%)' }}
                >
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="font-serif text-[1.3rem] leading-tight" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                            A letter to next week
                        </h3>
                        <span
                            className="inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-[0.14em]"
                            style={{ background: 'rgba(246,199,104,0.12)', border: '1px solid rgba(246,199,104,0.3)', color: GOLD.primary }}
                        >
                            {TYPE_ICONS[promptType]}
                            {TYPE_LABELS[promptType]}
                        </span>
                    </div>

                    <motion.blockquote
                        className="mt-4 font-serif italic text-[16px] leading-relaxed"
                        style={{ color: GOLD.textMid }}
                        initial={{ opacity: 0, x: -8 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ ...GOLD_SOFT_SPRING, delay: 0.2 }}
                    >
                        “{text}”
                    </motion.blockquote>

                    <AnimatePresence mode="wait">
                        {!submitted ? (
                            <motion.div
                                key="input"
                                className="mt-5 flex items-center gap-2.5"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={GOLD_SOFT_SPRING}
                            >
                                <input
                                    type="text"
                                    className="grc-input"
                                    placeholder="Quick thought…"
                                    value={reply}
                                    onChange={(e) => setReply(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                />
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    transition={GOLD_PRESS_SPRING}
                                    onClick={handleSubmit}
                                    disabled={!reply.trim()}
                                    aria-label="Send reply"
                                    className="flex w-11 h-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
                                    style={{
                                        background: `linear-gradient(135deg, ${GOLD.primary} 0%, ${GOLD.deep} 100%)`,
                                        color: GOLD.inkOnGold,
                                        boxShadow: '0 8px 22px rgba(246,199,104,0.26)',
                                    }}
                                >
                                    <Send size={15} strokeWidth={2.2} />
                                </motion.button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="thanks"
                                className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-semibold"
                                style={{ background: 'rgba(246,199,104,0.1)', border: '1px solid rgba(246,199,104,0.3)', color: GOLD.light }}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={GOLD_SOFT_SPRING}
                            >
                                <Sparkles size={14} />
                                <span>Noted for next week</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.section>
    );
}
