import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Mic } from 'lucide-react';
import type { RecapMemoryRef, RecapPalette } from '../../types';
import { StorageService } from '../../services/storage';
import { GOLD, GOLD_SOFT_SPRING, GoldSectionHeader, goldRise } from '../premium/GoldKit';
import { deriveDuotone } from './goldPalette';

interface RecapHeadlineProps {
    memory: RecapMemoryRef;
    palette: RecapPalette;
}

/** Headline moment — the week's best memory as a foil-framed full feature. */
export function RecapHeadline({ memory, palette }: RecapHeadlineProps) {
    const duo = useMemo(() => deriveDuotone(palette), [palette]);
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!memory.hasImage) return;
        const memories = StorageService.getMemories?.() ?? [];
        const found = memories.find((m: any) => m.id === memory.id);
        if (found?.image) {
            setImageUrl(found.image);
        } else if (found?.imageId || found?.storagePath) {
            StorageService.getImage(found.imageId ?? '', undefined, found.storagePath)
                .then((url: string | null) => url && setImageUrl(url))
                .catch(() => {});
        }
    }, [memory.id, memory.hasImage]);

    const moodEmoji = getMoodEmoji(memory.mood);
    const dateStr = new Date(memory.date).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });

    return (
        <motion.section
            className="grc-headline"
            variants={goldRise}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
        >
            <GoldSectionHeader label="Headline moment" className="mt-10 mb-3" />

            {imageUrl ? (
                <div className="lp-foil">
                    <div className="grc-headline__hero">
                        <img src={imageUrl} alt={memory.text.slice(0, 60)} className="grc-headline__img" />
                        <div className="grc-headline__scrim" aria-hidden="true" />
                        <div className="grc-headline__content">
                            {moodEmoji && (
                                <motion.span
                                    className="block text-[1.7rem] mb-1.5"
                                    initial={{ scale: 0, opacity: 0 }}
                                    whileInView={{ scale: 1, opacity: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ ...GOLD_SOFT_SPRING, delay: 0.3 }}
                                >
                                    {moodEmoji}
                                </motion.span>
                            )}
                            <p className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: duo.accent }}>
                                {memory.dayLabel}
                            </p>
                            <h2
                                className="mt-1.5 font-serif text-[1.5rem] leading-snug"
                                style={{ color: 'rgba(255,250,242,0.96)', letterSpacing: '-0.02em' }}
                            >
                                {memory.text.split('.')[0].slice(0, 100) || 'A beautiful moment'}
                            </h2>
                            <p className="mt-1.5 text-[11px]" style={{ color: 'rgba(255,246,230,0.55)' }}>
                                {dateStr}
                            </p>
                            <div className="mt-2.5 flex items-center gap-2" style={{ color: GOLD.light }}>
                                {memory.hasImage && <Camera size={12} />}
                                {memory.hasAudio && <Mic size={12} />}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div
                    className="relative overflow-hidden rounded-[1.75rem] px-6 py-7 text-center"
                    style={{ background: GOLD.cardBg, border: `1px solid ${duo.border}` }}
                >
                    <div
                        className="absolute inset-0 pointer-events-none"
                        aria-hidden="true"
                        style={{ background: `radial-gradient(90% 70% at 50% 0%, ${duo.soft} 0%, transparent 72%)` }}
                    />
                    {moodEmoji && (
                        <motion.span
                            className="relative block text-[2.4rem] mb-2"
                            initial={{ scale: 0, rotate: -20, opacity: 0 }}
                            whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ ...GOLD_SOFT_SPRING, delay: 0.2 }}
                        >
                            {moodEmoji}
                        </motion.span>
                    )}
                    <p className="relative text-[10px] font-bold uppercase tracking-[0.26em]" style={{ color: duo.accent }}>
                        {memory.dayLabel}
                    </p>
                    <h2
                        className="relative mt-2 font-serif text-[1.45rem] leading-snug"
                        style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                    >
                        {memory.text.split('.')[0].slice(0, 100) || 'A quiet moment'}
                    </h2>
                    <p className="relative mt-2 text-[11px]" style={{ color: GOLD.textLow }}>
                        {dateStr}
                    </p>
                </div>
            )}
        </motion.section>
    );
}

function getMoodEmoji(mood?: string): string | null {
    if (!mood) return null;
    const map: Record<string, string> = {
        loved: '🥰', romantic: '💕', grateful: '🙏', joyful: '✨',
        happy: '😊', excited: '🎉', playful: '😝', peaceful: '☮️',
        calm: '😌', content: '😊', thoughtful: '🤔', reflective: '💭',
        tender: '💗', tired: '😴', quiet: '🤫', meh: '😐',
        stressed: '😤', sad: '😢', anxious: '😰', frustrated: '😣',
        lonely: '💔', angry: '😠',
    };
    return map[mood.toLowerCase()] ?? null;
}
