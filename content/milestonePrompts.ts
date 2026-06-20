/**
 * Milestone & seasonal daily-prompt specials.
 *
 * On a milestone derived from the SHARED `anniversaryDate` (or a fixed calendar
 * date), the daily ritual serves one of these curated reflective prompts INSTEAD
 * of the normal rotation pick. Both partners compute the identical milestone from
 * the same shared inputs, so the special is deterministic and shared — no new
 * mechanics, no persistence, just "which string gets selected today".
 *
 * Multi-entry buckets are indexed deterministically by occurrence (year / count)
 * so successive milestones vary instead of repeating the same line.
 */

/** Round-number "days together" milestones, mapped to a curated special. */
export const DAY_MILESTONE_PROMPTS: Readonly<Record<number, string>> = {
    100: "100 days together today. What's a moment from these first 100 days you'd keep forever?",
    365: "A whole year, day by day. What surprised you most about loving me this year?",
    500: "500 days in. What do you know about us now that you didn't on day one?",
    1000: "1000 days together. If you could thank past-us for one thing, what would it be?",
    2000: "2000 days, and counting. What part of our story are you most proud we wrote?",
    3000: "3000 days together. What still feels brand new about us after all this time?",
};

/** Days-together values that trigger a special, in ascending order. */
export const DAY_MILESTONES: number[] = Object.keys(DAY_MILESTONE_PROMPTS)
    .map(Number)
    .sort((a, b) => a - b);

/** Yearly-anniversary bucket (varied across years by occurrence index). */
export const ANNIVERSARY_PROMPTS: string[] = [
    "Happy anniversary. What's one way we've grown together that you're grateful for?",
    "Another year of us today. What's a memory from this past year you never want to forget?",
    "It's our anniversary. If you had to describe this chapter of us in one sentence, what would it be?",
    "Anniversary day. What do you love about us now that you couldn't have imagined at the start?",
    "Today we celebrate us. What's something you'd promise me for the year ahead?",
];

/** Monthly "monthsary" bucket — lighter than the yearly anniversary. */
export const MONTHSARY_PROMPTS: string[] = [
    "Another month of us. What's a small moment from this month you loved?",
    "Monthsary check-in: what made you feel closest to me this month?",
    "One more month together. What's something you want more of next month?",
    "Marking another month. What's one tiny thing I did this month that you appreciated?",
];

/** Fixed calendar-date specials, keyed by MM-DD (shared, so deterministic). */
export const SEASONAL_PROMPTS: Readonly<Record<string, string>> = {
    '02-14': "It's Valentine's Day. Beyond the obvious — what's one quiet reason you love me?",
    '12-25': "It's a day for warmth. What's a feeling you hope we carry into next year together?",
    '12-31': "Last day of the year. What's a moment from this year with us you're holding onto?",
    '01-01': "A brand-new year. What's one thing you're excited to do together this year?",
};

/**
 * Picks an entry from a non-empty bucket deterministically by a shared index
 * (e.g. occurrence number). Falls back to index 0 for any out-of-range/NaN.
 */
export function pickFromBucket(bucket: readonly string[], index: number): string {
    if (bucket.length === 0) return '';
    const safe = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
    return bucket[safe % bucket.length];
}
