
export interface Memory {
  id: string;
  image?: string; // Data URI (Legacy or Sync transport)
  imageId?: string; // ID for IndexedDB
  imageBytes?: number;
  imageMimeType?: string;
  video?: string; // Data URI for Video
  videoId?: string; // ID for IndexedDB
  videoBytes?: number;
  videoMimeType?: string;
  storagePath?: string; // Supabase Storage path for image
  videoStoragePath?: string; // Supabase Storage path for video
  ownerUserId?: string; // Stable uploader/owner identity for media namespacing
  text: string;
  date: string; // ISO string
  mood: string;
}

export interface SpecialDate {
  id: string;
  title: string;
  date: string; // ISO string
  type: 'anniversary' | 'birthday' | 'other';
}

export interface Note {
  id: string;
  content: string;
  createdAt: string;
  color: string;
}

export interface Envelope {
  id: string;
  label: string; // e.g. "Open when you miss me"
  content: string;
  color: string;
  isLocked: boolean; // Just a visual indicator, or 'opened' state
  openedAt?: string;
}

export interface DailyPhoto {
  id: string;
  imageId?: string;
  imageBytes?: number;
  imageMimeType?: string;
  image?: string; // For sync transport
  videoId?: string;
  videoBytes?: number;
  videoMimeType?: string;
  video?: string;
  storagePath?: string; // Supabase Storage path for image
  videoStoragePath?: string; // Supabase Storage path for video
  ownerUserId?: string; // Stable uploader/owner identity for media namespacing
  caption: string;
  createdAt: string;
  expiresAt: string;
  senderId: string;
}

export interface Comment {
  id: string;
  postId: string;       // DailyPhoto id
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  parentId?: string;    // For threaded replies
}

// NEW: Immutable Keepsake (Gift/Letter)
export interface Keepsake {
  id: string;
  senderId: string;
  type: 'letter' | 'photo' | 'song' | 'memory' | 'video';
  title?: string;
  content?: string;
  image?: string; // Data URI
  imageId?: string; // ID for IndexedDB
  imageBytes?: number;
  imageMimeType?: string;
  video?: string;
  videoId?: string;
  videoBytes?: number;
  videoMimeType?: string;
  storagePath?: string; // Supabase Storage path for image
  videoStoragePath?: string; // Supabase Storage path for video
  ownerUserId?: string; // Stable uploader/owner identity for media namespacing
  spotifyLink?: string;
  date: string; // ISO String
  isHidden: boolean; // Soft delete only
}

export interface UserStatus {
  state: 'awake' | 'sleeping';
  timestamp: string; // ISO string
}

export interface DinnerOption {
  id: string;
  text: string;
}

export interface QuestionEntry {
  date: string; // YYYY-MM-DD
  question: string;
  answers: Record<string, string>; // { [name]: answer text }
  revealedAt?: string; // ISO string — when both answered
}

export interface StreakData {
  checkIns: Record<string, string>; // { [name]: 'YYYY-MM-DD' }
  count: number;
  lastMutualDate: string; // 'YYYY-MM-DD'
  bestStreak: number;
  lastBrokenCount?: number; // streak count when it last broke
  lastBrokenDate?: string;  // date it broke
}

export interface CoupleProfile {
  myName: string;
  partnerName: string;
  anniversaryDate: string; // ISO string
  photo?: string; // Base64 data URI
  theme?: string; // 'rose', 'blue', 'green', 'orange', 'purple', 'dark'
  isPremium?: boolean; // Premium status for unlocking features like video uploads
  coupleId?: string; // Shared couple tenant ID used for cloud sync
  partnerUserId?: string; // Set after QR pairing — real Supabase user ID of partner
  missedAuras?: any[];
  bonsaiState?: any;
  presenceTraces?: PresenceTrace[];
  nightlights?: NightlightEntry[];
  streakData?: StreakData;
  questions?: QuestionEntry[];
}

export interface PresenceTrace {
  id: string;
  senderName: string;
  targetName: string;
  title: string;
  subtitle: string;
  note: string;
  color: string;
  createdAt: string; // ISO string
  expiresAt?: string; // ISO string
}

export interface NightlightEntry {
  id: string;
  senderName: string;
  targetName: string;
  nightKey: string; // Local YYYY-MM-DD for the sender's night
  intentId: string;
  title: string;
  subtitle: string;
  detail: string;
  note: string;
  color: string;
  palette: [string, string, string];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  openedAt?: string; // ISO string
  feltAt?: string; // ISO string
  whisperAudio?: string; // Data URI
  whisperDurationSec?: number;
}

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  category: 'hat' | 'accessory' | 'environment';
  emoji: string;
}

export interface PetStats {
  name: string;
  type: 'dog' | 'cat' | 'bunny' | 'bear';
  lastFed: string; // ISO String
  lastPetted: string; // ISO String
  happiness: number; // 0-100
  xp: number;
  lastMemoryPrompt?: string; // ISO String of last AI flashback
  lastCareDate?: string; // ISO string for daily care streak logic
  lastBondDate?: string; // ISO string for daily bond streak logic
  lastSignalSentAt?: string; // ISO string
  lastSignalReceivedAt?: string; // ISO string
  lastInteractionAt?: string; // ISO string
  careStreak: number;
  presenceStreak: number;
  bondMoments: number;
  coins: number;
  inventory: string[];
  equipped: {
    hat?: string;
    accessory?: string;
    environment?: string;
  };
}

export interface MoodEntry {
  id: string;
  userId: string;
  mood: string;
  timestamp: string; // ISO string
  note?: string;
}

export interface TimeCapsule {
  id: string;
  senderId: string;
  title: string;
  message: string;
  imageId?: string;
  imageBytes?: number;
  imageMimeType?: string;
  image?: string;
  storagePath?: string;
  ownerUserId?: string; // Stable uploader/owner identity for media namespacing
  unlockDate: string; // ISO string
  createdAt: string; // ISO string
  isUnlocked: boolean;
}

export interface Surprise {
  id: string;
  senderId: string;
  title: string;
  message: string;
  emoji?: string;
  imageId?: string;
  imageBytes?: number;
  imageMimeType?: string;
  image?: string;
  storagePath?: string;
  ownerUserId?: string; // Stable uploader/owner identity for media namespacing
  scheduledFor: string; // ISO string
  createdAt: string; // ISO string
  delivered: boolean;
  deliveredAt?: string;
}

export interface VoiceNote {
  id: string;
  title?: string;
  audioId?: string; // IDB key
  audioBytes?: number;
  audioMimeType?: string;
  audioStoragePath?: string; // R2 URL
  ownerUserId?: string; // Stable uploader/owner identity for media namespacing
  duration: number; // seconds
  createdAt: string; // ISO string
  senderId: string;
}

// ── Daily Voice Moments (10-second ritual) ─────────────────────────
export interface DailyVoiceMoment {
  id: string;
  odCoupleId: string;
  odUserId: string;
  momentDate: string; // YYYY-MM-DD in user's local timezone
  audioId?: string; // IndexedDB key
  audioStoragePath?: string; // Supabase/R2 path
  audioDurationMs: number; // max 10000
  waveformData: number[]; // 64 amplitude values 0-1
  recordedAt: string; // ISO timestamp
  listenedByPartner: boolean;
  listenedAt?: string;
}

export interface VoiceMomentSettings {
  userId: string;
  nudgeWindowStart: string; // "07:00"
  nudgeWindowEnd: string; // "10:00"
  revealTime: string; // "22:00"
  notificationsEnabled: boolean;
  timezone: string;
  streakCount: number;
  longestStreak: number;
  totalMoments: number;
  lastMomentDate?: string;
}

export interface VoiceMomentDay {
  date: string;
  userMoment?: DailyVoiceMoment;
  partnerMoment?: DailyVoiceMoment;
  bothRecorded: boolean;
}

export interface OnThisDay {
  date: string;
  daysAgo: number;
  label: string; // "1 year ago", "6 months ago", etc.
  moments: VoiceMomentDay;
}

// ── Partner Intelligence ────────────────────────────────────────────
export type InsightCategory = 'emotional_state' | 'connection_pattern' | 'meaningful_date' | 'appreciation' | 'nudge';

export interface PartnerInsight {
  id: string;
  coupleId: string;
  targetUserId: string; // who sees this insight
  aboutUserId?: string; // who the insight is about (null for couple-level)
  category: InsightCategory;
  insightKey: string; // e.g., 'mood_decline_sustained'
  insightText: string;
  confidence: number; // 0-1, only surface if > 0.7
  dataPoints?: Record<string, unknown>;
  createdAt: string;
  seenAt?: string;
  dismissedAt?: string;
}

export interface InsightAggregates {
  coupleId: string;
  userId: string;
  computedAt: string;
  moodAverage30d: number;
  moodAverage7d: number;
  moodTrend7d: 'rising' | 'falling' | 'stable';
  moodByDayOfWeek: Record<string, number>;
  daysActive30d: number;
  voiceNotesSent30d: number;
  voiceNotesAvgLengthMs: number;
  notesSent30d: number;
  notesSentiment30d: 'positive' | 'neutral' | 'negative' | 'mixed';
  memoriesAdded30d: number;
  dailyMomentStreak: number;
  avgSessionHour: number;
  lateNightSessions7d: number;
  auraSignalsSent7d: number;
  auraAvgResponseTimeMs: number;
  bonsaiWaters7d: number;
}

export type ViewState = 'home' | 'add-memory' | 'timeline' | 'special-dates' | 'notes' | 'open-when' | 'sync' | 'daily-moments' | 'dinner-decider' | 'profile' | 'quiet-mode' | 'keepsakes' | 'countdowns' | 'mood-calendar' | 'aura-rewind' | 'aura-signal' | 'presence-room' | 'bonsai-bloom' | 'us' | 'our-room' | 'canvas' | 'privacy-policy' | 'terms-of-service' | 'time-capsule' | 'surprises' | 'voice-notes' | 'year-in-review' | 'partner-intelligence' | 'daily-video' | 'weekly-recap';

// ── Daily Video Moments (10-second clips → monthly compilation) ─────
export interface DailyVideoClip {
  id: string;
  odCoupleId: string;
  odUserId: string;
  clipDate: string; // YYYY-MM-DD in user's local timezone
  videoId?: string; // IndexedDB key
  videoStoragePath?: string; // Supabase/R2 path
  thumbnailId?: string; // IndexedDB key for thumbnail
  thumbnailStoragePath?: string;
  durationMs: number; // max 10000
  recordedAt: string; // ISO timestamp
  watchedByPartner: boolean;
  watchedAt?: string;
}

export interface VideoMomentDay {
  date: string;
  userClip?: DailyVideoClip;
  partnerClip?: DailyVideoClip;
  bothRecorded: boolean;
}

export interface MonthlyVideoCompilation {
  id: string;
  coupleId: string;
  month: string; // YYYY-MM
  videoId?: string; // IndexedDB key
  videoStoragePath?: string;
  thumbnailId?: string;
  thumbnailStoragePath?: string;
  durationMs: number;
  clipCount: number;
  generatedAt: string; // ISO timestamp
  status: 'pending' | 'generating' | 'ready' | 'failed';
}

export interface VideoMomentSettings {
  odCoupleId: string;
  userId: string;
  reminderEnabled: boolean;
  reminderTime: string; // "20:00"
  timezone: string;
  streakCount: number;
  longestStreak: number;
  totalClips: number;
  lastClipDate?: string;
}

// ── Weekly Recap Video ──────────────────────────────────────────────
export interface WeeklyRecap {
  id: string;
  coupleId: string;
  weekStart: string; // YYYY-MM-DD (Sunday)
  weekEnd: string; // YYYY-MM-DD (Saturday)
  videoId?: string; // IndexedDB key
  videoStoragePath?: string;
  thumbnailId?: string;
  thumbnailStoragePath?: string;
  durationMs: number;
  generatedAt: string; // ISO timestamp
  status: 'pending' | 'generating' | 'ready' | 'failed';
  stats: WeeklyRecapStats;
}

export interface WeeklyRecapStats {
  memoriesCount: number;
  notesCount: number;
  moodsLogged: number;
  avgMoodScore: number;
  moodTrend: 'up' | 'down' | 'stable';
  specialDatesCount: number;
  dailyClipsCount: number;
  highlightMoments: string[]; // IDs of featured items
}

export type TransitionDirection = 'push' | 'pop' | 'tab' | 'modal';

export const ROOT_TABS: ViewState[] = ['home', 'us', 'timeline', 'daily-moments', 'profile'];

export interface RoomFurniture {
  uid: string;
  itemId: string;
  gx: number;
  gy: number;
  placedBy: string;
}

export interface RoomPlacedItem {
  uid: string;
  itemId: string;
  x: number; // percentage (0-100) within room plane
  y: number; // percentage (0-100) within room plane
  z?: number;
  scale?: number;
  rotation?: number;
  purchasePrice?: number;
  placedBy: string;
}

export interface RoomUpgradeLevels {
  creatorRig: number;
  cozyNook: number;
  idleEngine: number;
  storage: number;
  bonding: number;
}

export interface RoomDailyState {
  streak: number;
  bestStreak: number;
  lastClaimDate?: string;
  lastVisitDate?: string;
  lastGiftDate?: string;
  lastJointDate?: string;
  actionsToday?: number;
  coinsToday?: number;
  coupleActionsToday?: number;
  giftsToday?: number;
  visitsToday?: number;
  claimedTaskIds: string[];
  claimedCollectionIds: string[];
  taskSeedDate?: string;
}

export interface RoomRunStats {
  actionsCompleted: number;
  contentCreated: number;
  cozyActions: number;
  memoryActions: number;
  coupleActions: number;
  visitsCompleted: number;
  giftsSent: number;
  tasksCompleted: number;
  itemsPurchased: number;
  coinsEarned: number;
  loveEarned: number;
  starsEarned: number;
}

export interface RoomState {
  placedItems: RoomPlacedItem[];
  coins: number;
  love?: number;
  stars?: number;
  xp?: number;
  roomXp?: number;
  bondXp?: number;
  roomName: string;
  wallpaper: 'plain' | 'stripes' | 'polka' | 'hearts' | 'stars' | 'wood';
  floor: 'hardwood' | 'carpet' | 'tiles' | 'cloud' | 'grass' | 'marble';
  ambient: 'warm' | 'cool' | 'rainbow';
  lastActiveAt?: string;
  lastIdleClaimAt?: string;
  purchaseCounts?: Record<string, number>;
  upgrades?: Partial<RoomUpgradeLevels>;
  daily?: Partial<RoomDailyState>;
  stats?: Partial<RoomRunStats>;
  unlockedThemes?: string[];
  furniture?: RoomFurniture[]; // legacy field (migration only)
}

// ── Couple Room v2 (emotional, non-gamified) ────────────────────────

export interface RoomNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  color: string;
}

export interface RoomGift {
  id: string;
  from: string;
  emoji: string;
  message: string;
  createdAt: string;
  opened: boolean;
}

export interface RoomMilestoneItem {
  milestoneId: string;
  unlockedAt: string;
  itemId: string;
}

export interface CoupleRoomState {
  placedItems: RoomPlacedItem[];
  roomName: string;
  wallpaper: string;
  floor: string;
  ambient: string;
  notes: RoomNote[];
  gifts: RoomGift[];
  milestoneItems: RoomMilestoneItem[];
  lastActorName?: string;
  lastActionText?: string;
  lastTouchedAt?: string;
  seasonalUnlocks?: string[];
  lastVisitedAt?: string;
  createdAt: string;
}

export interface UsBucketItem {
  id: string;
  text: string;
  addedBy: string;
  completedAt?: string;
}

export interface UsWishlistItem {
  id: string;
  text: string;
  ownerName: string;
  gifted?: boolean;
}

export interface UsMilestone {
  id: string;
  title: string;
  date: string;
  emoji: string;
  description?: string;
}
