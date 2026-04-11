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
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{
          opacity: loading ? 1 : 0,
          scale: loading ? 1 : 1.015,
        }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        style={{ pointerEvents: loading ? 'auto' : 'none' }}
      >
        {skeleton}
      </motion.div>

      <motion.div
        className="relative h-full"
        initial={false}
        animate={{
          opacity: loading ? 0 : 1,
          scale: loading ? 0.985 : 1,
          filter: loading ? 'blur(6px)' : 'blur(0px)',
        }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
};
