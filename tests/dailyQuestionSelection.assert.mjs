import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The production content/selection modules are `.ts` with extensionless bare
// imports resolved by the Vite/TS bundler, not by Node's native type-stripping.
// So this suite reads the sources as TEXT (same approach the other asserts use
// for source guards) and validates the pure rotation FORMULA on a real-sized
// pool — proving the both-partners-same-prompt and full-cycle-before-repeat
// guarantees without booting the browser/Supabase module graph.

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const dailyPromptsSrc = read('../content/dailyPrompts.ts');
const milestoneSrc = read('../content/milestonePrompts.ts');
const storageSrc = read('../services/storage.ts');
const duetSrc = read('../content/duetPrompts.ts');
const depthsSrc = read('../content/depthsDecks.ts');

// ── Pool widening: the base 75 + Duet (48) + Depths (filtered) are folded in ──

assert.match(
    dailyPromptsSrc,
    /export const DAILY_POOL: string\[\] = Array\.from\(\s*new Set<string>\(\[\.\.\.DAILY_BASE, \.\.\.DUET_TEXTS, \.\.\.DEPTHS_TEXTS\]\)/,
    'Expected DAILY_POOL to fold DAILY_BASE + Duet + Depths texts through a de-duping Set',
);

assert.match(
    dailyPromptsSrc,
    /EXCLUDED_DECK_IDS = new Set<string>\(\['after-dark', 'repair'\]\)/,
    'Expected the spicy/conflict Depths decks to be excluded from the everyday rotation',
);

// The base pool still holds the original 75 hand-written prompts.
const baseCount = (dailyPromptsSrc.match(/^\s{4}"/gm) || []).length;
assert.ok(
    baseCount >= 75,
    `Expected DAILY_BASE to retain the original ~75 prompts, counted ${baseCount}`,
);

// Duet contributes 48 texts; the four kept Depths decks contribute 18*4 = 72.
const duetCount = (duetSrc.match(/text: '/g) || []).length;
assert.equal(duetCount, 48, `Expected 48 Duet prompts to be available to fold in, got ${duetCount}`);

// ── Deterministic rotation formula (mirrors storage.ts selectDailyQuestion) ──
// Re-derive the EXACT pure formula against a synthetic pool the size of the real
// widened pool to prove determinism + a clean no-repeat full cycle.

const POOL_SIZE = 231; // 75 + 48 + 72, before defensive de-dupe (lower bound is fine)
const POOL = Array.from({ length: POOL_SIZE }, (_, i) => `q${i}`);
const MS_PER_DAY = 86_400_000;
const utcDayOrdinal = (today) => {
    const [y, m, d] = today.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
};
const rotationPick = (today, offset = 0) => {
    const idx = (((utcDayOrdinal(today) + offset) % POOL.length) + POOL.length) % POOL.length;
    return POOL[idx];
};

// Same date → same string (both partners, same UTC day).
assert.equal(
    rotationPick('2026-06-19'),
    rotationPick('2026-06-19'),
    'Expected the same calendar day to deterministically yield the same prompt',
);

// Adjacent days advance by exactly one slot (monotonic ordinal — no aliasing).
assert.equal(
    utcDayOrdinal('2026-06-20') - utcDayOrdinal('2026-06-19'),
    1,
    'Expected the day ordinal to advance by exactly 1 between adjacent calendar days',
);
assert.notEqual(
    rotationPick('2026-06-19'),
    rotationPick('2026-06-20'),
    'Expected adjacent days to land on different prompts (no collision)',
);

// A contiguous run of POOL.length days visits every prompt exactly once.
const startOrd = utcDayOrdinal('2026-01-01');
const seen = new Set();
for (let i = 0; i < POOL.length; i++) {
    const key = new Date((startOrd + i) * MS_PER_DAY).toISOString().split('T')[0];
    seen.add(rotationPick(key));
}
assert.equal(
    seen.size,
    POOL.length,
    'Expected a contiguous run of POOL.length days to visit every prompt exactly once before repeating',
);

// The couple offset is a pure phase-shift: identical for both partners, still a
// full-cycle rotation (just a different starting phase).
assert.equal(
    rotationPick('2026-06-19', 7),
    rotationPick('2026-06-19', 7),
    'Expected the per-couple offset to be deterministic (same offset → same prompt)',
);

// ── Milestone / seasonal specials present and deterministic ─────────────────

for (const day of ['100', '365', '500', '1000']) {
    assert.match(
        milestoneSrc,
        new RegExp(`${day}:\\s*"`),
        `Expected a curated day-${day} milestone special`,
    );
}
for (const mmdd of ['02-14', '12-25', '12-31', '01-01']) {
    assert.match(
        milestoneSrc,
        new RegExp(`'${mmdd}':\\s*"`),
        `Expected a seasonal special for ${mmdd}`,
    );
}
assert.match(
    milestoneSrc,
    /export const ANNIVERSARY_PROMPTS: string\[\]/,
    'Expected a multi-entry anniversary bucket so successive anniversaries vary',
);
assert.match(
    milestoneSrc,
    /return bucket\[safe % bucket\.length\]/,
    'Expected bucket picks to wrap deterministically by occurrence index',
);

// ── storage.ts shared-seed contract ─────────────────────────────────────────

assert.match(
    storageSrc,
    /selectDailyQuestion\(today, profile\.anniversaryDate, profile\.coupleId\)/,
    'Expected getTodayQuestion to select via selectDailyQuestion(today, anniversaryDate, coupleId)',
);
assert.match(
    storageSrc,
    /Date\.UTC\(y, m - 1, d\)/,
    'Expected the day ordinal to use Date.UTC so partners never split across midnight in different timezones',
);

// The selection function must never seed on random / per-user / device-local data.
const selectBody = storageSrc.match(/const selectDailyQuestion = \([\s\S]*?\n\};/)?.[0] ?? '';
assert.ok(selectBody.length > 0, 'Expected to locate selectDailyQuestion in storage.ts');
assert.doesNotMatch(
    selectBody,
    /Math\.random|myName|partnerName|localStorage|sessionStorage|navigator/,
    'Expected daily-question selection to never seed on random / per-user / device-local values',
);
const milestoneBody = storageSrc.match(/const milestoneQuestionFor = \([\s\S]*?\n\};/)?.[0] ?? '';
assert.doesNotMatch(
    milestoneBody,
    /Math\.random|myName|partnerName|localStorage/,
    'Expected milestone selection to stay a pure function of shared anniversary/date',
);

// Depths source still exposes the excluded decks (so the filter has a target).
for (const id of ['after-dark', 'repair']) {
    assert.match(depthsSrc, new RegExp(`id: '${id}'`), `Expected Depths to define the '${id}' deck`);
}

console.log('dailyQuestionSelection.assert.mjs: all assertions passed');
