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
      case 'heart': return <Heart size={18} className="text-tulika-500 fill-tulika-500" />;
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
            initial={{ y: -50, scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
            animate={{ 
              y: 12, 
              scale: 1, 
              opacity: 1, 
              filter: 'blur(0px)',
              transition: { type: 'spring', damping: 18, stiffness: 200 }
            }}
            exit={{ 
              y: -40, 
              scale: 0.9, 
              opacity: 0, 
              filter: 'blur(4px)',
              transition: { duration: 0.2 }
            }}
            className="pointer-events-auto flex items-center gap-3 bg-white/80 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.12)] px-4 py-3 rounded-full"
          >
            {/* Dynamic shape expansion animation */}
            <motion.div
              layoutId="toast-icon"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.1 }}
            >
              {getIcon(currentToast.type)}
            </motion.div>
            
            <motion.span 
              layoutId="toast-text"
              className="text-sm font-medium text-gray-800 pr-1 truncate max-w-[200px]"
            >
              {currentToast.message}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
