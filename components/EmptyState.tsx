/**
 * EmptyState — warm, personality-rich empty state for every view.
 *
 * Usage:
 *   <EmptyState variant="memories" onAction={() => setView('add-memory')} />
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

// ─── Variant definitions ──────────────────────────────────────────────────────

export type EmptyStateVariant =
    | 'memories'
    | 'voiceNotes'
    | 'timeCapsule'
    | 'surprises'
    | 'dailyMoments'
    | 'keepsake'
    | 'notes'
    | 'openWhen';

interface VariantConfig {
    emoji: string;
    gradient: string;       // icon background
    title: string;
    subtitle: string;
    actionLabel?: string;
    tip?: string;           // small hint below CTA
}

const VARIANTS: Record<EmptyStateVariant, VariantConfig> = {
    memories: {
        emoji: '📸',
        gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        title: 'Your story starts here',
        subtitle: 'Add your first memory — a photo, a moment, or just words. Every great love story starts with a first entry.',
        actionLabel: 'Add a memory',
        tip: 'Tap the ♡ button at the bottom any time',
    },
    voiceNotes: {
        emoji: '🎙️',
        gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        title: 'Leave them a voice',
        subtitle: 'Record something you might not find words for. A voice message that feels like a hand on their shoulder.',
        actionLabel: 'Record your first note',
        tip: 'They can replay it whenever they miss your voice',
    },
    timeCapsule: {
        emoji: '⏳',
        gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
        title: 'Write to your future selves',
        subtitle: 'Seal a letter today. Choose a date to unlock it. Future you will be so glad past you did this.',
        actionLabel: 'Create a capsule',
        tip: 'Free plan: up to 3 capsules',
    },
    surprises: {
        emoji: '🎁',
        gradient: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
        title: 'Plan something unexpected',
        subtitle: 'Add a surprise — a note, a plan, a secret. Set a reveal date and watch their face when it unlocks.',
        actionLabel: 'Plan a surprise',
        tip: 'They won\'t see it until the date you set',
    },
    dailyMoments: {
        emoji: '🌅',
        gradient: 'linear-gradient(135deg, #f77062 0%, #fe5196 100%)',
        title: 'Share a piece of your day',
        subtitle: 'Send one photo from your day. They send one back. It disappears in 24 hours — like passing a note.',
        actionLabel: 'Send a moment',
        tip: 'Disappears in 24 hours — no pressure, just connection',
    },
    keepsake: {
        emoji: '🗝️',
        gradient: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
        title: 'A vault for the precious ones',
        subtitle: 'Save the things you never want to forget — the photos, the screenshots, the moments that matter most.',
        actionLabel: 'Add to your vault',
        tip: 'Private. Backed up. Yours forever.',
    },
    notes: {
        emoji: '📝',
        gradient: 'linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)',
        title: 'Notes between just you two',
        subtitle: 'Write something down — a thought, a reminder, a love letter. Just for the two of you.',
        actionLabel: 'Write a note',
        tip: 'Only you and your partner can see these',
    },
    openWhen: {
        emoji: '💌',
        gradient: 'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
        title: '"Open when you need me"',
        subtitle: 'Write letters for the hard moments and the happy ones. "Open when you miss me." "Open when you\'re proud."',
        actionLabel: 'Write your first letter',
        tip: 'They open it whenever the moment feels right',
    },
};

// ─── Illustration icon ────────────────────────────────────────────────────────

const IllustrationIcon: React.FC<{ emoji: string; gradient: string }> = ({ emoji, gradient }) => (
    <div className="flex justify-center mb-7">
        <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'relative' }}
        >
            {/* Outer glow */}
            <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.35, 0.6, 0.35] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                    position: 'absolute',
                    inset: -16,
                    borderRadius: '50%',
                    background: gradient,
                    filter: 'blur(24px)',
                    pointerEvents: 'none',
                }}
            />
            {/* Icon card */}
            <div
                style={{
                    width: 88,
                    height: 88,
                    borderRadius: '1.75rem',
                    background: gradient,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.35)',
                    position: 'relative',
                }}
            >
                {/* Shimmer */}
                <div style={{
                    position: 'absolute', inset: 0, borderRadius: '1.75rem',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.28) 0%, transparent 55%)',
                }} />
                <span style={{ fontSize: 38, lineHeight: 1, position: 'relative', zIndex: 1 }}>{emoji}</span>
            </div>
        </motion.div>
    </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

interface EmptyStateProps {
    variant: EmptyStateVariant;
    onAction?: () => void;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ variant, onAction, className = '' }) => {
    const config = VARIANTS[variant];

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className={`flex flex-col items-center text-center px-8 py-12 ${className}`}
        >
            <IllustrationIcon emoji={config.emoji} gradient={config.gradient} />

            <h3
                className="font-serif text-[1.45rem] leading-snug mb-3"
                style={{ color: 'var(--color-text-primary)' }}
            >
                {config.title}
            </h3>

            <p
                className="text-[14px] leading-relaxed mb-7 max-w-[280px]"
                style={{ color: 'var(--color-text-secondary)' }}
            >
                {config.subtitle}
            </p>

            {onAction && config.actionLabel && (
                <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={onAction}
                    className="flex items-center gap-2 px-6 py-3.5 rounded-2xl font-bold text-[14px] mb-4"
                    style={{
                        background: 'linear-gradient(135deg, #d4637a 0%, #c4687e 100%)',
                        color: '#fff',
                        border: 'none',
                        boxShadow: '0 6px 20px rgba(196,104,126,0.35)',
                        letterSpacing: '0.01em',
                    }}
                >
                    {config.actionLabel}
                    <ArrowRight size={15} strokeWidth={2.5} />
                </motion.button>
            )}

            {config.tip && (
                <p
                    className="text-[12px] font-medium"
                    style={{ color: 'var(--color-text-secondary)', opacity: 0.55 }}
                >
                    {config.tip}
                </p>
            )}
        </motion.div>
    );
};
