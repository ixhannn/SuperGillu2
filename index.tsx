import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App';
import './index.css';
import './styles/typography.css';
import './styles/root-fixes.css';
import './styles/premium-features.css';
import './styles/native-polish.css';
import './styles/performance.css';
import './styles/premium-hub.css';
import './styles/polish-fixes.css';
import './styles/dinner-decider.css';
import { initGlobalGestures } from './utils/gesture';
import { startRevealSafety } from './utils/revealSafety';
import { ThemeService } from './services/theme';

// ── THEME BOOT (before first paint) ──
// Apply the saved theme synchronously BEFORE React's first render so a non-rose
// (especially the dark starry-night) theme never paints the rose default for a
// frame and then snaps. The authoritative theme still loads from the couple
// profile during init; this only seeds the boot frame. `instant` = no crossfade.
// (The inline <head> script in index.html covers the even-earlier pre-bundle
// frame for the dark theme.)
if (typeof document !== 'undefined') {
  try {
    const savedTheme = localStorage.getItem('lior_theme');
    if (savedTheme) ThemeService.applyTheme(savedTheme, { instant: true });
  } catch { /* private mode / no storage — fall back to CSS rose default */ }
}

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
    const el = pressedEl;
    delete el.dataset.pressing;
    // Spring the press back to life (the mymind release): stamp data-releasing
    // so the scale→1 return plays on --lior-press-spring instead of snapping
    // flat. ONLY for plain, CSS-driven surfaces — an element with an inline
    // transform is framer/JS-controlled and owns its own release, and a CSS
    // transition would fight its per-frame transform writes. Self-clears.
    if (!el.style.transform) {
      el.dataset.releasing = '1';
      window.setTimeout(() => { if (el.dataset.releasing === '1') delete el.dataset.releasing; }, 340);
    }
    pressedEl = null;
    activePointerId = null;
  };

  // Every tappable surface gets the pressed state — not just elements that
  // opted in via .spring-press. Cards rendered as cursor-pointer divs and
  // plain buttons previously gave zero visual response until the click
  // ripple fired, which reads as "dead" on native. Scroll cancellation
  // below keeps this from flashing mid-scroll.
  const PRESSABLE = '.spring-press, [data-press], button, [role="button"], .cursor-pointer';
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    const interactive = target.closest(PRESSABLE) as HTMLElement | null;
    if (interactive && !interactive.closest('[data-no-press]')) {
      if (!interactive.hasAttribute('disabled') && interactive.getAttribute('aria-disabled') !== 'true') {
        // Near-viewport-sized surfaces (modal backdrops, full-screen sheets)
        // must not visibly scale — pressing them would reveal layer edges.
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = interactive.getBoundingClientRect();
        if (vw > 0 && vh > 0 && rect.width >= vw * 0.96 && rect.height >= vh * 0.8) return;
        clearPressed();
        delete interactive.dataset.releasing; // cancel any in-flight spring-back
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

  // ── ACTIVATION POP ──
  // A subtle scale "settle" when a control becomes selected/active/checked —
  // the mymind "every state change feels alive" touch. One global observer; no
  // per-component wiring. Fires ONLY on the transition INTO an active value (a
  // freshly-mounted active element never mutates, so it never pops). Skips
  // framer/JS-driven elements (they carry an inline transform and animate their
  // own scale) and anything that opted out of press feedback. Animates the
  // independent `scale` property so it composes with the transform-based press.
  const reduceMotionPop = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotionPop && 'MutationObserver' in window) {
    const ACTIVE_VALUES = new Set(['true', 'active', 'selected', 'on']);
    const popObserver = new MutationObserver((records) => {
      for (const r of records) {
        if (!r.attributeName) continue;
        const el = r.target as HTMLElement;
        const next = el.getAttribute(r.attributeName);
        if (
          next && ACTIVE_VALUES.has(next) &&
          !(r.oldValue && ACTIVE_VALUES.has(r.oldValue)) &&
          !el.style.transform &&
          !el.closest('[data-no-press]')
        ) {
          el.classList.remove('lior-activate-pop');
          void el.offsetWidth; // restart the animation on a rapid re-toggle
          el.classList.add('lior-activate-pop');
        }
      }
    });
    popObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['aria-pressed', 'aria-checked', 'aria-selected', 'data-active'],
    });
    document.body.addEventListener('animationend', (e) => {
      if (e.animationName === 'lior-activate-pop') {
        (e.target as HTMLElement).classList.remove('lior-activate-pop');
      }
    });
  }

  // Boot the gesture system: [data-press] delegation + CSS injection
  initGlobalGestures();

  // Fail-safe: never let entrance-animated content stay stranded invisible if
  // its reveal animation is interrupted (background/resume, throttling, etc.).
  startRevealSafety();

  // iOS Safari only applies :active styles when a touchstart listener exists.
  // This used to be an inline ontouchstart="" on <body>, which the strict
  // production CSP (script-src 'self') would block.
  document.body.addEventListener('touchstart', () => {}, { passive: true });
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
    {/* reducedMotion="user" makes every framer-motion animation app-wide honour
        the OS "reduce motion" setting (opacity-only, no transform/layout) —
        previously only the route layer respected it. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>
);
