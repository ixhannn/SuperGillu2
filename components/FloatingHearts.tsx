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
    const items: Particle[] = Array.from({ length: 12 }).map((_, i) => {
      const layer = i < 4 ? 'slow' : i < 8 ? 'medium' : 'fast';
      const baseDuration = layer === 'slow' ? 14 : layer === 'medium' ? 10 : 7;

      return {
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 8,
        size: layer === 'slow'
          ? Math.random() * 6 + 8
          : layer === 'medium'
            ? Math.random() * 8 + 12
            : Math.random() * 10 + 16,
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        duration: baseDuration + Math.random() * 4,
        driftX: (Math.random() - 0.5) * 60,
        driftRotate: Math.random() * 360,
        opacity: layer === 'slow' ? 0.25 : layer === 'medium' ? 0.4 : 0.55,
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