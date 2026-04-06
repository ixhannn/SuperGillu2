import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Lock } from 'lucide-react';
import { CoupleProfile, QuestionEntry } from '../types';
import { StorageService } from '../services/storage';

interface DailyQuestionProps {
    profile: CoupleProfile;
    onUpdate: () => void;
}

export const DailyQuestion: React.FC<DailyQuestionProps> = ({ profile, onUpdate }) => {
    const [entry, setEntry] = useState<QuestionEntry | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const q = StorageService.getTodayQuestion(profile.myName, profile.partnerName);
        setEntry(q);
    }, [profile]);

    const refresh = () => {
        const q = StorageService.getTodayQuestion(profile.myName, profile.partnerName);
        setEntry(q);
        onUpdate();
    };

    if (!entry) return null;

    const myAnswer = entry.answers[profile.myName];
    const partnerAnswer = entry.answers[profile.partnerName];
    const iRevealed = !!entry.revealedAt;

    const chipLabel = iRevealed
        ? 'Both answered'
        : myAnswer
        ? `Waiting for ${profile.partnerName}`
        : 'Answer today\'s question';

    const chipColor = iRevealed
        ? 'rgba(139,92,246,0.18)'
        : myAnswer
        ? 'rgba(251,146,60,0.12)'
        : 'rgba(255,255,255,0.06)';

    const chipBorder = iRevealed
        ? '1px solid rgba(139,92,246,0.30)'
        : myAnswer
        ? '1px solid rgba(251,146,60,0.20)'
        : '1px solid rgba(255,255,255,0.08)';

    return (
        <>
            {/* Compact home pill */}
            <motion.button
                onClick={() => setOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl mb-4 text-left"
                style={{ background: chipColor, border: chipBorder }}
                whileTap={{ scale: 0.97 }}
            >
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: iRevealed ? '#8b5cf6' : myAnswer ? '#fb923c' : 'rgba(255,255,255,0.25)' }} />
                <span className="text-xs flex-1 line-clamp-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.75 }}>
                    {entry.question}
                </span>
                <span className="text-[10px] font-medium flex-shrink-0"
                    style={{ color: iRevealed ? '#8b5cf6' : myAnswer ? '#fb923c' : 'var(--color-text-secondary)', opacity: iRevealed || myAnswer ? 1 : 0.4 }}>
                    {chipLabel}
                </span>
            </motion.button>

            {/* Modal */}
            <AnimatePresence>
                {open && (
                    <QuestionModal
                        entry={entry}
                        profile={profile}
                        onClose={() => setOpen(false)}
                        onSubmit={refresh}
                    />
                )}
            </AnimatePresence>
        </>
    );
};

interface ModalProps {
    entry: QuestionEntry;
    profile: CoupleProfile;
    onClose: () => void;
    onSubmit: () => void;
}

const QuestionModal: React.FC<ModalProps> = ({ entry, profile, onClose, onSubmit }) => {
    const [draft, setDraft] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const myAnswer = entry.answers[profile.myName];
    const partnerAnswer = entry.answers[profile.partnerName];
    const bothAnswered = !!myAnswer && !!partnerAnswer;

    useEffect(() => {
        if (!myAnswer) setTimeout(() => inputRef.current?.focus(), 300);
    }, []);

    const handleSubmit = () => {
        if (!draft.trim()) return;
        StorageService.submitQuestionAnswer(draft.trim());
        setSubmitted(true);
        onSubmit();
        setTimeout(() => {
            const updated = StorageService.getTodayQuestion(profile.myName, profile.partnerName);
            if (updated.answers[profile.partnerName]) {
                // partner already answered — refresh to show reveal
                onSubmit();
            }
        }, 400);
    };

    return (
        <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}
        >
            <motion.div
                className="w-full max-w-lg rounded-t-[2rem] overflow-hidden"
                style={{ background: 'var(--color-surface, #0f0914)' }}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                onClick={e => e.stopPropagation()}
            >
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
                </div>

                <div className="px-6 pb-10 pt-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <p className="text-[10px] uppercase tracking-widest font-bold mb-1"
                                style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                                Today's Question
                            </p>
                            <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.35 }}>
                                {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full"
                            style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <X size={16} style={{ color: 'var(--color-text-secondary)' }} />
                        </button>
                    </div>

                    {/* Question */}
                    <h2 className="font-serif text-2xl leading-snug mb-8"
                        style={{ color: 'var(--color-text-primary)' }}>
                        {entry.question}
                    </h2>

                    {bothAnswered ? (
                        /* Both answered — reveal */
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                        >
                            <AnswerCard name={profile.myName} answer={entry.answers[profile.myName]} isMe />
                            <AnswerCard name={profile.partnerName} answer={entry.answers[profile.partnerName]} isMe={false} />
                        </motion.div>
                    ) : myAnswer ? (
                        /* I answered, waiting */
                        <div className="text-center py-8">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.20)' }}>
                                <Lock size={18} className="text-orange-400" />
                            </div>
                            <p className="font-serif text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>
                                Waiting for {profile.partnerName}
                            </p>
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                                Answers reveal when both of you respond.
                            </p>
                        </div>
                    ) : (
                        /* Input */
                        <div className="space-y-3">
                            <textarea
                                ref={inputRef}
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                placeholder="Write your answer..."
                                rows={4}
                                maxLength={300}
                                className="w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none"
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.10)',
                                    color: 'var(--color-text-primary)',
                                    caretColor: 'var(--color-text-primary)',
                                }}
                            />
                            <div className="flex items-center justify-between">
                                <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.35 }}>
                                    {profile.partnerName} won't see this until they answer too.
                                </span>
                                <motion.button
                                    onClick={handleSubmit}
                                    disabled={!draft.trim()}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                                    style={{
                                        background: draft.trim() ? 'rgba(139,92,246,0.85)' : 'rgba(255,255,255,0.06)',
                                        color: draft.trim() ? 'white' : 'rgba(255,255,255,0.25)',
                                    }}
                                    whileTap={draft.trim() ? { scale: 0.96 } : {}}
                                >
                                    <Send size={13} />
                                    Send
                                </motion.button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

const AnswerCard: React.FC<{ name: string; answer: string; isMe: boolean }> = ({ name, answer, isMe }) => (
    <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: isMe ? 0 : 0.15 }}
        className="rounded-2xl p-4"
        style={{
            background: isMe ? 'rgba(139,92,246,0.10)' : 'rgba(255,255,255,0.04)',
            border: isMe ? '1px solid rgba(139,92,246,0.20)' : '1px solid rgba(255,255,255,0.07)',
        }}
    >
        <p className="text-[10px] uppercase tracking-widest font-bold mb-2"
            style={{ color: isMe ? '#8b5cf6' : 'var(--color-text-secondary)', opacity: isMe ? 1 : 0.5 }}>
            {isMe ? 'You' : name}
        </p>
        <p className="text-sm leading-relaxed font-serif" style={{ color: 'var(--color-text-primary)' }}>
            {answer}
        </p>
    </motion.div>
);
