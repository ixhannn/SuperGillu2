import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, Mic } from 'lucide-react';
import { RecapMemoryRef, RecapPalette } from '../../types';
import { StorageService } from '../../services/storage';

interface RecapHeadlineProps {
  memory: RecapMemoryRef;
  palette: RecapPalette;
}

export function RecapHeadline({ memory, palette }: RecapHeadlineProps) {
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
      className="recap-headline"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {imageUrl ? (
        <div className="recap-headline__hero">
          <img
            src={imageUrl}
            alt={memory.text.slice(0, 60)}
            className="recap-headline__image"
          />
          <div className="recap-headline__overlay" />
          <div className="recap-headline__content recap-headline__content--over-image">
            {moodEmoji && (
              <motion.span
                className="recap-headline__emoji"
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ type: 'spring', delay: 0.3 }}
              >
                {moodEmoji}
              </motion.span>
            )}
            <p className="recap-headline__day">{memory.dayLabel}</p>
            <h2 className="recap-headline__text recap-headline__text--light">
              {memory.text.split('.')[0].slice(0, 100) || 'A beautiful moment'}
            </h2>
            <p className="recap-headline__date" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {dateStr}
            </p>
            <div className="recap-headline__badges">
              {memory.hasImage && <Camera size={12} />}
              {memory.hasAudio && <Mic size={12} />}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="recap-headline__text-hero"
          style={{
            background: `linear-gradient(135deg, ${palette.accent}18, ${palette.base})`,
            borderColor: `${palette.accent}30`,
          }}
        >
          {moodEmoji && (
            <motion.span
              className="recap-headline__emoji recap-headline__emoji--large"
              initial={{ scale: 0, rotate: -20 }}
              whileInView={{ scale: 1, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', delay: 0.2 }}
            >
              {moodEmoji}
            </motion.span>
          )}
          <p className="recap-headline__day" style={{ color: palette.muted }}>
            {memory.dayLabel}
          </p>
          <h2 className="recap-headline__text" style={{ color: palette.textOnBase }}>
            {memory.text.split('.')[0].slice(0, 100) || 'A quiet moment'}
          </h2>
          <p className="recap-headline__date" style={{ color: palette.muted }}>
            {dateStr}
          </p>
        </div>
      )}

      <p className="recap-headline__label" style={{ color: palette.muted }}>
        ✦ Headline Moment
      </p>
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
