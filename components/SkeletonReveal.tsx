import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonRevealProps {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const SkeletonReveal: React.FC<SkeletonRevealProps> = ({
  loading,
  skeleton,
  children,
  className = '',
}) => {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Unified 240ms silk crossfade (matches --lior-motion-tab). The two
          layers fade through each other at one tempo instead of the old
          350/420ms staggered pair, so content arrives in the app's rhythm.
          Animated `filter: blur` removed — it's an expensive per-frame
          compositor op on mid-range Android for little perceptual gain. */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{
          opacity: loading ? 1 : 0,
          scale: loading ? 1 : 1.01,
        }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        style={{ pointerEvents: loading ? 'auto' : 'none' }}
      >
        {skeleton}
      </motion.div>

      <motion.div
        className="relative h-full"
        initial={false}
        animate={{
          opacity: loading ? 0 : 1,
          scale: loading ? 0.99 : 1,
        }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
};
