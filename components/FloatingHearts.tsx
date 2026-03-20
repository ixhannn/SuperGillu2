import React, { useEffect, useState } from 'react';

type Particle = {
  id: number;
  left: number;
  delay: number;
  size: number;
  shape: string;
  duration: number;
  driftX: number;
  driftRotate: number;
  opacity: number;
  layer: 'slow' | 'medium' | 'fast';
};

const SHAPES = ['❤', '✦', '★', '·', '♡', '✧'];

export const FloatingHearts = () => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const items: Particle[] = Array.from({ length: 18 }).map((_, i) => {
      const layer = i < 6 ? 'slow' : i < 12 ? 'medium' : 'fast';
      const baseDuration = layer === 'slow' ? 16 : layer === 'medium' ? 11 : 8;

      return {
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 10,
        size: layer === 'slow'
          ? Math.random() * 8 + 10
          : layer === 'medium'
            ? Math.random() * 10 + 14
            : Math.random() * 12 + 18,
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        duration: baseDuration + Math.random() * 4,
        driftX: (Math.random() - 0.5) * 80,
        driftRotate: Math.random() * 360,
        opacity: layer === 'slow' ? 0.35 : layer === 'medium' ? 0.55 : 0.7,
        layer,
      };
    });
    setParticles(items);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {particles.map(p => (
        <div
          key={p.id}
          className={`absolute bottom-[-20px] will-change-transform animate-drift ${p.layer === 'slow' ? 'text-tulika-100' :
              p.layer === 'medium' ? 'text-tulika-200' : 'text-tulika-300'
            }`}
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            fontSize: `${p.size}px`,
            opacity: 0,
            '--drift-duration': `${p.duration}s`,
            '--drift-x': `${p.driftX}px`,
            '--drift-rotate': `${p.driftRotate}deg`,
            '--particle-opacity': `${p.opacity}`,
            '--particle-scale': p.layer === 'fast' ? '1' : p.layer === 'medium' ? '0.85' : '0.7',
          } as React.CSSProperties}
        >
          {p.shape}
        </div>
      ))}
    </div>
  );
};