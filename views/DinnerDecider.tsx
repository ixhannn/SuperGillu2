import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Utensils, RotateCw, Shuffle } from 'lucide-react';
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

// Slice enamel is the ONLY saturated colour and is fully theme-token driven, so
// the dish re-stains with every accent (rose, teal, ocean, starry-night, …).
// Every structural material (walnut, brass, chrome, glass) is a fixed neutral
// colour defined in dinner-decider.css — deriving "brass" from a theme token
// would turn the metal cyan/indigo on most themes.
// The two palest tokens (particle-3 / particle-5) are intentionally avoided —
// white labels can't read on near-white enamel. The cycle stays in the
// saturated 1/2/4 tokens, varied by opacity, for legibility + colour rhythm.
const SLICE_TINTS = [
  'rgba(var(--theme-particle-1-rgb),0.96)',
  'rgba(var(--theme-particle-2-rgb),0.86)',
  'rgba(var(--theme-particle-4-rgb),0.90)',
  'rgba(var(--theme-particle-1-rgb),0.78)',
  'rgba(var(--theme-particle-2-rgb),0.96)',
  'rgba(var(--theme-particle-4-rgb),0.80)',
];
// Deepen each tint toward fired vitreous enamel ("deep, not candy"). Combined
// with the strong dark label outline below, this keeps every slice's white
// label legible on all 9 themes without muddying the warm colour.
const tintFor = (i: number) =>
  `color-mix(in srgb, ${SLICE_TINTS[i % SLICE_TINTS.length]} 82%, var(--color-text-primary) 18%)`;

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

  // Pre-compute wedge geometry once so we can paint the disc in ordered layers
  // (fills → enamel deepening → labels → pegs) without recomputing trig.
  const wedges = displayedOptions.map((opt, i) => {
    const startAngle = i / displayedOptions.length;
    const endAngle = (i + 1) / displayedOptions.length;
    const [startX, startY] = getCoordinatesForPercent(startAngle);
    const [endX, endY] = getCoordinatesForPercent(endAngle);
    const pathData = displayedOptions.length === 1
      ? `M 0 0 L 1 0 A 1 1 0 1 1 1 -0.0001 Z`
      : `M 0 0 L ${startX} ${startY} A 1 1 0 0 1 ${endX} ${endY} Z`;
    const midAngle = (startAngle + endAngle) / 2;
    const [labelX, labelY] = getCoordinatesForPercent(midAngle);
    return {
      opt, i, pathData,
      pegX: startX, pegY: startY,
      labelX, labelY,
      textRotation: midAngle * 360 + 90,
      isWinning: winner !== null && opt.id === winnerId,
    };
  });
  const showPegs = displayedOptions.length <= 12;

  const stageClass = `dd-stage${isSpinning ? ' is-spinning' : ''}${winner ? ' has-winner' : ''}`;

  return (
    <div className="min-h-screen px-6 pt-8 pb-32">
      <ViewHeader
        title="Dinner Decider"
        subtitle="Give it a spin to settle tonight"
        onBack={() => setView('home')}
        variant="simple"
      />

      <div className="dd-skeu mx-auto w-full max-w-[22rem] flex flex-col items-center pt-2">

        {/* ── The Lazy-Susan ───────────────────────────────────────────── */}
        <div className={stageClass}>
          <div className="dd-shadow" aria-hidden="true" />
          <div className="dd-glow" aria-hidden="true" />

          {/* Leather-and-brass ticker at 12 o'clock */}
          <div className="dd-pointer" aria-hidden="true">
            <div className={`dd-ticker${winner ? ' dd-ticked' : ''}`}>
              <svg viewBox="0 0 44 58" className="w-full h-full">
                <defs>
                  <linearGradient id="dd-brass-v" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#f6e3a8" />
                    <stop offset="0.5" stopColor="#d9b24a" />
                    <stop offset="1" stopColor="#9c7a23" />
                  </linearGradient>
                  <linearGradient id="dd-leather" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#6e4a38" />
                    <stop offset="1" stopColor="#492e23" />
                  </linearGradient>
                </defs>
                {/* stitched-leather hinge tongue */}
                <rect x="13" y="2" width="18" height="17" rx="4.5" fill="url(#dd-leather)" />
                <line x1="16.5" y1="6.5" x2="27.5" y2="6.5" stroke="rgba(255,221,184,0.42)" strokeWidth="0.9" strokeDasharray="1.6 1.6" strokeLinecap="round" />
                <line x1="16.5" y1="14.5" x2="27.5" y2="14.5" stroke="rgba(255,221,184,0.42)" strokeWidth="0.9" strokeDasharray="1.6 1.6" strokeLinecap="round" />
                {/* brass pawl */}
                <path d="M22 54 L13.5 24 Q12.4 17.5 22 16.5 Q31.6 17.5 30.5 24 Z" fill="url(#dd-brass-v)" stroke="rgba(78,52,10,0.6)" strokeWidth="0.8" strokeLinejoin="round" />
                <ellipse cx="20.5" cy="23" rx="4.6" ry="2.8" fill="rgba(255,255,255,0.55)" />
              </svg>
            </div>
          </div>

          {/* Walnut rim + rotating enamel disc */}
          <div className="dd-bezel">
            <div
              className="dd-wheel"
              style={{ transform: `rotate(${rotation}deg) translateZ(0)` }}
            >
              <svg viewBox="-1 -1 2 2" className="w-full h-full transform -rotate-90">
                <defs>
                  <radialGradient id="dd-deepen" cx="50%" cy="50%" r="50%">
                    <stop offset="60%" stopColor="#000" stopOpacity="0" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0.20" />
                  </radialGradient>
                  <radialGradient id="dd-bloom" cx="38%" cy="34%" r="68%">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
                    <stop offset="55%" stopColor="#fff" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Layer 4a/4d — fired enamel slices + cloisonné dividers */}
                {wedges.map(w => (
                  <g key={`fill-${w.opt.id}`}>
                    <path
                      d={w.pathData}
                      fill={tintFor(w.i)}
                      stroke="rgba(38,22,14,0.45)"
                      strokeWidth="0.014"
                      style={{
                        paintOrder: 'stroke',
                        opacity: winner && !w.isWinning ? 0.45 : 1,
                        transition: 'opacity 0.5s ease',
                      }}
                    />
                    {w.isWinning && (
                      <path d={w.pathData} fill="url(#dd-bloom)" className="dd-bloom" style={{ pointerEvents: 'none' }} />
                    )}
                  </g>
                ))}

                {/* Layer 4c — per-disc fired-enamel deepening toward the rim */}
                <circle cx="0" cy="0" r="1" fill="url(#dd-deepen)" style={{ pointerEvents: 'none' }} />

                {/* Layer 4e — labels (white + dark stroke = legible on every theme) */}
                {wedges.map(w => (
                  <text
                    key={`label-${w.opt.id}`}
                    x={w.labelX * 0.62}
                    y={w.labelY * 0.62}
                    fontSize={displayedOptions.length > 7 ? '0.10' : '0.115'}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${w.textRotation}, ${w.labelX * 0.62}, ${w.labelY * 0.62})`}
                    className="dd-slice-label"
                    style={{
                      opacity: winner && !w.isWinning ? 0.5 : 1,
                      transition: 'opacity 0.5s ease',
                      pointerEvents: 'none',
                    }}
                  >
                    {w.opt.text.length > 13 ? `${w.opt.text.slice(0, 13)}…` : w.opt.text}
                  </text>
                ))}

                {/* Brass ratchet pegs at each slice boundary */}
                {showPegs && wedges.map(w => (
                  <g key={`peg-${w.opt.id}`} style={{ pointerEvents: 'none' }}>
                    <circle cx={w.pegX * 0.93} cy={w.pegY * 0.93} r="0.026" fill="#c79a3e" stroke="rgba(60,40,8,0.55)" strokeWidth="0.006" />
                    <circle cx={w.pegX * 0.93 - 0.008} cy={w.pegY * 0.93 - 0.008} r="0.008" fill="rgba(255,250,230,0.85)" />
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* Layer 5 — fixed domed-glass crystal */}
          <div className="dd-gloss" aria-hidden="true" />

          {/* Layer 6 — turned-brass centre knob (tap to spin) */}
          <button
            type="button"
            className="dd-hub"
            onClick={startSpin}
            disabled={!canSpin || isSpinning}
            aria-label={isSpinning ? 'Spinning' : 'Spin the wheel'}
          >
            <Utensils size={25} strokeWidth={2.1} />
          </button>
        </div>

        {/* ── Winner reveal ────────────────────────────────────────────── */}
        <div className="w-full mt-7">
          <AnimatePresence mode="wait">
            {winner ? (
              <motion.div
                key="winner"
                className="dd-winner"
                aria-live="polite"
                initial={{ opacity: 0, scale: 0.82, y: 8 }}
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
                <span className="dd-winner-eyebrow">Tonight you&apos;re having</span>
                <p className="dd-winner-name font-display">{winner}</p>
              </motion.div>
            ) : (
              <motion.p
                key="hint"
                className="dd-hint text-center text-sm font-medium"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {canSpin
                  ? 'Tap the knob — or the button below.'
                  : 'Add at least 2 dishes to start.'}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={startSpin}
          disabled={!canSpin || isSpinning}
          className="dd-spin-btn mt-5 mb-9 w-full"
        >
          {winner && !isSpinning
            ? <Shuffle size={19} strokeWidth={2.4} />
            : <RotateCw size={19} strokeWidth={2.4} className={isSpinning ? 'animate-spin' : ''} />}
          {isSpinning ? 'Spinning…' : winner ? 'Spin again' : 'Spin the Wheel'}
        </button>

        {/* ── Menu editor ──────────────────────────────────────────────── */}
        <div className="w-full space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Add a dish…"
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
                <motion.div key={opt.id} layout variants={staggerItem} className="dd-chip">
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
            <div className="dd-empty animate-fade-in">
              <div className="dd-empty-icon">
                <Utensils size={26} strokeWidth={2.1} style={{ animation: 'wiggle-spring 2.4s ease-in-out infinite' }} />
              </div>
              <p className="dd-empty-title">Add some dishes to spin</p>
              <p className="dd-empty-sub">You need at least 2 to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
