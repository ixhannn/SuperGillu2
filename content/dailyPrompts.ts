/**
 * Daily Question pool — the renewable-novelty source for the two-person daily
 * ritual.
 *
 * `DAILY_BASE` is the original hand-written 75-prompt pool (extracted verbatim
 * from `StorageService.getTodayQuestion`). `DAILY_POOL` widens it with the Duet
 * and Depths question texts so the no-repeat rotation window grows from ~75 days
 * to ~195 days (the two warm Depths decks; spicy/conflict decks excluded for
 * tone) — MORE CONTENT, not new mechanics.
 *
 * The pool is a plain `string[]` literal built ONCE at module scope, in a stable
 * concat order with no sort/shuffle/locale dependence. Because it is identical
 * source in both partners' builds, indexing it by a shared UTC day ordinal yields
 * the SAME prompt for both partners every day (see `getTodayQuestion`).
 *
 * The deep Depths decks (`after-dark` — romantic/spicy, `repair` — conflict) are
 * intentionally EXCLUDED from the everyday rotation: as a once-a-day home-screen
 * prompt they read as jarring when surfaced at random. The remaining decks
 * (beginnings + depths + play + future) keep daily texture warm.
 */

import { DUET_PROMPTS } from './duetPrompts';
import { DEPTHS_DECKS } from './depthsDecks';

/** The original 75-prompt hand-written base pool (light → reflective → deep). */
export const DAILY_BASE: string[] = [
    // ── Light & Fun ──
    "If today had a flavor, what would it be?",
    "What's the most useless talent you have?",
    "If we swapped lives for one day, what's the first thing you'd do?",
    "What's a guilty pleasure you've never fully admitted to me?",
    "What's your go-to order when you genuinely can't decide?",
    "If you had to describe today using only a movie title, what would it be?",
    "What's a weird habit you have that I probably don't know about?",
    "What's the last song you had stuck in your head all day?",
    "What's something you bought recently that you absolutely did not need?",
    "If we were any two animals, what would we be and why?",
    "What's something on your phone you'd be mildly embarrassed if I saw?",
    "What's a childhood snack you still secretly love?",
    "What's a conspiracy theory you kind of half-believe?",
    "What would your reality TV show be called?",
    "What's the most random thing you googled this week?",
    "If today had a color, what would it be?",
    "What's a small luxury that makes your day noticeably better?",
    "What's a smell that instantly takes you somewhere else?",
    "If you could have any superpower just for tomorrow, what would you pick?",
    "What's something tiny that actually made today a little better?",
    "What's the last photo you took on your phone?",
    "If we had a theme song right now, what would it be?",
    "What's a word in another language you love the sound of?",
    "What's something you've been procrastinating on for way too long?",
    "What's a show or movie you could rewatch forever?",
    "If you could rename yourself, would you? What to?",
    "What's the weirdest dream you've had recently?",
    "What's a skill you wish you had but never actually learned?",
    "What's your comfort food right now, no judgment?",
    "If you could teleport anywhere for exactly one hour, where?",
    "What's a place you really want to show me someday?",
    "What's a compliment someone gave you that you still think about?",
    "What's something you've been watching or reading lately?",
    "What would you do if you had a completely free, unplanned day tomorrow?",
    "If you could have dinner with any fictional character, who and why?",
    "What's a small thing you're quietly looking forward to this week?",
    "What's a word you always spell wrong no matter how many times you look it up?",
    "What's something you used to be obsessed with that you've completely moved on from?",
    "If you could only keep three apps on your phone, which ones?",
    "What's something that always makes you feel instantly better?",

    // ── Reflective & Warm ──
    "What's something you learned about yourself recently that surprised you?",
    "What's a decision you made lately that you feel genuinely good about?",
    "What's a memory from us that you come back to more than I probably know?",
    "What does a perfect lazy day actually look like for you?",
    "What's something you're quietly proud of yourself for?",
    "What's something you wish people understood about you without having to explain it?",
    "What's a version of our future that you love imagining?",
    "What's something I do that means more to you than I probably realize?",
    "What's a quality in yourself that you're actively trying to grow?",
    "What made you feel most understood recently?",
    "What does feeling at home feel like to you?",
    "What's a moment from the last few months you'd want to live again?",
    "What's something you've let go of that felt hard but turned out to be right?",
    "What's something we do together that feels like its own little world?",
    "What's a way I've grown recently that you've noticed?",
    "What's something about our relationship that still surprises you?",
    "What's a goal you set for yourself this year — how's it going honestly?",
    "What's something you're still figuring out about yourself?",
    "What's something you're grateful for that you don't say out loud enough?",
    "What does a good day feel like for you lately — what's the common thread?",
    "What's a memory from your childhood you love revisiting?",
    "What's a book, song, or film that genuinely changed how you think?",
    "What's something about love that you understand now that you didn't before?",
    "What's something small I do that you'd miss a lot if I stopped?",
    "If you wrote me a letter tonight, what would the first line be?",

    // ── Deep & Vulnerable (occasional) ──
    "What's something you've been carrying alone lately that you haven't said out loud?",
    "What's something you wish you could go back and tell a younger version of yourself?",
    "What's a part of you that you find genuinely hard to share, even with me?",
    "What's something you're afraid to want too much — in case it doesn't happen?",
    "When was the last time you felt truly at peace, and what was happening?",
    "What's a wound that's still healing, even slowly?",
    "What do you need more of that you find hard to ask for?",
    "What does feeling loved by me look like on a really hard day?",
    "What's a fear about us you've never said out loud?",
    "What's a question you wish I would ask you more?",
];

/** Depth decks intentionally kept OUT of the everyday rotation (tone). */
const EXCLUDED_DECK_IDS = new Set<string>(['after-dark', 'repair']);

/** Duet deck texts — 48 two-pen prompts across six moods. */
const DUET_TEXTS: string[] = DUET_PROMPTS.map(p => p.text);

/** Depths deck texts, minus the spicy/conflict decks (beginnings+depths+play+future). */
const DEPTHS_TEXTS: string[] = DEPTHS_DECKS
    .filter(d => !EXCLUDED_DECK_IDS.has(d.id))
    .flatMap(d => d.questions.map(q => q.text));

/**
 * The widened daily rotation pool, de-duped defensively (a few Duet/Depths
 * texts overlap thematically with the base pool — e.g. a fear about "us" never
 * said out loud). `Array.from(new Set(...))` preserves first-seen order, which
 * keeps the order stable and deterministic across both builds.
 */
export const DAILY_POOL: string[] = Array.from(
    new Set<string>([...DAILY_BASE, ...DUET_TEXTS, ...DEPTHS_TEXTS]),
);
