import React from 'react';
import { motion } from 'framer-motion';
import { Delete } from 'lucide-react';
import { feedback } from '../utils/feedback';

interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  disabled?: boolean;
  /** Bump this counter to replay the error shake on the dots. */
  errorSignal?: number;
  keyStyle?: React.CSSProperties;
  dotStyle?: React.CSSProperties;
  filledDotStyle?: React.CSSProperties;
}

const KEYS: Array<string> = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

/**
 * Numeric PIN keypad with entry dots. Purely controlled — the parent
 * decides what happens when `value` reaches `length`.
 */
export const PinPad: React.FC<PinPadProps> = ({
  value,
  onChange,
  length = 4,
  disabled = false,
  errorSignal = 0,
  keyStyle,
  dotStyle,
  filledDotStyle,
}) => {
  const press = (key: string) => {
    if (disabled) return;
    if (key === 'back') {
      if (value.length === 0) return;
      feedback.light();
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    feedback.light();
    onChange(value + key);
  };

  return (
    <div className="flex w-full flex-col items-center">
      <motion.div
        key={errorSignal}
        animate={errorSignal > 0 ? { x: [0, -9, 9, -7, 7, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="mb-7 flex items-center justify-center gap-3.5"
        role="status"
        aria-label={`${value.length} of ${length} digits entered`}
      >
        {Array.from({ length }).map((_, index) => {
          const filled = index < value.length;
          return (
            <span
              key={index}
              className="h-3.5 w-3.5 rounded-full transition-all duration-150"
              style={filled
                ? { background: 'currentColor', transform: 'scale(1.12)', ...filledDotStyle }
                : { background: 'rgba(0,0,0,0.12)', ...dotStyle }}
            />
          );
        })}
      </motion.div>

      <div className="grid w-full max-w-[16.5rem] grid-cols-3 gap-2.5">
        {KEYS.map((key, index) => {
          if (key === '') return <span key={`spacer-${index}`} aria-hidden="true" />;
          const isBack = key === 'back';
          return (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              disabled={disabled || (isBack && value.length === 0)}
              aria-label={isBack ? 'Delete digit' : `Digit ${key}`}
              className="flex min-h-[3.6rem] items-center justify-center rounded-[1.3rem] text-[1.35rem] font-semibold transition-transform active:scale-95 disabled:opacity-35"
              style={keyStyle}
            >
              {isBack ? <Delete size={22} strokeWidth={1.9} /> : key}
            </button>
          );
        })}
      </div>
    </div>
  );
};
