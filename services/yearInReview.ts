import { StorageService } from './storage';

export interface YearStats {
    year: number;
    myName: string;
    partnerName: string;

    // Memories
    totalMemories: number;
    mostActiveMonth: { name: string; count: number };
    topMoods: Array<{ mood: string; emoji: string; count: number }>;

    // Daily Moments
    totalDailyPhotos: number;
    totalDailyVideos: number;

    // Notes & Communication
    totalNotes: number;
    totalEnvelopes: number;
    totalKeepsakes: number;

    // Voice Notes
    totalVoiceNotes: number;
    totalVoiceSeconds: number;

    // Relationship
    bestStreak: number;
    totalSpecialDates: number;
    daysTogether: number;

    // Top words from memory texts
    topWords: string[];
}

const MOOD_MAP: Record<string, string> = {
    love: '😍',
    funny: '😂',
    party: '🥳',
    peace: '😌',
    cute: '🥺',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on',
    'at', 'to', 'for', 'of', 'with', 'it', 'is', 'was', 'we', 'i', 'you',
    'he', 'she', 'they', 'this', 'that', 'so', 'as', 'be', 'had', 'have',
    'are', 'were', 'our', 'my', 'your', 'his', 'her', 'its', 'just', 'got',
    'did', 'not', 'no', 'will', 'would', 'could', 'from', 'out', 'very',
    'then', 'when', 'what', 'how', 'all', 'also', 'up']);

export function computeYearStats(year?: number): YearStats {
    const targetYear = year ?? new Date().getFullYear();

    const profile = StorageService.getCoupleProfile();
    const memories = StorageService.getMemories().filter(m => {
        const y = new Date(m.date).getFullYear();
        return year ? y === targetYear : true;
    });
    const dailyPhotos = StorageService.getDailyPhotos();
    const notes = StorageService.getNotes();
    const envelopes = StorageService.getEnvelopes();
    const keepsakes = StorageService.getKeepsakes();
    const voiceNotes = StorageService.getVoiceNotes();

    // Most active month
    const monthCounts: Record<number, number> = {};
    for (const m of memories) {
        const mo = new Date(m.date).getMonth();
        monthCounts[mo] = (monthCounts[mo] ?? 0) + 1;
    }
    const topMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0];
    const mostActiveMonth = topMonth
        ? { name: MONTH_NAMES[parseInt(topMonth[0])], count: topMonth[1] }
        : { name: 'None yet', count: 0 };

    // Mood breakdown
    const moodCounts: Record<string, number> = {};
    for (const m of memories) {
        if (m.mood) moodCounts[m.mood] = (moodCounts[m.mood] ?? 0) + 1;
    }
    const topMoods = Object.entries(moodCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([mood, count]) => ({ mood, emoji: MOOD_MAP[mood] ?? '❤️', count }));

    // Top words from memory texts
    const wordFreq: Record<string, number> = {};
    for (const m of memories) {
        const words = (m.text || '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
        for (const w of words) {
            if (w.length > 3 && !STOP_WORDS.has(w)) {
                wordFreq[w] = (wordFreq[w] ?? 0) + 1;
            }
        }
    }
    const topWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([w]) => w);

    // Days together
    const anniversaryDate = profile.anniversaryDate ? new Date(profile.anniversaryDate) : new Date();
    const daysTogether = Math.floor((Date.now() - anniversaryDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
        year: targetYear,
        myName: profile.myName,
        partnerName: profile.partnerName,
        totalMemories: memories.length,
        mostActiveMonth,
        topMoods,
        totalDailyPhotos: dailyPhotos.filter(p => !p.video && !p.videoId).length,
        totalDailyVideos: dailyPhotos.filter(p => !!p.video || !!p.videoId).length,
        totalNotes: notes.length,
        totalEnvelopes: envelopes.length,
        totalKeepsakes: keepsakes.filter(k => !k.isHidden).length,
        totalVoiceNotes: voiceNotes.length,
        totalVoiceSeconds: voiceNotes.reduce((sum, n) => sum + (n.duration ?? 0), 0),
        bestStreak: profile.streakData?.bestStreak ?? 0,
        totalSpecialDates: StorageService.getSpecialDates().length,
        daysTogether: Math.max(0, daysTogether),
        topWords,
    };
}
