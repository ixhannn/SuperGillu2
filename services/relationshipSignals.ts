import {
  PulseCheck,
  MicroGratitude,
  WeeklyReflection,
  LoveLanguageSignal,
  LoveLanguageType,
  ReactionEvent,
  RevisitEvent,
  ThinkingOfYouEvent,
  ResponseLatencyEvent,
  InitiationEvent,
  PULSE_QUESTIONS,
} from '../types';
import { generateId } from '../utils/ids';

// ── Storage ─────────────────────────────────────────────────────────

const DB_NAME = 'LiorVault_v11';
const STORE = 'metadata_store';

const KEYS = {
  PULSE_CHECKS: 'ri_pulse_checks',
  MICRO_GRATITUDES: 'ri_micro_gratitudes',
  WEEKLY_REFLECTIONS: 'ri_weekly_reflections',
  LOVE_LANGUAGE_SIGNALS: 'ri_love_language_signals',
  REACTIONS: 'ri_reactions',
  REVISITS: 'ri_revisits',
  THINKING_OF_YOU: 'ri_thinking_of_you',
  RESPONSE_LATENCY: 'ri_response_latency',
  INITIATIONS: 'ri_initiations',
  SIGNAL_META: 'ri_signal_meta',
};

// ── IndexedDB helpers (shared pattern with partnerIntelligence) ─────

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

const write = async (key: string, value: unknown): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

const read = async <T>(key: string): Promise<T | null> => {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); resolve(null); };
  });
};

// ── Event bus ───────────────────────────────────────────────────────

export const signalEventTarget = new EventTarget();

const notify = (type: string) => {
  signalEventTarget.dispatchEvent(new CustomEvent('signal-update', { detail: { type } }));
};

// ── In-memory caches ────────────────────────────────────────────────

let pulseChecks: PulseCheck[] = [];
let microGratitudes: MicroGratitude[] = [];
let weeklyReflections: WeeklyReflection[] = [];
let loveLanguageSignals: LoveLanguageSignal[] = [];
let reactions: ReactionEvent[] = [];
let revisits: RevisitEvent[] = [];
let thinkingOfYou: ThinkingOfYouEvent[] = [];
let responseLatencies: ResponseLatencyEvent[] = [];
let initiations: InitiationEvent[] = [];

interface SignalMeta {
  lastPulseQuestionIdx: number;
  totalSignalCount: number;
  firstSignalDate?: string;
}

let meta: SignalMeta = { lastPulseQuestionIdx: -1, totalSignalCount: 0 };

// ── Helpers ─────────────────────────────────────────────────────────

const getDeviceId = (): string =>
  localStorage.getItem('lior_device_id') || 'unknown';

const getCoupleId = (): string => {
  try {
    const profile = JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
    return profile.coupleId || 'local';
  } catch { return 'local'; }
};

// ── Service ─────────────────────────────────────────────────────────

export const RelationshipSignals = {
  // ── Init ────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const [p, mg, wr, ll, rx, rv, ty, rl, ini, m] = await Promise.all([
      read<PulseCheck[]>(KEYS.PULSE_CHECKS),
      read<MicroGratitude[]>(KEYS.MICRO_GRATITUDES),
      read<WeeklyReflection[]>(KEYS.WEEKLY_REFLECTIONS),
      read<LoveLanguageSignal[]>(KEYS.LOVE_LANGUAGE_SIGNALS),
      read<ReactionEvent[]>(KEYS.REACTIONS),
      read<RevisitEvent[]>(KEYS.REVISITS),
      read<ThinkingOfYouEvent[]>(KEYS.THINKING_OF_YOU),
      read<ResponseLatencyEvent[]>(KEYS.RESPONSE_LATENCY),
      read<InitiationEvent[]>(KEYS.INITIATIONS),
      read<SignalMeta>(KEYS.SIGNAL_META),
    ]);

    pulseChecks = p || [];
    microGratitudes = mg || [];
    weeklyReflections = wr || [];
    loveLanguageSignals = ll || [];
    reactions = rx || [];
    revisits = rv || [];
    thinkingOfYou = ty || [];
    responseLatencies = rl || [];
    initiations = ini || [];
    meta = m || { lastPulseQuestionIdx: -1, totalSignalCount: 0 };
  },

  // ── Pulse Checks ───────────────────────────────────────────────────

  getNextPulseQuestion(): string {
    const idx = (meta.lastPulseQuestionIdx + 1) % PULSE_QUESTIONS.length;
    return PULSE_QUESTIONS[idx];
  },

  async recordPulseCheck(score: 1 | 2 | 3 | 4 | 5, note?: string): Promise<PulseCheck> {
    const question = this.getNextPulseQuestion();
    const entry: PulseCheck = {
      id: generateId(),
      userId: getDeviceId(),
      score,
      question,
      note: note?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    pulseChecks.push(entry);
    meta.lastPulseQuestionIdx = (meta.lastPulseQuestionIdx + 1) % PULSE_QUESTIONS.length;
    meta.totalSignalCount++;
    if (!meta.firstSignalDate) meta.firstSignalDate = entry.createdAt;

    await Promise.all([
      write(KEYS.PULSE_CHECKS, pulseChecks),
      write(KEYS.SIGNAL_META, meta),
    ]);

    // Also record as initiation
    await this.recordInitiation('pulse_check');

    notify('pulse_check');
    return entry;
  },

  getPulseChecks(userId?: string): PulseCheck[] {
    if (userId) return pulseChecks.filter(p => p.userId === userId);
    return [...pulseChecks];
  },

  getTodaysPulseCheck(userId?: string): PulseCheck | null {
    const uid = userId || getDeviceId();
    const today = new Date().toISOString().slice(0, 10);
    return pulseChecks.find(p => p.userId === uid && p.createdAt.slice(0, 10) === today) || null;
  },

  // ── Micro-Gratitudes ──────────────────────────────────────────────

  async recordGratitude(text: string, aboutUserId: string): Promise<MicroGratitude> {
    const entry: MicroGratitude = {
      id: generateId(),
      userId: getDeviceId(),
      aboutUserId,
      text: text.trim().slice(0, 100),
      createdAt: new Date().toISOString(),
    };

    microGratitudes.push(entry);
    meta.totalSignalCount++;
    await Promise.all([
      write(KEYS.MICRO_GRATITUDES, microGratitudes),
      write(KEYS.SIGNAL_META, meta),
    ]);
    notify('micro_gratitude');
    return entry;
  },

  getGratitudes(aboutUserId?: string): MicroGratitude[] {
    if (aboutUserId) return microGratitudes.filter(g => g.aboutUserId === aboutUserId);
    return [...microGratitudes];
  },

  // ── Weekly Reflections ────────────────────────────────────────────

  async recordReflection(bestMoment: string, hardThing?: string): Promise<WeeklyReflection> {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const weekStart = monday.toISOString().slice(0, 10);

    const entry: WeeklyReflection = {
      id: generateId(),
      userId: getDeviceId(),
      weekStart,
      bestMoment: bestMoment.trim(),
      hardThing: hardThing?.trim() || undefined,
      createdAt: now.toISOString(),
    };

    weeklyReflections.push(entry);
    meta.totalSignalCount++;
    await Promise.all([
      write(KEYS.WEEKLY_REFLECTIONS, weeklyReflections),
      write(KEYS.SIGNAL_META, meta),
    ]);
    notify('weekly_reflection');
    return entry;
  },

  getWeeklyReflections(userId?: string): WeeklyReflection[] {
    if (userId) return weeklyReflections.filter(r => r.userId === userId);
    return [...weeklyReflections];
  },

  getCurrentWeekReflection(userId?: string): WeeklyReflection | null {
    const uid = userId || getDeviceId();
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const weekStart = monday.toISOString().slice(0, 10);
    return weeklyReflections.find(r => r.userId === uid && r.weekStart === weekStart) || null;
  },

  // ── Love Language Signals ─────────────────────────────────────────

  async recordLoveLanguageSignal(
    aboutUserId: string,
    language: LoveLanguageType,
    source: LoveLanguageSignal['source'],
    weight: number = 0.5,
    sourceEventId?: string,
  ): Promise<LoveLanguageSignal> {
    const entry: LoveLanguageSignal = {
      id: generateId(),
      userId: aboutUserId,
      language,
      source,
      weight: Math.max(0, Math.min(1, weight)),
      sourceEventId,
      createdAt: new Date().toISOString(),
    };

    loveLanguageSignals.push(entry);
    meta.totalSignalCount++;
    await Promise.all([
      write(KEYS.LOVE_LANGUAGE_SIGNALS, loveLanguageSignals),
      write(KEYS.SIGNAL_META, meta),
    ]);
    notify('love_language');
    return entry;
  },

  getLoveLanguageSignals(userId?: string): LoveLanguageSignal[] {
    if (userId) return loveLanguageSignals.filter(s => s.userId === userId);
    return [...loveLanguageSignals];
  },

  // ── Reactions ─────────────────────────────────────────────────────

  async recordReaction(
    targetUserId: string,
    targetType: ReactionEvent['targetType'],
    targetId: string,
    reactionType: ReactionEvent['reactionType'] = 'heart',
  ): Promise<ReactionEvent> {
    const entry: ReactionEvent = {
      id: generateId(),
      userId: getDeviceId(),
      targetUserId,
      targetType,
      targetId,
      reactionType,
      createdAt: new Date().toISOString(),
    };

    reactions.push(entry);
    meta.totalSignalCount++;
    await Promise.all([
      write(KEYS.REACTIONS, reactions),
      write(KEYS.SIGNAL_META, meta),
    ]);
    notify('reaction');
    return entry;
  },

  getReactions(targetId?: string): ReactionEvent[] {
    if (targetId) return reactions.filter(r => r.targetId === targetId);
    return [...reactions];
  },

  getReactionsForUser(userId: string): ReactionEvent[] {
    return reactions.filter(r => r.targetUserId === userId);
  },

  // ── Revisits ──────────────────────────────────────────────────────

  async recordRevisit(
    targetType: RevisitEvent['targetType'],
    targetId: string,
  ): Promise<RevisitEvent> {
    // Deduplicate: max 1 revisit per item per day
    const today = new Date().toISOString().slice(0, 10);
    const uid = getDeviceId();
    const existing = revisits.find(
      r => r.userId === uid && r.targetId === targetId && r.createdAt.slice(0, 10) === today
    );
    if (existing) return existing;

    const entry: RevisitEvent = {
      id: generateId(),
      userId: uid,
      targetType,
      targetId,
      createdAt: new Date().toISOString(),
    };

    revisits.push(entry);
    meta.totalSignalCount++;
    await Promise.all([
      write(KEYS.REVISITS, revisits),
      write(KEYS.SIGNAL_META, meta),
    ]);
    notify('revisit');
    return entry;
  },

  getRevisits(targetId?: string): RevisitEvent[] {
    if (targetId) return revisits.filter(r => r.targetId === targetId);
    return [...revisits];
  },

  getMostRevisited(limit: number = 5): Array<{ targetId: string; targetType: string; count: number }> {
    const counts = new Map<string, { targetType: string; count: number }>();
    for (const r of revisits) {
      const existing = counts.get(r.targetId);
      if (existing) existing.count++;
      else counts.set(r.targetId, { targetType: r.targetType, count: 1 });
    }
    return Array.from(counts.entries())
      .map(([targetId, v]) => ({ targetId, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  // ── Thinking of You ───────────────────────────────────────────────

  async recordThinkingOfYou(context?: string): Promise<ThinkingOfYouEvent> {
    const entry: ThinkingOfYouEvent = {
      id: generateId(),
      userId: getDeviceId(),
      context: context?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    thinkingOfYou.push(entry);
    meta.totalSignalCount++;
    await Promise.all([
      write(KEYS.THINKING_OF_YOU, thinkingOfYou),
      write(KEYS.SIGNAL_META, meta),
    ]);

    await this.recordInitiation('thinking_of_you');
    notify('thinking_of_you');
    return entry;
  },

  getThinkingOfYouEvents(userId?: string): ThinkingOfYouEvent[] {
    if (userId) return thinkingOfYou.filter(t => t.userId === userId);
    return [...thinkingOfYou];
  },

  // ── Response Latency ──────────────────────────────────────────────

  async recordResponseLatency(
    triggerUserId: string,
    triggerType: ResponseLatencyEvent['triggerType'],
    triggerId: string,
    latencyMs: number,
  ): Promise<ResponseLatencyEvent> {
    const entry: ResponseLatencyEvent = {
      id: generateId(),
      userId: getDeviceId(),
      triggerUserId,
      triggerType,
      triggerId,
      latencyMs,
      createdAt: new Date().toISOString(),
    };

    responseLatencies.push(entry);
    meta.totalSignalCount++;
    await Promise.all([
      write(KEYS.RESPONSE_LATENCY, responseLatencies),
      write(KEYS.SIGNAL_META, meta),
    ]);
    notify('response_latency');
    return entry;
  },

  getResponseLatencies(userId?: string): ResponseLatencyEvent[] {
    if (userId) return responseLatencies.filter(r => r.userId === userId);
    return [...responseLatencies];
  },

  // ── Initiations ───────────────────────────────────────────────────

  async recordInitiation(actionType: InitiationEvent['actionType']): Promise<InitiationEvent> {
    const entry: InitiationEvent = {
      id: generateId(),
      userId: getDeviceId(),
      actionType,
      createdAt: new Date().toISOString(),
    };

    initiations.push(entry);
    meta.totalSignalCount++;
    await Promise.all([
      write(KEYS.INITIATIONS, initiations),
      write(KEYS.SIGNAL_META, meta),
    ]);
    notify('initiation');
    return entry;
  },

  getInitiations(userId?: string): InitiationEvent[] {
    if (userId) return initiations.filter(i => i.userId === userId);
    return [...initiations];
  },

  // ── Aggregate Queries ─────────────────────────────────────────────

  getTotalSignalCount(): number {
    return meta.totalSignalCount;
  },

  getFirstSignalDate(): string | null {
    return meta.firstSignalDate || null;
  },

  getDaysSinceFirstSignal(): number {
    if (!meta.firstSignalDate) return 0;
    const diff = Date.now() - new Date(meta.firstSignalDate).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  },

  /** Average pulse score over last N days */
  getAvgPulse(days: number, userId?: string): number {
    const uid = userId || getDeviceId();
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const recent = pulseChecks.filter(p => p.userId === uid && p.createdAt >= cutoff);
    if (recent.length === 0) return 0;
    return recent.reduce((sum, p) => sum + p.score, 0) / recent.length;
  },

  /** Pulse scores grouped by day-of-week */
  getPulseByDayOfWeek(userId?: string): Record<number, number[]> {
    const uid = userId || getDeviceId();
    const byDay: Record<number, number[]> = {};
    for (const p of pulseChecks.filter(pc => pc.userId === uid)) {
      const day = new Date(p.createdAt).getDay();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(p.score);
    }
    return byDay;
  },

  /** Initiation ratio: returns 0-1 where 0.5 is balanced */
  getInitiationRatio(userId: string, partnerUserId: string, days: number = 30): number {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const recent = initiations.filter(i => i.createdAt >= cutoff);
    const userCount = recent.filter(i => i.userId === userId).length;
    const partnerCount = recent.filter(i => i.userId === partnerUserId).length;
    const total = userCount + partnerCount;
    if (total === 0) return 0.5;
    return userCount / total;
  },

  /** Average response latency in ms over last N days */
  getAvgResponseLatency(days: number, userId?: string): number {
    const uid = userId || getDeviceId();
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const recent = responseLatencies.filter(r => r.userId === uid && r.createdAt >= cutoff);
    if (recent.length === 0) return 0;
    return recent.reduce((sum, r) => sum + r.latencyMs, 0) / recent.length;
  },

  /** Is it a good time to show the weekly reflection? (Fri-Sun) */
  isReflectionTime(): boolean {
    const day = new Date().getDay();
    return day === 5 || day === 6 || day === 0; // Fri, Sat, Sun
  },

  /** Has the user already done their weekly reflection this week? */
  hasReflectedThisWeek(userId?: string): boolean {
    return this.getCurrentWeekReflection(userId) !== null;
  },
};

// Initialize on import
RelationshipSignals.init();
