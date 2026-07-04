import React, { useEffect, useRef, useState } from 'react';
import { Droplets, Check } from 'lucide-react';
import { feedback } from '../../utils/feedback';

export const WATER_HOLD_MS = 1300;

interface WaterButtonProps {
  watered: boolean;
  planted: boolean;
  disabled?: boolean;
  reducedMotion: boolean;
  onPourStart: () => void;
  onPourEnd: () => void;
  onComplete: () => void;
}

/**
 * Press-and-hold watering. The hold is the ritual — a moment of intention
 * instead of a tap. Pointer capture keeps the hold alive through tiny finger
 * drifts (the aura hold-send lesson). The fill ring is pure CSS (no rAF —
 * AnimationEngine owns the only loop); completion is a single timeout.
 * Reduced motion falls back to an instant tap.
 */
export function WaterButton({
  watered,
  planted,
  disabled,
  reducedMotion,
  onPourStart,
  onPourEnd,
  onComplete,
}: WaterButtonProps) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const clearHold = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
    onPourEnd();
  };

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  const begin = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (watered || disabled || doneRef.current || reducedMotion) return;
    try {
      buttonRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — hold still works */
    }
    feedback.interact();
    onPourStart();
    setHolding(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      doneRef.current = true;
      clearHold();
      onComplete();
      window.setTimeout(() => {
        doneRef.current = false;
      }, 800);
    }, WATER_HOLD_MS);
  };

  const end = () => {
    if (doneRef.current || timerRef.current == null) return;
    feedback.tapSilent();
    clearHold();
  };

  const click = () => {
    if (!reducedMotion || watered || disabled || doneRef.current) return;
    doneRef.current = true;
    onComplete();
    window.setTimeout(() => {
      doneRef.current = false;
    }, 800);
  };

  const label = watered ? 'Watered today' : planted ? 'Hold to water' : 'Hold to plant your seed';
  const reducedLabel = planted ? 'Water the tree' : 'Plant your seed';

  return (
    <button
      ref={buttonRef}
      type="button"
      className={[
        'bonsai-water',
        watered ? 'bonsai-water--done' : '',
        holding ? 'bonsai-water--holding' : '',
      ].join(' ')}
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      onClick={click}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={reducedMotion && !watered ? 'Water the tree' : label}
    >
      <span className="bonsai-water__fill" aria-hidden="true" />
      <span className="bonsai-water__face">
        {watered ? <Check size={20} strokeWidth={2.5} /> : <Droplets size={20} strokeWidth={2.2} />}
        <span>{reducedMotion && !watered ? reducedLabel : label}</span>
      </span>
    </button>
  );
}
