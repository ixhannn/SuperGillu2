import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Info, AlertCircle, BellRing, Heart } from 'lucide-react';
import { toast, ToastMessage } from '../utils/toast';
import { feedback } from '../utils/feedback';

export const DynamicToast: React.FC = () => {
  const [currentToast, setCurrentToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    const unsubscribe = toast.subscribe((newToast) => {
      setCurrentToast(newToast);
      if (newToast) {
        // Trigger haptics and audio on new toast
        if (newToast.type === 'success' || newToast.type === 'heart') {
          feedback.celebrate();
        } else if (newToast.type === 'error') {
          feedback.error();
        } else {
          feedback.interact(); // light pop for info
        }
      }
    });
    return unsubscribe;
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 size={18} className="text-green-500" />;
      case 'error': return <AlertCircle size={18} className="text-red-500" />;
      case 'bell': return <BellRing size={18} className="text-blue-500" />;
      case 'heart': return <Heart size={18} className="text-lior-500 fill-lior-500" />;
      case 'info':
      default: return <Info size={18} className="text-gray-500" />;
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex justify-center pointer-events-none px-4 pt-safe sm:pt-4">
      <AnimatePresence mode="wait">
        {currentToast && (
          <motion.div
            key={currentToast.id}
            initial={{ y: -44, scale: 0.92, opacity: 0, filter: 'blur(6px)' }}
            animate={{ 
              y: 12, 
              scale: 1, 
              opacity: 1, 
              filter: 'blur(0px)',
              transition: { type: 'spring', damping: 20, stiffness: 280 }
            }}
            exit={{ 
              y: -40, 
              scale: 0.9, 
              opacity: 0, 
              filter: 'blur(4px)',
              transition: { duration: 0.2 }
            }}
            className="pointer-events-auto flex items-center gap-3 glass-card backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.12)] px-4 py-3 rounded-full"
          >
            {/* Dynamic shape expansion animation */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.05, stiffness: 500, damping: 25 }}
            >
              {getIcon(currentToast.type)}
            </motion.div>
            
            <motion.span
              className="text-sm font-medium pr-1 truncate max-w-[200px]"
              style={{ color: 'var(--color-text-primary)' }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ delay: 0.04, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {currentToast.message}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
