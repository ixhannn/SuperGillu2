import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
  type?: 'text' | 'image' | 'avatar' | 'card';
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', type = 'text' }) => {
  const baseClass = "bg-gray-200/60 overflow-hidden relative";
  
  let typeClass = "";
  switch (type) {
    case 'text': typeClass = "h-4 w-3/4 rounded-md"; break;
    case 'avatar': typeClass = "h-10 w-10 rounded-full"; break;
    case 'image': typeClass = "w-full aspect-square rounded-2xl"; break;
    case 'card': typeClass = "w-full h-32 rounded-3xl"; break;
  }

  return (
    <div className={`${baseClass} ${typeClass} ${className}`}>
      {/* Shimmer effect */}
      <motion.div
        className="absolute inset-0 -translate-x-full"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
        }}
        animate={{
          translateX: ['-100%', '200%']
        }}
        transition={{
          repeat: Infinity,
          duration: 1.5,
          ease: 'linear'
        }}
      />
    </div>
  );
};
