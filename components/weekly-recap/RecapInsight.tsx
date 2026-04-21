import React from 'react';
import { motion } from 'framer-motion';

interface RecapInsightProps {
  text: string;
  label: string;
  variant: 'paragraph' | 'prompt';
}

export function RecapInsight({ text, label, variant }: RecapInsightProps) {
  return (
    <motion.section
      className={`recap-insight recap-insight--${variant}`}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.7 }}
    >
      <p className="recap-insight__label">{label}</p>
      <p className="recap-insight__text">{text}</p>
    </motion.section>
  );
}
