/**
 * TiltCard — Simple press-feedback card wrapper for mobile.
 * Desktop 3D tilt/glare removed — this is a mobile-only app.
 */

import React from 'react';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  maxTilt?: number;
  glare?: boolean;
  scale?: number;
  onClick?: () => void;
  'data-coachmark'?: string;
}

export const TiltCard: React.FC<TiltCardProps> = ({
  children,
  className = '',
  style = {},
  onClick,
  'data-coachmark': dataCoachmark,
}) => (
  <div
    className={`relative spring-press ${className}`}
    style={style}
    onClick={onClick}
    {...(dataCoachmark ? { 'data-coachmark': dataCoachmark } : {})}
  >
    {children}
  </div>
);
