import React, { useCallback } from 'react';
import { ViewState, TransitionDirection } from '../types';
import { TransitionEngine } from '../utils/TransitionEngine';

interface ViewTransitionProps {
  viewKey: ViewState;
  transitionDirection?: TransitionDirection;
  children: React.ReactNode;
}

export const ViewTransition: React.FC<ViewTransitionProps> = ({ children }) => {
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) TransitionEngine.init(node);
  }, []);

  return (
    <div
      ref={containerRef}
      data-transition-shell="true"
      className="w-full min-h-full"
      style={{
        contain:            'paint',
        isolation:          'isolate',
        backfaceVisibility: 'hidden',
        transform:          'translateZ(0)',
      }}
    >
      {children}
    </div>
  );
};
