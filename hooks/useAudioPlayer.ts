import { useState, useRef, useCallback, useEffect } from 'react';

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  currentTime: number; // milliseconds
  duration: number; // milliseconds
  progress: number; // 0-1
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setAudioSource: (url: string, durationMs?: number) => void;
  error: string | null;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number>(0);

  const updateTime = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime * 1000);
      if (!audioRef.current.paused) {
        animationFrameRef.current = requestAnimationFrame(updateTime);
      }
    }
  }, []);

  const setAudioSource = useCallback((url: string, durationMs?: number) => {
    setError(null);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      const dur = durationMs || audio.duration * 1000;
      setDuration(dur);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      cancelAnimationFrame(animationFrameRef.current);
    };

    audio.onerror = () => {
      setError('Could not load audio');
      setIsPlaying(false);
    };

    audio.onplay = () => {
      setIsPlaying(true);
      animationFrameRef.current = requestAnimationFrame(updateTime);
    };

    audio.onpause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(animationFrameRef.current);
    };

    // Set duration if provided (for cases where metadata isn't available)
    if (durationMs) {
      setDuration(durationMs);
    }
  }, [updateTime]);

  const play = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(err => {
        setError('Playback failed');
      });
    }
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time / 1000;
      setCurrentTime(time);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;

  return {
    isPlaying,
    currentTime,
    duration,
    progress,
    play,
    pause,
    seek,
    setAudioSource,
    error
  };
}
