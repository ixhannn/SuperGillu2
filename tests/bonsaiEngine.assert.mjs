import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

// The bonsai growth engine and voxel generator are PURE TypeScript modules
// (no DOM, no Supabase), so this suite bundles the real sources with esbuild
// and executes them — the exact code both partners run must produce identical
// trees from identical event logs.

const bundle = async (entry) => {
    const result = await build({
        entryPoints: [new URL(entry, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
        bundle: true,
        format: 'esm',
        write: false,
        platform: 'neutral',
        logLevel: 'silent',
    });
    const code = Buffer.from(result.outputFiles[0].contents).toString('base64');
    return import(`data:text/javascript;base64,${code}`);
};

const growth = await bundle('../utils/bonsai/growth.ts');
const model = await bundle('../utils/bonsai/voxelModel.ts');

const { computeTreeState, dayMood, dayKey, addDays, daysBetween, BONSAI_STAGES } = growth;
const { generateBonsaiModel, growthToG, MAX_GROWTH } = model;

const COUPLE = 'c-1';
const ME = 'user-a';
const PARTNER = 'user-b';

let eventSeq = 0;
const water = (authorId, day, note) => ({
    id: `${COUPLE}_${day}_${authorId}_w`,
    coupleId: COUPLE,
    authorId,
    type: 'water',
    day,
    note: note ?? null,
    targetEventId: null,
    createdAt: `${day}T08:0${(eventSeq++ % 10)}:00.000Z`,
});
const noteOpen = (authorId, day, targetEventId) => ({
    id: `${COUPLE}_o_${authorId}_${targetEventId}`,
    coupleId: COUPLE,
    authorId,
    type: 'note_open',
    day,
    note: null,
    targetEventId,
    createdAt: `${day}T09:00:00.000Z`,
});

const compute = (events, today) =>
    computeTreeState({ events, seed: 1234, today, selfId: ME });

// ── Day helpers ──────────────────────────────────────────────────────

assert.equal(dayKey(new Date(2026, 6, 2)), '2026-07-02', 'dayKey formats local date');
assert.equal(addDays('2026-07-02', 1), '2026-07-03');
assert.equal(addDays('2026-07-31', 1), '2026-08-01', 'addDays rolls months');
assert.equal(daysBetween('2026-07-01', '2026-07-04'), 3);

// ── Growth points: both = 3, solo = 1 ────────────────────────────────

{
    const events = [
        water(ME, '2026-07-01'), water(PARTNER, '2026-07-01'), // both  → 3
        water(ME, '2026-07-02'),                               // solo  → 1
        water(PARTNER, '2026-07-03'),                          // solo  → 1
        water(ME, '2026-07-04'), water(PARTNER, '2026-07-04'), // both  → 3
    ];
    const tree = compute(events, '2026-07-04');
    assert.equal(tree.growth, 8, 'both=3/solo=1 growth math');
    assert.deepEqual(tree.bloomDays, ['2026-07-01', '2026-07-04']);
    assert.equal(tree.totalWaterDays, 4);
    assert.equal(tree.wateredTodayByMe, true);
    assert.equal(tree.wateredTodayByPartner, true);
}

// ── Determinism: identical logs → identical state on both phones ─────

{
    const events = [
        water(ME, '2026-06-28'), water(PARTNER, '2026-06-28'),
        water(ME, '2026-06-29', 'hi love'),
    ];
    const a = compute(events, '2026-06-30');
    const b = compute([...events].reverse(), '2026-06-30');
    assert.deepEqual(
        { ...a, notes: a.notes.length, mood: a.mood },
        { ...b, notes: b.notes.length, mood: b.mood },
        'event order must not change derived state',
    );
    assert.deepEqual(dayMood(99, '2026-07-02'), dayMood(99, '2026-07-02'), 'mood deterministic');
}

// ── Streaks: consecutive BOTH-watered days; today-in-progress safe ───

{
    const both = (day) => [water(ME, day), water(PARTNER, day)];
    const events = [...both('2026-07-01'), ...both('2026-07-02'), ...both('2026-07-03')];
    assert.equal(compute(events, '2026-07-03').streak, 3, '3 consecutive bloom days');
    // Today not yet complete → yesterday's run still counts (winnable).
    assert.equal(compute(events, '2026-07-04').streak, 3, 'grace while today is winnable');
    // A full missed day kills the run but not the best record.
    const later = compute(events, '2026-07-06');
    assert.equal(later.streak, 0);
    assert.equal(later.bestStreak, 3);
}

// ── Stages ───────────────────────────────────────────────────────────

{
    assert.equal(compute([], '2026-07-02').stage.id, 'seed');
    const both = (day) => [water(ME, day), water(PARTNER, day)];
    const twoDays = [...both('2026-07-01'), ...both('2026-07-02')];
    const tree = compute(twoDays, '2026-07-02');
    assert.equal(tree.growth, 6);
    assert.equal(tree.stage.id, 'seedling', '6 points lands in seedling (at 5)');
    assert.equal(tree.nextStage.id, 'sapling');
    assert.ok(tree.stageProgress > 0 && tree.stageProgress <= 1);
    const ancientAt = BONSAI_STAGES.find((s) => s.id === 'ancient').at;
    assert.equal(ancientAt, 400, 'ancient tier caps the ladder');
}

// ── Blossom notes: sealed until the reader waters that day or later ──

{
    const partnerNote = water(PARTNER, '2026-07-02', 'you looked happy today');
    // I have not watered since the note day → sealed.
    let tree = compute([water(ME, '2026-07-01'), partnerNote], '2026-07-02');
    let note = tree.notes.find((n) => n.forMe);
    assert.equal(note.unlocked, false, 'note sealed until I water on/after its day');
    assert.equal(tree.unreadNotesForMe, 0, 'sealed notes are not "unread" yet');

    // I water today → unlocked + unread.
    tree = compute([water(ME, '2026-07-01'), partnerNote, water(ME, '2026-07-02')], '2026-07-02');
    note = tree.notes.find((n) => n.forMe);
    assert.equal(note.unlocked, true);
    assert.equal(tree.unreadNotesForMe, 1);

    // Opening it clears the unread count and marks it read for the author.
    tree = compute(
        [water(ME, '2026-07-01'), partnerNote, water(ME, '2026-07-02'), noteOpen(ME, '2026-07-02', partnerNote.id)],
        '2026-07-02',
    );
    assert.equal(tree.unreadNotesForMe, 0);
    assert.equal(tree.notes.find((n) => n.forMe).opened, true);
}

// ── Resting (never dies) + planting ceremony ─────────────────────────

{
    const events = [water(ME, '2026-06-20'), water(PARTNER, '2026-06-20')];
    assert.equal(compute(events, '2026-06-22').resting, false, '2 quiet days is fine');
    assert.equal(compute(events, '2026-06-27').resting, true, '7 quiet days → resting');
    assert.equal(compute([], '2026-07-02').planted, false);
    assert.equal(compute([water(ME, '2026-07-02')], '2026-07-02').planted, false, 'needs both');
    assert.equal(compute(events, '2026-06-27').planted, true);
}

// ── Decorations unlock from streak/bloom milestones ──────────────────

{
    const both = (day) => [water(ME, day), water(PARTNER, day)];
    const events = [];
    for (let i = 0; i < 7; i++) events.push(...both(addDays('2026-06-01', i)));
    const tree = compute(events, addDays('2026-06-01', 6));
    const ids = tree.decorations.map((d) => d.id);
    assert.ok(ids.includes('moss'), '3-day streak → moss');
    assert.ok(ids.includes('lantern'), '7-day streak → lantern');
    assert.ok(!ids.includes('wind-chime'), 'wind-chime needs 14 blooms');
    assert.ok(tree.nextDecoration, 'a next decoration is always suggested until done');
}

// ── Voxel model: deterministic, bounded, growth-monotonic ────────────

{
    const a = generateBonsaiModel(777);
    const b = generateBonsaiModel(777);
    assert.equal(a.voxels.length, b.voxels.length, 'same seed → same voxel count');
    assert.deepEqual(a.voxels[100], b.voxels[100], 'same seed → identical voxels');
    const c = generateBonsaiModel(778);
    assert.notEqual(
        JSON.stringify(a.voxels.slice(0, 200)),
        JSON.stringify(c.voxels.slice(0, 200)),
        'different seed → different tree',
    );

    assert.ok(a.voxels.length > 800 && a.voxels.length < 6000, `sane voxel budget (${a.voxels.length})`);
    assert.ok(a.anchors.length >= 30, `enough blossom anchors (${a.anchors.length})`);
    for (const v of a.voxels.slice(0, 500)) {
        assert.ok(Number.isInteger(v.x) && Number.isInteger(v.y) && Number.isInteger(v.z), 'integer grid');
        assert.ok(v.threshold >= 0 && v.threshold <= 1, 'threshold in [0,1]');
    }

    // Consecutive bloom days must land on DISTINCT canopy spots for any seed
    // (a fixed stride used to collapse onto a few anchors for some counts).
    for (const s of [7, 777, 35 * 41, 12345]) {
        const m = generateBonsaiModel(s);
        const firstTwenty = m.anchors.slice(0, 20).map((p) => `${p.x},${p.y},${p.z}`);
        const distinct = new Set(firstTwenty).size;
        assert.ok(distinct >= 18, `seed ${s}: first 20 blossoms use ${distinct} distinct spots`);
    }

    const visibleAt = (g) => a.voxels.filter((v) => v.kind !== 'decor' && growthToG(g) >= v.threshold).length;
    const day1 = visibleAt(3);
    const month = visibleAt(90);
    const full = visibleAt(MAX_GROWTH);
    assert.ok(day1 > 0, 'something visible on day one');
    assert.ok(month > day1 && full > month, `growth strictly reveals more voxels (${day1} → ${month} → ${full})`);
    assert.ok(growthToG(3) > 0.04, 'early growth feels fast (first day visibly moves)');
}

// ── Source guards: idempotent ids, RLS, registration stay intact ─────

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const serviceSrc = read('../services/bonsai.ts');
assert.match(serviceSrc, /\$\{this\.coupleKey\(\)\}_\$\{day\}_\$\{this\.selfId\(\)\}_w/, 'deterministic once-per-day water id');
assert.match(serviceSrc, /onConflict:\s*'id'/, 'idempotent conflict-update upsert for offline replays');

const migrationSrc = read('../supabase/migrations/20260702000000_bonsai_events.sql');
assert.match(migrationSrc, /enable row level security/, 'RLS enabled');
assert.match(migrationSrc, /force row level security/, 'RLS forced');
assert.match(migrationSrc, /couple_memberships/, 'couple-membership scoped policies');
assert.match(migrationSrc, /\(select auth\.uid\(\)\)/, 'hardened (select auth.uid()) policy form');
assert.match(migrationSrc, /bonsai_events_id_prefix_matches_couple/, 'id-squatting CHECK constraint present');
assert.match(migrationSrc, /bonsai_events_note_len/, 'server-side note length cap');
assert.match(migrationSrc, /bonsai_events_forbid_core_mutation/, 'append-only update trigger');
assert.match(migrationSrc, /supabase_realtime add table public\.bonsai_events/, 'realtime publication');

const registrySrc = read('../views/viewRegistry.tsx');
assert.match(registrySrc, /'bonsai-bloom': lazyNamedView\(\(\) => import\('\.\/BonsaiBloom'\), 'BonsaiBloom'\)/, 'view stays registered');

const sceneSrc = read('../components/bonsai/BonsaiScene.tsx');
assert.match(sceneSrc, /fps:\s*30/, 'scene subscriber honours the 30fps ambient cap');
assert.ok(!/requestAnimationFrame/.test(sceneSrc), 'scene never owns its own rAF loop');

console.log('bonsaiEngine.assert OK');
