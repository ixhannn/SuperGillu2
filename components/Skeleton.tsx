import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
  type?: 'text' | 'image' | 'avatar' | 'card' | 'list-item' | 'grid' | 'calendar' | 'countdown';
}

const Shimmer: React.FC = () => (
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
);

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', type = 'text' }) => {
  const baseClass = "bg-gray-200/60 overflow-hidden relative";

  if (type === 'list-item') {
    return (
      <div className={`flex items-center gap-3 p-4 ${className}`}>
        <div className={`${baseClass} w-10 h-10 rounded-full flex-shrink-0`}><Shimmer /></div>
        <div className="flex-1 space-y-2">
          <div className={`${baseClass} h-4 w-3/4 rounded-md`}><Shimmer /></div>
          <div className={`${baseClass} h-3 w-1/2 rounded-md`}><Shimmer /></div>
        </div>
      </div>
    );
  }

  if (type === 'grid') {
    return (
      <div className={`grid grid-cols-2 gap-4 ${className}`}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`${baseClass} aspect-square rounded-2xl`}><Shimmer /></div>
        ))}
      </div>
    );
  }

  if (type === 'calendar') {
    return (
      <div className={`${className}`}>
        <div className={`${baseClass} h-6 w-40 rounded-md mb-4`}><Shimmer /></div>
        <div className="grid grid-cols-7 gap-3">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className={`${baseClass} w-8 h-8 rounded-full mx-auto`}><Shimmer /></div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'countdown') {
    return (
      <div className={`flex flex-col items-center gap-4 py-8 ${className}`}>
        <div className={`${baseClass} h-8 w-48 rounded-lg`}><Shimmer /></div>
        <div className="grid grid-cols-4 gap-3 w-full max-w-xs">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`${baseClass} h-16 rounded-xl`}><Shimmer /></div>
          ))}
        </div>
        <div className={`${baseClass} h-4 w-32 rounded-md`}><Shimmer /></div>
      </div>
    );
  }

  let typeClass = "";
  switch (type) {
    case 'text': typeClass = "h-4 w-3/4 rounded-md"; break;
    case 'avatar': typeClass = "h-10 w-10 rounded-full"; break;
    case 'image': typeClass = "w-full aspect-square rounded-2xl"; break;
    case 'card': typeClass = "w-full h-32 rounded-3xl"; break;
  }

  return (
    <div className={`${baseClass} ${typeClass} ${className}`}>
      <Shimmer />
    </div>
  );
};
