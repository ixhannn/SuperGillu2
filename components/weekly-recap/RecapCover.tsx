import React from 'react';
import { motion } from 'framer-motion';
import { RecapPalette } from '../../types';

interface RecapCoverProps {
  headline: string;
  dateRange: string;
  names: [string, string];
  palette: RecapPalette;
}

export function RecapCover({ headline, dateRange, names, palette }: RecapCoverProps) {
  return (
    <section
      className="recap-cover"
      style={{ background: palette.base, color: palette.textOnBase }}
    >
      <div
        className="recap-cover__vignette"
        style={{ background: palette.vignette }}
        aria-hidden
      />
      <motion.p
        className="recap-cover__eyebrow"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ color: palette.muted }}
      >
        Week of {dateRange}
      </motion.p>
      <motion.h1
        className="recap-cover__headline"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
      >
        {headline}
      </motion.h1>
      <motion.p
        className="recap-cover__names"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.35 }}
        style={{ color: palette.muted }}
      >
        {names[0]} &amp; {names[1]}
      </motion.p>
    </section>
  );
}
