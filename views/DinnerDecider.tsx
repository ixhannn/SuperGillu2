import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Utensils, RotateCw, Shuffle } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { ViewState, DinnerOption } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService, syncEventTarget } from '../services/sync';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';
import { listRemoveExit } from '../utils/motion';

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] } }
};

// "Soft Clay": the whole screen is ONE moulded slab of the theme colour
// (--clay = --color-surface). Slices aren't a separate material — they're the
// same clay with an alternating tonal emboss + a *muted* per-slice accent rim
// tint (14%). Accent is rationed; only the winning wedge goes saturated.
const SLICE_TINTS = [
  'rgba(var(--theme-particle-1-rgb),1)',
  'rgba(var(--theme-particle-2-rgb),1)',
  'rgba(var(--theme-particle-4-rgb),1)',
  'rgba(var(--theme-particle-1-rgb),1)',
  'rgba(var(--theme-particle-2-rgb),1)',
  'rgba(var(--theme-particle-4-rgb),1)',
];
const accentTint = (i: number) =>
  `color-mix(in srgb, ${SLICE_TINTS[i % SLICE_TINTS.length]} 82%, var(--color-text-primary) 18%)`;
// Clay slice fill: alternating ±10% tonal emboss carrying a strong 48% accent so
// the segmented face reads richly colourful (warm, deep — not candy), while dark
// labels stay well above AA (dark text on a mid-rose enamel ≈ 8:1).
const sliceFill = (i: number) => {
  const tonal = i % 2 === 0
    ? 'color-mix(in srgb, var(--clay) 90%, white 10%)'
    : 'color-mix(in srgb, var(--clay) 90%, black 10%)';
  return `color-mix(in srgb, ${tonal} 52%, ${accentTint(i)} 48%)`;
};
// The winning wedge — the deepest, most saturated field on the screen.
const WINNER_FILL = 'color-mix(in srgb, var(--clay) 32%, rgb(var(--theme-particle-1-rgb)) 68%)';

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
  // Warm-init from the synchronous cache (returns DEFAULT_DINNER_OPTIONS for a
  // brand-new couple) so the spin wheel paints its full segments on the first
  // frame instead of rendering an empty wheel that snaps to full one commit later.
  const [options, setOptions] = useState<DinnerOption[]>(() => StorageService.getDinnerOptions());
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
    // Keep an on-screen result if the winning dish still exists in the live
    // menu; a partner adding/removing an UNRELATED dish should not wipe your
    // reveal mid-celebration. Only re-sync when the winner is actually gone.
    if (winnerId !== null && options.some(o => o.id === winnerId)) return;
    setActiveSpinOptions(null);
    setWinner(null);
    setWinnerId(null);
  }, [options]);

  useEffect(() => {
    const load = () => setOptions(StorageService.getDinnerOptions());
    load();

    // Only reload on events that actually touch the dinner options (or a bulk
    // init). Without this filter, ANY cross-table event (partner awake/asleep,
    // a memory/profile sync, a theme write) re-ran load(); for default-options
    // users getDinnerOptions() returns a fresh array each call, so the new
    // `options` reference re-fired the winner-invalidation effect and wiped the
    // spin result with no user action.
    const handleUpdate = (e: Event) => {
      const table = (e as CustomEvent).detail?.table;
      if (!table || table === 'dinner_options' || table === 'init') load();
    };
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
  // (fills → deepening → labels) without recomputing trig.
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
      labelX, labelY,
      textRotation: midAngle * 360 + 90,
      isWinning: winner !== null && opt.id === winnerId,
    };
  });

  const stageClass = `dd-stage${isSpinning ? ' is-spinning' : ''}${winner ? ' has-winner' : ''}`;

  return (
    <div className="dd-screen relative min-h-screen px-6 pt-8 pb-32">
      {/* Opaque tabletop — replaces the app's translucent ambient backdrop so
          the dial rests on a real surface (skeuomorphism needs a ground). */}
      <div className="dd-surface" aria-hidden="true" />

      <ViewHeader
        title="Dinner Decider"
        subtitle="Give it a spin to settle tonight"
        onBack={() => setView('home')}
        variant="simple"
      />

      <div className="dd-skeu relative z-10 mx-auto w-full max-w-[22rem] flex flex-col items-center pt-2">

        {/* ── The Lazy-Susan ───────────────────────────────────────────── */}
        <div className={stageClass}>
          {/* Clay teardrop pointer moulded at the crater lip */}
          <div className="dd-pointer" aria-hidden="true">
            <div className={`dd-ticker${winner ? ' dd-ticked' : ''}`}>
              <svg viewBox="0 0 40 50" className="w-full h-full">
                {/* raised clay peg: domed body + accent tip, pointing into the wheel */}
                <path d="M20 48 Q4 26 20 4 Q36 26 20 48 Z" style={{ fill: 'var(--obj-hi)' }} />
                <path d="M20 48 Q9 30 20 16 Q31 30 20 48 Z" style={{ fill: 'color-mix(in srgb, var(--clay) 22%, rgb(var(--theme-particle-1-rgb)) 78%)' }} />
                <ellipse cx="17" cy="16" rx="4.5" ry="3" style={{ fill: 'rgba(255,255,255,0.5)' }} />
              </svg>
            </div>
          </div>

          {/* Wheel crater + rotating clay disc */}
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

                {/* Clay slices — alternating tonal emboss + engraved groove */}
                {wedges.map(w => (
                  <g key={`fill-${w.opt.id}`}>
                    <path
                      d={w.pathData}
                      fill={w.isWinning ? WINNER_FILL : sliceFill(w.i)}
                      stroke="color-mix(in srgb, var(--clay) 62%, black 38%)"
                      strokeWidth="0.013"
                      style={{
                        paintOrder: 'stroke',
                        opacity: winner && !w.isWinning ? 0.45 : 1,
                        transition: 'opacity 0.5s ease, fill 0.4s ease',
                      }}
                    />
                    {w.isWinning && (
                      <path d={w.pathData} fill="url(#dd-bloom)" className="dd-bloom" style={{ pointerEvents: 'none' }} />
                    )}
                  </g>
                ))}

                {/* subtle dome deepening toward the rim */}
                <circle cx="0" cy="0" r="1" fill="url(#dd-deepen)" style={{ pointerEvents: 'none' }} />

                {/* labels — dark text-primary (AA by construction); winner is label-free */}
                {wedges.map(w => (winner && w.isWinning) ? null : (
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
                      opacity: winner ? 0.5 : 1,
                      transition: 'opacity 0.5s ease',
                      pointerEvents: 'none',
                    }}
                  >
                    {w.opt.text.length > 13 ? `${w.opt.text.slice(0, 13)}…` : w.opt.text}
                  </text>
                ))}
              </svg>
            </div>
          </div>

          {/* Centre clay hub (tap to spin) */}
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
              <AnimatePresence mode="popLayout" initial={false}>
                {options.map((opt, i) => (
                  <motion.div key={opt.id} layout variants={staggerItem} exit={listRemoveExit} className="dd-chip">
                    <span className="dd-chip-dot" style={{ background: `color-mix(in srgb, var(--clay) 30%, ${accentTint(i)} 70%)` }} />
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
              </AnimatePresence>
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
