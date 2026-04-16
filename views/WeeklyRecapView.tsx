import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Play,
  Pause,
  Calendar,
  Heart,
  MessageCircle,
  Smile,
  Film,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  Loader2,
  Clock,
  Image as ImageIcon
} from 'lucide-react';
import { WeeklyRecap, WeeklyRecapStats, Memory, MoodEntry, Note, ViewState } from '../types';
import { VideoCompilerService } from '../services/videoCompiler';
import { StorageService, storageEventTarget } from '../services/storage';
import { generateId } from '../utils/ids';

interface Props {
  setView: (view: ViewState) => void;
}

// ── IndexedDB Setup ───────────────────────────────────────────────────
const DB_NAME = 'LiorVault_v11';
const DB_VERSION = 1;
const STORES = {
  DATA: 'metadata_store',
  IMAGES: 'image_vault'
};

const CACHE_KEY = 'lior_weekly_recaps';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.DATA)) db.createObjectStore(STORES.DATA);
      if (!db.objectStoreNames.contains(STORES.IMAGES)) db.createObjectStore(STORES.IMAGES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const writeRaw = async (store: string, key: string, val: unknown): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(val, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

const readRaw = async <T,>(store: string, key: string): Promise<T | null> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
};

// ── Date Helpers ──────────────────────────────────────────────────────
const getWeekBounds = (date: Date): { start: Date; end: Date } => {
  const d = new Date(date);
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day); // Sunday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Saturday
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const formatWeekLabel = (start: Date, end: Date): string => {
  const startMonth = start.toLocaleString('default', { month: 'short' });
  const endMonth = end.toLocaleString('default', { month: 'short' });
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
};

const getWeekKey = (date: Date): string => {
  const { start } = getWeekBounds(date);
  return start.toISOString().split('T')[0];
};

// ── Components ────────────────────────────────────────────────────────
const StatCard: React.FC<{
  icon: React.ReactNode;
  value: number | string;
  label: string;
  color: string;
}> = ({ icon, value, label, color }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center p-4 rounded-2xl"
    style={{ backgroundColor: `${color}15` }}
  >
    <div className="mb-2" style={{ color }}>{icon}</div>
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="text-xs text-white/60">{label}</div>
  </motion.div>
);

const WeekSelector: React.FC<{
  currentWeek: Date;
  onChange: (date: Date) => void;
}> = ({ currentWeek, onChange }) => {
  const { start, end } = getWeekBounds(currentWeek);
  const isCurrentWeek = getWeekKey(new Date()) === getWeekKey(currentWeek);

  const goToPrevWeek = () => {
    const prev = new Date(currentWeek);
    prev.setDate(prev.getDate() - 7);
    onChange(prev);
  };

  const goToNextWeek = () => {
    if (isCurrentWeek) return;
    const next = new Date(currentWeek);
    next.setDate(next.getDate() + 7);
    onChange(next);
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-2xl">
      <button
        onClick={goToPrevWeek}
        className="p-2 rounded-full hover:bg-white/10 transition-colors"
      >
        <ChevronLeft className="w-5 h-5 text-white/70" />
      </button>

      <div className="text-center">
        <div className="text-white font-medium">{formatWeekLabel(start, end)}</div>
        <div className="text-white/50 text-xs">{start.getFullYear()}</div>
      </div>

      <button
        onClick={goToNextWeek}
        disabled={isCurrentWeek}
        className={`p-2 rounded-full transition-colors ${
          isCurrentWeek ? 'opacity-30' : 'hover:bg-white/10'
        }`}
      >
        <ChevronRight className="w-5 h-5 text-white/70" />
      </button>
    </div>
  );
};

const VideoPlayer: React.FC<{
  videoUrl: string;
  onClose: () => void;
}> = ({ videoUrl, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onClick={onClose}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        autoPlay
        playsInline
        className="max-w-full max-h-full"
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
        onEnded={() => setIsPlaying(false)}
      />

      <button
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 p-4 rounded-full bg-white/20 backdrop-blur-lg"
      >
        {isPlaying ? (
          <Pause className="w-8 h-8 text-white" />
        ) : (
          <Play className="w-8 h-8 text-white fill-white" />
        )}
      </button>

      <button
        onClick={onClose}
        className="absolute top-12 right-4 p-2 rounded-full bg-white/10"
      >
        <ArrowLeft className="w-5 h-5 text-white" />
      </button>
    </motion.div>
  );
};

// ── Main Component ────────────────────────────────────────────────────
export const WeeklyRecapView: React.FC<Props> = ({ setView }) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [recaps, setRecaps] = useState<WeeklyRecap[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [weekStats, setWeekStats] = useState<WeeklyRecapStats | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [moods, setMoods] = useState<MoodEntry[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  // Load data from StorageService
  useEffect(() => {
    const loadData = () => {
      setMemories(StorageService.getMemories());
      setMoods(StorageService.getMoodEntries());
      setNotes(StorageService.getNotes());
    };
    loadData();
    storageEventTarget.addEventListener('storage-update', loadData);
    return () => storageEventTarget.removeEventListener('storage-update', loadData);
  }, []);

  // Load existing recaps
  useEffect(() => {
    const loadRecaps = async () => {
      const data = await readRaw<WeeklyRecap[]>(STORES.DATA, CACHE_KEY);
      if (data) setRecaps(data);
    };
    loadRecaps();
  }, []);

  // Calculate stats for current week
  useEffect(() => {
    const { start, end } = getWeekBounds(currentWeek);

    const weekMemories = memories.filter(m => {
      const date = new Date(m.date);
      return date >= start && date <= end;
    });

    const weekMoods = moods.filter(m => {
      const date = new Date(m.timestamp);
      return date >= start && date <= end;
    });

    const weekNotes = notes.filter(n => {
      const date = new Date(n.createdAt);
      return date >= start && date <= end;
    });

    // Calculate average mood score
    const moodScores: Record<string, number> = {
      'excited': 5, 'happy': 4, 'peaceful': 4, 'content': 3,
      'neutral': 3, 'tired': 2, 'anxious': 2, 'sad': 1, 'stressed': 1
    };

    const avgMood = weekMoods.length > 0
      ? weekMoods.reduce((sum, m) => sum + (moodScores[m.mood] || 3), 0) / weekMoods.length
      : 0;

    // Calculate trend
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (weekMoods.length >= 2) {
      const firstHalf = weekMoods.slice(0, Math.floor(weekMoods.length / 2));
      const secondHalf = weekMoods.slice(Math.floor(weekMoods.length / 2));
      const firstAvg = firstHalf.reduce((s, m) => s + (moodScores[m.mood] || 3), 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((s, m) => s + (moodScores[m.mood] || 3), 0) / secondHalf.length;
      if (secondAvg > firstAvg + 0.5) trend = 'up';
      else if (secondAvg < firstAvg - 0.5) trend = 'down';
    }

    setWeekStats({
      memoriesCount: weekMemories.length,
      notesCount: weekNotes.length,
      moodsLogged: weekMoods.length,
      avgMoodScore: Math.round(avgMood * 10) / 10,
      moodTrend: trend,
      specialDatesCount: 0,
      dailyClipsCount: 0,
      highlightMoments: weekMemories.slice(0, 5).map(m => m.id)
    });
  }, [currentWeek, memories, moods, notes]);

  // Get current week's recap
  const currentRecap = recaps.find(r => r.weekStart === getWeekKey(currentWeek));

  // Generate recap video
  const handleGenerateRecap = useCallback(async () => {
    if (!weekStats || isGenerating) return;

    const { start, end } = getWeekBounds(currentWeek);

    const weekMemories = memories.filter(m => {
      const date = new Date(m.date);
      return date >= start && date <= end;
    });

    const weekMoods = moods.filter(m => {
      const date = new Date(m.timestamp);
      return date >= start && date <= end;
    });

    const weekNotes = notes.filter(n => {
      const date = new Date(n.createdAt);
      return date >= start && date <= end;
    });

    if (weekMemories.length === 0 && weekMoods.length === 0 && weekNotes.length === 0) {
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);

    try {
      const weekLabel = formatWeekLabel(start, end);
      const { blob, thumbnail, duration } = await VideoCompilerService.compileWeeklyRecap(
        weekMemories,
        weekMoods,
        weekNotes,
        weekStats,
        weekLabel,
        { onProgress: setGenerationProgress }
      );

      // Save to IndexedDB
      const id = generateId();
      const videoId = `weekly_recap_${id}`;
      const thumbnailId = `weekly_recap_thumb_${id}`;

      const videoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      await writeRaw(STORES.IMAGES, videoId, videoBase64);
      await writeRaw(STORES.IMAGES, thumbnailId, thumbnail);

      const newRecap: WeeklyRecap = {
        id,
        coupleId: 'local',
        weekStart: getWeekKey(currentWeek),
        weekEnd: end.toISOString().split('T')[0],
        videoId,
        thumbnailId,
        durationMs: duration,
        generatedAt: new Date().toISOString(),
        status: 'ready',
        stats: weekStats
      };

      const updated = recaps.filter(r => r.weekStart !== newRecap.weekStart);
      updated.push(newRecap);
      setRecaps(updated);
      await writeRaw(STORES.DATA, CACHE_KEY, updated);
    } catch (err) {
      console.error('Failed to generate recap:', err);
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  }, [currentWeek, memories, moods, notes, weekStats, isGenerating, recaps]);

  // Play video
  const handlePlayVideo = useCallback(async (recap: WeeklyRecap) => {
    if (!recap.videoId) return;
    const videoUrl = await readRaw<string>(STORES.IMAGES, recap.videoId);
    if (videoUrl) setPlayingVideo(videoUrl);
  }, []);

  const hasContent = weekStats && (
    weekStats.memoriesCount > 0 ||
    weekStats.moodsLogged > 0 ||
    weekStats.notesCount > 0
  );

  const trendIcon = weekStats?.moodTrend === 'up' ? '📈' :
                    weekStats?.moodTrend === 'down' ? '📉' : '➡️';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f0f23] text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-gradient-to-b from-[#1a1a2e] to-transparent pt-12 pb-4 px-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setView('home')}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Weekly Recap</h1>
            <p className="text-white/50 text-sm">Your week in a video</p>
          </div>
          <Film className="w-6 h-6 text-purple-400" />
        </div>

        <WeekSelector currentWeek={currentWeek} onChange={setCurrentWeek} />
      </div>

      <div className="px-4 space-y-6">
        {/* Stats Grid */}
        {weekStats && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={<ImageIcon className="w-5 h-5" />}
              value={weekStats.memoriesCount}
              label="Memories"
              color="#ec4899"
            />
            <StatCard
              icon={<Smile className="w-5 h-5" />}
              value={weekStats.moodsLogged}
              label="Moods"
              color="#8b5cf6"
            />
            <StatCard
              icon={<MessageCircle className="w-5 h-5" />}
              value={weekStats.notesCount}
              label="Notes"
              color="#06b6d4"
            />
          </div>
        )}

        {/* Mood Summary */}
        {weekStats && weekStats.moodsLogged > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-white/5 rounded-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white/50 text-sm mb-1">Mood this week</div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{trendIcon}</span>
                  <span className="text-lg font-medium">
                    {weekStats.avgMoodScore.toFixed(1)} / 5
                  </span>
                </div>
              </div>
              <div className="text-right text-white/50 text-sm">
                {weekStats.moodTrend === 'up' && 'Trending up!'}
                {weekStats.moodTrend === 'down' && 'A tough week'}
                {weekStats.moodTrend === 'stable' && 'Steady vibes'}
              </div>
            </div>
          </motion.div>
        )}

        {/* Generated Recap or Generate Button */}
        {currentRecap ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10"
          >
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                <span className="text-white/70 text-sm">Your recap is ready!</span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold mb-1">
                    {formatWeekLabel(
                      new Date(currentRecap.weekStart),
                      new Date(currentRecap.weekEnd)
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-white/50 text-sm">
                    <Clock className="w-4 h-4" />
                    {Math.round(currentRecap.durationMs / 1000)}s
                  </div>
                </div>

                <button
                  onClick={() => handlePlayVideo(currentRecap)}
                  className="p-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg"
                >
                  <Play className="w-6 h-6 text-white fill-white" />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex border-t border-white/10">
              <button
                onClick={() => handleGenerateRecap()}
                className="flex-1 py-3 text-center text-sm text-white/70 hover:bg-white/5 transition-colors"
              >
                Regenerate
              </button>
              <button
                className="flex-1 py-3 text-center text-sm text-white/70 hover:bg-white/5 transition-colors border-l border-white/10"
              >
                <Download className="w-4 h-4 inline mr-1" />
                Save
              </button>
              <button
                className="flex-1 py-3 text-center text-sm text-white/70 hover:bg-white/5 transition-colors border-l border-white/10"
              >
                <Share2 className="w-4 h-4 inline mr-1" />
                Share
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-8"
          >
            {hasContent ? (
              <>
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                  <Film className="w-10 h-10 text-purple-400" />
                </div>

                <h3 className="text-lg font-semibold mb-2">Ready to create your recap?</h3>
                <p className="text-white/50 text-sm mb-6 max-w-xs mx-auto">
                  Turn this week's {weekStats?.memoriesCount || 0} memories,
                  {weekStats?.moodsLogged || 0} moods, and {weekStats?.notesCount || 0} notes
                  into a beautiful video
                </p>

                <button
                  onClick={handleGenerateRecap}
                  disabled={isGenerating}
                  className="px-8 py-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 font-medium shadow-lg shadow-purple-500/30 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Creating... {Math.round(generationProgress * 100)}%</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      <span>Generate Recap</span>
                    </div>
                  )}
                </button>
              </>
            ) : (
              <>
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <Calendar className="w-10 h-10 text-white/30" />
                </div>

                <h3 className="text-lg font-semibold mb-2 text-white/50">No activity this week</h3>
                <p className="text-white/40 text-sm max-w-xs mx-auto">
                  Add memories, moods, or notes to create a weekly recap video
                </p>
              </>
            )}
          </motion.div>
        )}

        {/* Past Recaps */}
        {recaps.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-white/50 mb-3 px-1">Past Recaps</h3>
            <div className="space-y-3">
              {recaps
                .filter(r => r.weekStart !== getWeekKey(currentWeek))
                .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
                .slice(0, 8)
                .map(recap => (
                  <motion.button
                    key={recap.id}
                    onClick={() => handlePlayVideo(recap)}
                    className="w-full flex items-center gap-4 p-4 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors text-left"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center">
                      <Play className="w-5 h-5 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {formatWeekLabel(
                          new Date(recap.weekStart),
                          new Date(recap.weekEnd)
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-white/50">
                        <span>{recap.stats.memoriesCount} memories</span>
                        <span>{Math.round(recap.durationMs / 1000)}s</span>
                      </div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-white/30" />
                  </motion.button>
                ))
              }
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20">
          <div className="flex items-start gap-3">
            <Heart className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-sm mb-1">Weekly Recap Tips</div>
              <ul className="text-white/60 text-xs space-y-1">
                <li>• Add photos to memories for a richer video</li>
                <li>• Log your mood daily for trend insights</li>
                <li>• Write notes to capture special moments</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Video Player Modal */}
      <AnimatePresence>
        {playingVideo && (
          <VideoPlayer
            videoUrl={playingVideo}
            onClose={() => setPlayingVideo(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default WeeklyRecapView;
