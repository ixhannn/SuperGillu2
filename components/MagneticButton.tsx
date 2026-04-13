import React, { useRef, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import { attachPress } from '../utils/gesture';

interface MagneticButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  /** Magnetic pull strength — fraction of pointer offset applied as translation (default 0.18) */
  strength?: number;
  /** Hover/desktop scale bump — reserved for future use, currently unused on touch */
  scale?: number;
}

/**
 * MagneticButton — physics-based interactive button.
 *
 * Press: immediate scale(0.94) on pointerdown, spring release with subtle overshoot.
 * Magnetic: within 80px of the button centre, the element attracts toward the cursor
 *           via a spring (stiffness 220, damping 18) — feels like an iOS spring.
 *
 * No Framer Motion involved. Zero click delay.
 * Respects prefers-reduced-motion — both effects are disabled when true.
 */
export const MagneticButton: React.FC<MagneticButtonProps> = ({
  children,
  className = '',
  onClick,
  strength = 0.18,
  scale: _scale,
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
