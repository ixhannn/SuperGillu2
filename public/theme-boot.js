// Boot theme — runs BEFORE the JS bundle downloads so a non-rose (especially the
// dark starry-night) theme does not flash the rose splash on a cold launch.
// Must be an external same-origin file because the production CSP (script-src
// 'self') blocks inline <script>. ThemeService re-applies the full token set once
// the bundle executes; this only corrects the pre-bundle splash frame. The
// matching `html[data-theme="starry-night"]` splash colors live in index.html's
// inline <style> (synchronous, no extra request).
(function () {
  try {
    var t = localStorage.getItem('lior_theme');
    if (t && t !== 'rose') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    /* private mode / storage disabled — fall back to the CSS rose default */
  }
})();
