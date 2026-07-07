import type { ViewState } from '../types';

/**
 * Full-bleed surface behind each view, painted by Layout on the scroll
 * wrapper (`main.lenis-wrapper`) AND on `.lenis-content`.
 *
 * WHY THIS EXISTS — the "background clips through at the top/bottom" bug:
 * Layout wraps every page in `.lenis-content` with `pt-safe` + `pb-32`
 * padding. A view that paints its own immersive background on its root
 * element only covers its root — the padding gutters around it still show
 * the app's pink theme shell. Scroll to either extreme (the gutters are
 * always inside the scroll range) and a bright pink band clips through the
 * page's world. The wrapper, by contrast, is viewport-fixed and spans the
 * full 100dvh regardless of scroll position, so a surface painted here can
 * never be scrolled or overscrolled away.
 *
 * RULE: every view that paints its own full-page background (anything that
 * is not the standard theme shell) MUST register its base surface here,
 * matching the view root's background. Views that sit directly on the theme
 * shell need no entry (they resolve to 'transparent').
 *
 * Gradients are fine: the wrapper is viewport-sized, so its gradient ends
 * meet the (content-sized) page gradient at the same end colors where the
 * gutters actually show.
 */

/** GoldShell stage base — keep in sync with components/premium/GoldShell.tsx. */
const GOLD_STAGE = '#09090e';

export const VIEW_SURFACES: Partial<Record<ViewState, string>> = {
  'private-space': '#f1edf3',
  // Pulse is an immersive near-black screen. Without a matching surface the
  // pink app background showed through the content column's bottom padding,
  // so the page looked like it ended abruptly mid-screen.
  'aura-signal': '#050508',
  // Premium Worlds is an immersive cosmic screen — match its deep base so the
  // pink app background never bleeds behind the bottom nav / safe-area gutter.
  premium: '#0a0712',
  // Quiet Mode's full-screen dialog base.
  'quiet-mode': '#050308',
  // OUR HOME's ivory-blush sky — same stops as .oh-view (styles/our-home.css)
  // so the safe-area gutters continue the room's light seamlessly.
  'our-room':
    'radial-gradient(120% 80% at 50% 34%, #fdf5eb 0%, #f7e7d9 46%, #eed5c3 78%, #e4c4ac 100%)',
  // Bonsai's dawn gradient — same stops as the view root so the top/bottom
  // gutters continue the page's sky instead of snapping to pink.
  'bonsai-bloom':
    'linear-gradient(180deg, #faf5ff 0%, #f5f3ff 25%, #fdf2f8 50%, #fff7ed 80%, #fefce8 100%)',
  // Draw-together's pastel wash (views/Canvas.tsx root).
  canvas:
    'radial-gradient(circle at 12% 4%, rgba(255,204,216,0.58), transparent 30%), ' +
    'radial-gradient(circle at 92% 10%, rgba(202,218,255,0.48), transparent 28%), ' +
    'linear-gradient(180deg, rgba(255,248,251,0.96) 0%, rgba(250,231,241,0.94) 52%, rgba(239,232,255,0.92) 100%)',
  // Dinner Decider's opaque clay tabletop (--clay = --color-surface).
  'dinner-decider': 'var(--color-surface)',
  // ── LIOR GOLD wing — every GoldShell view shares the same dark stage. ──
  'time-capsule': GOLD_STAGE,
  surprises: GOLD_STAGE,
  'voice-notes': GOLD_STAGE,
  'partner-intelligence': GOLD_STAGE,
  'daily-video': GOLD_STAGE,
  'weekly-recap': GOLD_STAGE,
  'our-story': GOLD_STAGE,
  'date-studio': GOLD_STAGE,
  'duet-journal': GOLD_STAGE,
  depths: GOLD_STAGE,
  'love-missions': GOLD_STAGE,
  heirlooms: GOLD_STAGE,
};

export const getViewSurface = (view: ViewState): string =>
  VIEW_SURFACES[view] ?? 'transparent';
