import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { feedback } from '../utils/feedback';

interface MediaErrorCardProps {
  title: string;
  detail?: string;
  onRetry: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Inline error card for failed uploads/processing. Unlike a toast it
 * stays visible until resolved and keeps the user's work recoverable
 * with an explicit retry.
 */
export const MediaErrorCard: React.FC<MediaErrorCardProps> = ({
  title,
  detail,
  onRetry,
  retryLabel = 'Try again',
  onDismiss,
  className = '',
}) => (
  <motion.div
    role="alert"
    initial={{ opacity: 0, y: 8, scale: 0.99 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 6, scale: 0.99 }}
    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    className={`rounded-2xl p-4 ${className}`}
    style={{
      background: 'rgba(254, 242, 242, 0.94)',
      border: '1px solid rgba(220, 38, 38, 0.14)',
    }}
  >
    <div className="flex items-start gap-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: 'rgba(220, 38, 38, 0.1)', color: '#b91c1c' }}
      >
        <AlertCircle size={18} strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[0.88rem] font-bold leading-snug" style={{ color: '#7f1d1d' }}>
          {title}
        </p>
        {detail && (
          <p className="mt-0.5 text-[0.78rem] leading-5" style={{ color: 'rgba(127, 29, 29, 0.72)' }}>
            {detail}
          </p>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ color: 'rgba(127, 29, 29, 0.55)' }}
        >
          <X size={16} />
        </button>
      )}
    </div>
    <button
      onClick={() => {
        feedback.tap();
        onRetry();
      }}
      className="mt-3 flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl text-[0.85rem] font-bold text-white active:scale-[0.98] transition-transform"
      style={{ background: '#dc2626' }}
    >
      <RefreshCw size={15} strokeWidth={2.4} />
      {retryLabel}
    </button>
  </motion.div>
);
