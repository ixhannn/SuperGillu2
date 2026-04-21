import {
  DeepInsight,
  DeepInsightCategory,
  InsightTone,
  InsightSentiment,
  RelationshipModel,
  LoveLanguageType,
  SystemMessage,
} from '../types';
import { generateId } from '../utils/ids';
import { RelationshipModelService } from './relationshipModel';
import { RelationshipSignals } from './relationshipSignals';
import { differenceInDays, format } from 'date-fns';

// ── Storage ─────────────────────────────────────────────────────────

const DB_NAME = 'LiorVault_v11';
const STORE = 'metadata_store';
const INSIGHTS_KEY = 'ri_deep_insights';
const MESSAGES_KEY = 'ri_system_messages';

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

const writeData = async (key: string, value: unknown): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

const readData = async <T>(key: string): Promise<T | null> => {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); resolve(null); };
  });
};

// ── Event bus ───────────────────────────────────────────────────────

export const insightEventTarget = new EventTarget();

// ── State ───────────────────────────────────────────────────────────

let deepInsights: DeepInsight[] = [];
let systemMessages: SystemMessage[] = [];

// ── Helpers ─────────────────────────────────────────────────────────

const getDeviceId = (): string =>
  localStorage.getItem('lior_device_id') || 'unknown';

const getProfile = () => {
  try {
    return JSON.parse(localStorage.getItem('lior_shared_profile') || '{}');
  } catch { return {}; }
};

const getPartnerName = (): string => getProfile().partnerName || 'Partner';
const getMyName = (): string => getProfile().myName || 'You';
const getPartnerUserId = (): string => getProfile().partnerUserId || 'partner';

const LOVE_LANGUAGE_LABELS: Record<LoveLanguageType, string> = {
  words_of_affirmation: 'words of affirmation',
  quality_time: 'quality time',
  acts_of_service: 'acts of service',
  physical_touch: 'physical touch',
  gifts: 'thoughtful gifts',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Insight Template System ─────────────────────────────────────────

interface InsightTemplate {
  id: string;
  category: DeepInsightCategory;
  tone: InsightTone;
  sentiment: InsightSentiment;
  minConfidence: number; // minimum model data confidence to use this template
  cooldownDays: number;
  condition: (model: RelationshipModel) => boolean;
  generate: (model: RelationshipModel) => {
    text: string;
    specificDataRef?: string;
    suggestedAction?: DeepInsight['suggestedAction'];
    confidence: number;
    dataPointCount: number;
    targetUserId?: string; // override: send to specific partner only
    aboutUserId?: string;
  };
}

const templates: InsightTemplate[] = [

  // ── DEEP PATTERN (intimate, specific) ───────────────────────────────

  {
    id: 'love_language_discovery',
    category: 'love_language_insight',
    tone: 'warm',
    sentiment: 'affirmative',
    minConfidence: 0.3,
    cooldownDays: 21,
    condition: (m) => {
      const partner = m.partners.find(p => p.userId === getPartnerUserId());
      return !!partner && partner.loveLanguage.confidence >= 0.3;
    },
    generate: (m) => {
      const partnerName = getPartnerName();
      const partner = m.partners.find(p => p.userId === getPartnerUserId())!;
      const ll = partner.loveLanguage;
      const primaryLabel = LOVE_LANGUAGE_LABELS[ll.primary];
      const secondaryLabel = LOVE_LANGUAGE_LABELS[ll.secondary];
      return {
        text: `${partnerName} responds most to ${primaryLabel}, with ${secondaryLabel} as a close second. This isn't a quiz result — it's what their actual behavior shows.`,
        confidence: ll.confidence,
        dataPointCount: Math.round(ll.confidence * 30),
        aboutUserId: getPartnerUserId(),
        suggestedAction: {
          text: `Try leading with ${primaryLabel} this week`,
          actionType: 'activity',
        },
      };
    },
  },

  {
    id: 'best_day_pattern',
    category: 'deep_pattern',
    tone: 'warm',
    sentiment: 'affirmative',
    minConfidence: 0.3,
    cooldownDays: 30,
    condition: (m) => {
      const partner = m.partners.find(p => p.userId === getPartnerUserId());
      return !!partner && partner.emotionalRhythm.confidence >= 0.3 && partner.emotionalRhythm.bestDays.length > 0;
    },
    generate: (m) => {
      const partnerName = getPartnerName();
      const partner = m.partners.find(p => p.userId === getPartnerUserId())!;
      const bestDay = DAY_NAMES[partner.emotionalRhythm.bestDays[0]];
      const worstDay = partner.emotionalRhythm.worstDays.length > 0
        ? DAY_NAMES[partner.emotionalRhythm.worstDays[0]]
        : null;
      const text = worstDay
        ? `${partnerName} feels warmest on ${bestDay}s and tends to dip on ${worstDay}s. Not random — it's their rhythm. A small gesture on ${worstDay} mornings could shift the whole day.`
        : `${partnerName}'s best days are ${bestDay}s. Something about that day works for them. Worth noticing.`;
      return {
        text,
        specificDataRef: `Based on ${Math.round(partner.emotionalRhythm.confidence * 20)}+ check-ins`,
        confidence: partner.emotionalRhythm.confidence,
        dataPointCount: Math.round(partner.emotionalRhythm.confidence * 20),
        aboutUserId: getPartnerUserId(),
        suggestedAction: worstDay ? {
          text: `Send a morning note next ${worstDay}`,
          actionType: 'activity',
          targetView: 'notes',
        } : undefined,
      };
    },
  },

  {
    id: 'weekend_vs_weekday',
    category: 'deep_pattern',
    tone: 'curious',
    sentiment: 'affirmative',
    minConfidence: 0.3,
    cooldownDays: 45,
    condition: (m) => {
      return m.seasonalPatterns.some(p => p.confidence >= 0.3 &&
        (p.pattern.includes('Weekends') || p.pattern.includes('Weekdays')));
    },
    generate: (m) => {
      const pattern = m.seasonalPatterns.find(p =>
        p.pattern.includes('Weekends') || p.pattern.includes('Weekdays'))!;
      const isWeekendBetter = pattern.pattern.includes('Weekends are warmer');
      return {
        text: isWeekendBetter
          ? `You two are warmer on weekends — more present, more connected. The weekday grind pulls you apart. Even a 2-minute voice note on a Wednesday could bridge that gap.`
          : `Surprisingly, your weekdays feel closer than weekends. Maybe routine grounds you. Weekends might need more intentional time together.`,
        confidence: pattern.confidence,
        dataPointCount: 14,
        suggestedAction: isWeekendBetter
          ? { text: 'Try a mid-week voice note', actionType: 'activity', targetView: 'voice-notes' }
          : { text: 'Plan a low-key weekend ritual', actionType: 'ritual' },
      };
    },
  },

  // ── BEHAVIORAL REVEAL ───────────────────────────────────────────────

  {
    id: 'stress_initiator',
    category: 'behavioral_reveal',
    tone: 'gentle',
    sentiment: 'affirmative',
    minConfidence: 0.4,
    cooldownDays: 30,
    condition: (m) => {
      const me = m.partners.find(p => p.userId === getDeviceId());
      return !!me && me.initiationPattern.stressCorrelation > 0.3 && me.initiationPattern.confidence >= 0.3;
    },
    generate: (m) => {
      const myName = getMyName();
      const me = m.partners.find(p => p.userId === getDeviceId())!;
      return {
        text: `${myName} reaches out more on hard days, not easy ones. When stress hits, your instinct is to connect — that's not nothing. It's how you cope, and it says a lot about what this relationship means.`,
        targetUserId: getPartnerUserId(), // tell the partner about this
        aboutUserId: getDeviceId(),
        confidence: me.initiationPattern.confidence,
        dataPointCount: me.initiationPattern.last30dCount.user,
      };
    },
  },

  {
    id: 'partner_stress_initiator',
    category: 'behavioral_reveal',
    tone: 'gentle',
    sentiment: 'affirmative',
    minConfidence: 0.4,
    cooldownDays: 30,
    condition: (m) => {
      const partner = m.partners.find(p => p.userId === getPartnerUserId());
      return !!partner && partner.initiationPattern.stressCorrelation > 0.3 && partner.initiationPattern.confidence >= 0.3;
    },
    generate: (m) => {
      const partnerName = getPartnerName();
      const partner = m.partners.find(p => p.userId === getPartnerUserId())!;
      return {
        text: `${partnerName} initiates more when they're stressed, not when they're happy. That's their way of reaching for you. When they send a random note on a hard day — that's not small talk, it's need.`,
        targetUserId: getDeviceId(),
        aboutUserId: getPartnerUserId(),
        confidence: partner.initiationPattern.confidence,
        dataPointCount: partner.initiationPattern.last30dCount.partner,
        suggestedAction: {
          text: 'When they reach out on hard days, respond warmly',
          actionType: 'reflection',
        },
      };
    },
  },

  {
    id: 'initiation_asymmetry',
    category: 'behavioral_reveal',
    tone: 'gentle',
    sentiment: 'growth',
    minConfidence: 0.4,
    cooldownDays: 21,
    condition: (m) => m.asymmetryScore > 0.3 && m.dataConfidence >= 0.3,
    generate: (m) => {
      const userId = getDeviceId();
      const partnerName = getPartnerName();
      const myName = getMyName();
      const moreActive = m.asymmetryDirection === userId ? myName : partnerName;
      const lessActive = m.asymmetryDirection === userId ? partnerName : myName;
      const pct = Math.round(m.asymmetryScore * 100);
      return {
        text: `${moreActive} has been initiating more lately — about ${pct}% of the exchanges start there. ${lessActive}, try starting the next conversation. A small shift in who reaches out first changes how a relationship feels.`,
        confidence: m.dataConfidence,
        dataPointCount: 20,
        suggestedAction: {
          text: `${lessActive}: send the first note today`,
          actionType: 'activity',
          targetView: 'notes',
        },
      };
    },
  },

  // ── TRAJECTORY ──────────────────────────────────────────────────────

  {
    id: 'growing_closer',
    category: 'trajectory',
    tone: 'celebratory',
    sentiment: 'affirmative',
    minConfidence: 0.3,
    cooldownDays: 14,
    condition: (m) => m.closenessTrajectory === 'growing' && m.closenessScore.d7 > m.closenessScore.d30 + 8,
    generate: (m) => {
      const diff = m.closenessScore.d7 - m.closenessScore.d30;
      return {
        text: `You've been growing closer — your connection score is up ${diff} points from your recent average. Whatever you're doing, keep doing it.`,
        specificDataRef: 'Last 7 days vs. last 30',
        confidence: m.dataConfidence,
        dataPointCount: 15,
        suggestedAction: {
          text: 'Notice what changed — and name it to each other',
          actionType: 'conversation',
        },
      };
    },
  },

  {
    id: 'drifting_gentle',
    category: 'trajectory',
    tone: 'gentle',
    sentiment: 'flag',
    minConfidence: 0.3,
    cooldownDays: 14,
    condition: (m) => m.closenessTrajectory === 'drifting' && m.closenessScore.d7 < m.closenessScore.d30 - 8,
    generate: (m) => {
      const diff = m.closenessScore.d30 - m.closenessScore.d7;
      return {
        text: `Things feel a little more distant this week — your connection is down ${diff} points from usual. That's not a crisis; it's a signal. Sometimes just acknowledging it helps.`,
        specificDataRef: 'Last 7 days vs. last 30',
        confidence: m.dataConfidence,
        dataPointCount: 15,
        suggestedAction: {
          text: 'Ask: "How are we doing lately?"',
          actionType: 'conversation',
        },
      };
    },
  },

  {
    id: 'recovering_celebration',
    category: 'trajectory',
    tone: 'celebratory',
    sentiment: 'affirmative',
    minConfidence: 0.3,
    cooldownDays: 21,
    condition: (m) => m.closenessTrajectory === 'recovering',
    generate: (m) => {
      const cycles = m.ruptureCycles.filter(c => c.repair !== null);
      const latest = cycles[cycles.length - 1];
      const repairDays = latest ? latest.durationDays : 0;
      return {
        text: repairDays > 0
          ? `You came through a rough patch and found your way back in ${repairDays} days. That repair matters more than the dip ever did. Every couple faces hard stretches — not every couple recovers like this.`
          : `You were drifting, and now you're coming back. That's not luck — that's both of you choosing to show up.`,
        confidence: m.dataConfidence,
        dataPointCount: 10,
        suggestedAction: {
          text: 'Celebrate: you made it through',
          actionType: 'reflection',
        },
      };
    },
  },

  {
    id: 'response_latency_improving',
    category: 'trajectory',
    tone: 'warm',
    sentiment: 'affirmative',
    minConfidence: 0.3,
    cooldownDays: 21,
    condition: (m) => {
      const partner = m.partners.find(p => p.userId === getPartnerUserId());
      return !!partner && partner.responsePattern.latencyTrend === 'faster' && partner.responsePattern.confidence >= 0.3;
    },
    generate: (m) => {
      const partnerName = getPartnerName();
      const partner = m.partners.find(p => p.userId === getPartnerUserId())!;
      const pctFaster = Math.abs(Math.round(partner.responsePattern.latencyChange7d));
      return {
        text: `${partnerName} has been responding ${pctFaster}% faster this week. It's subtle, but response time is one of the most honest signals of engagement. They're leaning in.`,
        confidence: partner.responsePattern.confidence,
        dataPointCount: 10,
        aboutUserId: getPartnerUserId(),
      };
    },
  },

  // ── EARLY WARNING ───────────────────────────────────────────────────

  {
    id: 'conversation_avoidance',
    category: 'early_warning',
    tone: 'gentle',
    sentiment: 'flag',
    minConfidence: 0.4,
    cooldownDays: 30,
    condition: (m) => m.conversationHealth.avoidanceRisk !== 'none' && m.conversationHealth.confidence >= 0.3,
    generate: (m) => {
      const days = m.conversationHealth.daysSinceHardConversation;
      const risk = m.conversationHealth.avoidanceRisk;
      const urgency = risk === 'high' ? 'That might mean something.' : 'Worth noticing.';
      return {
        text: days > 0
          ? `You haven't had a hard conversation in ${days} days. That's either health or avoidance — only you know. ${urgency} Relationships that avoid friction don't deepen.`
          : `Your recent reflections suggest things have been smooth. That's great — unless there's something neither of you is saying.`,
        confidence: m.conversationHealth.confidence,
        dataPointCount: 8,
        suggestedAction: {
          text: `Try asking: "Is there anything we\u2019re not talking about?"`,
          actionType: 'conversation',
        },
      };
    },
  },

  {
    id: 'reciprocity_drop',
    category: 'early_warning',
    tone: 'gentle',
    sentiment: 'flag',
    minConfidence: 0.4,
    cooldownDays: 21,
    condition: (m) => m.reciprocityScore < 0.3 && m.dataConfidence >= 0.3,
    generate: (m) => {
      const partnerName = getPartnerName();
      return {
        text: `When ${partnerName} has had hard days recently, there hasn't been as much response from your side. That's not a judgment — life gets busy. But showing up on their low days is the highest-leverage thing you can do.`,
        targetUserId: getDeviceId(),
        confidence: m.dataConfidence,
        dataPointCount: 10,
        suggestedAction: {
          text: 'Check in next time they seem down',
          actionType: 'activity',
        },
      };
    },
  },

  // ── CELEBRATION ─────────────────────────────────────────────────────

  {
    id: 'pulse_streak',
    category: 'celebration',
    tone: 'celebratory',
    sentiment: 'affirmative',
    minConfidence: 0.1,
    cooldownDays: 14,
    condition: () => {
      const pulses = RelationshipSignals.getPulseChecks(getDeviceId());
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().slice(0, 10);
        if (pulses.some(p => p.createdAt.slice(0, 10) === dateStr)) streak++;
        else break;
      }
      return streak >= 7;
    },
    generate: () => {
      const pulses = RelationshipSignals.getPulseChecks(getDeviceId());
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().slice(0, 10);
        if (pulses.some(p => p.createdAt.slice(0, 10) === dateStr)) streak++;
        else break;
      }
      return {
        text: `${streak} days in a row of checking in on your relationship. Most couples never do this once. You're building something most people only wish they had.`,
        confidence: 0.95,
        dataPointCount: streak,
        suggestedAction: {
          text: 'Keep going — the insights get richer with time',
          actionType: 'reflection',
        },
      };
    },
  },

  {
    id: 'gratitude_milestone',
    category: 'celebration',
    tone: 'celebratory',
    sentiment: 'affirmative',
    minConfidence: 0.1,
    cooldownDays: 30,
    condition: () => {
      return RelationshipSignals.getGratitudes().length >= 10;
    },
    generate: () => {
      const count = RelationshipSignals.getGratitudes().length;
      const themes = RelationshipSignals.getGratitudes()
        .slice(-5)
        .map(g => g.text);
      return {
        text: `You've shared ${count} gratitudes about each other. The most recent ones mention: "${themes[0] || '...'}" — this is your love language in action.`,
        confidence: 0.9,
        dataPointCount: count,
      };
    },
  },

  // ── GROWTH NUDGE ────────────────────────────────────────────────────

  {
    id: 'try_weekly_reflection',
    category: 'growth_nudge',
    tone: 'curious',
    sentiment: 'growth',
    minConfidence: 0.2,
    cooldownDays: 14,
    condition: () => {
      return RelationshipSignals.getWeeklyReflections().length < 2 &&
        RelationshipSignals.getTotalSignalCount() >= 10;
    },
    generate: () => ({
      text: `You've been checking in daily — try a weekly reflection too. "What was the best moment this week?" and "What felt hard?" takes 2 minutes but reveals patterns you'd never catch day-to-day.`,
      confidence: 0.8,
      dataPointCount: 10,
      suggestedAction: {
        text: 'Start your first weekly reflection',
        actionType: 'reflection',
        targetView: 'partner-intelligence',
      },
    }),
  },

  {
    id: 'ritual_suggestion_morning_note',
    category: 'growth_nudge',
    tone: 'curious',
    sentiment: 'growth',
    minConfidence: 0.3,
    cooldownDays: 30,
    condition: (m) => {
      const partner = m.partners.find(p => p.userId === getPartnerUserId());
      return !!partner &&
        partner.emotionalRhythm.bestTimeOfDay === 'morning' &&
        partner.emotionalRhythm.confidence >= 0.3;
    },
    generate: (m) => {
      const partnerName = getPartnerName();
      return {
        text: `${partnerName} tends to be in their best headspace in the mornings. A short note before they start their day could become the ritual that defines how they feel about your relationship.`,
        confidence: m.dataConfidence,
        dataPointCount: 15,
        suggestedAction: {
          text: 'Try a morning note for a week',
          actionType: 'ritual',
          targetView: 'notes',
        },
      };
    },
  },
];

// ── Insight Generation Engine ───────────────────────────────────────

function enforceRatio(candidates: Array<{ template: InsightTemplate; result: ReturnType<InsightTemplate['generate']> }>): typeof candidates {
  // 70/20/10 ratio: affirmative/growth/flag
  const affirmative = candidates.filter(c => c.template.sentiment === 'affirmative');
  const growth = candidates.filter(c => c.template.sentiment === 'growth');
  const flags = candidates.filter(c => c.template.sentiment === 'flag');

  const result: typeof candidates = [];

  // Prioritize affirmative
  result.push(...affirmative.slice(0, 3));
  result.push(...growth.slice(0, 1));
  result.push(...flags.slice(0, 1));

  return result;
}

// ── Main Service ────────────────────────────────────────────────────

export const InsightEngine = {

  async init(): Promise<void> {
    deepInsights = await readData<DeepInsight[]>(INSIGHTS_KEY) || [];
    systemMessages = await readData<SystemMessage[]>(MESSAGES_KEY) || [];
  },

  getAllInsights(): DeepInsight[] {
    return [...deepInsights].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  getUnseenInsight(userId?: string): DeepInsight | null {
    const uid = userId || getDeviceId();
    return deepInsights.find(i =>
      i.targetUserId === uid && !i.seenAt && !i.dismissedAt
    ) || null;
  },

  getRecentInsights(limit: number = 20, userId?: string): DeepInsight[] {
    const uid = userId || getDeviceId();
    return deepInsights
      .filter(i => i.targetUserId === uid)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },

  async markSeen(insightId: string): Promise<void> {
    const idx = deepInsights.findIndex(i => i.id === insightId);
    if (idx === -1) return;
    deepInsights[idx] = { ...deepInsights[idx], seenAt: new Date().toISOString() };
    await writeData(INSIGHTS_KEY, deepInsights);
    insightEventTarget.dispatchEvent(new CustomEvent('insight-update'));
  },

  async dismiss(insightId: string): Promise<void> {
    const idx = deepInsights.findIndex(i => i.id === insightId);
    if (idx === -1) return;
    deepInsights[idx] = {
      ...deepInsights[idx],
      seenAt: new Date().toISOString(),
      dismissedAt: new Date().toISOString(),
    };
    await writeData(INSIGHTS_KEY, deepInsights);
    insightEventTarget.dispatchEvent(new CustomEvent('insight-update'));
  },

  async markActedOn(insightId: string): Promise<void> {
    const idx = deepInsights.findIndex(i => i.id === insightId);
    if (idx === -1) return;
    deepInsights[idx] = { ...deepInsights[idx], actedOnAt: new Date().toISOString() };
    await writeData(INSIGHTS_KEY, deepInsights);
    insightEventTarget.dispatchEvent(new CustomEvent('insight-update'));
  },

  /** Main generation: evaluate all templates, enforce ratio, pick best */
  async generate(): Promise<DeepInsight | null> {
    const userId = getDeviceId();
    const model = RelationshipModelService.getModel();
    if (!model) return null;

    // Don't generate if unseen insight exists
    if (this.getUnseenInsight()) return null;

    // Max 3 insights per week
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const recentCount = deepInsights.filter(i =>
      i.targetUserId === userId && i.createdAt >= weekAgo
    ).length;
    if (recentCount >= 3) return null;

    // Evaluate templates
    const candidates: Array<{ template: InsightTemplate; result: ReturnType<InsightTemplate['generate']> }> = [];

    for (const tmpl of templates) {
      // Check minimum confidence
      if (model.dataConfidence < tmpl.minConfidence) continue;

      // Check cooldown
      const lastOfType = deepInsights.find(i =>
        i.targetUserId === userId &&
        deepInsights.some(d => d.id === i.id && d.category === tmpl.category)
      );
      // More precise cooldown check by template id
      const lastByTemplate = deepInsights
        .filter(i => i.targetUserId === userId)
        .find(i => {
          // Match by insight text pattern (since we don't store template id)
          const generated = tmpl.condition(model) ? tmpl.generate(model) : null;
          return generated && i.category === tmpl.category &&
            differenceInDays(new Date(), new Date(i.createdAt)) < tmpl.cooldownDays;
        });
      if (lastByTemplate) continue;

      // Check condition
      try {
        if (tmpl.condition(model)) {
          const result = tmpl.generate(model);
          if (result.confidence >= 0.3) {
            candidates.push({ template: tmpl, result });
          }
        }
      } catch {
        // Template evaluation failed — skip silently
      }
    }

    if (candidates.length === 0) return null;

    // Enforce 70/20/10 ratio and pick
    const filtered = enforceRatio(candidates);
    if (filtered.length === 0) return null;

    // Don't repeat same category as last insight
    const lastInsight = deepInsights
      .filter(i => i.targetUserId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    let winner = filtered[0];
    if (lastInsight && winner.template.category === lastInsight.category && filtered.length > 1) {
      winner = filtered[1];
    }

    // Create insight
    const insight: DeepInsight = {
      id: generateId(),
      coupleId: model.coupleId,
      targetUserId: winner.result.targetUserId || userId,
      aboutUserId: winner.result.aboutUserId,
      category: winner.template.category,
      tone: winner.template.tone,
      sentiment: winner.template.sentiment,
      insightText: winner.result.text,
      specificDataRef: winner.result.specificDataRef,
      suggestedAction: winner.result.suggestedAction,
      confidence: winner.result.confidence,
      dataPointCount: winner.result.dataPointCount,
      createdAt: new Date().toISOString(),
    };

    deepInsights.push(insight);
    await writeData(INSIGHTS_KEY, deepInsights);
    insightEventTarget.dispatchEvent(new CustomEvent('insight-update'));

    return insight;
  },

  // ── Progressive First-Week Experience ─────────────────────────────

  getSystemMessage(): SystemMessage | null {
    const daysSince = RelationshipSignals.getDaysSinceFirstSignal();
    const totalSignals = RelationshipSignals.getTotalSignalCount();
    const seenIds = new Set(systemMessages.filter(m => m.seenAt).map(m => m.id));

    const messages: Array<Omit<SystemMessage, 'createdAt' | 'seenAt'>> = [
      {
        id: 'welcome',
        type: 'onboarding',
        text: 'I\'m starting to learn you.',
        subtext: 'Log your first pulse check and I\'ll begin building your relationship map.',
        dayThreshold: 0,
        minSignals: 0,
      },
      {
        id: 'day_3',
        type: 'onboarding',
        text: 'I\'m noticing your first patterns.',
        subtext: 'A few more days and I\'ll have your first real insight.',
        dayThreshold: 3,
        minSignals: 3,
      },
      {
        id: 'day_7',
        type: 'data_milestone',
        text: 'Your first week is in.',
        subtext: 'I can now see your rhythms. Your first deep insight is ready.',
        dayThreshold: 7,
        minSignals: 7,
      },
      {
        id: 'day_14',
        type: 'data_milestone',
        text: 'Two weeks of your story.',
        subtext: 'I can now detect patterns, not just moments. The intelligence is getting real.',
        dayThreshold: 14,
        minSignals: 14,
      },
      {
        id: 'day_30',
        type: 'data_milestone',
        text: 'One month together with me.',
        subtext: 'Your relationship model is rich enough for deep insights now. I know your rhythms.',
        dayThreshold: 30,
        minSignals: 25,
      },
    ];

    for (const msg of messages) {
      if (daysSince >= msg.dayThreshold && totalSignals >= msg.minSignals && !seenIds.has(msg.id)) {
        return { ...msg, createdAt: new Date().toISOString() } as SystemMessage;
      }
    }

    return null;
  },

  async markSystemMessageSeen(msgId: string): Promise<void> {
    const existing = systemMessages.find(m => m.id === msgId);
    if (existing) {
      existing.seenAt = new Date().toISOString();
    } else {
      systemMessages.push({
        id: msgId,
        type: 'onboarding',
        text: '',
        dayThreshold: 0,
        minSignals: 0,
        createdAt: new Date().toISOString(),
        seenAt: new Date().toISOString(),
      });
    }
    await writeData(MESSAGES_KEY, systemMessages);
  },

  /** Count insights by sentiment for ratio tracking */
  getInsightRatioStats(): { affirmative: number; growth: number; flag: number } {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const recent = deepInsights.filter(i => i.createdAt >= thirtyDaysAgo);
    return {
      affirmative: recent.filter(i => i.sentiment === 'affirmative').length,
      growth: recent.filter(i => i.sentiment === 'growth').length,
      flag: recent.filter(i => i.sentiment === 'flag').length,
    };
  },
};

// ── Periodic Generation ─────────────────────────────────────────────

let lastGenCheck = 0;

export const checkAndGenerateDeepInsights = async () => {
  const now = Date.now();
  if (now - lastGenCheck < 6 * 60 * 60 * 1000) return; // Every 6 hours
  lastGenCheck = now;
  await InsightEngine.generate();
};

// Initialize on import
InsightEngine.init();
