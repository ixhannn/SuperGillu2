import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { useNavigationActions } from '../App';
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

const useSpacerVisible = (ref: React.RefObject<HTMLDivElement | null>) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const compute = () => {
      const shell = el.closest('.keep-alive-shell');
      const isCachedTab = shell?.classList.contains('is-cached') || shell?.getAttribute('aria-hidden') === 'true';
      const isVisible = !isCachedTab && el.offsetParent !== null && el.offsetWidth > 0;
      setVisible((prev) => (prev === isVisible ? prev : isVisible));
    };

    compute();

    const shell = el.closest('.keep-alive-shell');
    let observer: MutationObserver | null = null;
    if (shell) {
      observer = new MutationObserver(compute);
      observer.observe(shell, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(compute);
      resizeObserver.observe(el);
      if (shell instanceof HTMLElement) resizeObserver.observe(shell);
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') compute();
    };

    window.addEventListener('resize', compute);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', compute);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
  const { goBack } = useNavigationActions();
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
