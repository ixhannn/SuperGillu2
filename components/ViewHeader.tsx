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
    const shell = el.closest('.keep-alive-shell');

    const compute = () => {
      // Visibility is derived from the DELIBERATE is-cached/aria-hidden state of
      // the owning keep-alive shell — NOT from offsetWidth/offsetParent. Those read
      // transient zero values while the TransitionEngine writes inline
      // transform/opacity to the shell mid-navigation, which made `visible` flip
      // false for a frame and unmounted+replayed the whole header on every nav
      // ("the header disappears and reappears when leaving a page"). The class is
      // set exactly once per navigation, so it never flickers. (It also stays
      // correct now that cached shells are warm `visibility:hidden` rather than
      // `display:none`, where an offsetWidth check would wrongly read "visible".)
      const isCachedTab = !!shell
        && (shell.classList.contains('is-cached') || shell.getAttribute('aria-hidden') === 'true');
      const isVisible = shell ? !isCachedTab : true;
      setVisible((prev) => (prev === isVisible ? prev : isVisible));
    };

    compute();

    let observer: MutationObserver | null = null;
    if (shell) {
      // Observe ONLY `class` (the real active/cached signal) — never `style`, which
      // the transition engine rewrites transiently and which caused the false flips.
      observer = new MutationObserver(compute);
      observer.observe(shell, { attributes: true, attributeFilter: ['class'] });
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') compute();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      observer?.disconnect();
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
      {typeof document !== 'undefined'
        ? ReactDOM.createPortal(
            // Portal stays MOUNTED across navigation; we only toggle CSS
            // visibility. Previously this was `{visible && portal}`, so a
            // transient `visible=false` during a transition unmounted the header
            // and replayed its entrance animation on arrival = the header
            // blinking out/in on every nav. Keeping it mounted means the entrance
            // plays once (on first mount) and nav is a pure show/hide.
            <div
              style={{
                visibility: visible ? 'visible' : 'hidden',
                pointerEvents: visible ? undefined : 'none',
              }}
              aria-hidden={visible ? undefined : true}
            >
              {shell}
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
