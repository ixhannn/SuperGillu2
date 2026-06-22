import { useCallback, useEffect, useRef } from 'react';

/**
 * Plays a muted/looping preview video only while it is on (or near) screen, and
 * pauses it once it scrolls away. Off-screen videos are invisible, so this is a
 * purely invisible optimization: it stops the WebView from decoding and
 * compositing frames the user can't see, which is otherwise a steady CPU/GPU/
 * battery drain while scrolling a feed of autoplaying clips.
 *
 * Returns a callback ref to spread onto a <video> (or framer-motion
 * `motion.video`). Drop the `autoPlay` attribute and let this drive playback.
 *
 * `rootMargin` starts playback slightly BEFORE the element enters the viewport
 * (default 200px) so a clip is already running by the time it is visible — the
 * on-screen result is identical to always-autoplaying. If IntersectionObserver
 * is unavailable the video just plays, so behaviour never regresses.
 */
export const useInViewVideo = (rootMargin = '200px 0px') => {
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setRef = useCallback((node: HTMLVideoElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      // No observer support — keep the old "always plays" behaviour.
      void node.play?.().catch(() => { /* autoplay may be blocked — ignore */ });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void (entry.target as HTMLVideoElement).play?.().catch(() => { /* ignore */ });
          } else {
            (entry.target as HTMLVideoElement).pause?.();
          }
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    observerRef.current = observer;
  }, [rootMargin]);

  useEffect(() => () => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  return setRef;
};
