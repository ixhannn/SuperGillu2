
export interface Memory {
  id: string;
  image?: string; // Data URI (Legacy or Sync transport)
  imageId?: string; // ID for IndexedDB
  video?: string; // Data URI for Video
  videoId?: string; // ID for IndexedDB
  storagePath?: string; // Supabase Storage path for image
  videoStoragePath?: string; // Supabase Storage path for video
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
  image?: string; // For sync transport
  videoId?: string;
  video?: string;
  storagePath?: string; // Supabase Storage path for image
  videoStoragePath?: string; // Supabase Storage path for video
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
  video?: string;
  videoId?: string;
  storagePath?: string; // Supabase Storage path for image
  videoStoragePath?: string; // Supabase Storage path for video
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

export type ViewState = 'home' | 'add-memory' | 'timeline' | 'special-dates' | 'notes' | 'open-when' | 'sync' | 'daily-moments' | 'dinner-decider' | 'profile' | 'quiet-mode' | 'keepsakes' | 'countdowns' | 'mood-calendar' | 'aura-rewind' | 'aura-signal' | 'presence-room' | 'bonsai-bloom' | 'us' | 'our-room' | 'canvas' | 'privacy-policy' | 'terms-of-service';

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
  placedBy: string;
}

export interface RoomState {
  placedItems: RoomPlacedItem[];
  coins: number;
  roomName: string;
  wallpaper: 'plain' | 'stripes' | 'polka' | 'hearts' | 'stars' | 'wood';
  floor: 'hardwood' | 'carpet' | 'tiles' | 'cloud' | 'grass' | 'marble';
  ambient: 'warm' | 'cool' | 'rainbow';
  furniture?: RoomFurniture[]; // legacy field (migration only)
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
