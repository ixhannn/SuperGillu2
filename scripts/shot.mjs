#!/usr/bin/env node
/**
 * Universal preview screenshot capture.
 *
 * The Claude in-app preview keeps its page permanently `visibilityState:hidden`,
 * so Chrome throttles/suspends that page's compositor and `preview_screenshot`
 * never receives a painted frame (it times out at 30s). A Playwright browser we
 * launch ourselves has a genuinely VISIBLE page, so `page.screenshot()` returns
 * real frames — this is the reliable "see the pixels" loop in every worktree.
 *
 * Usage:
 *   node scripts/shot.mjs --view bonsai-bloom --out shot.png
 *   node scripts/shot.mjs --view bonsai-bloom --bonsai 120 --out shot.png
 *   node scripts/shot.mjs --url http://localhost:3013/?e2e=1&view=home --out home.png
 *
 * Flags:
 *   --view <name>       e2e view (builds .../?e2e=1&view=<name>). Default: home
 *   --url <url>         full URL (overrides --view)
 *   --port <n>          dev server port (default 3013)
 *   --out <path>        PNG output path (default shot.png)
 *   --bonsai <growth>   seed a paired both-watered bonsai of this growth, reload
 *   --eval "<js>"       run JS in the page before shooting (then --reload if it
 *                       changes localStorage)
 *   --reload            reload after --eval / --bonsai (default on for --bonsai)
 *   --selector <css>    wait for this element before shooting
 *   --hide <css>        remove matching elements right before shooting
 *   --scrollto <css>    scroll this element into view before shooting
 *   --wait <ms>         settle delay after load (default 1600)
 *   --w --h --dpr       viewport (default 390 x 844, dpr 2)
 *   --clip x,y,w,h      crop the screenshot to this rect
 *   --full              full-page screenshot
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(`--${k}`);

const port = get('port', '3013');
const view = get('view', 'home');
const url = get('url') || `http://localhost:${port}/?e2e=1&view=${view}`;
const out = get('out', 'shot.png');
const waitMs = Number(get('wait', '1600'));
const selector = get('selector');
const hide = get('hide');
const scrollTo = get('scrollto');
const w = Number(get('w', '390'));
const h = Number(get('h', '844'));
const dpr = Number(get('dpr', '2'));
const bonsai = get('bonsai');
const evalJs = get('eval');
const clip = get('clip');
const full = has('full');
const doReload = has('reload') || bonsai != null;

function bonsaiSeed(growth) {
  const days = Math.max(1, Math.round(Number(growth) / 3)); // both watered = 3/day
  return `(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const events = []; const today = new Date();
    for (let i = ${days} - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const day = key(d);
      events.push({ id: 'cpl1_' + day + '_me_w', coupleId: 'cpl1', authorId: 'me', type: 'water', day, note: null, targetEventId: null, createdAt: day + 'T08:00:00.000Z' });
      // Partner waters hours later so days are NOT counted as "twin blooms"
      // (which would gild every blossom). A realistic mixed tree.
      events.push({ id: 'cpl1_' + day + '_partner-sim_w', coupleId: 'cpl1', authorId: 'partner-sim', type: 'water', day, note: null, targetEventId: null, createdAt: day + 'T15:30:00.000Z' });
    }
    const sh = JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
    sh.coupleId = 'cpl1'; sh.partnerUserId = 'partner-sim';
    localStorage.setItem('lior_shared_profile', JSON.stringify(sh));
    const idp = JSON.parse(localStorage.getItem('lior_identity') || '{}');
    idp.partnerName = 'Sam'; idp.myName = idp.myName || 'Alex';
    localStorage.setItem('lior_identity', JSON.stringify(idp));
    localStorage.setItem('lior_bonsai_events_v1', JSON.stringify({ coupleKey: 'cpl1', events, pendingIds: [] }));
    localStorage.setItem('lior_bonsai_seen_v1', JSON.stringify({ coupleKey: 'cpl1:0', growth: ${Number(growth)} }));
  })()`;
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: 'load' });
if (bonsai != null) await page.evaluate(bonsaiSeed(bonsai));
if (evalJs) await page.evaluate(evalJs);
if (doReload) await page.goto(url, { waitUntil: 'load' });
if (selector) await page.waitForSelector(selector, { timeout: 15000 }).catch(() => {});
await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
await page.waitForTimeout(waitMs);
if (scrollTo) {
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), scrollTo);
  await page.waitForTimeout(600);
}
if (hide) await page.evaluate((sel) => { for (const el of document.querySelectorAll(sel)) el.remove(); }, hide);

const opts = { path: out, fullPage: full };
if (clip) { const [x, y, cw, ch] = clip.split(',').map(Number); opts.clip = { x, y, width: cw, height: ch }; opts.fullPage = false; }
await page.screenshot(opts);
await browser.close();

console.log(`saved ${out}`);
if (errors.length) console.log(`console errors (${errors.length}):\n` + errors.slice(0, 8).join('\n'));
