
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

export interface CoupleProfile {
  myName: string;
  partnerName: string;
  anniversaryDate: string; // ISO string
  photo?: string; // Base64 data URI
  theme?: string; // 'rose', 'blue', 'green', 'orange', 'purple', 'dark'
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
  lastMemoryPrompt?: string; // ISO String of last AI flashback
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

export type ViewState = 'home' | 'add-memory' | 'timeline' | 'special-dates' | 'notes' | 'open-when' | 'sync' | 'daily-moments' | 'dinner-decider' | 'profile' | 'quiet-mode' | 'keepsakes' | 'countdowns' | 'mood-calendar' | 'aura-rewind';
