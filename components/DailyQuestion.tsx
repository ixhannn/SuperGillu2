import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, X, Lock, Heart } from 'lucide-react';
import { CoupleProfile, QuestionEntry } from '../types';
import { StorageService } from '../services/storage';
import { Haptics } from '../services/haptics';
import { springSnappy, EASE_SILK, DUR_MODAL, prefersReducedMotion } from '../utils/motion';

interface DailyQuestionProps {
    profile: CoupleProfile;
    onUpdate: () => void;
}

export const DailyQuestion: React.FC<DailyQuestionProps> = ({ profile, onUpdate }) => {
    const [entry, setEntry] = useState<QuestionEntry | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [draft, setDraft] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Tracks whether the partner-response reveal beat has already played this
    // session so the heartbeat/particle fire exactly once (loud once, then
    // silent) and never re-fire on subsequent re-renders or refreshes.
    const revealPlayedRef = useRef(false);
    // The previous "both answered" value, so we can distinguish the live
    // waiting→revealed transition (fire the beat) from a card that mounts
    // already-revealed (partner answered before today's load — stay silent).
    const wasBothAnsweredRef = useRef<boolean | null>(null);
    // Drives the one-shot drifting heart + warm border for the reveal beat.
    const [revealBeat, setRevealBeat] = useState(false);

    useEffect(() => {
        const q = StorageService.getTodayQuestion(profile.myName, profile.partnerName);
        setEntry(q);
    }, [profile]);

    const refresh = () => {
        const q = StorageService.getTodayQuestion(profile.myName, profile.partnerName);
        setEntry(q);
        onUpdate();
    };

    // ── Partner-response reveal choreography (5.3.4) ────────────────────────
    // Intercept the waiting→revealed transition: fire the heartbeat + a single
    // soft drifting heart as their answer lands. This is the headline beat —
    // loud once, then silent. A card that loads already-revealed stays quiet.
    useEffect(() => {
        if (!entry) return;
        const both = !!entry.answers[profile.myName] && !!entry.answers[profile.partnerName];

        // First observation: seed the ref without firing (covers mount-as-revealed).
        if (wasBothAnsweredRef.current === null) {
            wasBothAnsweredRef.current = both;
            return;
        }

        const justRevealed = both && !wasBothAnsweredRef.current;
        wasBothAnsweredRef.current = both;

        if (!justRevealed || revealPlayedRef.current) return;
        revealPlayedRef.current = true;

        const reduced = prefersReducedMotion();
        if (reduced) {
            // Reduced motion: plain opacity reveal — no haptics, no particle.
            return;
        }

        // t=0–150ms — anticipation snap: a literal heartbeat as their words arrive.
        Haptics.heartbeat();
        // t=400–700ms — their answer blooms: doubleBeat + one drifting heart.
        const beatTimer = setTimeout(() => {
            Haptics.doubleBeat();
            setRevealBeat(true);
        }, 400);
        // Retire the heart after its drift completes (start 400ms + 2000ms drift).
        const heartTimer = setTimeout(() => { setRevealBeat(false); }, 2600);
        return () => { clearTimeout(beatTimer); clearTimeout(heartTimer); };
    }, [entry, profile.myName, profile.partnerName]);

    if (!entry) return null;

    const myAnswer = entry.answers[profile.myName];
    const partnerAnswer = entry.answers[profile.partnerName];
    const bothAnswered = !!myAnswer && !!partnerAnswer;
    // Stays warm-bordered for the session once the reveal has played.
    const warmBorder = revealPlayedRef.current && bothAnswered;

    const handleCardClick = () => {
        if (!myAnswer && !expanded) {
            setExpanded(true);
            setTimeout(() => textareaRef.current?.focus(), 350);
        }
    };

    const handleSubmit = () => {
        if (!draft.trim()) return;
        const answer = draft.trim();
        setEntry(prev => prev ? ({
            ...prev,
            answers: {
                ...prev.answers,
                [profile.myName]: answer,
            },
        }) : prev);
        StorageService.submitQuestionAnswer(answer);
        // Submitting your answer is the vulnerability beat — an explicit
        // product action, so success haptics are sanctioned.
        Haptics.success();
        setExpanded(false);
        setDraft('');
        onUpdate();
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(false);
        setDraft('');
    };

    return (
        <motion.div
            layout="size"
            onClick={handleCardClick}
            className="w-full rounded-[1.75rem] p-5 mb-5 relative overflow-hidden"
            style={{
                background: 'rgba(255,255,255,0.88)',
                backdropFilter: 'blur(24px) saturate(140%)',
                WebkitBackdropFilter: 'blur(24px) saturate(140%)',
                borderWidth: '1px',
                borderStyle: 'solid',
                boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,1), 0 2px 16px rgba(232,160,176,0.10)',
                cursor: !myAnswer ? 'pointer' : 'default',
            }}
            initial={false}
            animate={{
                // Border warms to rose as their answer arrives, then stays warm
                // for the session (5.3.4 t=0–150ms / rest).
                borderColor: warmBorder ? 'rgba(244,63,94,0.30)' : 'rgba(255,255,255,0.95)',
            }}
            transition={{
                layout: springSnappy,
                borderColor: { duration: 0.15, ease: EASE_SILK },
            }}
        >
            {/* One soft drifting heart — the single particle of the reveal beat.
                Guarded by reduced-motion (only mounts when revealBeat is set,
                which never happens under reduced motion). */}
            <AnimatePresence>
                {revealBeat && (
                    <motion.div
                        key="reveal-heart"
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 bottom-6"
                        initial={{ opacity: 0, y: 0, scale: 0.6, x: '-50%' }}
                        animate={{ opacity: [0, 0.9, 0], y: -120, scale: 1, x: '-50%' }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2.0, ease: EASE_SILK, times: [0, 0.2, 1] }}
                    >
                        <Heart size={20} className="text-rose-400" fill="currentColor" />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex items-center gap-1.5 mb-3">
                <Sparkles size={12} className="text-rose-400" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-rose-400">
                    Today's Question
                </span>
            </div>

            {/* Question text */}
            <p className="font-serif text-[1.1rem] italic leading-snug text-gray-800 mb-3">
                "{entry.question}"
            </p>

            {/* State content */}
            <AnimatePresence mode="wait">
                {bothAnswered ? (
                    /* Both answered — reveal inline */
                    <motion.div
                        key="revealed"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="space-y-2 mt-1"
                        onClick={e => e.stopPropagation()}
                    >
                        <AnswerBubble name="You" answer={myAnswer} isMe />
                        <AnswerBubble name={profile.partnerName} answer={partnerAnswer} isMe={false} />
                    </motion.div>

                ) : myAnswer ? (
                    /* Answered — waiting for partner */
                    <motion.div
                        key="waiting"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl"
                        style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)' }}
                    >
                        {/* One quiet breathe loop — anticipation (5.3.3). */}
                        <motion.div
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: '#fb923c' }}
                            animate={{ scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }}
                            transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
                        />
                        <span className="text-sm text-gray-400 italic">
                            Waiting for {profile.partnerName} to answer...
                        </span>
                        {/* One-shot "sealed" micro-beat — the privacy promise (5.3.2). */}
                        <motion.span
                            className="ml-auto flex-shrink-0 text-gray-400"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 0.7 }}
                            transition={springSnappy}
                        >
                            <Lock size={12} />
                        </motion.span>
                    </motion.div>

                ) : expanded ? (
                    /* Expanded input — inline answer */
                    <motion.div
                        key="input"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            placeholder="Write your answer..."
                            rows={3}
                            maxLength={300}
                            inputMode="text"
                            enterKeyHint="send"
                            autoCapitalize="sentences"
                            autoCorrect="on"
                            spellCheck
                            className="w-full resize-none rounded-2xl px-4 py-3 text-[16px] outline-none mb-2.5"
                            style={{
                                background: 'rgba(0,0,0,0.04)',
                                border: '1px solid rgba(0,0,0,0.07)',
                                color: '#2D1F25',
                                caretColor: '#f43f5e',
                            }}
                        />
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={handleCancel}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-400"
                                style={{ background: 'rgba(0,0,0,0.05)' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!draft.trim()}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold text-white"
                                style={{
                                    background: draft.trim() ? 'linear-gradient(135deg, #f43f5e, #e11d48)' : 'rgba(0,0,0,0.12)',
                                    color: draft.trim() ? 'white' : 'rgba(0,0,0,0.25)',
                                }}
                            >
                                <Send size={11} />
                                Send
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 text-center">
                            {profile.partnerName} won't see this until they answer too.
                        </p>
                    </motion.div>

                ) : (
                    /* Default — prompt to answer */
                    <motion.div
                        key="prompt"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl"
                        style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)' }}
                    >
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'rgba(180,180,180,0.6)' }} />
                        <span className="text-sm text-gray-400 italic">
                            Tap to answer today's question
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

const AnswerBubble: React.FC<{ name: string; answer: string; isMe: boolean }> = ({ name, answer, isMe }) => (
    <motion.div
        layout
        // Yours settles first via the card layout spring (5.3.4 t=150–400ms);
        // theirs blooms a touch larger after a held breath (t=400–700ms).
        initial={isMe ? { opacity: 0, y: 8 } : { opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={isMe
            ? springSnappy
            : { duration: DUR_MODAL, ease: EASE_SILK, delay: 0.25 }}
        className="rounded-2xl px-4 py-3"
        style={{
            background: isMe ? 'rgba(244,63,94,0.07)' : 'rgba(0,0,0,0.04)',
            border: isMe ? '1px solid rgba(244,63,94,0.14)' : '1px solid rgba(0,0,0,0.05)',
        }}
    >
        <p className="text-[10px] uppercase tracking-widest font-bold mb-1.5"
            style={{ color: isMe ? '#e11d48' : '#9B7B84' }}>
            {isMe ? 'You' : name}
        </p>
        <p className="text-sm leading-relaxed font-serif text-gray-700">{answer}</p>
    </motion.div>
);
