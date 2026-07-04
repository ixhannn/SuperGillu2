/**
 * revealSafety — guarantees entrance-animated content can never be stranded
 * invisible.
 *
 * Many surfaces across the app (keep-alive tab shells, the view header, the
 * home reveals, framer "initial opacity:0 → animate opacity:1" elements) start
 * at opacity:0 and depend on a CSS/WAAPI entrance animation to fade in. If that
 * animation is interrupted or never progresses — e.g. the WebView freezes the
 * document timeline while the app is backgrounded, a tab switch races a resume,
 * or a low-end device throttles rAF — the element is left at opacity:0 and the
 * content appears to "disappear".
 *
 * This sweep finishes any *finite* running animation, jumping it to its end
 * (visible) keyframe, at the moments where stranding tends to happen: shortly
 * after first paint, on resume from background, and on visibility change.
 * Infinite/looping ambient animations (breathing, glow, spin) are skipped so
 * they keep running.
 *
 * It is a no-op on a healthy device: entrance animations have already finished
 * by the time the deferred sweep runs, so .finish() does nothing. It only
 * rescues genuinely stuck animations.
 */

let _scheduled = false;

function commitFiniteAnimations(): void {
  if (typeof document === 'undefined') return;

  // 1) Finish stuck CSS / WAAPI entrance animations (e.g. keep-alive tab fade,
  //    home reveals). Looping ambient effects are left running.
  if (typeof document.getAnimations === 'function') {
    for (const anim of document.getAnimations()) {
      try {
        const timing = anim.effect?.getComputedTiming?.();
        if (!timing) continue;
        if (timing.iterations === Infinity) continue;
        if (anim.playState === 'finished' || anim.playState === 'idle') continue;
        // The cinematic theme-reveal disc drives a finite clip-path bloom; it
        // owns its own safety net (a timer + a cancel-on-new-pick path in
        // ThemeService). Force-finishing it here would cut the ~620ms bloom to an
        // instant on a focus/visibilitychange event mid-transition. Skip it.
        const target = (anim.effect as KeyframeEffect | null)?.target;
        if (target instanceof Element && target.classList.contains('lior-theme-reveal')) continue;
        anim.finish();
      } catch {
        /* paused/cancelled/non-finishable — ignore */
      }
    }
  }

  // 2) Rescue framer-motion elements stranded at inline opacity:0.
  //    framer drives "initial opacity:0 → animate opacity:1" by writing inline
  //    styles from its own rAF loop; if that loop is interrupted the element is
  //    left invisible. By the time this sweep runs, a healthy element has long
  //    since reached opacity:1, so we only touch genuinely stuck ones:
  //    inline opacity ~0, laid out on-screen, not in a cached tab, not hidden.
  rescueStrandedInlineOpacity();
}

function rescueStrandedInlineOpacity(): void {
  let candidates: NodeListOf<HTMLElement>;
  try {
    candidates = document.querySelectorAll<HTMLElement>('[style*="opacity: 0"], [style*="opacity:0"]');
  } catch {
    return;
  }
  candidates.forEach((el) => {
    const inline = el.style.opacity;
    if (inline === '' || parseFloat(inline) > 0.01) return;       // not stranded at ~0
    if (el.getAttribute('aria-hidden') === 'true') return;        // intentionally hidden
    if (el.closest('.keep-alive-shell.is-cached')) return;        // a cached tab — keep hidden
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return;    // no layout footprint
    // Only un-strand opacity (the sole goal: never leave content invisible).
    // Do NOT clear transform — on a LIVE framer entrance the inline transform is
    // mid-flight, and wiping it amputates the slide (a visible pop); on a
    // genuinely stuck node the residual transform is just the small initial
    // offset (e.g. translateY 14px), negligible next to the visibility win.
    el.style.opacity = '';
  });
}

function schedule(delay = 700): void {
  if (_scheduled || typeof window === 'undefined') return;
  _scheduled = true;
  // Defer so a just-started entrance animation on a healthy device isn't cut
  // short — only genuinely stranded ones are still un-finished after the delay.
  window.setTimeout(() => {
    _scheduled = false;
    commitFiniteAnimations();
  }, delay);
}

/** Wire up the fail-safe. Call once at app startup. */
export function startRevealSafety(): void {
  if (typeof window === 'undefined') return;

  // Initial post-mount sweeps — two passes so late-mounted / portaled content
  // (e.g. the view header, which portals in after its tab becomes active) is
  // also covered. Both are well past entrance-animation durations, so on a
  // healthy device they're no-ops; they only rescue genuinely stranded nodes.
  window.setTimeout(commitFiniteAnimations, 800);
  window.setTimeout(commitFiniteAnimations, 2200);

  // Re-sweep whenever the page returns to the foreground — this is the most
  // common stranding moment (the timeline pauses while hidden, and a reveal
  // that was mid-flight never resumes cleanly).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(400);
  });
  window.addEventListener('pageshow', () => schedule(400));
  window.addEventListener('focus', () => schedule(400));

  // Re-sweep after each navigation/tab switch. TransitionEngine sets
  // <html data-transitioning="1"> for the duration of a transition and clears
  // it when done; the view header re-portals and tab shells re-reveal in that
  // window, so a sweep just after the transition finishes rescues anything
  // whose entrance animation didn't land.
  const root = document.documentElement;
  let wasTransitioning = root.dataset.transitioning === '1';
  const obs = new MutationObserver(() => {
    const now = root.dataset.transitioning === '1';
    if (wasTransitioning && !now) schedule(360); // transition just finished
    wasTransitioning = now;
  });
  obs.observe(root, { attributes: true, attributeFilter: ['data-transitioning'] });
}
