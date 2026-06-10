import React from 'react';
import { motion } from 'framer-motion';
import { MicOff, VideoOff, RefreshCw, X } from 'lucide-react';
import { describeMediaFailure, MediaFailureReason, MediaKind } from '../utils/mediaPermissions';
import { feedback } from '../utils/feedback';

interface PermissionBannerProps {
  kind: MediaKind;
  reason: MediaFailureReason;
  onRetry: () => void;
  onDismiss?: () => void;
  /** Visual context: 'light' for normal views, 'dark' for camera/recording overlays. */
  tone?: 'light' | 'dark';
  className?: string;
}

/**
 * Inline banner shown when mic/camera access fails. Explains what went
 * wrong in plain language and always offers a retry path — permission
 * failures should never dead-end in a toast.
 */
export const PermissionBanner: React.FC<PermissionBannerProps> = ({
  kind,
  reason,
  onRetry,
  onDismiss,
  tone = 'light',
  className = '',
}) => {
  const copy = describeMediaFailure(reason, kind);
  const Icon = kind === 'microphone' ? MicOff : VideoOff;
  const dark = tone === 'dark';

  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={`relative rounded-2xl p-4 ${className}`}
      style={dark ? {
        background: 'rgba(20, 14, 18, 0.82)',
        border: '1px solid rgba(255,255,255,0.14)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      } : {
        background: 'rgba(254, 243, 242, 0.92)',
        border: '1px solid rgba(217, 119, 87, 0.18)',
      }}
    >
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ color: dark ? 'rgba(255,255,255,0.65)' : 'rgba(120, 70, 60, 0.65)' }}
        >
          <X size={16} />
        </button>
      )}

      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={dark ? {
            background: 'rgba(255,255,255,0.1)',
            color: '#f8b4ab',
          } : {
            background: 'rgba(217, 119, 87, 0.12)',
            color: '#c2554a',
          }}
        >
          <Icon size={19} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1 pr-6">
          <p
            className="text-[0.92rem] font-bold leading-snug"
            style={{ color: dark ? 'rgba(255,255,255,0.95)' : '#7a3a32' }}
          >
            {copy.title}
          </p>
          <p
            className="mt-1 text-[0.8rem] leading-5"
            style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(122, 58, 50, 0.78)' }}
          >
            {copy.hint}
          </p>
        </div>
      </div>

      <button
        onClick={() => {
          feedback.tap();
          onRetry();
        }}
        className="mt-3 flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl text-[0.85rem] font-bold active:scale-[0.98] transition-transform"
        style={dark ? {
          background: 'rgba(255,255,255,0.92)',
          color: '#3c2630',
        } : {
          background: '#c2554a',
          color: '#ffffff',
        }}
      >
        <RefreshCw size={15} strokeWidth={2.4} />
        Try again
      </button>
    </motion.div>
  );
};
