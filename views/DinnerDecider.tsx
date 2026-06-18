import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Utensils, RotateCw, Sparkles, Shuffle } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { ViewState, DinnerOption } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService, syncEventTarget } from '../services/sync';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } }
};

// Wheel slice tints are pulled from the active theme's particle palette, so the
// dial re-skins with every accent (rose, teal, ocean, starry-night, …) instead
// of being locked to the old hardcoded pinks.
const SLICE_TINTS = [
  'rgba(var(--theme-particle-1-rgb),0.95)',
  'rgba(var(--theme-particle-3-rgb),0.82)',
  'rgba(var(--theme-particle-2-rgb),0.90)',
  'rgba(var(--theme-particle-4-rgb),0.85)',
  'rgba(var(--theme-particle-1-rgb),0.70)',
  'rgba(var(--theme-particle-5-rgb),0.92)',
];
const tintFor = (i: number) => SLICE_TINTS[i % SLICE_TINTS.length];

// Deterministic spark layout for the winner reveal (no per-frame layout cost).
const SPARKS = [
  { x: -78, y: -34 }, { x: 70, y: -42 }, { x: -54, y: 30 }, { x: 64, y: 26 },
  { x: -96, y: 6 }, { x: 92, y: -8 }, { x: -20, y: -52 }, { x: 24, y: 44 },
];

interface DinnerDeciderProps {
  setView: (view: ViewState) => void;
}

interface SpinSignalPayload {
  spinId: string;
  finalRotation: number;
  winnerId: string;
  winnerText: string;
  optionsSnapshot: DinnerOption[];
}

export const DinnerDecider: React.FC<DinnerDeciderProps> = ({ setView }) => {
  const SPIN_DURATION_MS = 3000;
  const [options, setOptions] = useState<DinnerOption[]>([]);
  const [newOption, setNewOption] = useState('');
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [activeSpinOptions, setActiveSpinOptions] = useState<DinnerOption[] | null>(null);
  const spinTimeoutRef = useRef<number | null>(null);
  const isSpinningRef = useRef(false);
  const lastSpinIdRef = useRef('');
  const queuedSpinRef = useRef<SpinSignalPayload | null>(null);

  const isDinnerOption = (value: unknown): value is DinnerOption => {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<DinnerOption>;
    return typeof candidate.id === 'string' && typeof candidate.text === 'string';
  };

  const isSpinSignalPayload = (payload: unknown): payload is SpinSignalPayload => {
    if (!payload || typeof payload !== 'object') return false;

    const candidate = payload as Partial<SpinSignalPayload>;
    const optionsSnapshot = candidate.optionsSnapshot;
    return (
      typeof candidate.spinId === 'string' &&
      typeof candidate.finalRotation === 'number' &&
      Number.isFinite(candidate.finalRotation) &&
      typeof candidate.winnerId === 'string' &&
      typeof candidate.winnerText === 'string' &&
      Array.isArray(optionsSnapshot) &&
      optionsSnapshot.length > 0 &&
      optionsSnapshot.every(isDinnerOption) &&
      optionsSnapshot.some(option => option.id === candidate.winnerId && option.text === candidate.winnerText)
    );
  };

  useEffect(() => {
    isSpinningRef.current = isSpinning;
  }, [isSpinning]);

  // Editing the menu (add/delete, or a partner's edit) invalidates the frozen
  // wheel snapshot and the last result — re-sync the dial to the live options
  // so it never displays a stale set. Skipped mid-spin to avoid reshuffling.
  useEffect(() => {
    if (isSpinningRef.current) return;
    setActiveSpinOptions(null);
    setWinner(null);
    setWinnerId(null);
  }, [options]);

  useEffect(() => {
    const load = () => setOptions(StorageService.getDinnerOptions());
    load();

    const handleUpdate = () => load();
    storageEventTarget.addEventListener('storage-update', handleUpdate);

    // Listen for Sync signals (e.g., Partner spun the wheel)
    const handleSignal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || typeof detail !== 'object') return;

      const candidate = detail as { signalType?: unknown; payload?: unknown };
      if (candidate.signalType !== 'SPIN' || !isSpinSignalPayload(candidate.payload)) return;
      if (candidate.payload.spinId === lastSpinIdRef.current) return;

      if (isSpinningRef.current) {
        queuedSpinRef.current = candidate.payload;
        return;
      }

      performSpin(candidate.payload);
    };
    syncEventTarget.addEventListener('signal-received', handleSignal);

    return () => {
      if (spinTimeoutRef.current !== null) {
        window.clearTimeout(spinTimeoutRef.current);
      }
      storageEventTarget.removeEventListener('storage-update', handleUpdate);
      syncEventTarget.removeEventListener('signal-received', handleSignal);
    };
  }, []);

  const handleAdd = () => {
    if (!newOption.trim()) return;
    const item: DinnerOption = {
      id: generateId(),
      text: newOption.trim()
    };
    StorageService.saveDinnerOption(item);
    feedback.tap();
    setNewOption('');
  };

  const handleDelete = (id: string) => {
    feedback.tap();
    StorageService.deleteDinnerOption(id);
  };

  const startSpin = () => {
    if (isSpinning || options.length < 2) return;
    feedback.interact();

    const optionsSnapshot = options.map(option => ({ ...option }));
    const segmentSize = 360 / optionsSnapshot.length;
    const winningIndex = Math.floor(Math.random() * optionsSnapshot.length);
    const winningOption = optionsSnapshot[winningIndex];
    const currentRotation = ((rotation % 360) + 360) % 360;
    const targetRotation = (360 - (winningIndex * segmentSize + segmentSize / 2)) % 360;
    const deltaRotation = (targetRotation - currentRotation + 360) % 360;
    const finalRotation = rotation + 360 * 5 + deltaRotation;
    const payload: SpinSignalPayload = {
      spinId: generateId(),
      finalRotation,
      winnerId: winningOption.id,
      winnerText: winningOption.text,
      optionsSnapshot,
    };

    lastSpinIdRef.current = payload.spinId;

    // Send signal to partner
    SyncService.sendSignal('SPIN', payload);

    // Perform local spin
    performSpin(payload);
  };

  const performSpin = ({ spinId, finalRotation, winnerId: spinWinnerId, winnerText, optionsSnapshot }: SpinSignalPayload) => {
    const winningOption = optionsSnapshot.find(option => option.id === spinWinnerId);

    lastSpinIdRef.current = spinId;
    setIsSpinning(true);
    setWinner(null);
    setWinnerId(null);
    setActiveSpinOptions(optionsSnapshot);
    setRotation(finalRotation);

    if (spinTimeoutRef.current !== null) {
      window.clearTimeout(spinTimeoutRef.current);
    }

    spinTimeoutRef.current = window.setTimeout(() => {
      setIsSpinning(false);
      setWinner(winningOption?.text ?? winnerText);
      setWinnerId(spinWinnerId);
      feedback.celebrate();
      spinTimeoutRef.current = null;

      const queuedSpin = queuedSpinRef.current;
      queuedSpinRef.current = null;

      if (queuedSpin && queuedSpin.spinId !== spinId) {
        performSpin(queuedSpin);
        return;
      }
    }, SPIN_DURATION_MS);
  };

  const displayedOptions = activeSpinOptions ?? options;
  const canSpin = options.length >= 2;

  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  const stageClass = `dd-stage${isSpinning ? ' is-spinning' : ''}${winner ? ' has-winner' : ''}`;

  return (
    <div className="min-h-screen px-6 pt-8 pb-32">
      <ViewHeader
        title="Dinner Decider"
        subtitle="Let the wheel settle it tonight"
        onBack={() => setView('home')}
        variant="simple"
      />

      <div className="flex flex-col items-center pt-2">

        {/* ── The Wheel ────────────────────────────────────────────────── */}
        <div className={stageClass}>
          <div className="dd-glow" aria-hidden="true" />

          {/* Pointer */}
          <div className="dd-pointer" aria-hidden="true">
            <svg viewBox="0 0 40 48" className="w-full h-full">
              <defs>
                <linearGradient id="dd-pointer-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: 'var(--color-lior-400)' }} />
                  <stop offset="1" style={{ stopColor: 'var(--color-lior-600)' }} />
                </linearGradient>
              </defs>
              <path
                d="M20 46 L5 15 Q3 6 11 4 L29 4 Q37 6 35 15 Z"
                fill="url(#dd-pointer-grad)"
                stroke="rgba(255,255,255,0.7)"
                strokeWidth="1.4"
              />
              <ellipse cx="20" cy="13" rx="7" ry="4" fill="rgba(255,255,255,0.35)" />
            </svg>
          </div>

          {/* Bezel + rotating disc */}
          <div className="dd-bezel">
            <div
              className="dd-wheel"
              style={{ transform: `rotate(${rotation}deg) translateZ(0)` }}
            >
              <svg viewBox="-1 -1 2 2" className="w-full h-full transform -rotate-90">
                {displayedOptions.map((opt, i) => {
                  const startAngle = i / displayedOptions.length;
                  const endAngle = (i + 1) / displayedOptions.length;
                  const [startX, startY] = getCoordinatesForPercent(startAngle);
                  const [endX, endY] = getCoordinatesForPercent(endAngle);

                  const pathData = displayedOptions.length === 1
                    ? `M 0 0 L 1 0 A 1 1 0 1 1 1 -0.0001 Z`
                    : `M 0 0 L ${startX} ${startY} A 1 1 0 0 1 ${endX} ${endY} Z`;

                  const midAngle = (startAngle + endAngle) / 2;
                  const [labelX, labelY] = getCoordinatesForPercent(midAngle);
                  const textRotation = midAngle * 360 + 90;
                  const isWinning = winner !== null && opt.id === winnerId;

                  return (
                    <g key={opt.id}>
                      <path
                        d={pathData}
                        fill={tintFor(i)}
                        stroke="rgba(255,255,255,0.85)"
                        strokeWidth="0.014"
                        style={{
                          opacity: winner && !isWinning ? 0.45 : 1,
                          transition: 'opacity 0.5s ease',
                        }}
                      />
                      <text
                        x={labelX * 0.62}
                        y={labelY * 0.62}
                        fontSize={displayedOptions.length > 7 ? '0.10' : '0.115'}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${textRotation}, ${labelX * 0.62}, ${labelY * 0.62})`}
                        className="dd-slice-label"
                        style={{
                          opacity: winner && !isWinning ? 0.5 : 1,
                          transition: 'opacity 0.5s ease',
                          pointerEvents: 'none',
                        }}
                      >
                        {opt.text.length > 13 ? `${opt.text.slice(0, 13)}…` : opt.text}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Fixed gloss highlight */}
          <div className="dd-gloss" aria-hidden="true" />

          {/* Centre hub — tap to spin */}
          <button
            type="button"
            className="dd-hub"
            onClick={startSpin}
            disabled={!canSpin || isSpinning}
            aria-label={isSpinning ? 'Spinning' : 'Spin the wheel'}
          >
            <Utensils size={26} strokeWidth={2.2} className={isSpinning ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── Winner reveal ────────────────────────────────────────────── */}
        <div className="w-full max-w-xs mt-8">
          <AnimatePresence mode="wait">
            {winner ? (
              <motion.div
                key="winner"
                className="dd-winner"
                initial={{ opacity: 0, scale: 0.8, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -8 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              >
                {SPARKS.map((s, idx) => (
                  <span
                    key={idx}
                    className="dd-spark"
                    style={{ '--sx': `${s.x}px`, '--sy': `${s.y}px`, animationDelay: `${idx * 35}ms` } as React.CSSProperties}
                  />
                ))}
                <span className="dd-winner-eyebrow">
                  <Sparkles size={12} strokeWidth={2.5} />
                  Tonight you&apos;re having
                </span>
                <p className="dd-winner-name font-display">{winner}</p>
              </motion.div>
            ) : (
              <motion.p
                key="hint"
                className="text-center text-sm font-medium"
                style={{ color: 'var(--color-text-secondary)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {canSpin
                  ? 'Tap the wheel — or the button below.'
                  : 'Add at least 2 options to start.'}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={startSpin}
          disabled={!canSpin || isSpinning}
          className="dd-spin-btn spring-press mt-5 mb-9"
        >
          {winner && !isSpinning
            ? <Shuffle size={19} strokeWidth={2.4} />
            : <RotateCw size={19} strokeWidth={2.4} className={isSpinning ? 'animate-spin' : ''} />}
          {isSpinning ? 'Spinning…' : winner ? 'Spin again' : 'Spin the Wheel'}
        </button>

        {/* ── Options editor ───────────────────────────────────────────── */}
        <div className="w-full max-w-xs space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Add a food option…"
              maxLength={40}
              className="dd-input"
            />
            <button
              onClick={handleAdd}
              disabled={!newOption.trim()}
              className="dd-add-btn"
              aria-label="Add option"
            >
              <Plus size={22} strokeWidth={2.6} />
            </button>
          </div>

          {options.length > 0 ? (
            <motion.div
              className="flex flex-wrap gap-2 justify-center"
              variants={staggerContainer}
              initial="hidden"
              animate="show"
            >
              {options.map((opt, i) => (
                <motion.div key={opt.id} layout variants={staggerItem} className="dd-chip spring-press">
                  <span className="dd-chip-dot" style={{ background: tintFor(i) }} />
                  <span className="dd-chip-text">{opt.text}</span>
                  <button
                    onClick={() => handleDelete(opt.id)}
                    aria-label={`Delete ${opt.text}`}
                    className="dd-chip-del"
                  >
                    <X size={15} strokeWidth={2.6} />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="flex flex-col items-center text-center py-8 animate-fade-in glass-card rounded-[2rem] shadow-sm" style={{ border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-full blur-xl" style={{ background: 'rgba(var(--theme-particle-1-rgb),0.22)' }} />
                <div className="relative p-4 rounded-full shadow-inner" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.10)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.18)' }}>
                  <Utensils size={28} style={{ animation: 'wiggle-spring 2s ease-in-out infinite', color: 'var(--color-lior-500)' }} />
                </div>
              </div>
              <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>Add some options to spin</p>
              <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>You need at least 2 to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
