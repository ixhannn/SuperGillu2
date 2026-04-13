import React, { useRef, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import { attachPress } from '../utils/gesture';

interface MagneticButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

/**
 * MagneticButton — press-feedback button wrapper.
 *
 * Press: immediate scale(0.94) on pointerdown, spring release with subtle overshoot.
 * Respects prefers-reduced-motion — disabled when true.
 */
export const MagneticButton: React.FC<MagneticButtonProps> = ({
  children,
  className = '',
  onClick,
  ...props
}) => {
  const ref              = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || shouldReduceMotion) return;

    const cleanPress = attachPress(el, {
      pressScale:   0.94,
      pressOpacity: 1,
      spring:       { stiffness: 450, damping: 28, mass: 0.5 },
    });

    return () => {
      cleanPress();
    };
  }, [shouldReduceMotion]);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`relative cursor-pointer ${className}`}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', userSelect: 'none' }}
      {...props}
    >
      {children}
    </div>
  );
};
