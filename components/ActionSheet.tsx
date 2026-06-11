import React from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Haptics } from '../services/haptics';

/**
 * ActionSheet — native-style bottom action sheet.
 *
 * Slides up from the bottom edge, dismisses via drag-down fling, backdrop
 * tap, or hardware back — the same physical contract as Android/iOS system
 * sheets. Keep items short (2–4): this is for contextual actions, not forms.
 */

export interface ActionSheetItem {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  destructive?: boolean;
  onSelect: () => void;
}

interface ActionSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  items: ActionSheetItem[];
}

export const ActionSheet: React.FC<ActionSheetProps> = ({ open, onClose, title, items }) => {
  const y = useMotionValue(0);
  const backdropOpacity = useTransform(y, [0, 180], [1, 0.25]);

  React.useEffect(() => {
    if (!open) return;
    const handleBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    window.addEventListener('lior:hardware-back', handleBack);
    return () => window.removeEventListener('lior:hardware-back', handleBack);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  // Portal OUTSIDE AnimatePresence: a ReactPortal is not a plain element, so
  // AnimatePresence's child tracking silently drops it. Inverting the nesting
  // keeps presence (enter/exit) working on the real element tree.
  return ReactDOM.createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[140] flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ opacity: backdropOpacity, background: 'rgba(20,8,14,0.52)' }}
            className="absolute inset-0"
            data-no-press
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.9 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 500) onClose();
            }}
            style={{ y }}
            className="relative w-full max-w-md rounded-t-[1.8rem] px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2.5"
          >
            <div
              className="absolute inset-0 rounded-t-[1.8rem]"
              style={{
                background: 'linear-gradient(180deg, #fdf6f8 0%, #f8ecf0 100%)',
                border: '1px solid rgba(190,61,114,0.10)',
                boxShadow: '0 -10px 44px rgba(60,18,38,0.22), inset 0 1px 0 rgba(255,255,255,0.85)',
              }}
              aria-hidden
            />
            <div className="relative">
              <div className="flex items-center justify-center pb-2">
                <span aria-hidden className="h-1.5 w-10 rounded-full" style={{ background: 'rgba(122,72,90,0.22)' }} />
              </div>
              {title && (
                <p
                  className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] truncate"
                  style={{ color: 'rgba(122,72,90,0.62)' }}
                >
                  {title}
                </p>
              )}
              <div className="flex flex-col gap-1 pb-1">
                {items.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      Haptics.tap();
                      onClose();
                      // Let the sheet start its exit before heavier work runs.
                      window.setTimeout(item.onSelect, 40);
                    }}
                    className="flex items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: item.destructive ? 'rgba(225,29,72,0.10)' : 'rgba(190,61,114,0.10)',
                        color: item.destructive ? '#be123c' : '#be3d72',
                      }}
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block text-[15px] font-semibold leading-tight"
                        style={{ color: item.destructive ? '#be123c' : 'var(--color-text-primary, #2D1F25)' }}
                      >
                        {item.label}
                      </span>
                      {item.sublabel && (
                        <span className="block pt-0.5 text-[12px]" style={{ color: 'rgba(122,72,90,0.6)' }}>
                          {item.sublabel}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
