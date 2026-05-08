import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { useNavigation } from '../App';
import { motion } from 'framer-motion';

interface ViewHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  variant?: 'simple' | 'centered' | 'transparent';
  borderless?: boolean;
  tone?: 'default' | 'romance';
}

/**
 * Returns whether the spacer (and therefore this header instance) is currently
 * visible on screen. Keep-alive shells set `display:none` on inactive views,
 * but the React portal escapes that — so we observe the spacer's own layout
 * to decide whether to render the floating pill. Only the active view's pill
 * is mounted at any time.
 */
const useSpacerVisible = (ref: React.RefObject<HTMLDivElement>) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const compute = () => {
      // offsetParent is null when any ancestor has display:none.
      // Combined with offsetWidth>0 this is a robust visibility probe that
      // works inside keep-alive shells, transitions, and modals alike.
      const isVisible = el.offsetParent !== null && el.offsetWidth > 0;
      setVisible((prev) => (prev === isVisible ? prev : isVisible));
    };

    compute();

    // Watch the keep-alive shell for class flips that toggle display.
    const shell = el.closest('.keep-alive-shell');
    let mo: MutationObserver | null = null;
    if (shell) {
      mo = new MutationObserver(compute);
      mo.observe(shell, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    // Also recompute on resize / orientation changes.
    window.addEventListener('resize', compute);

    // Periodic safety net — covers any state changes the observers miss
    // (transitions, view-transition snapshots, etc.). Cheap: one rAF every ~250ms.
    let raf = 0;
    let lastCheck = 0;
    const tick = (t: number) => {
      if (t - lastCheck > 250) {
        compute();
        lastCheck = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      if (mo) mo.disconnect();
      window.removeEventListener('resize', compute);
      cancelAnimationFrame(raf);
    };
  }, [ref]);

  return visible;
};

export const ViewHeader: React.FC<ViewHeaderProps> = ({
  title,
  subtitle,
  onBack,
  rightSlot,
  variant,
  borderless = false,
}) => {
  const { goBack } = useNavigation();
  const handleBack = onBack ?? goBack;
  const isGhost = borderless || variant === 'transparent';
  const spacerRef = useRef<HTMLDivElement>(null);
  const visible = useSpacerVisible(spacerRef);

  const shell = (
    <div className="vh-shell">
      <motion.header
        className={`vh${isGhost ? ' vh--ghost' : ''}`}
        initial={{ opacity: 0, y: -12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Left — back button */}
        <motion.button
          className="vh-back"
          onClick={(e) => { e.stopPropagation(); handleBack(); }}
          aria-label="Go back"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.06, duration: 0.40, ease: [0.22, 1, 0.36, 1] }}
          whileTap={{ scale: 0.86 }}
        >
          <ArrowLeft size={17} strokeWidth={2.6} />
        </motion.button>

        {/* Center — title + subtitle */}
        <div className="vh-center">
          <motion.h2
            className="vh-title"
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.09, duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
          >
            {title}
          </motion.h2>

          {subtitle && (
            <motion.p
              className="vh-sub"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.40, ease: [0.22, 1, 0.36, 1] }}
            >
              {subtitle}
            </motion.p>
          )}
        </div>

        {/* Right — action slot */}
        <div className="vh-actions">
          {rightSlot ?? (
            <div
              className="vh-back"
              aria-hidden="true"
              style={{ opacity: 0, pointerEvents: 'none' }}
            />
          )}
        </div>
      </motion.header>
    </div>
  );

  return (
    <>
      <div ref={spacerRef} className="vh-spacer" aria-hidden="true" />
      {visible && typeof document !== 'undefined' ? ReactDOM.createPortal(shell, document.body) : null}
    </>
  );
};
