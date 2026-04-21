import React from 'react';
import { motion } from 'framer-motion';
import { RecapHighlight as RecapHighlightData } from '../../types';

interface RecapHighlightProps {
  highlight: RecapHighlightData;
}

export function RecapHighlight({ highlight }: RecapHighlightProps) {
  return (
    <motion.section
      className="recap-highlight"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7 }}
    >
      <span
        className="recap-highlight__marker"
        style={{ backgroundColor: highlight.accentColor }}
      />
      <p className="recap-highlight__label">Moment of the week</p>
      <h2 className="recap-highlight__title">{highlight.title}</h2>
      {highlight.body && highlight.body !== highlight.title && (
        <p className="recap-highlight__body">{highlight.body}</p>
      )}
      {highlight.date && (
        <p className="recap-highlight__date">
          {new Date(highlight.date).toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      )}
    </motion.section>
  );
}
