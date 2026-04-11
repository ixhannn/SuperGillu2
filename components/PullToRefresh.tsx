import React, { useState, useRef, useEffect } from 'react';
import { motion, useAnimation, useSpring } from 'framer-motion';
import { Heart } from 'lucide-react';
import { feedback } from '../utils/feedback';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  
  const pullHeight = useSpring(0, { stiffness: 300, damping: 30, mass: 0.5 });
  const maxPull = 120;
  const threshold = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current?.scrollTop === 0 && !isRefreshing) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;
    
    // Only pull down
    if (delta > 0) {
      // Add resistance
      const resistance = delta * 0.4;
      const finalPull = Math.min(resistance, maxPull);
      pullHeight.set(finalPull);
      
      // Haptic tick when passing threshold
      if (finalPull >= threshold && pullHeight.get() < threshold) {
        feedback.light();
      }
      
      // Prevent native scroll chaining
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    setIsPulling(false);
    
    if (pullHeight.get() >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      pullHeight.set(50); // Hold at spinner height
      feedback.tap();
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        pullHeight.set(0);
        feedback.success();
      }
    } else {
      pullHeight.set(0);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full overflow-y-auto no-scrollbar"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <motion.div 
        className="absolute top-0 left-0 right-0 flex justify-center items-end pb-4 overflow-hidden pointer-events-none"
        style={{ height: pullHeight, zIndex: 0 }}
      >
        <motion.div
            animate={{ 
                rotate: isRefreshing ? 360 : 0,
                scale: isRefreshing ? [1, 1.2, 1] : 1
            }}
            transition={{ 
                rotate: { repeat: Infinity, duration: 1, ease: 'linear' },
                scale: { repeat: Infinity, duration: 1 }
            }}
        >
          <Heart 
            size={24} 
            className="text-lior-500 drop-shadow-md" 
            fill={isRefreshing ? "currentColor" : "none"} 
            strokeWidth={isRefreshing ? 0 : 2.5}
          />
        </motion.div>
      </motion.div>

      {/* Content wrapper pushed down by spring */}
      <motion.div 
        style={{ y: pullHeight, zIndex: 10 }}
        className="min-h-full relative"
      >
        {children}
      </motion.div>
    </div>
  );
};
