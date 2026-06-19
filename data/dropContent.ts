/**
 * dropContent.ts — content banks for the Daily Drop rotation.
 *
 * Pure data. The engine (utils/dropEngine.ts) deterministically selects one
 * entry per (couple, date) and FREEZES it into the saved row, so editing a bank
 * here never mutates an in-flight drop. Order is stable; append, don't reorder
 * (a reorder shifts which content a given day resolves to, which is harmless but
 * means two partners on mismatched app versions could see different content —
 * keep banks append-only across releases).
 */
import type { DropOption } from '../types';

export interface ThisOrThatEntry {
  title: string;
  a: DropOption;
  b: DropOption;
}

export interface DidTheyKnowEntry {
  title: string;
  options: DropOption[];
}

// ── this_or_that ───────────────────────────────────────────────────────────
export const THIS_OR_THAT: ThisOrThatEntry[] = [
  { title: 'Right now, I’d rather…', a: { id: 'beach', label: 'Beach day', emoji: '🏖️' }, b: { id: 'mountains', label: 'Mountain air', emoji: '🏔️' } },
  { title: 'Tonight calls for…', a: { id: 'in', label: 'Cozy night in', emoji: '🛋️' }, b: { id: 'out', label: 'Out somewhere', emoji: '🌃' } },
  { title: 'If we ran away tomorrow…', a: { id: 'roadtrip', label: 'Road trip', emoji: '🚗' }, b: { id: 'flight', label: 'Catch a flight', emoji: '✈️' } },
  { title: 'My love language today is…', a: { id: 'words', label: 'Sweet words', emoji: '💬' }, b: { id: 'touch', label: 'Just hold me', emoji: '🤍' } },
  { title: 'Pick our perfect morning:', a: { id: 'slow', label: 'Slow & sleepy', emoji: '😴' }, b: { id: 'sunrise', label: 'Up for sunrise', emoji: '🌅' } },
  { title: 'Dessert, obviously. But…', a: { id: 'choc', label: 'Chocolate', emoji: '🍫' }, b: { id: 'fruit', label: 'Something fruity', emoji: '🍓' } },
  { title: 'Our soundtrack right now:', a: { id: 'calm', label: 'Soft & calm', emoji: '🎐' }, b: { id: 'hype', label: 'Loud & alive', emoji: '🎶' } },
  { title: 'If today were a season…', a: { id: 'summer', label: 'Warm summer', emoji: '☀️' }, b: { id: 'autumn', label: 'Cozy autumn', emoji: '🍂' } },
  { title: 'Rather spend the evening…', a: { id: 'movie', label: 'Movie & blanket', emoji: '🎬' }, b: { id: 'walk', label: 'A long walk', emoji: '🌙' } },
  { title: 'Our next little date:', a: { id: 'cafe', label: 'Quiet café', emoji: '☕' }, b: { id: 'adventure', label: 'Try something new', emoji: '🗺️' } },
  { title: 'Honestly, today I am more…', a: { id: 'soft', label: 'Soft & slow', emoji: '🫧' }, b: { id: 'spark', label: 'Restless & sparky', emoji: '⚡' } },
  { title: 'If I could teleport to you now…', a: { id: 'hug', label: 'For a long hug', emoji: '🫂' }, b: { id: 'mischief', label: 'To cause mischief', emoji: '😏' } },
];

// ── guess_my_mood (fixed palette; both pick their own + guess the other) ─────
export const MOOD_PALETTE: DropOption[] = [
  { id: 'radiant', label: 'Radiant', emoji: '☀️' },
  { id: 'content', label: 'Content', emoji: '🌿' },
  { id: 'tender', label: 'Tender', emoji: '💗' },
  { id: 'playful', label: 'Playful', emoji: '✨' },
  { id: 'tired', label: 'Tired', emoji: '🌙' },
  { id: 'foggy', label: 'Foggy', emoji: '🌫️' },
  { id: 'stormy', label: 'Stormy', emoji: '⛈️' },
  { id: 'flat', label: 'Flat', emoji: '◽' },
];

export const GUESS_MY_MOOD_TITLES: string[] = [
  'How’s your heart today?',
  'Set your mood — I’ll try to read you',
  'Where are you, really, right now?',
  'Today’s weather, on the inside:',
];

// ── did_they_know (answer for yourself + guess your partner) ─────────────────
export const DID_THEY_KNOW: DidTheyKnowEntry[] = [
  { title: 'My ideal Friday night is…', options: [
    { id: 'cozy', label: 'Cozy in', emoji: '🏠' }, { id: 'loud', label: 'Out & loud', emoji: '🎉' },
    { id: 'drive', label: 'A spontaneous drive', emoji: '🚗' }, { id: 'dinner', label: 'Dinner somewhere new', emoji: '🍝' } ] },
  { title: 'My comfort meal is…', options: [
    { id: 'noodles', label: 'Noodles', emoji: '🍜' }, { id: 'pizza', label: 'Pizza', emoji: '🍕' },
    { id: 'homecooked', label: 'Something home-cooked', emoji: '🍲' }, { id: 'sweet', label: 'Just dessert', emoji: '🍰' } ] },
  { title: 'When I’m stressed, what I really want is…', options: [
    { id: 'space', label: 'A little space', emoji: '🌫️' }, { id: 'hug', label: 'To be held', emoji: '🫂' },
    { id: 'talk', label: 'To talk it out', emoji: '💬' }, { id: 'distract', label: 'A good distraction', emoji: '🎮' } ] },
  { title: 'My dream tiny vacation is…', options: [
    { id: 'beach', label: 'Beach & nothing', emoji: '🏝️' }, { id: 'city', label: 'A buzzing city', emoji: '🏙️' },
    { id: 'cabin', label: 'A quiet cabin', emoji: '🌲' }, { id: 'home', label: 'A staycation', emoji: '🛏️' } ] },
  { title: 'The way to my heart this week is…', options: [
    { id: 'food', label: 'Bring me food', emoji: '🥡' }, { id: 'note', label: 'A little note', emoji: '💌' },
    { id: 'plan', label: 'Plan something', emoji: '📅' }, { id: 'listen', label: 'Just listen', emoji: '👂' } ] },
  { title: 'On a perfect lazy Sunday, I’d pick…', options: [
    { id: 'sleep', label: 'Sleep in late', emoji: '😴' }, { id: 'brunch', label: 'A slow brunch', emoji: '🥞' },
    { id: 'movies', label: 'Movies all day', emoji: '🎬' }, { id: 'outside', label: 'Get outside', emoji: '🌳' } ] },
  { title: 'The compliment I secretly love most is about my…', options: [
    { id: 'mind', label: 'Mind', emoji: '🧠' }, { id: 'humor', label: 'Humor', emoji: '😂' },
    { id: 'looks', label: 'Looks', emoji: '😍' }, { id: 'heart', label: 'Heart', emoji: '💗' } ] },
  { title: 'If I had a free afternoon, I’d…', options: [
    { id: 'nap', label: 'Nap, no guilt', emoji: '🛌' }, { id: 'create', label: 'Make something', emoji: '🎨' },
    { id: 'move', label: 'Move my body', emoji: '🏃' }, { id: 'wander', label: 'Wander aimlessly', emoji: '🚶' } ] },
];

// ── finish_my_sentence ───────────────────────────────────────────────────────
export const FINISH_MY_SENTENCE: string[] = [
  'Lately I keep thinking about…',
  'The thing I’d never want us to lose is…',
  'You made me smile this week when…',
  'A tiny thing I’m grateful for today is…',
  'If I could give you one feeling right now, it’d be…',
  'Something I’m looking forward to with you is…',
  'I feel most like myself when we…',
  'The version of us I love imagining is…',
  'One thing I wish I said out loud more is…',
  'Right now, home feels like…',
  'A moment from us I keep replaying is…',
  'Something small you do that I adore is…',
];

// ── on_this_day (titles; the memory itself is resolved at render) ────────────
export const ON_THIS_DAY_TITLES: string[] = [
  'Look what today used to be',
  'A little echo from your past',
  'On this day, once upon a time',
];

// ── secret_window (intimate; rationed by the rotation weights) ───────────────
export const SECRET_WINDOW: string[] = [
  'Something I haven’t told you yet…',
  'A fear about us I’ve never said out loud…',
  'Something you do that I’ve never admitted affects me…',
  'A part of me I find hard to share, even with you…',
  'Something I want more of but rarely ask for…',
  'A quiet hope I’m holding for us…',
  'A way you’ve changed me that I’ve never named…',
  'Something I’d want you to know if today were our last…',
];

// ── the_dare (tiny, real, same-day actions) ──────────────────────────────────
export const THE_DARE: string[] = [
  'Send a selfie from exactly where you are right now.',
  'Text your partner one specific thing you find attractive about them.',
  'Send a voice note saying good morning / good night — your real voice.',
  'Take a photo of something that reminded you of them today.',
  'Write down one memory you want to make together this month and send it.',
  'Do one small thing on their to-do list without being asked, then tell them.',
  'Send the last song that made you think of them.',
  'Pay them a compliment you’ve never said before.',
];

// ── pulse (one-tap; minimal copy, the visual is the message) ─────────────────
export const PULSE_TITLES: string[] = [
  'Send them a pulse',
  'Let them feel you thinking of them',
  'One tap. Straight to their heart.',
];
