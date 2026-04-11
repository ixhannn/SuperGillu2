import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { Haptics } from './services/haptics';
import { initGlobalGestures } from './utils/gesture';
// Boot CSS Animation Bus — registers before any component mounts
import './services/CSSAnimationBus';

// ── GLOBAL TACTILE INTERCEPTOR ──
// Fire a lightweight native haptic impact the EXACT millisecond an interactive
// element is touched. This entirely bypasses React's synthetic event delay and
// the 100ms+ delay of waiting for an `onClick` (which fires on release).
if (typeof document !== 'undefined') {
  let pressedEl: HTMLElement | null = null;
  const clearPressed = () => {
    if (!pressedEl) return;
    delete pressedEl.dataset.pressing;
    pressedEl = null;
  };

  document.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    // Walk up the tree to see if we hit an interactive element
    const interactive = target.closest('.spring-press, button, a, [role="button"]') as HTMLElement | null;
    if (interactive) {
      if (!interactive.hasAttribute('disabled') && interactive.getAttribute('aria-disabled') !== 'true') {
        clearPressed();
        interactive.dataset.pressing = 'true';
        pressedEl = interactive;
      }
      Haptics.tap();
    }
  }, { passive: true });

  window.addEventListener('pointerup', clearPressed, { passive: true });
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
