import type { LoveLanguageType } from '../types';

/**
 * Love Missions — the weekly mission pool.
 * Three are drawn deterministically every Monday (see views/LoveMissions.tsx),
 * biased toward the partner's primary love language when one is known.
 * Titles are imperative and warm; details say exactly how, with a twist.
 */

export interface MissionTemplate {
    id: string;
    title: string;
    detail: string;
    language: LoveLanguageType | 'any';
}

export const MISSION_POOL: MissionTemplate[] = [
    // ── Words of affirmation ────────────────────────────────────────
    {
        id: 'words-01',
        title: 'Leave a note where only they will find it',
        detail: 'Three lines, tucked into their coat pocket, wallet or laptop sleeve. Name one specific thing they did this week that you never said out loud.',
        language: 'words_of_affirmation',
    },
    {
        id: 'words-02',
        title: 'Tell them what you tell strangers about them',
        detail: 'We brag about our partners to other people and forget to say it to their face. Tonight, deliver the brag directly — word for word, eyes up.',
        language: 'words_of_affirmation',
    },
    {
        id: 'words-03',
        title: 'Send the 4pm message',
        detail: 'Mid-afternoon is where days sag. Set a quiet alarm and send one sentence about why you are glad you get to come home to them.',
        language: 'words_of_affirmation',
    },
    {
        id: 'words-04',
        title: 'Finish the sentence: "I never told you, but…"',
        detail: 'Say it out loud over dinner. Pick something true and kind from before this week — an old moment they do not know mattered to you.',
        language: 'words_of_affirmation',
    },
    {
        id: 'words-05',
        title: 'Compliment the thing they apologise for',
        detail: 'Not their best feature — the one they are shy about. Be specific, be gentle, and say why it is part of what you love.',
        language: 'words_of_affirmation',
    },
    {
        id: 'words-06',
        title: 'Leave a one-line review on the mirror',
        detail: 'A sticky note rating something gloriously mundane they do: "10/10 the way you laugh at your own jokes. Would recommend."',
        language: 'words_of_affirmation',
    },
    {
        id: 'words-07',
        title: 'Thank them for something invisible',
        detail: 'Find a kindness nobody acknowledges — the bins, the bills, the check-in texts to your family — and thank them for it by name.',
        language: 'words_of_affirmation',
    },
    {
        id: 'words-08',
        title: 'Praise them in front of a witness',
        detail: 'A compliment lands twice as hard when someone else hears it. Next time you are with friends or family, tell a story where they are the hero.',
        language: 'words_of_affirmation',
    },
    {
        id: 'words-09',
        title: 'Record a voice note for a bad day',
        detail: 'Thirty seconds, told like you are talking them off a hard afternoon. Tell them to save it for when they need it — someday they will.',
        language: 'words_of_affirmation',
    },
    {
        id: 'words-10',
        title: 'Upgrade one "thanks" to the full sentence',
        detail: 'Instead of "thanks", say exactly what they did and how it landed: "You took that call so I could rest. I noticed."',
        language: 'words_of_affirmation',
    },

    // ── Quality time ────────────────────────────────────────────────
    {
        id: 'time-01',
        title: 'Take the long way home together',
        detail: 'Pick one errand this week and double its length on purpose. No podcast, no rush — just the detour and the conversation it makes room for.',
        language: 'quality_time',
    },
    {
        id: 'time-02',
        title: 'Put both phones in a drawer for one dinner',
        detail: 'Both phones, one drawer, until the plates are cleared. The first ten minutes feel strange; the next thirty are why you are doing it.',
        language: 'quality_time',
    },
    {
        id: 'time-03',
        title: 'Recreate your earliest date on a budget of nothing',
        detail: 'Same kind of food, same kind of walk, the questions you asked when you were still nervous. Notice what has changed and say so.',
        language: 'quality_time',
    },
    {
        id: 'time-04',
        title: 'Watch their comfort show without complaint',
        detail: 'The one they always offer and you always veto. Sit close, ask questions, and let them explain why episode four matters.',
        language: 'quality_time',
    },
    {
        id: 'time-05',
        title: 'Turn one chore into a date',
        detail: 'Cooking, folding, the grocery run — pick one and do it shoulder to shoulder with music on. Slow it down instead of dividing it up.',
        language: 'quality_time',
    },
    {
        id: 'time-06',
        title: 'Steal twenty minutes of morning',
        detail: 'Set the alarm twenty minutes early, once. Coffee, bed, no agenda. The day can have the rest of you.',
        language: 'quality_time',
    },
    {
        id: 'time-07',
        title: 'Go somewhere neither of you has been',
        detail: 'It can be one suburb over — a park, a bakery, a strange little shop. New ground turns old couples back into explorers.',
        language: 'quality_time',
    },
    {
        id: 'time-08',
        title: 'Sit through one entire sunset',
        detail: 'Find west-facing anything — a balcony, a parked car, a kerb — and stay until the colour is gone. That is the whole mission.',
        language: 'quality_time',
    },
    {
        id: 'time-09',
        title: 'Join their hobby for thirty minutes',
        detail: 'The run, the game, the garden — the thing they do without you. Do not try to be good at it; try to be there.',
        language: 'quality_time',
    },
    {
        id: 'time-10',
        title: 'Hold a ten-minute debrief with snacks',
        detail: 'Before bed, split something tasty and each answer two questions: best minute of the day, hardest minute of the day. No fixing — just listening.',
        language: 'quality_time',
    },

    // ── Acts of service ─────────────────────────────────────────────
    {
        id: 'acts-01',
        title: 'Take the task they keep postponing',
        detail: 'Find the thing quietly dreaded for weeks — the return, the email, the broken whatever — and finish it without announcing it first.',
        language: 'acts_of_service',
    },
    {
        id: 'acts-02',
        title: 'Set up their morning the night before',
        detail: 'Coffee ready to press, keys by the door, lunch packed. Let their first ten minutes tomorrow run on rails you laid tonight.',
        language: 'acts_of_service',
    },
    {
        id: 'acts-03',
        title: 'Do their least favourite chore — their way',
        detail: 'Take it over for the week, and do it exactly how they do it, not your improved version. The way they do it is the love part.',
        language: 'acts_of_service',
    },
    {
        id: 'acts-04',
        title: 'Beat the weather to it',
        detail: 'Whatever the season costs them daily — scrape the ice, start the fan, set out the umbrella — handle it once before they have thought of it.',
        language: 'acts_of_service',
    },
    {
        id: 'acts-05',
        title: 'Refill what they are about to run out of',
        detail: 'Quietly audit their world: shampoo, phone battery, transit card, printer paper. Top one thing up before it becomes their problem.',
        language: 'acts_of_service',
    },
    {
        id: 'acts-06',
        title: 'Make the call they have been avoiding',
        detail: 'The appointment to book, the subscription to cancel, the bill to dispute. Take it off their plate entirely — done is the gift.',
        language: 'acts_of_service',
    },
    {
        id: 'acts-07',
        title: 'Cook the meal that means home to them',
        detail: 'Not your signature dish — theirs. The childhood one, the rainy-day one. Get the details right; call their mum if you have to.',
        language: 'acts_of_service',
    },
    {
        id: 'acts-08',
        title: 'Fix the small broken thing',
        detail: 'The wobbly handle, the dead bulb, the drawer that sticks. It has been quietly annoying them for a month. Make it disappear.',
        language: 'acts_of_service',
    },
    {
        id: 'acts-09',
        title: 'Give them one hour of nothing',
        detail: 'Take everything — kids, dishes, dog, doorbell — for a full hour and tell them the time is theirs. Then guard the door.',
        language: 'acts_of_service',
    },
    {
        id: 'acts-10',
        title: 'Be the one who remembers',
        detail: 'Find one thing they are carrying — a deadline, a hard anniversary, an appointment — and set your own reminder. When it arrives, be already there.',
        language: 'acts_of_service',
    },

    // ── Physical touch ──────────────────────────────────────────────
    {
        id: 'touch-01',
        title: 'Hold the hug for ten full seconds',
        detail: 'The hello-hug is usually two seconds. Once this week, hold one until you both actually exhale. Count silently if you need to.',
        language: 'physical_touch',
    },
    {
        id: 'touch-02',
        title: 'Offer the no-occasion massage',
        detail: 'Eight minutes, shoulders or feet, nothing expected back. Set a timer so they can stop tracking time and actually relax into it.',
        language: 'physical_touch',
    },
    {
        id: 'touch-03',
        title: 'Hold hands somewhere you usually do not',
        detail: 'The supermarket queue, the car console, the walk to the bins. Small public tethering — like you are new again.',
        language: 'physical_touch',
    },
    {
        id: 'touch-04',
        title: 'Be the one who crosses the sofa gap',
        detail: 'Whatever your sofa geometry is tonight, close it. Head on shoulder, legs over lap — reach over first, without being asked.',
        language: 'physical_touch',
    },
    {
        id: 'touch-05',
        title: 'Kiss them like you are late for the airport',
        detail: 'Once this week, replace the routine peck with a kiss that has your full attention. Two extra seconds changes everything.',
        language: 'physical_touch',
    },
    {
        id: 'touch-06',
        title: 'Find where the stress actually lives',
        detail: 'Ask: "where is the tension sitting today?" Then spend five minutes on exactly that spot — temples, jaw, hands, lower back.',
        language: 'physical_touch',
    },
    {
        id: 'touch-07',
        title: 'Slow dance in the kitchen',
        detail: 'One song, lights low, dinner can wait. If you do not have a song yet, this is exactly how couples get one.',
        language: 'physical_touch',
    },
    {
        id: 'touch-08',
        title: 'Be the warm-up',
        detail: 'Cold hands, cold feet, cold side of the bed — fix it with yourself, not the heater. Yes, even the icy feet. Especially the icy feet.',
        language: 'physical_touch',
    },
    {
        id: 'touch-09',
        title: 'Touch base — literally — all day',
        detail: 'Every time you pass them at home today, make brief contact: shoulder, back, hair. A dozen tiny check-ins says "I see you" better than a speech.',
        language: 'physical_touch',
    },
    {
        id: 'touch-10',
        title: 'Trade the evening scroll for head scratches',
        detail: 'Tonight, when you would both default to screens, offer ten minutes of head scratches while they watch whatever they want. Devastatingly effective.',
        language: 'physical_touch',
    },

    // ── Gifts ───────────────────────────────────────────────────────
    {
        id: 'gifts-01',
        title: 'Buy the small thing they mentioned once',
        detail: 'Weeks ago they noticed something tiny — a snack, a pen, a candle — and moved on. You did not. Producing it now proves you listen.',
        language: 'gifts',
    },
    {
        id: 'gifts-02',
        title: 'Bring home their exact order, unprompted',
        detail: 'The precise coffee, the specific chocolate, the right pastry from the right place. The gift is not the item — it is the precision.',
        language: 'gifts',
    },
    {
        id: 'gifts-03',
        title: 'Print the photo you always scroll back to',
        detail: 'Pick the one picture you keep returning to in your camera roll. Print it — a pharmacy machine is fine — and put it where mornings happen.',
        language: 'gifts',
    },
    {
        id: 'gifts-04',
        title: 'Make them a three-song gift',
        detail: 'Not a sixty-track playlist — three songs, with one line each on why. Small enough to actually listen to on the way to work.',
        language: 'gifts',
    },
    {
        id: 'gifts-05',
        title: 'Give them flowers on a random Tuesday',
        detail: 'Or a plant, or one stem from a corner shop. Occasion-less flowers say more than anniversary ones ever can.',
        language: 'gifts',
    },
    {
        id: 'gifts-06',
        title: 'Plant a tiny gift in their day',
        detail: 'Hide a small treat where their routine will find it — coat pocket, car cup-holder, lunch bag. Love them by ambush.',
        language: 'gifts',
    },
    {
        id: 'gifts-07',
        title: 'Buy a backup of the thing they ration',
        detail: 'Whatever they treat as "a treat" — the fancy tea, the good chocolate — buy a second before they run out. Abundance is its own message.',
        language: 'gifts',
    },
    {
        id: 'gifts-08',
        title: 'Make something with your actual hands',
        detail: 'A terrible drawing, a folded card, a lopsided baked thing. Handmade beats expensive in the only currency that matters here.',
        language: 'gifts',
    },
    {
        id: 'gifts-09',
        title: 'Post them a letter to your own address',
        detail: 'A real card, a real stamp, addressed to them at home. Nobody gets non-bill mail anymore. Watch their face when it lands.',
        language: 'gifts',
    },
    {
        id: 'gifts-10',
        title: 'Gift them an out',
        detail: 'Hand-make a voucher: one guilt-free lazy Sunday, one dinner of their choosing, one veto. Redeemable whenever — and honoured without grumbling.',
        language: 'gifts',
    },

    // ── Wildcard (any language) ─────────────────────────────────────
    {
        id: 'any-01',
        title: 'Ask the question you have never asked',
        detail: 'Find one — "what do you daydream about lately?", "what were you like at nine?" — and ask it when there is time for the real answer.',
        language: 'any',
    },
    {
        id: 'any-02',
        title: 'Narrate your favourite memory of them — to them',
        detail: 'Pick one moment from your history and retell it in full detail: what they wore, what you thought, when you knew. Watch them light up.',
        language: 'any',
    },
    {
        id: 'any-03',
        title: 'Put something six months away on the calendar',
        detail: 'A trip, a dinner, a tiny tradition — anything with a real date on it. Every couple needs a lighthouse on the calendar.',
        language: 'any',
    },
    {
        id: 'any-04',
        title: 'Apologise for the small thing you let slide',
        detail: 'Not the big stuff — the snappy tone on Tuesday, the reply you forgot. Name it before they have to. Clean slates are romantic.',
        language: 'any',
    },
    {
        id: 'any-05',
        title: 'Institute the thirty-second reunion',
        detail: 'When you reunite at the end of the day this week, give the first thirty seconds to a proper hello — before bags, logistics or "what is for dinner?"',
        language: 'any',
    },
    {
        id: 'any-06',
        title: 'Defend their guilty pleasure',
        detail: 'Find the thing they get teased for liking — the show, the band, the cursed food combo — and join in wholeheartedly, once. Be allies in dumb joy.',
        language: 'any',
    },
    {
        id: 'any-07',
        title: 'Swap one worry each',
        detail: 'Each of you shares one thing currently sitting on your chest — work, family, anything. No advice unless invited. Carried together is half the weight.',
        language: 'any',
    },
    {
        id: 'any-08',
        title: 'Revive an inside joke they think you forgot',
        detail: 'Dig up an old one from your early days and deploy it deadpan at the perfect moment. Shared history, weaponised for delight.',
        language: 'any',
    },
    {
        id: 'any-09',
        title: 'Say yes to everything small for one day',
        detail: 'The walk, the second episode, the "come look at this". For one whole day, every little invitation from them gets a yes.',
        language: 'any',
    },
    {
        id: 'any-10',
        title: 'Found a tiny ritual together',
        detail: 'Agree on one small repeatable thing — Sunday pancakes, a goodnight phrase, a Thursday walk — and hold round one this week.',
        language: 'any',
    },
];
