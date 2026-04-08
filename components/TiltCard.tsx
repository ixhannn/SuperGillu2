/**
 * TiltCard — Interactive 3D perspective card that responds to
 * pointer movement and device gyroscope for a real depth effect.
 * Includes glare overlay and shadow depth.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  maxTilt?: number;
  glare?: boolean;
  scale?: number;
  onClick?: () => void;
}

export const TiltCard: React.FC<TiltCardProps> = ({
  children,
  className = '',
  style = {},
  maxTilt = 15,
  glare = true,
  scale = 1.02,
  onClick,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const orientRafRef = useRef<number>(0);
  const [isHovered, setIsHovered] = useState(false);

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);

  const springConfig = { stiffness: 300, damping: 25, mass: 0.5 };
  const springRotateX = useSpring(rotateX, springConfig);
  const springRotateY = useSpring(rotateY, springConfig);

  const shadowX = useTransform(springRotateY, [-maxTilt, maxTilt], [15, -15]);
  const shadowY = useTransform(springRotateX, [-maxTilt, maxTilt], [-10, 20]);
  const shadowBlur = useTransform(
    [springRotateX, springRotateY],
    ([rx, ry]: number[]) => {
      const tilt = Math.sqrt(rx * rx + ry * ry);
      return 20 + tilt * 1.5;
    }
  );

  const handlePointerEnterCapture = useCallback(() => {
    // Only capture on devices that support true hover
    if (!window.matchMedia('(any-hover: hover)').matches) return;
    if (cardRef.current) rectRef.current = cardRef.current.getBoundingClientRect();
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!window.matchMedia('(any-hover: hover)').matches) return;
    const rect = rectRef.current;
    if (!rect) return;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const pctX = (e.clientX - centerX) / (rect.width / 2);
    const pctY = (e.clientY - centerY) / (rect.height / 2);

    rotateX.set(-pctY * maxTilt);
    rotateY.set(pctX * maxTilt);
    glareX.set(((e.clientX - rect.left) / rect.width) * 100);
    glareY.set(((e.clientY - rect.top) / rect.height) * 100);
  }, [maxTilt, rotateX, rotateY, glareX, glareY]);

  const handlePointerLeave = useCallback(() => {
    if (!window.matchMedia('(any-hover: hover)').matches) return;
    rotateX.set(0);
    rotateY.set(0);
    glareX.set(50);
    glareY.set(50);
    setIsHovered(false);
  }, [rotateX, rotateY, glareX, glareY]);

  // Device orientation (gyroscope) for mobile — RAF-throttled + tier-checked
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      // Skip expensive orientation updates if device is struggling
      if (typeof document !== 'undefined' && document.documentElement.dataset.tier === 'low') return;
      if (e.beta === null || e.gamma === null) return;
      
      cancelAnimationFrame(orientRafRef.current);
      orientRafRef.current = requestAnimationFrame(() => {
        const tiltX = Math.max(-maxTilt, Math.min(maxTilt, (e.beta! - 45) * 0.3));
        const tiltY = Math.max(-maxTilt, Math.min(maxTilt, e.gamma! * 0.3));
        rotateX.set(-tiltX);
        rotateY.set(tiltY);
      });
    };

    if (typeof DeviceOrientationEvent !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches) {
      window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      cancelAnimationFrame(orientRafRef.current);
    };
  }, [maxTilt, rotateX, rotateY]);

  return (
    <motion.div
      ref={cardRef}
      className={`relative ${className}`}
      style={{
        ...style,
        transformStyle: 'preserve-3d',
        perspective: '1000px',
        rotateX: springRotateX,
        rotateY: springRotateY,
      }}
      whileHover={{ scale }}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => { handlePointerEnterCapture(); setIsHovered(true); }}
      onPointerLeave={handlePointerLeave}
      onClick={onClick}
    >
      {/* Dynamic shadow layer */}
      <motion.div
        className="absolute inset-0 rounded-[inherit] pointer-events-none z-0"
        style={{
          x: shadowX,
          y: shadowY,
          filter: useTransform(shadowBlur, (b) => `blur(${b}px)`),
          background: 'rgba(251, 207, 232, 0.10)',
          opacity: isHovered ? 0.8 : 0.3,
          transition: 'opacity 0.3s',
        }}
      />

      {/* Content */}
      <div className="relative z-10" style={{ transform: 'translateZ(20px)', transformStyle: 'preserve-3d' }}>
        {children}
      </div>

      {/* Glare overlay */}
      {glare && (
        <motion.div
          className="absolute inset-0 rounded-[inherit] pointer-events-none z-20 overflow-hidden"
          style={{
            opacity: isHovered ? 0.25 : 0,
            transition: 'opacity 0.3s',
            background: useTransform(
              [glareX, glareY],
              ([gx, gy]: number[]) =>
                `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.6) 0%, transparent 60%)`
            ),
          }}
        />
      )}

      {/* Inner glow edge */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none z-10"
        style={{
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 0 rgba(0,0,0,0.05)',
        }}
      />
    </motion.div>
  );
};
