import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, ChevronLeft, ChevronRight, Mic } from 'lucide-react';
import type { RecapMemoryRef, RecapPalette } from '../../types';
import { StorageService } from '../../services/storage';
import { feedback } from '../../utils/feedback';
import { GOLD, GOLD_PRESS_SPRING, GOLD_SOFT_SPRING, goldRise } from '../premium/GoldKit';
import { deriveDuotone, type RecapDuotone } from './goldPalette';

interface RecapCarouselProps {
    memories: RecapMemoryRef[];
    palette: RecapPalette;
}

/** Best of the week — foil-framed memory cards in a snapping rail. */
export function RecapCarousel({ memories, palette }: RecapCarouselProps) {
    const duo = useMemo(() => deriveDuotone(palette), [palette]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [activeIdx, setActiveIdx] = useState(0);

    const scroll = useCallback((dir: 'left' | 'right') => {
        const el = scrollRef.current;
        if (!el) return;
        feedback.tap();
        const cardW = el.scrollWidth / memories.length;
        const next = dir === 'left' ? Math.max(0, activeIdx - 1) : Math.min(memories.length - 1, activeIdx + 1);
        el.scrollTo({ left: cardW * next, behavior: 'smooth' });
        setActiveIdx(next);
    }, [activeIdx, memories.length]);

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const cardW = el.scrollWidth / memories.length;
        const idx = Math.round(el.scrollLeft / cardW);
        setActiveIdx(idx);
    }, [memories.length]);

    if (memories.length < 2) return null;

    return (
        <motion.section
            className="grc-carousel"
            variants={goldRise}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
        >
            {/* Eyebrow header with rail controls */}
            <div className="mt-10 mb-3 flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD.eyebrow }}>
                    Best of the week
                </span>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, rgba(246,199,104,0.25), transparent)' }} />
                <div className="flex items-center gap-1.5">
                    <motion.button
                        whileTap={{ scale: 0.86 }}
                        transition={GOLD_PRESS_SPRING}
                        className="lp-glass w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40"
                        onClick={() => scroll('left')}
                        disabled={activeIdx === 0}
                        aria-label="Previous memory"
                        style={{ color: GOLD.light }}
                    >
                        <ChevronLeft size={14} strokeWidth={2.4} />
                    </motion.button>
                    <motion.button
                        whileTap={{ scale: 0.86 }}
                        transition={GOLD_PRESS_SPRING}
                        className="lp-glass w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40"
                        onClick={() => scroll('right')}
                        disabled={activeIdx === memories.length - 1}
                        aria-label="Next memory"
                        style={{ color: GOLD.light }}
                    >
                        <ChevronRight size={14} strokeWidth={2.4} />
                    </motion.button>
                </div>
            </div>

            <div ref={scrollRef} className="grc-track" onScroll={handleScroll}>
                {memories.map((mem, i) => (
                    <CarouselCard key={mem.id} memory={mem} duo={duo} index={i} />
                ))}
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5">
                {memories.map((_, i) => (
                    <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full transition-colors duration-300"
                        style={{ background: i === activeIdx ? duo.accent : 'rgba(255,255,255,0.16)' }}
                    />
                ))}
            </div>
        </motion.section>
    );
}

function CarouselCard({ memory, duo, index }: { memory: RecapMemoryRef; duo: RecapDuotone; index: number }) {
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

    return (
        <motion.div
            className="grc-frame"
            initial={{ opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ ...GOLD_SOFT_SPRING, delay: index * 0.06 }}
        >
            <div className="grc-frame__inner">
                {imageUrl ? (
                    <div className="grc-frame__media">
                        <img src={imageUrl} alt="" />
                        <div className="grc-frame__media-scrim" aria-hidden="true" />
                    </div>
                ) : (
                    <div
                        className="grc-frame__media flex items-center justify-center"
                        style={{ background: `radial-gradient(80% 80% at 50% 40%, ${duo.soft} 0%, transparent 75%)` }}
                    >
                        {moodEmoji ? (
                            <span className="text-3xl">{moodEmoji}</span>
                        ) : (
                            <Camera size={24} style={{ color: GOLD.textLow, opacity: 0.6 }} />
                        )}
                    </div>
                )}

                <div className="px-4 pt-3 pb-4">
                    <div className="flex items-center gap-2">
                        {moodEmoji && <span className="text-[13px] leading-none">{moodEmoji}</span>}
                        <span className="text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: duo.accent }}>
                            {memory.dayLabel}
                        </span>
                        {memory.hasAudio && <Mic size={10} style={{ color: GOLD.light }} />}
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: GOLD.textHigh }}>
                        {memory.text.slice(0, 60)}{memory.text.length > 60 ? '…' : ''}
                    </p>
                </div>
            </div>
        </motion.div>
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
