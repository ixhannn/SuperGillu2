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
    if (node) {
      // init() wires the global listeners once and ignores the node thereafter;
      // setContainer keeps the engine's container reference fresh if this shell
      // ever remounts (ErrorBoundary reset / Suspense swap). Without it the engine
      // would keep animating a detached node and transitions silently no-op.
      TransitionEngine.init(node);
      TransitionEngine.setContainer(node);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      data-transition-shell="true"
      className="w-full min-h-full"
      style={{
        contain:   'paint',
        isolation: 'isolate',
      }}
    >
      {children}
    </div>
  );
};
