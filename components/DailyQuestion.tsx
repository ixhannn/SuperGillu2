import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, X } from 'lucide-react';
import { CoupleProfile, QuestionEntry } from '../types';
import { StorageService } from '../services/storage';

interface DailyQuestionProps {
    profile: CoupleProfile;
    onUpdate: () => void;
}

export const DailyQuestion: React.FC<DailyQuestionProps> = ({ profile, onUpdate }) => {
    const [entry, setEntry] = useState<QuestionEntry | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [draft, setDraft] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    const bothAnswered = !!myAnswer && !!partnerAnswer;

    const handleCardClick = () => {
        if (!myAnswer && !expanded) {
            setExpanded(true);
            setTimeout(() => textareaRef.current?.focus(), 150);
        }
    };

    const handleSubmit = () => {
        if (!draft.trim()) return;
        StorageService.submitQuestionAnswer(draft.trim());
        setExpanded(false);
        setDraft('');
        refresh();
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(false);
        setDraft('');
    };

    return (
        <motion.div
            layout
            onClick={handleCardClick}
            className="w-full rounded-[1.75rem] p-5 mb-5 relative overflow-hidden"
            style={{
                background: 'rgba(255,255,255,0.88)',
                backdropFilter: 'blur(24px) saturate(140%)',
                WebkitBackdropFilter: 'blur(24px) saturate(140%)',
                border: '1px solid rgba(255,255,255,0.95)',
                boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,1), 0 2px 16px rgba(232,160,176,0.10)',
                cursor: !myAnswer ? 'pointer' : 'default',
            }}
            transition={{ layout: { type: 'spring', stiffness: 400, damping: 32 } }}
        >
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
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#fb923c' }} />
                        <span className="text-sm text-gray-400 italic">
                            Waiting for {profile.partnerName} to answer...
                        </span>
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
                            className="w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none mb-2.5"
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
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: isMe ? 0 : 0.12 }}
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
