import {
  RelationshipModel,
  PartnerModelSnapshot,
  LoveLanguageProfile,
  LoveLanguageType,
  EmotionalRhythm,
  InitiationPattern,
  ResponsePattern,
  ClosenessTrajectory,
  ConversationHealth,
  RuptureCycle,
  Ritual,
  RelationshipPhase,
  MoodEntry,
  Note,
  Memory,
  VoiceNote,
} from '../types';
import { RelationshipSignals } from './relationshipSignals';
import { subDays, differenceInDays } from 'date-fns';

// ── Storage ─────────────────────────────────────────────────────────

const DB_NAME = 'LiorVault_v11';
const STORE = 'metadata_store';
const MODEL_KEY = 'ri_relationship_model';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const writeModel = async (model: RelationshipModel): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(model, MODEL_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

const readModel = async (): Promise<RelationshipModel | null> => {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(MODEL_KEY);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); resolve(null); };
  });
};

// ── Event bus ───────────────────────────────────────────────────────

export const modelEventTarget = new EventTarget();

// ── Helpers ─────────────────────────────────────────────────────────

const getDeviceId = (): string =>
  localStorage.getItem('lior_device_id') || 'unknown';

const getProfile = () => {
  try {
    return JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
  } catch { return {}; }
};

const getPartnerUserId = (): string => {
  const p = getProfile();
  return p.partnerUserId || 'partner';
};

const getCoupleId = (): string => {
  const p = getProfile();
  return p.coupleId || 'local';
};

const getPartnerName = (): string => {
  const p = getProfile();
  return p.partnerName || 'Partner';
};

const getMyName = (): string => {
  const p = getProfile();
  return p.myName || 'You';
};

const getDaysTogether = (): number => {
  const p = getProfile();
  if (p.anniversaryDate) {
    return differenceInDays(new Date(), new Date(p.anniversaryDate));
  }
  return 0;
};

const getLocalCollection = <T>(key: string): T[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

// ── Model cache ─────────────────────────────────────────────────────

let cachedModel: RelationshipModel | null = null;

// ── Love Language Computation ───────────────────────────────────────

function computeLoveLanguageProfile(userId: string): LoveLanguageProfile {
  const signals = RelationshipSignals.getLoveLanguageSignals(userId);
  const scores: Record<LoveLanguageType, number> = {
    words_of_affirmation: 0,
    quality_time: 0,
    acts_of_service: 0,
    physical_touch: 0,
    gifts: 0,
  };

  // Aggregate weighted signals
  for (const s of signals) {
    scores[s.language] += s.weight;
  }

  // Also infer from reactions on different content types
  const reactionsAbout = RelationshipSignals.getReactionsForUser(userId);
  for (const r of reactionsAbout) {
    if (r.targetType === 'voice_note') scores.words_of_affirmation += 0.3;
    else if (r.targetType === 'note') scores.words_of_affirmation += 0.4;
    else if (r.targetType === 'memory') scores.quality_time += 0.3;
    else if (r.targetType === 'daily_moment') scores.quality_time += 0.2;
  }

  // Infer from revisits
  const revisits = RelationshipSignals.getRevisits();
  const userRevisits = revisits.filter(r => r.userId === userId);
  for (const r of userRevisits) {
    if (r.targetType === 'voice_note') scores.words_of_affirmation += 0.5;
    else if (r.targetType === 'note') scores.words_of_affirmation += 0.4;
    else if (r.targetType === 'memory') scores.quality_time += 0.4;
  }

  // Normalize to 0-1
  const maxScore = Math.max(...Object.values(scores), 1);
  const normalized: Record<LoveLanguageType, number> = {} as any;
  for (const [k, v] of Object.entries(scores)) {
    normalized[k as LoveLanguageType] = v / maxScore;
  }

  // Sort to find primary/secondary
  const sorted = Object.entries(normalized)
    .sort((a, b) => b[1] - a[1]) as [LoveLanguageType, number][];

  const totalDataPoints = signals.length + reactionsAbout.length + userRevisits.length;
  const confidence = Math.min(1, totalDataPoints / 30); // 30 signals = full confidence

  return {
    primary: sorted[0][0],
    secondary: sorted[1][0],
    scores: normalized,
    confidence,
    lastUpdated: new Date().toISOString(),
  };
}

// ── Emotional Rhythm ────────────────────────────────────────────────

function computeEmotionalRhythm(userId: string): EmotionalRhythm {
  const pulseByDay = RelationshipSignals.getPulseByDayOfWeek(userId);
  const avgByDay: Record<number, number> = {};

  for (let d = 0; d < 7; d++) {
    const scores = pulseByDay[d] || [];
    avgByDay[d] = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  // Also incorporate mood entries
  const moodEntries = getLocalCollection<MoodEntry>('lior_mood_entries')
    .filter(m => m.userId === userId);
  const moodScoreMap: Record<string, number> = {
    loved: 5, romantic: 5, grateful: 5, joyful: 5,
    happy: 4, excited: 4, playful: 4, peaceful: 4,
    calm: 3, content: 3, thoughtful: 3, reflective: 3, tender: 3,
    tired: 2, quiet: 2, meh: 2, stressed: 2,
    sad: 1, anxious: 1, frustrated: 1, lonely: 1, angry: 1,
  };

  for (const m of moodEntries) {
    const day = new Date(m.timestamp).getDay();
    const score = moodScoreMap[m.mood.toLowerCase()] ?? 3;
    if (avgByDay[day] > 0) {
      avgByDay[day] = (avgByDay[day] + score / 5 * 5) / 2; // blend
    } else {
      avgByDay[day] = score;
    }
  }

  const activeDays = Object.entries(avgByDay).filter(([, v]) => v > 0);
  const sorted = activeDays.sort((a, b) => b[1] - a[1]);

  const bestDays = sorted.slice(0, 2).map(([d]) => parseInt(d));
  const worstDays = sorted.slice(-2).map(([d]) => parseInt(d));

  // Time of day from pulse checks
  const pulses = RelationshipSignals.getPulseChecks(userId);
  const hours = pulses.map(p => new Date(p.createdAt).getHours());
  const avgHour = hours.length > 0 ? hours.reduce((a, b) => a + b, 0) / hours.length : 20;
  const bestTime: EmotionalRhythm['bestTimeOfDay'] =
    avgHour < 12 ? 'morning' : avgHour < 17 ? 'afternoon' : avgHour < 21 ? 'evening' : 'night';

  // Weekday vs weekend
  const weekdayScores = [1, 2, 3, 4, 5].map(d => avgByDay[d] || 0).filter(v => v > 0);
  const weekendScores = [0, 6].map(d => avgByDay[d] || 0).filter(v => v > 0);

  const confidence = Math.min(1, (pulses.length + moodEntries.length) / 20);

  return {
    bestDays,
    worstDays,
    bestTimeOfDay: bestTime,
    avgPulseByDay: avgByDay,
    weekdayAvg: weekdayScores.length > 0 ? weekdayScores.reduce((a, b) => a + b, 0) / weekdayScores.length : 0,
    weekendAvg: weekendScores.length > 0 ? weekendScores.reduce((a, b) => a + b, 0) / weekendScores.length : 0,
    confidence,
  };
}

// ── Initiation Pattern ──────────────────────────────────────────────

function computeInitiationPattern(userId: string, partnerUserId: string): InitiationPattern {
  const ratio = RelationshipSignals.getInitiationRatio(userId, partnerUserId, 30);
  const last30d = RelationshipSignals.getInitiations()
    .filter(i => i.createdAt >= new Date(Date.now() - 30 * 86400000).toISOString());
  const userCount = last30d.filter(i => i.userId === userId).length;
  const partnerCount = last30d.filter(i => i.userId === partnerUserId).length;

  // Stress correlation: do they initiate more when pulse is low?
  const pulses = RelationshipSignals.getPulseChecks(userId);
  let stressCorrelation = 0;
  if (pulses.length >= 7) {
    const lowPulseDays = pulses.filter(p => p.score <= 2).map(p => p.createdAt.slice(0, 10));
    const highPulseDays = pulses.filter(p => p.score >= 4).map(p => p.createdAt.slice(0, 10));
    const userInits = RelationshipSignals.getInitiations(userId);
    const initDays = userInits.map(i => i.createdAt.slice(0, 10));

    const lowDayInits = initDays.filter(d => lowPulseDays.includes(d)).length;
    const highDayInits = initDays.filter(d => highPulseDays.includes(d)).length;
    const lowRate = lowPulseDays.length > 0 ? lowDayInits / lowPulseDays.length : 0;
    const highRate = highPulseDays.length > 0 ? highDayInits / highPulseDays.length : 0;

    stressCorrelation = lowRate - highRate; // positive = initiates more when stressed
  }

  return {
    ratio,
    userId,
    partnerUserId,
    last30dCount: { user: userCount, partner: partnerCount },
    stressCorrelation,
    confidence: Math.min(1, (userCount + partnerCount) / 20),
  };
}

// ── Response Pattern ────────────────────────────────────────────────

function computeResponsePattern(userId: string): ResponsePattern {
  const avg7d = RelationshipSignals.getAvgResponseLatency(7, userId);
  const avg30d = RelationshipSignals.getAvgResponseLatency(30, userId);

  let latencyTrend: ResponsePattern['latencyTrend'] = 'stable';
  if (avg30d > 0 && avg7d > 0) {
    const change = (avg7d - avg30d) / avg30d;
    if (change < -0.15) latencyTrend = 'faster';
    else if (change > 0.15) latencyTrend = 'slower';
  }

  const latencyChange7d = avg30d > 0 ? ((avg7d - avg30d) / avg30d) * 100 : 0;

  // Engagement depth from reactions and revisits
  const reactions = RelationshipSignals.getReactionsForUser(userId);
  const recent = reactions.filter(r => r.createdAt >= new Date(Date.now() - 30 * 86400000).toISOString());
  const engagementDepth = Math.min(1, recent.length / 15);

  const latencies = RelationshipSignals.getResponseLatencies(userId);
  const confidence = Math.min(1, latencies.length / 15);

  return {
    avgLatencyMs: avg7d,
    latencyTrend,
    latencyChange7d,
    engagementDepth,
    confidence,
  };
}

// ── Closeness Trajectory ────────────────────────────────────────────

function computeClosenessScore(days: number): number {
  const userId = getDeviceId();
  const partnerUserId = getPartnerUserId();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  // Blend pulse checks + mood entries + activity
  const myPulses = RelationshipSignals.getPulseChecks(userId)
    .filter(p => p.createdAt >= cutoff);
  const partnerPulses = RelationshipSignals.getPulseChecks(partnerUserId)
    .filter(p => p.createdAt >= cutoff);

  const avgPulse = [...myPulses, ...partnerPulses].length > 0
    ? [...myPulses, ...partnerPulses].reduce((s, p) => s + p.score, 0) / [...myPulses, ...partnerPulses].length
    : 3;

  // Activity signals
  const recentReactions = RelationshipSignals.getReactions()
    .filter(r => r.createdAt >= cutoff).length;
  const recentThinking = RelationshipSignals.getThinkingOfYouEvents()
    .filter(t => t.createdAt >= cutoff).length;
  const recentGratitudes = RelationshipSignals.getGratitudes()
    .filter(g => g.createdAt >= cutoff).length;

  const activityScore = Math.min(1, (recentReactions + recentThinking + recentGratitudes) / (days * 0.5));

  // Blend: 60% pulse, 40% activity
  return Math.round(Math.min(100, Math.max(0,
    (avgPulse / 5) * 60 + activityScore * 40
  )));
}

function computeTrajectory(): ClosenessTrajectory {
  const d7 = computeClosenessScore(7);
  const d30 = computeClosenessScore(30);
  const d90 = computeClosenessScore(90);

  if (d7 > d30 + 8) {
    // Recent spike after lower period = recovering
    if (d30 < d90 - 5) return 'recovering';
    return 'growing';
  }
  if (d7 < d30 - 8) return 'drifting';
  return 'stable';
}

// ── Conversation Health ─────────────────────────────────────────────

function computeConversationHealth(): ConversationHealth {
  const reflections = RelationshipSignals.getWeeklyReflections();
  const pulses = RelationshipSignals.getPulseChecks();

  // Detect "hard conversation" days from low pulses + reflections mentioning difficulty
  let daysSinceHard = 999;
  let hardCount30d = 0;
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);

  // From reflections with hardThing filled
  const recentReflections = reflections.filter(r => r.createdAt >= thirtyDaysAgo.toISOString());
  for (const r of recentReflections) {
    if (r.hardThing && r.hardThing.trim().length > 0) {
      hardCount30d++;
      const daysSince = differenceInDays(now, new Date(r.createdAt));
      if (daysSince < daysSinceHard) daysSinceHard = daysSince;
    }
  }

  // From pulse drops (score 1-2 followed by recovery)
  const sortedPulses = [...pulses].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (let i = 1; i < sortedPulses.length; i++) {
    if (sortedPulses[i].score <= 2 && sortedPulses[i - 1].score >= 3) {
      const daysSince = differenceInDays(now, new Date(sortedPulses[i].createdAt));
      if (daysSince <= 30) hardCount30d++;
      if (daysSince < daysSinceHard) daysSinceHard = daysSince;
    }
  }

  if (daysSinceHard === 999) daysSinceHard = -1; // no data

  let avoidanceRisk: ConversationHealth['avoidanceRisk'] = 'none';
  if (daysSinceHard > 45 && reflections.length >= 4) avoidanceRisk = 'high';
  else if (daysSinceHard > 30 && reflections.length >= 3) avoidanceRisk = 'moderate';
  else if (daysSinceHard > 20 && reflections.length >= 2) avoidanceRisk = 'low';

  return {
    daysSinceHardConversation: daysSinceHard,
    hardConversationFrequency30d: hardCount30d,
    avoidanceRisk,
    confidence: Math.min(1, reflections.length / 8),
  };
}

// ── Rupture & Repair Cycles ─────────────────────────────────────────

function detectRuptureCycles(): RuptureCycle[] {
  const allPulses = [...RelationshipSignals.getPulseChecks()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (allPulses.length < 5) return [];

  const cycles: RuptureCycle[] = [];
  let inDip = false;
  let dipStart: { date: string; severity: number } | null = null;

  // Use 3-day rolling average to smooth
  for (let i = 2; i < allPulses.length; i++) {
    const avg = (allPulses[i].score + allPulses[i - 1].score + allPulses[i - 2].score) / 3;

    if (!inDip && avg <= 2.5) {
      inDip = true;
      dipStart = { date: allPulses[i].createdAt, severity: 5 - avg };
    } else if (inDip && avg >= 3.5 && dipStart) {
      cycles.push({
        id: `rupture-${dipStart.date}`,
        dip: dipStart,
        repair: { date: allPulses[i].createdAt, strength: avg },
        durationDays: differenceInDays(new Date(allPulses[i].createdAt), new Date(dipStart.date)),
      });
      inDip = false;
      dipStart = null;
    }
  }

  // Ongoing dip
  if (inDip && dipStart) {
    cycles.push({
      id: `rupture-${dipStart.date}`,
      dip: dipStart,
      repair: null,
      durationDays: differenceInDays(new Date(), new Date(dipStart.date)),
    });
  }

  return cycles;
}

// ── Reciprocity ─────────────────────────────────────────────────────

function computeReciprocity(): { score: number; trend: 'improving' | 'stable' | 'declining' } {
  const userId = getDeviceId();
  const partnerUserId = getPartnerUserId();
  const pulses = RelationshipSignals.getPulseChecks();
  const reactions = RelationshipSignals.getReactions();

  // When partner has low pulse, does user show up with reactions/gratitudes/thinking-of-you?
  const partnerLowDays = pulses
    .filter(p => p.userId === partnerUserId && p.score <= 2)
    .map(p => p.createdAt.slice(0, 10));

  if (partnerLowDays.length === 0) return { score: 0.5, trend: 'stable' };

  const userActionsOnLowDays = [
    ...reactions.filter(r => r.userId === userId),
    ...RelationshipSignals.getThinkingOfYouEvents(userId),
    ...RelationshipSignals.getGratitudes().filter(g => g.userId === userId),
  ].filter(a => partnerLowDays.includes(a.createdAt.slice(0, 10)));

  const showUpRate = Math.min(1, userActionsOnLowDays.length / partnerLowDays.length);

  return { score: showUpRate, trend: 'stable' };
}

// ── Phase Detection ─────────────────────────────────────────────────

function detectPhase(): { phase: RelationshipPhase; signals: string[] } {
  const daysSinceFirst = RelationshipSignals.getDaysSinceFirstSignal();
  const totalSignals = RelationshipSignals.getTotalSignalCount();

  if (daysSinceFirst < 14 || totalSignals < 10) {
    return { phase: 'discovering', signals: ['Still learning your patterns'] };
  }

  const d7 = computeClosenessScore(7);
  const d30 = computeClosenessScore(30);
  const trajectory = computeTrajectory();
  const health = computeConversationHealth();
  const signals: string[] = [];

  if (d7 >= 75 && trajectory === 'growing') {
    signals.push('High warmth and growing closeness');
    if (getDaysTogether() < 180) return { phase: 'honeymoon', signals };
    return { phase: 'deepening', signals };
  }

  if (trajectory === 'drifting' || health.avoidanceRisk === 'high') {
    signals.push(trajectory === 'drifting' ? 'Closeness trending down' : 'Potential conversation avoidance');
    return { phase: 'challenging', signals };
  }

  if (trajectory === 'recovering') {
    signals.push('Coming back from a rough patch');
    return { phase: 'renewing', signals };
  }

  signals.push('Stable connection');
  return { phase: 'settling', signals };
}

// ── Seasonal Patterns ───────────────────────────────────────────────

function detectSeasonalPatterns(): Array<{ pattern: string; confidence: number }> {
  const userId = getDeviceId();
  const rhythm = computeEmotionalRhythm(userId);
  const patterns: Array<{ pattern: string; confidence: number }> = [];
  const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

  if (rhythm.weekendAvg > rhythm.weekdayAvg + 0.5 && rhythm.confidence > 0.3) {
    patterns.push({ pattern: 'Weekends are warmer between you', confidence: rhythm.confidence });
  } else if (rhythm.weekdayAvg > rhythm.weekendAvg + 0.5 && rhythm.confidence > 0.3) {
    patterns.push({ pattern: 'Weekdays feel closer than weekends', confidence: rhythm.confidence });
  }

  // Specific bad days
  for (const d of rhythm.worstDays) {
    if (rhythm.avgPulseByDay[d] && rhythm.avgPulseByDay[d] < 2.5 && rhythm.confidence > 0.3) {
      patterns.push({
        pattern: `${dayNames[d]} tend to be harder`,
        confidence: rhythm.confidence,
      });
    }
  }

  // Specific good days
  for (const d of rhythm.bestDays) {
    if (rhythm.avgPulseByDay[d] && rhythm.avgPulseByDay[d] > 4 && rhythm.confidence > 0.3) {
      patterns.push({
        pattern: `${dayNames[d]} are your best days together`,
        confidence: rhythm.confidence,
      });
    }
  }

  return patterns;
}

// ── Asymmetry ───────────────────────────────────────────────────────

function computeAsymmetry(): { score: number; direction: string } {
  const userId = getDeviceId();
  const partnerUserId = getPartnerUserId();

  const initRatio = RelationshipSignals.getInitiationRatio(userId, partnerUserId, 30);
  const userReactions = RelationshipSignals.getReactions()
    .filter(r => r.userId === userId && r.createdAt >= new Date(Date.now() - 30 * 86400000).toISOString()).length;
  const partnerReactions = RelationshipSignals.getReactions()
    .filter(r => r.userId === partnerUserId && r.createdAt >= new Date(Date.now() - 30 * 86400000).toISOString()).length;

  const reactionRatio = (userReactions + partnerReactions) > 0
    ? userReactions / (userReactions + partnerReactions)
    : 0.5;

  const blended = (initRatio + reactionRatio) / 2;
  const asymmetryScore = Math.abs(blended - 0.5) * 2; // 0 = balanced, 1 = fully one-sided
  const direction = blended > 0.5 ? userId : partnerUserId;

  return { score: asymmetryScore, direction };
}

// ── Partner Snapshot ────────────────────────────────────────────────

function buildPartnerSnapshot(userId: string, partnerUserId: string): PartnerModelSnapshot {
  const gratitudes = RelationshipSignals.getGratitudes(userId);
  const topGratitudes = extractTopThemes(gratitudes.map(g => g.text));
  const revisited = RelationshipSignals.getMostRevisited(5)
    .filter(r => {
      // Only revisits by this user
      const allRevisits = RelationshipSignals.getRevisits(r.targetId);
      return allRevisits.some(rv => rv.userId === userId);
    })
    .map(r => r.targetId);

  return {
    userId,
    loveLanguage: computeLoveLanguageProfile(userId),
    emotionalRhythm: computeEmotionalRhythm(userId),
    initiationPattern: computeInitiationPattern(userId, partnerUserId),
    responsePattern: computeResponsePattern(userId),
    topGratitudes,
    revisitedContent: revisited,
  };
}

function extractTopThemes(texts: string[]): string[] {
  if (texts.length === 0) return [];

  // Simple word frequency analysis
  const wordFreq = new Map<string, number>();
  const stopWords = new Set(['the', 'a', 'an', 'is', 'was', 'and', 'or', 'but', 'for', 'in', 'on', 'to', 'of', 'my', 'me', 'i', 'you', 'they', 'she', 'he', 'it', 'that', 'this', 'with', 'so', 'at', 'by', 'we', 'our', 'us']);

  for (const text of texts) {
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    for (const w of words) {
      if (w.length > 2 && !stopWords.has(w)) {
        wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
      }
    }
  }

  return Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

// ── Main Service ────────────────────────────────────────────────────

export const RelationshipModelService = {
  cachedModel: null as RelationshipModel | null,

  async init(): Promise<void> {
    cachedModel = await readModel();
    this.cachedModel = cachedModel;
  },

  getModel(): RelationshipModel | null {
    return cachedModel;
  },

  getDataConfidence(): number {
    const totalSignals = RelationshipSignals.getTotalSignalCount();
    const daysSince = RelationshipSignals.getDaysSinceFirstSignal();

    // Need both breadth (signals) and depth (time)
    const signalConfidence = Math.min(1, totalSignals / 50);
    const timeConfidence = Math.min(1, daysSince / 30);
    return (signalConfidence * 0.6 + timeConfidence * 0.4);
  },

  async compute(): Promise<RelationshipModel> {
    const userId = getDeviceId();
    const partnerUserId = getPartnerUserId();
    const coupleId = getCoupleId();

    const mySnapshot = buildPartnerSnapshot(userId, partnerUserId);
    const partnerSnapshot = buildPartnerSnapshot(partnerUserId, userId);

    const reciprocity = computeReciprocity();
    const asymmetry = computeAsymmetry();
    const { phase, signals } = detectPhase();
    const conversationHealth = computeConversationHealth();
    const ruptureCycles = detectRuptureCycles();
    const seasonalPatterns = detectSeasonalPatterns();

    const model: RelationshipModel = {
      coupleId,
      computedAt: new Date().toISOString(),
      dataConfidence: this.getDataConfidence(),

      partners: [mySnapshot, partnerSnapshot],

      closenessScore: {
        current: computeClosenessScore(3),
        d7: computeClosenessScore(7),
        d30: computeClosenessScore(30),
        d90: computeClosenessScore(90),
      },
      closenessTrajectory: computeTrajectory(),
      conversationHealth,
      ruptureCycles,
      rituals: detectRituals(),

      reciprocityScore: reciprocity.score,
      reciprocityTrend: reciprocity.trend,

      asymmetryScore: asymmetry.score,
      asymmetryDirection: asymmetry.direction,

      currentPhase: phase,
      phaseStartedAt: cachedModel?.currentPhase === phase
        ? (cachedModel.phaseStartedAt || new Date().toISOString())
        : new Date().toISOString(),
      phaseSignals: signals,

      seasonalPatterns,
    };

    cachedModel = model;
    this.cachedModel = model;
    await writeModel(model);

    modelEventTarget.dispatchEvent(new CustomEvent('model-update'));
    return model;
  },

  /** Quick accessor for closeness trajectory */
  getTrajectory(): ClosenessTrajectory {
    return cachedModel?.closenessTrajectory || 'stable';
  },

  /** Quick accessor for current phase */
  getPhase(): RelationshipPhase {
    return cachedModel?.currentPhase || 'discovering';
  },

  /** Get partner's love language profile */
  getPartnerLoveLanguage(): LoveLanguageProfile | null {
    if (!cachedModel) return null;
    const partnerUserId = getPartnerUserId();
    const snapshot = cachedModel.partners.find(p => p.userId === partnerUserId);
    return snapshot?.loveLanguage || null;
  },

  /** Get my love language profile */
  getMyLoveLanguage(): LoveLanguageProfile | null {
    if (!cachedModel) return null;
    const userId = getDeviceId();
    const snapshot = cachedModel.partners.find(p => p.userId === userId);
    return snapshot?.loveLanguage || null;
  },
};

// ── Ritual Detection ────────────────────────────────────────────────

function detectRituals(): Ritual[] {
  const rituals: Ritual[] = [];
  const userId = getDeviceId();
  const pulses = RelationshipSignals.getPulseChecks(userId);
  const gratitudes = RelationshipSignals.getGratitudes();

  // Detect daily pulse check as ritual
  const last14days = pulses.filter(p => p.createdAt >= new Date(Date.now() - 14 * 86400000).toISOString());
  if (last14days.length >= 10) {
    rituals.push({
      id: 'daily-checkin',
      name: 'Daily Check-in',
      description: 'You check in on how your day felt together',
      frequency: 'daily',
      status: 'established',
      streakDays: last14days.length,
    });
  } else if (last14days.length >= 3 && last14days.length < 7) {
    rituals.push({
      id: 'daily-checkin',
      name: 'Daily Check-in',
      description: 'This could become your daily ritual',
      frequency: 'daily',
      status: 'fading',
      streakDays: last14days.length,
    });
  }

  // Detect gratitude sharing as ritual
  const recentGratitudes = gratitudes.filter(g => g.createdAt >= new Date(Date.now() - 14 * 86400000).toISOString());
  if (recentGratitudes.length >= 7) {
    rituals.push({
      id: 'gratitude-sharing',
      name: 'Gratitude Sharing',
      description: 'Telling each other what you appreciate',
      frequency: 'daily',
      status: 'established',
    });
  }

  // Suggest rituals they don't have yet
  const reflections = RelationshipSignals.getWeeklyReflections();
  if (reflections.length < 2) {
    rituals.push({
      id: 'weekly-reflection',
      name: 'Weekly Reflection',
      description: 'A quiet moment each week to reflect on your relationship',
      frequency: 'weekly',
      status: 'suggested',
    });
  }

  return rituals;
}

// Recompute on signal updates
let computeTimeout: ReturnType<typeof setTimeout> | null = null;

const scheduleRecompute = () => {
  if (computeTimeout) clearTimeout(computeTimeout);
  computeTimeout = setTimeout(async () => {
    await RelationshipModelService.compute();
  }, 5000); // debounce: recompute 5s after last signal
};

// Listen for signals
if (typeof window !== 'undefined') {
  const { signalEventTarget } = require('./relationshipSignals');
  signalEventTarget.addEventListener('signal-update', scheduleRecompute);
}

// Initialize on import
RelationshipModelService.init();
