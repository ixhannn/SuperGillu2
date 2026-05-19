import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/typography.css';
import './styles/root-fixes.css';
import './styles/premium-features.css';
import './styles/native-polish.css';
import './styles/performance.css';
import { initGlobalGestures } from './utils/gesture';

// ── GLOBAL PRESS STATE ──
// Keep visual press feedback central, but leave haptics to explicit product
// actions. Pointer-down haptics fired during scroll and felt noisy on mobile.
if (typeof document !== 'undefined') {
  let pressedEl: HTMLElement | null = null;
  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  const clearPressed = () => {
    if (!pressedEl) return;
    delete pressedEl.dataset.pressing;
    pressedEl = null;
    activePointerId = null;
  };

  document.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    const interactive = target.closest('.spring-press, [data-press]') as HTMLElement | null;
    if (interactive) {
      if (!interactive.hasAttribute('disabled') && interactive.getAttribute('aria-disabled') !== 'true') {
        clearPressed();
        interactive.dataset.pressing = 'true';
        pressedEl = interactive;
        activePointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
      }
    }
  }, { passive: true });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) clearPressed();
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
