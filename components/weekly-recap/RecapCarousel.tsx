import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, ChevronLeft, ChevronRight, Mic } from 'lucide-react';
import { RecapMemoryRef, RecapPalette } from '../../types';
import { StorageService } from '../../services/storage';

interface RecapCarouselProps {
  memories: RecapMemoryRef[];
  palette: RecapPalette;
}

export function RecapCarousel({ memories, palette }: RecapCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
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
      className="recap-carousel"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.6 }}
    >
      <div className="recap-carousel__header">
        <p className="recap-carousel__label" style={{ color: palette.muted }}>
          ✦ Best Of
        </p>
        <div className="recap-carousel__arrows">
          <button
            className="recap-carousel__arrow"
            onClick={() => scroll('left')}
            disabled={activeIdx === 0}
            style={{ color: palette.accent, borderColor: `${palette.accent}40` }}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            className="recap-carousel__arrow"
            onClick={() => scroll('right')}
            disabled={activeIdx === memories.length - 1}
            style={{ color: palette.accent, borderColor: `${palette.accent}40` }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="recap-carousel__track"
        onScroll={handleScroll}
      >
        {memories.map((mem, i) => (
          <CarouselCard key={mem.id} memory={mem} palette={palette} index={i} />
        ))}
      </div>

      <div className="recap-carousel__dots">
        {memories.map((_, i) => (
          <span
            key={i}
            className={`recap-carousel__dot ${i === activeIdx ? 'recap-carousel__dot--active' : ''}`}
            style={{ background: i === activeIdx ? palette.accent : `${palette.accent}30` }}
          />
        ))}
      </div>
    </motion.section>
  );
}

function CarouselCard({ memory, palette, index }: { memory: RecapMemoryRef; palette: RecapPalette; index: number }) {
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
      className="recap-carousel__card"
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      style={{
        background: imageUrl ? undefined : `linear-gradient(145deg, ${palette.accent}12, ${palette.base})`,
        borderColor: `${palette.accent}25`,
      }}
    >
      {imageUrl ? (
        <div className="recap-carousel__card-img-wrap">
          <img src={imageUrl} alt="" className="recap-carousel__card-img" />
          <div className="recap-carousel__card-img-overlay" />
        </div>
      ) : (
        <div
          className="recap-carousel__card-placeholder"
          style={{ background: `${palette.accent}10` }}
        >
          {moodEmoji ? (
            <span className="text-3xl">{moodEmoji}</span>
          ) : (
            <Camera size={24} style={{ color: palette.muted, opacity: 0.4 }} />
          )}
        </div>
      )}

      <div className="recap-carousel__card-meta">
        <div className="recap-carousel__card-top">
          {moodEmoji && <span className="recap-carousel__card-mood">{moodEmoji}</span>}
          <span className="recap-carousel__card-day" style={{ color: palette.muted }}>
            {memory.dayLabel}
          </span>
          {memory.hasAudio && <Mic size={10} style={{ color: palette.accent }} />}
        </div>
        <p className="recap-carousel__card-text" style={{ color: palette.textOnBase }}>
          {memory.text.slice(0, 60)}{memory.text.length > 60 ? '…' : ''}
        </p>
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
