import { PartnerInsight, InsightCategory, InsightAggregates, MoodEntry } from '../types';
import { SupabaseService } from './supabase';
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

  // Generate insights (called periodically)
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
    let notesSent30d = 0;
    try {
      const notes = JSON.parse(localStorage.getItem('lior_notes') || '[]');
      const thirtyDaysAgo = subDays(now, 30);
      notesSent30d = notes.filter((n: { createdAt: string }) =>
        new Date(n.createdAt) > thirtyDaysAgo
      ).length;
    } catch { /* ignore */ }

    // Get memories count
    let memoriesAdded30d = 0;
    try {
      const memories = JSON.parse(localStorage.getItem('lior_memories') || '[]');
      const thirtyDaysAgo = subDays(now, 30);
      memoriesAdded30d = memories.filter((m: { date: string }) =>
        new Date(m.date) > thirtyDaysAgo
      ).length;
    } catch { /* ignore */ }

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
      daysSinceLastNote: 3, // TODO: Calculate
      daysSinceLastVoiceNote: 5, // TODO: Calculate
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
