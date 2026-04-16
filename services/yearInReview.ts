import type {
    DailyPhoto,
    Envelope,
    Keepsake,
    Memory,
    Note,
    SpecialDate,
    VoiceNote,
} from '../types';
import { StorageService } from './storage';

export interface YearStats {
    year: number;
    myName: string;
    partnerName: string;
    daysTogether: number;

    totalMemories: number;
    memoriesWithPhotos: number;
    memoriesWithVideos: number;

    activeDays: number;
    capturedMonths: number;
    activityStreak: number;
    totalActivities: number;

    mostActiveMonth: { name: string; count: number };
    monthHighlights: Array<{ month: string; count: number; share: number }>;
    standoutDays: Array<{ date: string; title: string; count: number }>;

    topMoods: Array<{ mood: string; emoji: string; count: number; share: number }>;
    topWords: Array<{ word: string; count: number }>;

    totalDailyPhotos: number;
    totalDailyVideos: number;
    totalNotes: number;
    openedLetters: number;
    totalKeepsakes: number;
    totalVoiceNotes: number;
    totalVoiceSeconds: number;
    totalMilestones: number;

    favoriteFormat: {
        label: string;
        count: number;
        description: string;
    };

    summary: string;
    narrative: string;
}

const MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

const MOOD_MAP: Record<string, string> = {
    love: 'Heart eyes',
    funny: 'Laughing',
    party: 'Celebration',
    peace: 'Calm',
    cute: 'Tender',
    happy: 'Sunny',
    loved: 'Cherished',
    excited: 'Sparked',
    relaxed: 'Soft',
    sad: 'Blue',
    angry: 'Stormy',
    anxious: 'Restless',
};

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
    'with', 'it', 'is', 'was', 'we', 'i', 'you', 'he', 'she', 'they', 'this',
    'that', 'so', 'as', 'be', 'had', 'have', 'are', 'were', 'our', 'my', 'your',
    'his', 'her', 'its', 'just', 'got', 'did', 'not', 'no', 'will', 'would',
    'could', 'from', 'out', 'very', 'then', 'when', 'what', 'how', 'all', 'also',
    'up', 'down', 'into', 'about', 'over', 'after', 'before', 'because', 'still',
    'more', 'than', 'them', 'been', 'only', 'really', 'there', 'here',
]);

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const isInYear = (dateString: string | undefined, targetYear: number): boolean => {
    if (!dateString) return false;
    const date = new Date(dateString);
    return !Number.isNaN(date.getTime()) && date.getFullYear() === targetYear;
};

const toDateKey = (dateString: string): string => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDateTitle = (dateKey: string): string => {
    const date = new Date(`${dateKey}T00:00:00`);
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    });
};

const computeLongestStreak = (dateKeys: string[]): number => {
    if (dateKeys.length === 0) return 0;

    const sorted = [...new Set(dateKeys)].sort();
    let best = 1;
    let current = 1;

    for (let i = 1; i < sorted.length; i += 1) {
        const prev = new Date(`${sorted[i - 1]}T00:00:00`);
        const next = new Date(`${sorted[i]}T00:00:00`);
        const diff = Math.round((next.getTime() - prev.getTime()) / MS_PER_DAY);
        if (diff === 1) {
            current += 1;
            best = Math.max(best, current);
        } else {
            current = 1;
        }
    }

    return best;
};

const getMonthCounts = (dateKeys: string[]): Record<number, number> => {
    const counts: Record<number, number> = {};
    for (const dateKey of dateKeys) {
        const month = Number(dateKey.slice(5, 7)) - 1;
        counts[month] = (counts[month] ?? 0) + 1;
    }
    return counts;
};

const buildMonthHighlights = (
    monthCounts: Record<number, number>,
    total: number,
): Array<{ month: string; count: number; share: number }> => {
    return Object.entries(monthCounts)
        .map(([month, count]) => ({
            month: MONTH_NAMES[Number(month)],
            count,
            share: total > 0 ? Math.round((count / total) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
};

const computeMilestoneOccurrences = (dates: SpecialDate[], targetYear: number): number => {
    return dates.reduce((sum, item) => {
        if (item.type === 'other') {
            return sum + (isInYear(item.date, targetYear) ? 1 : 0);
        }
        return sum + 1;
    }, 0);
};

const collectWordFrequency = (texts: string[]): Array<{ word: string; count: number }> => {
    const frequency: Record<string, number> = {};

    for (const text of texts) {
        const words = text
            .toLowerCase()
            .replace(/[^a-z\s]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);

        for (const word of words) {
            if (word.length <= 3 || STOP_WORDS.has(word)) continue;
            frequency[word] = (frequency[word] ?? 0) + 1;
        }
    }

    return Object.entries(frequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([word, count]) => ({ word, count }));
};

const pickFavoriteFormat = (counts: Record<string, number>): YearStats['favoriteFormat'] => {
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!ranked || ranked[1] === 0) {
        return {
            label: 'Shared moments',
            count: 0,
            description: 'This chapter is still waiting for its signature ritual.',
        };
    }

    const [key, count] = ranked;
    const descriptions: Record<string, { label: string; description: string }> = {
        memories: {
            label: 'Memories',
            description: 'You kept coming back to the vault to preserve what mattered.',
        },
        dailyPhotos: {
            label: 'Daily moments',
            description: 'Quick glimpses of real life became a ritual this year.',
        },
        dailyVideos: {
            label: 'Daily videos',
            description: 'Tiny moving snapshots carried the energy of your everyday life.',
        },
        notes: {
            label: 'Notes',
            description: 'Words carried a lot of the emotional weight this year.',
        },
        letters: {
            label: 'Open When letters',
            description: 'You saved comfort for the exact moments it would be needed.',
        },
        keepsakes: {
            label: 'Keepsakes',
            description: 'You treated your relationship like an archive worth curating.',
        },
        voiceNotes: {
            label: 'Voice notes',
            description: 'Hearing each other became part of the texture of the year.',
        },
    };

    return {
        label: descriptions[key]?.label ?? 'Shared moments',
        count,
        description: descriptions[key]?.description
            ?? 'This format carried the strongest signal in your story.',
    };
};

const buildSummary = (
    year: number,
    totalMemories: number,
    activeDays: number,
    favoriteFormat: YearStats['favoriteFormat'],
): string => {
    if (totalMemories === 0 && activeDays === 0) {
        return `${year} was a quiet chapter in the app, with room to turn next year into something unforgettable.`;
    }

    if (activeDays >= 90) {
        return `${year} felt lived in. You showed up on ${activeDays} separate days and turned ${favoriteFormat.label.toLowerCase()} into a real ritual.`;
    }

    if (totalMemories >= 24) {
        return `${year} became a collection worth revisiting, with ${totalMemories} memories and a clear rhythm of keeping each other close.`;
    }

    return `${year} held a smaller set of moments, but the signal was still clear: you kept finding ways to stay close.`;
};

const buildNarrative = (
    stats: Pick<
        YearStats,
        | 'favoriteFormat'
        | 'mostActiveMonth'
        | 'activityStreak'
        | 'topMoods'
        | 'totalActivities'
        | 'totalVoiceNotes'
    >,
): string => {
    const leadMood = stats.topMoods[0];
    const moodText = leadMood
        ? `${leadMood.emoji} energy showed up most often`
        : 'the emotional story is still taking shape';

    if (stats.totalActivities === 0) {
        return 'The premium layer is ready. It just needs more of your story to turn this into a yearly classic.';
    }

    if (stats.activityStreak >= 7) {
        return `${stats.mostActiveMonth.name} was the peak, ${stats.favoriteFormat.label.toLowerCase()} became your strongest habit, and a ${stats.activityStreak}-day run proved you can build rituals that last.`;
    }

    if (stats.totalVoiceNotes > 0) {
        return `${stats.favoriteFormat.label} carried the year, ${moodText}, and voice notes added a sense of presence that text alone never could.`;
    }

    return `${stats.favoriteFormat.label} defined the rhythm of the year, ${moodText}, and ${stats.mostActiveMonth.name} gave the story its strongest chapter.`;
};

const collectYears = (dateStrings: Array<string | undefined>): number[] => {
    const years = new Set<number>();

    for (const value of dateStrings) {
        if (!value) continue;
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            years.add(date.getFullYear());
        }
    }

    return [...years];
};

export function getAvailableReviewYears(): number[] {
    const profile = StorageService.getCoupleProfile();
    const years = new Set<number>([new Date().getFullYear()]);

    collectYears(StorageService.getMemories().map((item) => item.date)).forEach((year) => years.add(year));
    collectYears(StorageService.getDailyPhotos().map((item) => item.createdAt)).forEach((year) => years.add(year));
    collectYears(StorageService.getNotes().map((item) => item.createdAt)).forEach((year) => years.add(year));
    collectYears(StorageService.getKeepsakes().map((item) => item.date)).forEach((year) => years.add(year));
    collectYears(StorageService.getVoiceNotes().map((item) => item.createdAt)).forEach((year) => years.add(year));
    collectYears(StorageService.getSpecialDates().map((item) => item.date)).forEach((year) => years.add(year));

    if (profile.anniversaryDate) {
        years.add(new Date(profile.anniversaryDate).getFullYear());
    }

    return [...years].sort((a, b) => b - a);
}

export function computeYearStats(year?: number): YearStats {
    const targetYear = year ?? new Date().getFullYear();
    const profile = StorageService.getCoupleProfile();

    const memories = StorageService.getMemories().filter((item) => isInYear(item.date, targetYear));
    const dailyMoments = StorageService.getDailyPhotos().filter((item) => isInYear(item.createdAt, targetYear));
    const notes = StorageService.getNotes().filter((item) => isInYear(item.createdAt, targetYear));
    const keepsakes = StorageService.getKeepsakes()
        .filter((item) => !item.isHidden && isInYear(item.date, targetYear));
    const voiceNotes = StorageService.getVoiceNotes().filter((item) => isInYear(item.createdAt, targetYear));
    const specialDates = StorageService.getSpecialDates();
    const envelopes = StorageService.getEnvelopes();

    const activityDates = [
        ...memories.map((item) => toDateKey(item.date)),
        ...dailyMoments.map((item) => toDateKey(item.createdAt)),
        ...notes.map((item) => toDateKey(item.createdAt)),
        ...keepsakes.map((item) => toDateKey(item.date)),
        ...voiceNotes.map((item) => toDateKey(item.createdAt)),
    ];

    const uniqueActivityDates = [...new Set(activityDates)];
    const monthCounts = getMonthCounts(activityDates);
    const monthHighlights = buildMonthHighlights(monthCounts, activityDates.length);

    const mostActiveMonth = monthHighlights[0]
        ? { name: monthHighlights[0].month, count: monthHighlights[0].count }
        : { name: 'No big month yet', count: 0 };

    const dayCounts: Record<string, number> = {};
    for (const dateKey of activityDates) {
        dayCounts[dateKey] = (dayCounts[dateKey] ?? 0) + 1;
    }

    const standoutDays = Object.entries(dayCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([date, count]) => ({
            date,
            count,
            title: formatDateTitle(date),
        }));

    const moodCounts: Record<string, number> = {};
    for (const memory of memories) {
        if (!memory.mood) continue;
        moodCounts[memory.mood] = (moodCounts[memory.mood] ?? 0) + 1;
    }

    const topMoods = Object.entries(moodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([mood, count]) => ({
            mood,
            count,
            share: memories.length > 0 ? Math.round((count / memories.length) * 100) : 0,
            emoji: MOOD_MAP[mood] ?? 'Signature',
        }));

    const topWords = collectWordFrequency([
        ...memories.map((item) => item.text || ''),
        ...notes.map((item) => item.content || ''),
    ]);

    const favoriteFormat = pickFavoriteFormat({
        memories: memories.length,
        dailyPhotos: dailyMoments.filter((item) => !item.video && !item.videoId).length,
        dailyVideos: dailyMoments.filter((item) => !!item.video || !!item.videoId).length,
        notes: notes.length,
        letters: envelopes.filter((item) => isInYear(item.openedAt, targetYear)).length,
        keepsakes: keepsakes.length,
        voiceNotes: voiceNotes.length,
    });

    const reviewEnd = targetYear === new Date().getFullYear()
        ? new Date()
        : new Date(targetYear, 11, 31, 23, 59, 59, 999);
    const anniversary = profile.anniversaryDate ? new Date(profile.anniversaryDate) : new Date();
    const daysTogether = Math.max(0, Math.floor((reviewEnd.getTime() - anniversary.getTime()) / MS_PER_DAY));

    const totalDailyPhotos = dailyMoments.filter((item) => !item.video && !item.videoId).length;
    const totalDailyVideos = dailyMoments.filter((item) => !!item.video || !!item.videoId).length;
    const totalVoiceSeconds = voiceNotes.reduce((sum, item) => sum + (item.duration ?? 0), 0);

    const summary = buildSummary(targetYear, memories.length, uniqueActivityDates.length, favoriteFormat);
    const narrative = buildNarrative({
        favoriteFormat,
        mostActiveMonth,
        activityStreak: computeLongestStreak(uniqueActivityDates),
        topMoods,
        totalActivities: activityDates.length,
        totalVoiceNotes: voiceNotes.length,
    });

    return {
        year: targetYear,
        myName: profile.myName,
        partnerName: profile.partnerName,
        daysTogether,

        totalMemories: memories.length,
        memoriesWithPhotos: memories.filter((item) => !!item.image || !!item.imageId || !!item.storagePath).length,
        memoriesWithVideos: memories.filter((item) => !!item.video || !!item.videoId || !!item.videoStoragePath).length,

        activeDays: uniqueActivityDates.length,
        capturedMonths: new Set(uniqueActivityDates.map((item) => item.slice(0, 7))).size,
        activityStreak: computeLongestStreak(uniqueActivityDates),
        totalActivities: activityDates.length,

        mostActiveMonth,
        monthHighlights,
        standoutDays,

        topMoods,
        topWords,

        totalDailyPhotos,
        totalDailyVideos,
        totalNotes: notes.length,
        openedLetters: envelopes.filter((item) => isInYear(item.openedAt, targetYear)).length,
        totalKeepsakes: keepsakes.length,
        totalVoiceNotes: voiceNotes.length,
        totalVoiceSeconds,
        totalMilestones: computeMilestoneOccurrences(specialDates, targetYear),

        favoriteFormat,
        summary,
        narrative,
    };
}
