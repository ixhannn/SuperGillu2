import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Check } from 'lucide-react';
import { useVideoRecorder } from '../../hooks/useVideoRecorder';
import { useHoldToRecord } from '../../hooks/useHoldToRecord';
import { feedback } from '../../utils/feedback';

const CLIP_MS = 5000;
const RING_RADIUS = 58;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface DailyVideoRecorderProps {
  onSaved: (result: { blob: Blob; durationMs: number }) => void | Promise<void>;
  onClose: () => void;
}

type Phase = 'idle' | 'recording' | 'review';

interface Take {
  blob: Blob;
  durationMs: number;
  previewUrl: string;
}

export function DailyVideoRecorder({ onSaved, onClose }: DailyVideoRecorderProps) {
  const recorder = useVideoRecorder();
  const [phase, setPhase] = useState<Phase>('idle');
  const [take, setTake] = useState<Take | null>(null);
  const [saving, setSaving] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  const hold = useHoldToRecord({
    durationMs: CLIP_MS,
    onStart: async () => {
      feedback.light();
      await recorder.startRecording();
      setPhase('recording');
    },
    onRelease: async (_heldMs, _reachedFull) => {
      feedback.medium();
      const result = await recorder.stopRecording();
      if (!result) {
        setPhase('idle');
        return;
      }
      const url = URL.createObjectURL(result.blob);
      setTake({ blob: result.blob, durationMs: result.duration, previewUrl: url });
      setPhase('review');
    },
    onCancel: () => {
      recorder.cancelRecording();
      setPhase('idle');
    },
  });

  useEffect(() => {
    return () => {
      if (take?.previewUrl) URL.revokeObjectURL(take.previewUrl);
    };
  }, [take?.previewUrl]);

  useEffect(() => {
    if (phase === 'review' && previewVideoRef.current && take) {
      previewVideoRef.current.play().catch(() => {});
    }
  }, [phase, take]);

  const handleRetake = () => {
    if (take?.previewUrl) URL.revokeObjectURL(take.previewUrl);
    setTake(null);
    setPhase('idle');
  };

  const handleKeep = async () => {
    if (!take || saving) return;
    setSaving(true);
    try {
      await onSaved({ blob: take.blob, durationMs: take.durationMs });
      URL.revokeObjectURL(take.previewUrl);
    } finally {
      setSaving(false);
    }
  };

  const offset = CIRCUMFERENCE * (1 - hold.progress);

  return (
    <div className="dv-recorder">
      <button className="dv-recorder__close" onClick={onClose} aria-label="Close">
        <X size={22} />
      </button>

      <div className="dv-recorder__stage">
        {phase !== 'review' && (
          <video
            ref={recorder.videoPreviewRef}
            className="dv-recorder__preview"
            playsInline
            muted
            autoPlay
          />
        )}

        {phase === 'review' && take && (
          <video
            ref={previewVideoRef}
            className="dv-recorder__preview"
            src={take.previewUrl}
            playsInline
            loop
            controls={false}
          />
        )}

        {recorder.error && (
          <div className="dv-recorder__error">{recorder.error}</div>
        )}
      </div>

      <div className="dv-recorder__controls">
        <AnimatePresence mode="wait">
          {phase !== 'review' && (
            <motion.div
              key="capture"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="dv-recorder__capture"
            >
              <p className="dv-recorder__hint">
                {phase === 'recording' ? 'Recording…' : 'Hold to record 5 seconds'}
              </p>
              <button
                {...hold.bind}
                className={`dv-recorder__button${hold.isHolding ? ' is-holding' : ''}`}
                aria-label="Hold to record"
              >
                <svg className="dv-recorder__ring" width="140" height="140" viewBox="0 0 140 140">
                  <circle cx="70" cy="70" r={RING_RADIUS} className="dv-recorder__ring-track" />
                  <circle
                    cx="70"
                    cy="70"
                    r={RING_RADIUS}
                    className="dv-recorder__ring-progress"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={offset}
                  />
                </svg>
                <span className="dv-recorder__dot" />
              </button>
              <button
                type="button"
                className="dv-recorder__switch"
                onClick={() => recorder.switchCamera()}
              >
                <RotateCcw size={16} />
                <span>Flip</span>
              </button>
            </motion.div>
          )}

          {phase === 'review' && take && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="dv-recorder__review"
            >
              <button
                type="button"
                className="dv-recorder__retake"
                onClick={handleRetake}
                disabled={saving}
              >
                Retake
              </button>
              <button
                type="button"
                className="dv-recorder__keep"
                onClick={handleKeep}
                disabled={saving}
              >
                <Check size={18} />
                <span>{saving ? 'Saving…' : 'Keep'}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
