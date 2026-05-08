import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/root-fixes.css';
import './styles/premium-features.css';
import { Haptics } from './services/haptics';
import { initGlobalGestures } from './utils/gesture';
// Boot CSS Animation Bus — registers before any component mounts
import './services/CSSAnimationBus';

// ── GLOBAL TACTILE INTERCEPTOR ──
// Fire a single light haptic on intentional taps only. The previous
// implementation fired on `pointerdown`, which triggered every time a finger
// touched a button — including when the user was just placing their finger
// before scrolling. We now defer the haptic until pointerup AND only fire if
// the pointer didn't move meaningfully (= it's a tap, not a scroll/glide).
if (typeof document !== 'undefined') {
  const TAP_MOVE_THRESHOLD = 10; // px — beyond this, treat as scroll, no haptic
  const TAP_TIME_THRESHOLD = 500; // ms — beyond this, treat as long-press, no tap haptic

  let pressedEl: HTMLElement | null = null;
  let downX = 0;
  let downY = 0;
  let downTime = 0;
  let scrolled = false;

  const clearPressed = () => {
    if (!pressedEl) return;
    delete pressedEl.dataset.pressing;
    pressedEl = null;
    scrolled = false;
  };

  document.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    const interactive = target.closest('.spring-press, button, a, [role="button"]') as HTMLElement | null;
    if (!interactive) return;
    if (interactive.hasAttribute('disabled') || interactive.getAttribute('aria-disabled') === 'true') return;

    clearPressed();
    interactive.dataset.pressing = 'true';
    pressedEl = interactive;
    downX = e.clientX;
    downY = e.clientY;
    downTime = performance.now();
    scrolled = false;
  }, { passive: true });

  document.addEventListener('pointermove', (e) => {
    if (!pressedEl || scrolled) return;
    if (Math.abs(e.clientX - downX) > TAP_MOVE_THRESHOLD ||
        Math.abs(e.clientY - downY) > TAP_MOVE_THRESHOLD) {
      scrolled = true;
      // Cancel the pressed visual state too — the user is scrolling.
      delete pressedEl.dataset.pressing;
    }
  }, { passive: true });

  window.addEventListener('pointerup', () => {
    if (pressedEl && !scrolled && performance.now() - downTime < TAP_TIME_THRESHOLD) {
      Haptics.tap();
    }
    clearPressed();
  }, { passive: true });

  window.addEventListener('pointercancel', clearPressed, { passive: true });
  window.addEventListener('blur', clearPressed);

  // Boot the gesture system: [data-press] delegation + CSS injection
  initGlobalGestures();
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (import.meta.env.DEV) {
      // Avoid stale bundles in local dev from previously registered workers.
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      return;
    }

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;

        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            // New worker is ready; reload once so the new assets apply immediately.
            window.location.reload();
          }
        });
      });
    }).catch((err) => {
      console.log('SW registration failed: ', err);
    });
  });
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
