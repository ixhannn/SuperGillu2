import { PartnerInsight, InsightCategory, InsightAggregates, MoodEntry, Note, Memory, VoiceNote } from '../types';
import { generateId } from '../utils/ids';
import { format, subDays, differenceInDays } from 'date-fns';

const CACHE_KEYS = {
  INSIGHTS: 'lior_partner_insights',
  AGGREGATES: 'lior_insight_aggregates',
};

const DB_NAME = 'LiorVault_v11';
const STORES = {
  DATA: 'metadata_store',
};

export const partnerIntelligenceEventTarget = new EventTarget();

const notifyUpdate = () => {
  partnerIntelligenceEventTarget.dispatchEvent(new CustomEvent('insights-update'));
};

// IndexedDB helpers
const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.DATA)) db.createObjectStore(STORES.DATA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const writeRaw = async (store: string, key: string, value: unknown): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

const readRaw = async <T>(store: string, key: string): Promise<T | null> => {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); resolve(null); };
  });
};

// In-memory cache
let insightsCache: PartnerInsight[] = [];
let aggregatesCache: InsightAggregates | null = null;

// Helpers
const getDeviceId = (): string => {
  return localStorage.getItem('lior_device_id') || 'unknown';
};

const getCoupleId = (): string => {
  try {
    const profile = JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
    return profile.coupleId || 'local';
  } catch {
    return 'local';
  }
};

const getPartnerName = (): string => {
  try {
    const profile = JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
    return profile.partnerName || 'Partner';
  } catch {
    return 'Partner';
  }
};

const getDaysTogether = (): number => {
  try {
    const profile = JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
    if (profile.anniversaryDate) {
      return differenceInDays(new Date(), new Date(profile.anniversaryDate));
    }
    return 0;
  } catch {
    return 0;
  }
};

// Get mood entries
const getMoodEntries = (): MoodEntry[] => {
  try {
    const entries = JSON.parse(localStorage.getItem('lior_mood_entries') || '[]');
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
};

const getLocalCollection = <T>(key: string): T[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getDaysSinceLatest = (timestamps: Array<string | undefined>, now: Date): number => {
  const latest = timestamps
    .map((timestamp) => (typeof timestamp === 'string' ? new Date(timestamp) : null))
    .filter((date): date is Date => !!date && !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (!latest) return 0;
  return Math.max(0, differenceInDays(now, latest));
};

// Insight category icons
export const INSIGHT_ICONS: Record<InsightCategory, string> = {
  emotional_state: '◐',
  connection_pattern: '◑',
  meaningful_date: '◈',
  appreciation: '♡',
  nudge: '○'
};

export const INSIGHT_LABELS: Record<InsightCategory, string> = {
  emotional_state: 'Emotional State',
  connection_pattern: 'Connection',
  meaningful_date: 'Milestone',
  appreciation: 'Appreciation',
  nudge: 'Nudge'
};

// Insight templates
interface InsightRule {
  id: string;
  category: InsightCategory;
  cooldownDays: number;
  condition: (ctx: InsightContext) => boolean;
  generate: (ctx: InsightContext) => { text: string; confidence: number };
}

interface InsightContext {
  partnerName: string;
  daysTogether: number;
  moodTrend7d: string;
  moodAvg7d: number;
  moodAvg30d: number;
  daysSinceLastNote: number;
  daysSinceLastVoiceNote: number;
  voiceMomentStreak: number;
  notesSent30d: number;
  memoriesAdded30d: number;
  upcomingMilestone?: number;
}

const insightRules: InsightRule[] = [
  {
    id: 'mood_decline_sustained',
    category: 'emotional_state',
    cooldownDays: 7,
    condition: (ctx) => ctx.moodTrend7d === 'falling' && ctx.moodAvg7d < ctx.moodAvg30d - 0.3,
    generate: (ctx) => ({
      text: `${ctx.partnerName}'s mood has been lower than usual for a few days. A small gesture might mean a lot right now.`,
      confidence: 0.8
    })
  },
  {
    id: 'mood_upswing',
    category: 'emotional_state',
    cooldownDays: 7,
    condition: (ctx) => ctx.moodTrend7d === 'rising' && ctx.moodAvg7d > ctx.moodAvg30d + 0.3,
    generate: (ctx) => ({
      text: `${ctx.partnerName} has been in good spirits lately. Something's going well — might be nice to ask about it.`,
      confidence: 0.75
    })
  },
  {
    id: 'voice_moment_streak_7',
    category: 'appreciation',
    cooldownDays: 14,
    condition: (ctx) => ctx.voiceMomentStreak >= 7,
    generate: (ctx) => ({
      text: `${ctx.partnerName} has recorded a Daily Moment ${ctx.voiceMomentStreak} days in a row. They're showing up.`,
      confidence: 0.95
    })
  },
  {
    id: 'milestone_100',
    category: 'meaningful_date',
    cooldownDays: 30,
    condition: (ctx) => ctx.upcomingMilestone === 100,
    generate: (ctx) => ({
      text: `Tomorrow marks 100 days together. Might be worth marking.`,
      confidence: 0.95
    })
  },
  {
    id: 'milestone_365',
    category: 'meaningful_date',
    cooldownDays: 30,
    condition: (ctx) => ctx.upcomingMilestone === 365,
    generate: (ctx) => ({
      text: `Tomorrow marks one year together. A milestone worth celebrating.`,
      confidence: 0.98
    })
  },
  {
    id: 'milestone_500',
    category: 'meaningful_date',
    cooldownDays: 30,
    condition: (ctx) => ctx.upcomingMilestone === 500,
    generate: (ctx) => ({
      text: `In a day, you'll hit 500 days together. Half a thousand.`,
      confidence: 0.95
    })
  },
  {
    id: 'milestone_1000',
    category: 'meaningful_date',
    cooldownDays: 30,
    condition: (ctx) => ctx.upcomingMilestone === 1000,
    generate: (ctx) => ({
      text: `Tomorrow marks 1,000 days together. A quiet milestone worth knowing.`,
      confidence: 0.98
    })
  },
  {
    id: 'notes_high_frequency',
    category: 'appreciation',
    cooldownDays: 21,
    condition: (ctx) => ctx.notesSent30d >= 10,
    generate: (ctx) => ({
      text: `${ctx.partnerName} has left you ${ctx.notesSent30d} notes in the last month. That's more than usual.`,
      confidence: 0.85
    })
  },
  {
    id: 'memory_gap_gentle',
    category: 'nudge',
    cooldownDays: 14,
    condition: (ctx) => ctx.memoriesAdded30d === 0,
    generate: (ctx) => ({
      text: `It's been a while since you added a memory together. The last one seemed to make you both happy.`,
      confidence: 0.7
    })
  },
  {
    id: 'voice_note_gap',
    category: 'connection_pattern',
    cooldownDays: 10,
    condition: (ctx) => ctx.daysSinceLastVoiceNote > 7,
    generate: (ctx) => ({
      text: `It's been ${ctx.daysSinceLastVoiceNote} days since a voice note between you. That's different from your usual rhythm.`,
      confidence: 0.75
    })
  },
  {
    id: 'steady_moods',
    category: 'connection_pattern',
    cooldownDays: 14,
    condition: (ctx) => ctx.moodTrend7d === 'stable' && ctx.moodAvg7d > 3.5,
    generate: (ctx) => ({
      text: `You've both been logging warm moods lately. Something is working well.`,
      confidence: 0.8
    })
  }
];

// Check for upcoming milestones
const checkUpcomingMilestones = (daysTogether: number): number | undefined => {
  const milestones = [100, 200, 365, 500, 730, 1000, 1095, 1461, 1826, 2000];
  for (const m of milestones) {
    const daysUntil = m - daysTogether;
    if (daysUntil === 1) return m;
  }
  return undefined;
};

// Calculate mood trend
const calculateMoodTrend = (moods: number[]): 'rising' | 'falling' | 'stable' => {
  if (moods.length < 3) return 'stable';

  const first = moods.slice(0, Math.floor(moods.length / 2));
  const second = moods.slice(Math.floor(moods.length / 2));

  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
  const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;

  const diff = avgSecond - avgFirst;
  if (diff > 0.3) return 'rising';
  if (diff < -0.3) return 'falling';
  return 'stable';
};

export const PartnerIntelligenceService = {

  // Initialize
  async init(): Promise<void> {
    const stored = await readRaw<PartnerInsight[]>(STORES.DATA, CACHE_KEYS.INSIGHTS);
    insightsCache = stored || [];

    const agg = await readRaw<InsightAggregates>(STORES.DATA, CACHE_KEYS.AGGREGATES);
    aggregatesCache = agg;
  },

  // Get all insights
  getAllInsights(): PartnerInsight[] {
    return [...insightsCache].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  // Get current unseen insight (for home whisper)
  getCurrentInsight(): PartnerInsight | null {
    const deviceId = getDeviceId();
    const unseen = insightsCache.find(i =>
      i.targetUserId === deviceId &&
      !i.seenAt &&
      !i.dismissedAt
    );
    return unseen || null;
  },

  // Get recent insights for display
  getRecentInsights(limit: number = 20): PartnerInsight[] {
    const deviceId = getDeviceId();
    return insightsCache
      .filter(i => i.targetUserId === deviceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },

  // Mark insight as seen
  async markSeen(insightId: string): Promise<void> {
    const idx = insightsCache.findIndex(i => i.id === insightId);
    if (idx === -1) return;

    insightsCache[idx] = {
      ...insightsCache[idx],
      seenAt: new Date().toISOString()
    };

    await writeRaw(STORES.DATA, CACHE_KEYS.INSIGHTS, insightsCache);
    notifyUpdate();
  },

  // Dismiss insight
  async dismissInsight(insightId: string): Promise<void> {
    const idx = insightsCache.findIndex(i => i.id === insightId);
    if (idx === -1) return;

    insightsCache[idx] = {
      ...insightsCache[idx],
      seenAt: new Date().toISOString(),
      dismissedAt: new Date().toISOString()
    };

    await writeRaw(STORES.DATA, CACHE_KEYS.INSIGHTS, insightsCache);
    notifyUpdate();
  },

  // Check if enough data for insights
  hasEnoughData(): boolean {
    const moodEntries = getMoodEntries();
    return moodEntries.length >= 7;
  },

  // ── Love Language Tracker data methods ──────────────────────────────

  /** Pulse tab: partner's emotional temperature + mood pattern cards */
  getPulseData(): {
    partnerName: string;
    temperature: number;       // 0-100 warmth score
    temperatureTrend: 'rising' | 'falling' | 'stable';
    moodPatterns: Array<{ text: string; emoji: string; type: 'positive' | 'neutral' | 'concern' }>;
    activity: { lastMemory: string | null; lastNote: string | null; currentStreak: number };
  } {
    const partnerName = getPartnerName();
    const now = new Date();
    const moodEntries = getMoodEntries();
    const deviceId = getDeviceId();
    const partnerMoods = moodEntries.filter(m => m.userId !== deviceId);

    const last7d = partnerMoods.filter(m => new Date(m.timestamp) > subDays(now, 7));
    const prev7d = partnerMoods.filter(m => {
      const t = new Date(m.timestamp);
      return t > subDays(now, 14) && t <= subDays(now, 7);
    });

    const moodScore = (mood: string): number => {
      const map: Record<string, number> = {
        loved: 5, romantic: 5, grateful: 5, joyful: 5,
        happy: 4, excited: 4, playful: 4, peaceful: 4,
        calm: 3, content: 3, thoughtful: 3, reflective: 3, tender: 3,
        tired: 2, quiet: 2, meh: 2, stressed: 2,
        sad: 1, anxious: 1, frustrated: 1, lonely: 1, angry: 1,
      };
      return map[mood.toLowerCase()] ?? 3;
    };

    const avg7d = last7d.length > 0 ? last7d.map(m => moodScore(m.mood)).reduce((a,b) => a+b, 0) / last7d.length : 3;
    const avgPrev = prev7d.length > 0 ? prev7d.map(m => moodScore(m.mood)).reduce((a,b) => a+b, 0) / prev7d.length : 3;
    const temperature = Math.round(Math.min(100, Math.max(0, (avg7d / 5) * 100)));
    const temperatureTrend: 'rising' | 'falling' | 'stable' =
      avg7d - avgPrev > 0.3 ? 'rising' : avg7d - avgPrev < -0.3 ? 'falling' : 'stable';

    // Build mood pattern cards (max 3)
    const patterns: Array<{ text: string; emoji: string; type: 'positive' | 'neutral' | 'concern' }> = [];

    if (avg7d >= 4) {
      patterns.push({ text: `${partnerName} has been feeling great this week — your best stretch in a while 💕`, emoji: '🥰', type: 'positive' });
    } else if (avg7d <= 2) {
      patterns.push({ text: `${partnerName}'s mood has been lower than usual — a check-in could mean a lot`, emoji: '💙', type: 'concern' });
    }

    // Day-of-week pattern
    const dayBuckets: Record<number, number[]> = {};
    partnerMoods.forEach(m => {
      const day = new Date(m.timestamp).getDay();
      if (!dayBuckets[day]) dayBuckets[day] = [];
      dayBuckets[day].push(moodScore(m.mood));
    });
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let worstDay = -1, worstAvg = 6;
    Object.entries(dayBuckets).forEach(([d, scores]) => {
      const avg = scores.reduce((a,b) => a+b, 0) / scores.length;
      if (avg < worstAvg && scores.length >= 2) { worstAvg = avg; worstDay = parseInt(d); }
    });
    if (worstDay >= 0 && worstAvg < 3) {
      patterns.push({ text: `${partnerName}'s mood tends to dip on ${dayNames[worstDay]}s — a morning note could go a long way`, emoji: '📝', type: 'neutral' });
    }

    // Gap detection
    if (last7d.length === 0 && partnerMoods.length > 0) {
      patterns.push({ text: `${partnerName} hasn't logged a mood in a while — they might need a check-in`, emoji: '💭', type: 'concern' });
    }

    // Activity snapshot
    const memories = getLocalCollection<Memory>('lior_memories');
    const notes = getLocalCollection<Note>('lior_notes');
    const lastMemory = memories.length > 0 ? memories.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : null;
    const lastNote = notes.length > 0 ? notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].createdAt : null;

    let streak = 0;
    try {
      const settings = JSON.parse(localStorage.getItem('lior_voice_moment_settings') || '{}');
      streak = settings.streakCount || 0;
    } catch { /* ignore */ }

    return {
      partnerName,
      temperature,
      temperatureTrend,
      moodPatterns: patterns.slice(0, 3),
      activity: { lastMemory, lastNote, currentStreak: streak },
    };
  },

  /** Nudges tab: actionable suggestions with navigation targets */
  getNudges(): Array<{
    id: string;
    text: string;
    emoji: string;
    cta: string;
    target: string; // ViewState to navigate to
  }> {
    const partnerName = getPartnerName();
    const now = new Date();
    const memories = getLocalCollection<Memory>('lior_memories');
    const notes = getLocalCollection<Note>('lior_notes');
    const voiceNotes = getLocalCollection<VoiceNote>('lior_voice_notes');

    const daysSinceMemory = getDaysSinceLatest(memories.map(m => m.date), now);
    const daysSinceNote = getDaysSinceLatest(notes.map(n => n.createdAt), now);
    const daysSinceVoice = getDaysSinceLatest(voiceNotes.map(v => v.createdAt), now);

    const nudges: Array<{ id: string; text: string; emoji: string; cta: string; target: string }> = [];

    if (daysSinceNote > 3) {
      nudges.push({ id: 'write-note', text: `Write ${partnerName} a surprise note`, emoji: '💌', cta: 'Write Note', target: 'notes' });
    }
    if (daysSinceMemory > 5) {
      nudges.push({ id: 'add-memory', text: `Create a memory together`, emoji: '📸', cta: 'Add Memory', target: 'add-memory' });
    }
    if (daysSinceVoice > 5) {
      nudges.push({ id: 'voice-note', text: `Send ${partnerName} a voice note`, emoji: '🎙️', cta: 'Record', target: 'add-memory' });
    }
    nudges.push({ id: 'surprise', text: `Plan something special for this weekend`, emoji: '🎁', cta: 'Plan Surprise', target: 'surprises' });

    return nudges.slice(0, 3);
  },

  /** Nudges tab: communication tips based on activity patterns */
  getCommunicationTips(): string[] {
    const partnerName = getPartnerName();
    const voiceNotes = getLocalCollection<VoiceNote>('lior_voice_notes');
    const memories = getLocalCollection<Memory>('lior_memories');
    const notes = getLocalCollection<Note>('lior_notes');

    const tips: string[] = [];
    if (voiceNotes.length > notes.length) {
      tips.push(`${partnerName} responds most to voice notes and photos`);
    } else if (notes.length > voiceNotes.length) {
      tips.push(`${partnerName} seems to love written notes — keep them coming`);
    }
    if (memories.filter(m => !!(m as any).audioId).length > 0) {
      tips.push('Your voice memories get the warmest mood responses');
    }
    if (tips.length === 0) {
      tips.push('Keep showing up — consistency matters more than grand gestures');
    }
    return tips.slice(0, 2);
  },

  /** Gift & Date Ideas tab: personalized from mood/memory patterns */
  getGiftDateIdeas(): {
    gifts: Array<{ text: string; emoji: string; reason: string }>;
    dates: Array<{ text: string; emoji: string; reason: string }>;
    upcoming: Array<{ title: string; daysUntil: number; emoji: string }>;
  } {
    const partnerName = getPartnerName();
    const moodEntries = getMoodEntries();
    const deviceId = getDeviceId();
    const partnerMoods = moodEntries.filter(m => m.userId !== deviceId);
    const now = new Date();
    const recent = partnerMoods.filter(m => new Date(m.timestamp) > subDays(now, 14));

    const moodScore = (mood: string): number => {
      const map: Record<string, number> = {
        loved: 5, romantic: 5, grateful: 5, joyful: 5,
        happy: 4, excited: 4, playful: 4, peaceful: 4,
        calm: 3, content: 3, thoughtful: 3, reflective: 3, tender: 3,
        tired: 2, quiet: 2, meh: 2, stressed: 2,
        sad: 1, anxious: 1, frustrated: 1, lonely: 1, angry: 1,
      };
      return map[mood.toLowerCase()] ?? 3;
    };

    const avgRecent = recent.length > 0 ? recent.map(m => moodScore(m.mood)).reduce((a,b) => a+b, 0) / recent.length : 3;

    const gifts: Array<{ text: string; emoji: string; reason: string }> = [];
    const dates: Array<{ text: string; emoji: string; reason: string }> = [];

    // Mood-based suggestions
    if (avgRecent >= 4) {
      gifts.push({ text: 'A photo book of your best memories together', emoji: '📖', reason: `${partnerName} is on a high — celebrate it` });
      dates.push({ text: 'Try something adventurous you\'ve both been wanting to do', emoji: '🏔️', reason: 'Energy is high — go for it' });
    } else if (avgRecent <= 2.5) {
      gifts.push({ text: 'Their favorite comfort food, delivered', emoji: '🍕', reason: `${partnerName} could use some comfort` });
      dates.push({ text: 'A quiet evening in — cook together, no screens', emoji: '🕯️', reason: 'Low-pressure quality time' });
    } else {
      gifts.push({ text: 'A handwritten letter about what you love about them', emoji: '✉️', reason: 'Simple gestures land hardest' });
      dates.push({ text: 'A walk somewhere new with no agenda', emoji: '🚶', reason: 'Fresh context sparks fresh conversation' });
    }

    gifts.push({ text: 'A playlist of songs that remind you of them', emoji: '🎵', reason: 'Personal + zero cost' });
    dates.push({ text: 'Recreate your first date', emoji: '💫', reason: 'Nostalgia is powerful' });

    // Upcoming milestones
    const daysTogether = getDaysTogether();
    const milestones = [
      { days: 100, label: '100 days together', emoji: '💯' },
      { days: 200, label: '200 days together', emoji: '✨' },
      { days: 365, label: '1 year together', emoji: '🎂' },
      { days: 500, label: '500 days together', emoji: '🌟' },
      { days: 730, label: '2 years together', emoji: '💎' },
      { days: 1000, label: '1,000 days together', emoji: '🏆' },
    ];
    const upcoming = milestones
      .map(m => ({ title: m.label, daysUntil: m.days - daysTogether, emoji: m.emoji }))
      .filter(m => m.daysUntil > 0 && m.daysUntil <= 30);

    return { gifts, dates, upcoming };
  },

  /** Milestones tab: achievements, badges, timeline */
  getMilestones(): {
    achieved: Array<{ title: string; emoji: string; date?: string }>;
    badges: Array<{ title: string; emoji: string; unlocked: boolean }>;
    daysTogether: number;
  } {
    const daysTogether = getDaysTogether();
    const memories = getLocalCollection<Memory>('lior_memories');
    const voiceNotes = getLocalCollection<VoiceNote>('lior_voice_notes');
    const notes = getLocalCollection<Note>('lior_notes');

    const achieved: Array<{ title: string; emoji: string; date?: string }> = [];
    const milestoneMarks = [7, 30, 50, 100, 200, 365, 500, 730, 1000];
    milestoneMarks.forEach(m => {
      if (daysTogether >= m) {
        achieved.push({ title: `${m} days together`, emoji: m >= 365 ? '💎' : m >= 100 ? '🌟' : '✨' });
      }
    });

    if (memories.length >= 10) achieved.push({ title: '10th memory!', emoji: '📸' });
    if (memories.length >= 50) achieved.push({ title: '50th memory!', emoji: '🎞️' });
    if (memories.length >= 100) achieved.push({ title: '100th memory!', emoji: '🏆' });
    if (notes.length >= 10) achieved.push({ title: '10th note!', emoji: '💌' });
    if (voiceNotes.length >= 1) achieved.push({ title: 'First voice note!', emoji: '🎙️' });

    const badges: Array<{ title: string; emoji: string; unlocked: boolean }> = [
      { title: '7-day streak 🔥', emoji: '🔥', unlocked: false },
      { title: 'First voice memory', emoji: '🎙️', unlocked: voiceNotes.length > 0 },
      { title: 'Memory maker (10+)', emoji: '📸', unlocked: memories.length >= 10 },
      { title: 'Love letter writer', emoji: '💌', unlocked: notes.length >= 5 },
      { title: 'Century club (100 days)', emoji: '💯', unlocked: daysTogether >= 100 },
      { title: 'Anniversary', emoji: '🎂', unlocked: daysTogether >= 365 },
    ];

    // Check streak badge
    try {
      const settings = JSON.parse(localStorage.getItem('lior_voice_moment_settings') || '{}');
      if ((settings.streakCount || 0) >= 7) {
        badges[0].unlocked = true;
      }
    } catch { /* ignore */ }

    return { achieved: achieved.reverse(), badges, daysTogether };
  },
  async generateInsights(): Promise<PartnerInsight | null> {
    const deviceId = getDeviceId();
    const coupleId = getCoupleId();
    const partnerName = getPartnerName();
    const daysTogether = getDaysTogether();

    // Don't generate if not enough data
    if (!this.hasEnoughData()) return null;

    // Don't generate if we already have an unseen insight
    const current = this.getCurrentInsight();
    if (current) return null;

    // Check how many insights this week
    const now = new Date();
    const weekAgo = subDays(now, 7);
    const insightsThisWeek = insightsCache.filter(i =>
      i.targetUserId === deviceId &&
      new Date(i.createdAt) > weekAgo
    );
    if (insightsThisWeek.length >= 3) return null;

    // Build context
    const moodEntries = getMoodEntries();
    const deviceMoods = moodEntries.filter(m => m.userId !== deviceId); // Partner's moods
    const last7dMoods = deviceMoods
      .filter(m => new Date(m.timestamp) > subDays(now, 7))
      .map(m => {
        const moodMap: Record<string, number> = {
          'great': 5, 'good': 4, 'okay': 3, 'meh': 2, 'bad': 1
        };
        return moodMap[m.mood] || 3;
      });

    const last30dMoods = deviceMoods
      .filter(m => new Date(m.timestamp) > subDays(now, 30))
      .map(m => {
        const moodMap: Record<string, number> = {
          'great': 5, 'good': 4, 'okay': 3, 'meh': 2, 'bad': 1
        };
        return moodMap[m.mood] || 3;
      });

    const moodAvg7d = last7dMoods.length > 0
      ? last7dMoods.reduce((a, b) => a + b, 0) / last7dMoods.length
      : 3;

    const moodAvg30d = last30dMoods.length > 0
      ? last30dMoods.reduce((a, b) => a + b, 0) / last30dMoods.length
      : 3;

    // Get notes count
    const notes = getLocalCollection<Note>('lior_notes');
    const thirtyDaysAgo = subDays(now, 30);
    const notesSent30d = notes.filter((n) => new Date(n.createdAt) > thirtyDaysAgo).length;
    const daysSinceLastNote = getDaysSinceLatest(notes.map((n) => n.createdAt), now);

    // Get memories count
    const memories = getLocalCollection<Memory>('lior_memories');
    const memoriesAdded30d = memories.filter((m) => new Date(m.date) > thirtyDaysAgo).length;

    // Get voice notes timing
    const voiceNotes = getLocalCollection<VoiceNote>('lior_voice_notes');
    const daysSinceLastVoiceNote = getDaysSinceLatest(voiceNotes.map((note) => note.createdAt), now);

    // Get voice moment streak
    let voiceMomentStreak = 0;
    try {
      const settings = JSON.parse(localStorage.getItem('lior_voice_moment_settings') || '{}');
      voiceMomentStreak = settings.streakCount || 0;
    } catch { /* ignore */ }

    const context: InsightContext = {
      partnerName,
      daysTogether,
      moodTrend7d: calculateMoodTrend(last7dMoods),
      moodAvg7d,
      moodAvg30d,
      daysSinceLastNote,
      daysSinceLastVoiceNote,
      voiceMomentStreak,
      notesSent30d,
      memoriesAdded30d,
      upcomingMilestone: checkUpcomingMilestones(daysTogether)
    };

    // Evaluate rules
    const candidates: Array<{ rule: InsightRule; result: { text: string; confidence: number } }> = [];

    for (const rule of insightRules) {
      // Check cooldown
      const lastGenerated = insightsCache.find(i =>
        i.insightKey === rule.id &&
        i.targetUserId === deviceId
      );
      if (lastGenerated) {
        const daysSince = differenceInDays(now, new Date(lastGenerated.createdAt));
        if (daysSince < rule.cooldownDays) continue;
      }

      // Check condition
      if (rule.condition(context)) {
        const result = rule.generate(context);
        if (result.confidence >= 0.7) {
          candidates.push({ rule, result });
        }
      }
    }

    if (candidates.length === 0) return null;

    // Prioritize by category then confidence
    const priorityOrder: InsightCategory[] = ['meaningful_date', 'appreciation', 'emotional_state', 'connection_pattern', 'nudge'];
    candidates.sort((a, b) => {
      const priorityDiff = priorityOrder.indexOf(a.rule.category) - priorityOrder.indexOf(b.rule.category);
      if (priorityDiff !== 0) return priorityDiff;
      return b.result.confidence - a.result.confidence;
    });

    const winner = candidates[0];

    // Create insight
    const insight: PartnerInsight = {
      id: generateId(),
      coupleId,
      targetUserId: deviceId,
      category: winner.rule.category,
      insightKey: winner.rule.id,
      insightText: winner.result.text,
      confidence: winner.result.confidence,
      createdAt: new Date().toISOString()
    };

    // Save
    insightsCache = [...insightsCache, insight];
    await writeRaw(STORES.DATA, CACHE_KEYS.INSIGHTS, insightsCache);

    notifyUpdate();
    return insight;
  }
};

// Initialize on module load
PartnerIntelligenceService.init();

// Generate insights periodically (every 6 hours when app is open)
let lastGenerationCheck = 0;
export const checkAndGenerateInsights = async () => {
  const now = Date.now();
  if (now - lastGenerationCheck < 6 * 60 * 60 * 1000) return; // Skip if checked recently
  lastGenerationCheck = now;
  await PartnerIntelligenceService.generateInsights();
};
