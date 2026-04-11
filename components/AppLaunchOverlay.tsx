import React from 'react';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';

const PARTICLES = [
  { x: '-24%', y: '-18%', delay: 0.08 },
  { x: '20%', y: '-22%', delay: 0.12 },
  { x: '-30%', y: '8%', delay: 0.16 },
  { x: '28%', y: '10%', delay: 0.2 },
  { x: '-16%', y: '26%', delay: 0.24 },
  { x: '14%', y: '28%', delay: 0.28 },
];

export const AppLaunchOverlay: React.FC = () => {
  return (
    <motion.div
      className="fixed inset-0 z-[250] overflow-hidden flex items-center justify-center px-8"
      style={{ background: 'var(--theme-bg-main)', color: 'var(--color-text-primary)' }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
        scale: 1.02,
        transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'var(--theme-vignette)',
          opacity: 0.95,
        }}
      />

      <motion.div
        className="absolute inset-0"
        animate={{ opacity: [0.38, 0.58, 0.42] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div
          className="absolute top-[18%] left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl"
          style={{ background: 'var(--theme-orb-1)' }}
        />
        <div
          className="absolute bottom-[16%] left-[22%] w-56 h-56 rounded-full blur-3xl"
          style={{ background: 'var(--theme-orb-2)' }}
        />
        <div
          className="absolute bottom-[12%] right-[18%] w-52 h-52 rounded-full blur-3xl"
          style={{ background: 'var(--theme-orb-3)' }}
        />
      </motion.div>

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="relative">
          {PARTICLES.map((particle, index) => (
            <motion.span
              key={index}
              className="absolute left-1/2 top-1/2 w-2.5 h-2.5 rounded-full"
              style={{
                background: 'rgba(var(--theme-particle-2-rgb), 0.9)',
                boxShadow: '0 0 20px rgba(var(--theme-particle-2-rgb), 0.28)',
              }}
              initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
              animate={{
                opacity: [0, 0.95, 0],
                scale: [0, 1.15, 0.35],
                x: [0, particle.x],
                y: [0, particle.y],
              }}
              transition={{
                duration: 1.25,
                delay: particle.delay,
                repeat: Infinity,
                repeatDelay: 1.4,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          ))}

          <motion.div
            className="absolute inset-0 rounded-[2rem]"
            style={{
              background: 'radial-gradient(circle, rgba(var(--theme-particle-2-rgb),0.28) 0%, transparent 65%)',
              filter: 'blur(14px)',
            }}
            animate={{ scale: [0.88, 1.12, 0.96], opacity: [0.45, 0.8, 0.55] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.div
            className="relative w-28 h-28 rounded-[2rem] liquid-glass flex items-center justify-center overflow-hidden"
            initial={{ scale: 0.78, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.34), transparent 55%)',
              }}
              animate={{ opacity: [0.35, 0.7, 0.4] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              initial={{ scale: 0.3, opacity: 0, rotate: -18 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ delay: 0.12, type: 'spring', stiffness: 280, damping: 18 }}
            >
              <Heart
                size={40}
                fill="currentColor"
                style={{ color: 'var(--color-nav-active)' }}
              />
            </motion.div>
          </motion.div>
        </div>

        <div className="mt-8 flex items-center gap-1.5 overflow-hidden">
          {'LIOR'.split('').map((letter, index) => (
            <motion.span
              key={letter + index}
              className="font-serif text-[1.85rem] tracking-[0.34em]"
              initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{
                delay: 0.18 + index * 0.05,
                duration: 0.55,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {letter}
            </motion.span>
          ))}
        </div>

        <motion.p
          className="mt-4 text-[0.72rem] font-semibold uppercase tracking-[0.26em]"
          style={{ color: 'var(--color-text-secondary)' }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          Hold close. Everything is ready.
        </motion.p>
      </div>
    </motion.div>
  );
};
