import { useState, useRef, useCallback, useEffect } from 'react';

interface VideoRecorderResult {
  blob: Blob;
  duration: number;
  thumbnail: string; // Data URL of first frame
}

interface UseVideoRecorderReturn {
  isRecording: boolean;
  recordingTime: number;
  videoPreviewRef: React.RefObject<HTMLVideoElement>;
  hasPermission: boolean | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<VideoRecorderResult | null>;
  cancelRecording: () => void;
  switchCamera: () => Promise<void>;
  isFrontCamera: boolean;
}

const MAX_DURATION = 10000; // 10 seconds

export function useVideoRecorder(): UseVideoRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
  }, []);

  const initCamera = useCallback(async (facingMode: 'user' | 'environment' = 'user') => {
    try {
      stopStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      streamRef.current = stream;
      setHasPermission(true);
      setError(null);

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.muted = true;
        await videoPreviewRef.current.play();
      }

      return stream;
    } catch (err) {
      setHasPermission(false);
      const message = err instanceof Error ? err.message : 'Camera access denied';
      setError(message);
      return null;
    }
  }, [stopStream]);

  const switchCamera = useCallback(async () => {
    const newFacing = isFrontCamera ? 'environment' : 'user';
    setIsFrontCamera(!isFrontCamera);
    await initCamera(newFacing);
  }, [isFrontCamera, initCamera]);

  const generateThumbnail = useCallback((videoBlob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadeddata = () => {
        video.currentTime = 0.1; // Seek to first frame
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
          URL.revokeObjectURL(video.src);
          resolve(thumbnail);
        } else {
          reject(new Error('Could not get canvas context'));
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Could not load video'));
      };

      video.src = URL.createObjectURL(videoBlob);
    });
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];

    // Initialize camera if not already
    let stream = streamRef.current;
    if (!stream) {
      stream = await initCamera(isFrontCamera ? 'user' : 'environment');
      if (!stream) return;
    }

    // Prefer MP4 if supported, fallback to WebM
    const mimeType = MediaRecorder.isTypeSupported('video/mp4')
      ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2500000 // 2.5 Mbps for good quality
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(100); // Collect data every 100ms

    setIsRecording(true);
    setRecordingTime(0);
    startTimeRef.current = Date.now();

    // Update timer every 100ms for smooth countdown
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setRecordingTime(Math.min(elapsed, MAX_DURATION));
    }, 100);

    // Auto-stop at 10 seconds
    autoStopRef.current = setTimeout(() => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    }, MAX_DURATION);
  }, [initCamera, isFrontCamera]);

  const stopRecording = useCallback(async (): Promise<VideoRecorderResult | null> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }

    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      setIsRecording(false);
      return null;
    }

    return new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        const duration = Date.now() - startTimeRef.current;
        const mimeType = mediaRecorder.mimeType;
        const blob = new Blob(chunksRef.current, { type: mimeType });

        setIsRecording(false);
        stopStream();

        try {
          const thumbnail = await generateThumbnail(blob);
          resolve({
            blob,
            duration: Math.min(duration, MAX_DURATION),
            thumbnail
          });
        } catch {
          // Fallback: return without thumbnail
          resolve({
            blob,
            duration: Math.min(duration, MAX_DURATION),
            thumbnail: ''
          });
        }
      };

      mediaRecorder.stop();
    });
  }, [stopStream, generateThumbnail]);

  const cancelRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    chunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
    stopStream();
  }, [stopStream]);

  return {
    isRecording,
    recordingTime,
    videoPreviewRef,
    hasPermission,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    switchCamera,
    isFrontCamera
  };
}
