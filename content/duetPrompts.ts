/**
 * Duet Journal prompt deck.
 * One prompt, two pens — every prompt must be answerable in 2–6 sentences
 * and pull something honest out of both partners. Balanced across moods,
 * 8 per mood, 48 total.
 */

export type DuetMood = 'tender' | 'playful' | 'deep' | 'gratitude' | 'memory' | 'future';

export interface DuetPrompt {
    id: string;
    text: string;
    mood: DuetMood;
}

export const DUET_PROMPTS: DuetPrompt[] = [
    // ── Tender ──────────────────────────────────────────────────────
    { id: 'tender-1', mood: 'tender', text: 'What’s one thing I do when I think no one’s watching that you secretly love?' },
    { id: 'tender-2', mood: 'tender', text: 'Describe the exact moment you felt safest with me. Where were we, and what made it safe?' },
    { id: 'tender-3', mood: 'tender', text: 'When was the last time I made you feel chosen — not just loved, but chosen?' },
    { id: 'tender-4', mood: 'tender', text: 'What’s something small I said once that you’ve kept ever since, without telling me?' },
    { id: 'tender-5', mood: 'tender', text: 'Where do your eyes go first when you look at me, and what do they find there?' },
    { id: 'tender-6', mood: 'tender', text: 'What do I do when you’re sad that works better than I probably realize?' },
    { id: 'tender-7', mood: 'tender', text: 'Finish this honestly: “I never feel more like myself than when you…”' },
    { id: 'tender-8', mood: 'tender', text: 'What’s one way I love you that you’ve never seen anyone love anyone else?' },

    // ── Playful ─────────────────────────────────────────────────────
    { id: 'playful-1', mood: 'playful', text: 'If we got banned from a restaurant together, what would the story be?' },
    { id: 'playful-2', mood: 'playful', text: 'What’s my most ridiculous habit — the one you’d still defend to the death?' },
    { id: 'playful-3', mood: 'playful', text: 'If our relationship had a mascot, what would it be? Defend your answer.' },
    { id: 'playful-4', mood: 'playful', text: 'It’s a free Tuesday, zero responsibilities. What do I actually do with it? Be honest.' },
    { id: 'playful-5', mood: 'playful', text: 'Which fictional couple are we on a good day? And on a chaotic one?' },
    { id: 'playful-6', mood: 'playful', text: 'If we pulled one perfectly harmless heist together, what would we steal and why?' },
    { id: 'playful-7', mood: 'playful', text: 'Impersonate me in exactly one sentence. Go.' },
    { id: 'playful-8', mood: 'playful', text: 'In your version of the movie, what song plays when I walk into the room?' },

    // ── Deep ────────────────────────────────────────────────────────
    { id: 'deep-1', mood: 'deep', text: 'What’s one fear about us you’ve never said out loud?' },
    { id: 'deep-2', mood: 'deep', text: 'What part of yourself did you only discover because of this relationship?' },
    { id: 'deep-3', mood: 'deep', text: 'What do you need more of from me that you haven’t asked for yet?' },
    { id: 'deep-4', mood: 'deep', text: 'When have you felt most distant from me — and what quietly brought you back?' },
    { id: 'deep-5', mood: 'deep', text: 'What’s a hard truth about love you learned with me, not from me?' },
    { id: 'deep-6', mood: 'deep', text: 'If we argued tonight, what would it secretly be about underneath?' },
    { id: 'deep-7', mood: 'deep', text: 'What do you protect me from that I’ve never even noticed?' },
    { id: 'deep-8', mood: 'deep', text: 'What’s something you believe about us that you’re a little afraid to test?' },

    // ── Gratitude ───────────────────────────────────────────────────
    { id: 'gratitude-1', mood: 'gratitude', text: 'What’s one ordinary thing I did this month that quietly meant everything?' },
    { id: 'gratitude-2', mood: 'gratitude', text: 'Which of my flaws are you secretly grateful for?' },
    { id: 'gratitude-3', mood: 'gratitude', text: 'What did I get you through that you never properly thanked me for?' },
    { id: 'gratitude-4', mood: 'gratitude', text: 'Name one way your daily life is physically different — better — because I’m in it.' },
    { id: 'gratitude-5', mood: 'gratitude', text: 'What habit of mine made one of your hard days easier recently?' },
    { id: 'gratitude-6', mood: 'gratitude', text: 'What did you stop worrying about the day you realized I wasn’t going anywhere?' },
    { id: 'gratitude-7', mood: 'gratitude', text: 'What’s the most underrated thing about being loved by me?' },
    { id: 'gratitude-8', mood: 'gratitude', text: 'Who did I help you become that you couldn’t have become alone?' },

    // ── Memory ──────────────────────────────────────────────────────
    { id: 'memory-1', mood: 'memory', text: 'What’s a five-minute moment from our story you’d relive on a loop?' },
    { id: 'memory-2', mood: 'memory', text: 'What detail from our first date do you remember that I probably don’t?' },
    { id: 'memory-3', mood: 'memory', text: 'When did you first catch yourself missing me before I’d even left?' },
    { id: 'memory-4', mood: 'memory', text: 'Describe a photo of us that doesn’t exist but absolutely should.' },
    { id: 'memory-5', mood: 'memory', text: 'Which version of us do you miss a little, even though now is better?' },
    { id: 'memory-6', mood: 'memory', text: 'What was the exact moment you stopped performing and just became yourself with me?' },
    { id: 'memory-7', mood: 'memory', text: 'What’s the funniest thing we’ve survived together?' },
    { id: 'memory-8', mood: 'memory', text: 'What smell, song or street corner teleports you straight back to early us?' },

    // ── Future ──────────────────────────────────────────────────────
    { id: 'future-1', mood: 'future', text: 'What’s one tradition we haven’t invented yet that you want us to start?' },
    { id: 'future-2', mood: 'future', text: 'Describe us at seventy, on a completely ordinary Tuesday.' },
    { id: 'future-3', mood: 'future', text: 'What’s a trip you’re quietly building in your head for us?' },
    { id: 'future-4', mood: 'future', text: 'What do you hope our home always feels like the moment you walk in?' },
    { id: 'future-5', mood: 'future', text: 'What’s one thing about us you hope we never outgrow?' },
    { id: 'future-6', mood: 'future', text: 'What scares you most about our future — and what makes it worth it anyway?' },
    { id: 'future-7', mood: 'future', text: 'If we sealed a letter to open in ten years, what one line has to be in it?' },
    { id: 'future-8', mood: 'future', text: 'What’s something you want us to be brave enough to do within a year?' },
];

export const MOOD_TINTS: Record<DuetMood, string> = {
    tender: '#f9a8d4',
    playful: '#fbbf24',
    deep: '#818cf8',
    gratitude: '#6ee7b7',
    memory: '#e879f9',
    future: '#7dd3fc',
};

export const MOOD_LABELS: Record<DuetMood, string> = {
    tender: 'Tender',
    playful: 'Playful',
    deep: 'Deep',
    gratitude: 'Gratitude',
    memory: 'Memory',
    future: 'Future',
};
