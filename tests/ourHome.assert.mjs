/**
 * OUR HOME — the laws of the house (docs/OUR_HOME_VISION.md).
 *
 * These assertions keep the emotional contract enforceable in CI:
 * no gamification vocabulary, no forensic time, no guilt mechanics,
 * no blend-mode lighting, no bounce, and a merge-safe sync path.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** Comments talk ABOUT banned patterns; only code can contain them. */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const homeDir = 'components/our-home';
const homeFiles = [
  ...readdirSync(new URL(`../${homeDir}`, import.meta.url))
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .map((f) => `${homeDir}/${f}`),
  ...readdirSync(new URL(`../${homeDir}/objects`, import.meta.url))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => `${homeDir}/objects/${f}`),
];
const homeSource = homeFiles.map(read).join('\n');
const viewSource = read('views/OurRoom.tsx');
const cssSource = read('styles/our-home.css');
const soulSource = read(`${homeDir}/homeSoul.ts`);
const soulCoreSource = read(`${homeDir}/homeSoulCore.ts`);
const storageSource = read('services/storage.ts');
const all = homeSource + viewSource + cssSource;

/* ── 1 · What we refuse: no gamification vocabulary anywhere ── */
const allCode = stripComments(all);
assert.doesNotMatch(
  allCode,
  /\bcoins?\b|\bgems?\b|\bXP\b|level.?up|\bbadge|leaderboard|achievement/i,
  'Our Home must never speak in coins/XP/levels/badges — objects arrive from lived life.',
);
assert.doesNotMatch(
  allCode,
  /streak/i,
  'No streak mechanics or streak copy anywhere in Our Home — absence is quiet, never deficit.',
);

/* ── 2 · Coarse warm time only — no forensic timestamps in scene copy ── */
assert.match(
  homeSource,
  /coarseBucketIso/,
  'Presence writes must coarse-bucket their timestamps (5-minute buckets).',
);
assert.doesNotMatch(
  viewSource + read(`${homeDir}/HomePlaque.tsx`),
  /toLocaleTimeString|getMinutes\(\)/,
  'The home never renders minute-level time — five warm phrases only.',
);

/* ── 3 · Lighting is alpha gradients only — no blend modes ── */
assert.doesNotMatch(
  all,
  /mix-blend-mode|blendMode|feBlend|screen['"]?\s*[,}]/,
  'No blend modes, ever. All light is plain alpha gradients (the compositing tax was paid once).',
);
assert.doesNotMatch(
  cssSource,
  /backdrop-filter/,
  'The scene uses no backdrop-filter — glass shimmer has no place over a hand-inked room.',
);

/* ── 4 · Motion law: no bounce/elastic/overshoot, no animated blur/layout ── */
assert.doesNotMatch(
  stripComments(cssSource),
  /cubic-bezier\([^)]*[2-9]\.\d|bounce|elastic/i,
  'Zero bounce/overshoot in Our Home motion — things come to rest.',
);
assert.doesNotMatch(
  stripComments(cssSource),
  /@keyframes[^}]*\b(filter|width|height|top|left|margin|padding)\s*:/s,
  'Keyframes animate transform/opacity only — never blur or layout properties.',
);
assert.match(
  cssSource,
  /prefers-reduced-motion/,
  'Reduced-motion users get an instant home.',
);

/* ── 5 · The merge: cloud updates must never clobber ── */
assert.match(
  storageSource,
  /mergeOurHome\(local,\s*incoming\)/,
  'our_room_state cloud updates must merge (per-item latest-touch), never accept wholesale.',
);
assert.match(
  soulCoreSource,
  /objectClock[\s\S]{0,200}removedAt/,
  'Merge clocks must include removedAt so tombstoned objects cannot resurrect.',
);
/* the reviewed P0s — each of these regressing would corrupt real couples' rooms */
assert.match(
  soulCoreSource,
  /objects:\s*\[\]/,
  'The default room is EMPTY: a fresh device default can never out-rank a real arranged room.',
);
assert.match(
  soulSource,
  /placeNewObject/,
  'Furnishing mints instances — place as many copies of anything as a life needs.',
);
assert.match(
  soulCoreSource,
  /const\s+canonicalize[\s\S]{0,400}localeCompare/,
  'Merge/normalize output must be canonically ordered, or the converge-push comparison live-locks.',
);
assert.match(
  soulCoreSource,
  /return canonicalize\(\{/,
  'mergeOurHome must emit canonical order.',
);
assert.match(
  soulCoreSource,
  /ts\(candleSeen\)\s*>=\s*ts\(candleWinner\.litAt\)/,
  "A candle's seenAt belongs to one burn — merges must not resurrect a previous burn's seenAt.",
);
assert.match(
  soulSource,
  /rev:\s*bump\(o\)/,
  'Every mutating object op must advance the monotonic rev counter (coarse time is display-only).',
);
assert.match(
  storageSource,
  /from '\.\.\/components\/our-home\/homeSoulCore'/,
  'storage.ts must import ONLY the lean soul core — ops/traces/growth stay in the lazy view chunk.',
);

/* ── 6 · Trace discipline ── */
assert.match(
  soulSource,
  /TRACE_BUDGET\s*=\s*3/,
  'At most three active traces plus the lamp — the room reads as tended, never a crime scene.',
);
assert.match(
  soulSource,
  /quiet.*return state|hiding is not itself legible/is,
  'Quiet visits must not record presence — hiding is not itself legible.',
);

/* ── 7 · The placement grammar constants stay honest ── */
const placementSource = read(`${homeDir}/useHomePlacement.ts`);
assert.match(placementSource, /LIFT_MS\s*=\s*200/, 'Lift begins at 200ms.');
assert.match(placementSource, /CARRY_RISE\s*=\s*56/, 'Carried objects float 56 units above the fingertip.');
const seatsSource = read(`${homeDir}/homeSeats.ts`);
assert.match(seatsSource, /MAGNET_REACH\s*=\s*24/, 'The seam magnet reaches 24 units.');
assert.match(seatsSource, /HYSTERESIS\s*=\s*12/, 'Leaving a locked seam takes 12 units of intent.');

/* ── 8 · Growth: structure never gated on ritual compliance ── */
assert.doesNotMatch(
  soulSource.split('computeDueParcels')[1]?.split('hearthStage')[0] ?? '',
  /revealedQuestions|answeredTodayBoth/,
  'Parcels (structure) grow from calendar + memories only — rituals enrich warmth, never gate structure.',
);

/* ── 9 · The view stays out of the bundle hot path ── */
const registrySource = read('views/viewRegistry.tsx');
assert.match(
  registrySource,
  /'our-room':\s*lazyNamedView\(\(\)\s*=>\s*import\('\.\/OurRoom'\)/,
  'Our Home must stay lazily imported.',
);

console.log('ourHome.assert.mjs: all assertions passed');
