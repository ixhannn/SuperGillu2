/**
 * Ambient music service — curated set of tracks used as a music bed for
 * bi-weekly films. Tracks live under /public/music and are loaded lazily.
 *
 * Track selection heuristic:
 *  - If a preferred track is set in VideoMomentSettings, use it.
 *  - Else pick by dominant mood of the cycle (mapped from the week's recap
 *    palette bucket).
 *  - Else deterministic rotation based on cycleStart so subsequent films
 *    don't feel repetitive.
 */

import { AmbientTrack, RecapMoodBucket } from '../types';

export const AMBIENT_TRACKS: AmbientTrack[] = [
  {
    id: 'warm-ember',
    name: 'Warm Ember',
    src: '/music/warm-ember.mp3',
    mood: 'warm',
    durationSec: 120,
    credit: 'Lior ambient set',
  },
  {
    id: 'quiet-dawn',
    name: 'Quiet Dawn',
    src: '/music/quiet-dawn.mp3',
    mood: 'quiet',
    durationSec: 120,
    credit: 'Lior ambient set',
  },
  {
    id: 'playful-fern',
    name: 'Playful Fern',
    src: '/music/playful-fern.mp3',
    mood: 'playful',
    durationSec: 120,
    credit: 'Lior ambient set',
  },
  {
    id: 'contemplative-rain',
    name: 'Contemplative Rain',
    src: '/music/contemplative-rain.mp3',
    mood: 'contemplative',
    durationSec: 120,
    credit: 'Lior ambient set',
  },
];

const MOOD_TO_TRACK_MOOD: Record<RecapMoodBucket, AmbientTrack['mood']> = {
  warm: 'warm',
  tender: 'warm',
  quiet: 'quiet',
  contemplative: 'contemplative',
  playful: 'playful',
  intense: 'contemplative',
};

export const AmbientMusicService = {
  list(): AmbientTrack[] {
    return AMBIENT_TRACKS;
  },

  byId(id?: string): AmbientTrack | null {
    if (!id) return null;
    return AMBIENT_TRACKS.find((t) => t.id === id) ?? null;
  },

  pickForCycle(options: {
    cycleStart: string;
    preferredId?: string;
    moodBucket?: RecapMoodBucket;
  }): AmbientTrack {
    const preferred = this.byId(options.preferredId);
    if (preferred) return preferred;

    if (options.moodBucket) {
      const targetMood = MOOD_TO_TRACK_MOOD[options.moodBucket];
      const candidates = AMBIENT_TRACKS.filter((t) => t.mood === targetMood);
      if (candidates.length > 0) {
        const idx = hashCode(options.cycleStart) % candidates.length;
        return candidates[idx];
      }
    }

    const idx = hashCode(options.cycleStart) % AMBIENT_TRACKS.length;
    return AMBIENT_TRACKS[idx];
  },

  /**
   * Fetch the track as an AudioBuffer for Web Audio mixing during compilation.
   * Returns null if fetch fails (offline, missing file) — compiler will
   * fall back to silent audio.
   */
  async loadBuffer(track: AmbientTrack, audioCtx: AudioContext): Promise<AudioBuffer | null> {
    try {
      const resp = await fetch(track.src);
      if (!resp.ok) return null;
      const arr = await resp.arrayBuffer();
      return await audioCtx.decodeAudioData(arr);
    } catch {
      return null;
    }
  },
};

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
