import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Utensils, RotateCw } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { motion, type Variants } from 'framer-motion';
import { ViewState, DinnerOption } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService, syncEventTarget } from '../services/sync';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } }
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } }
};

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

  const performSpin = ({ spinId, finalRotation, winnerId, winnerText, optionsSnapshot }: SpinSignalPayload) => {
    const winningOption = optionsSnapshot.find(option => option.id === winnerId);

    lastSpinIdRef.current = spinId;
    setIsSpinning(true);
    setWinner(null);
    setActiveSpinOptions(optionsSnapshot);
    setRotation(finalRotation);

    if (spinTimeoutRef.current !== null) {
      window.clearTimeout(spinTimeoutRef.current);
    }

    spinTimeoutRef.current = window.setTimeout(() => {
      setIsSpinning(false);
      setWinner(winningOption?.text ?? winnerText);
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

  // Colors for wheel segments
  const COLORS = ['#f9a8d4', '#fbcfe8', '#fce7f3', '#ec4899', '#fda4af', '#fff1f2'];
  const displayedOptions = activeSpinOptions ?? options;

  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="min-h-screen px-6 pt-8 pb-32">
      <ViewHeader title="Dinner Decider" onBack={() => setView('home')} variant="simple" />

      <div className="flex flex-col items-center pt-4">

        {/* The Wheel */}
        <div className="relative w-full max-w-[18rem] aspect-square mb-8">
          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-4 z-20">
            <div className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[30px] border-t-lior-600 filter drop-shadow-md"></div>
          </div>

          {/* Spinning SVG */}
          <div
            className="w-full h-full rounded-full overflow-hidden border-4 shadow-xl transition-transform duration-[3000ms] ease-[cubic-bezier(0.15,0.2,0.25,1)] transform-gpu"
            style={{ transform: `rotate(${rotation}deg) translateZ(0)`, willChange: 'transform', borderColor: 'rgba(var(--theme-particle-2-rgb),0.20)' }}
          >
            <svg viewBox="-1 -1 2 2" className="w-full h-full transform -rotate-90">
              {displayedOptions.map((opt, i) => {
                // Draw slice
                const startAngle = i / displayedOptions.length;
                const endAngle = (i + 1) / displayedOptions.length;
                const [startX, startY] = getCoordinatesForPercent(startAngle);
                const [endX, endY] = getCoordinatesForPercent(endAngle);

                // Construct Path
                const pathData = displayedOptions.length === 1
                  ? `M 0 0 L 1 0 A 1 1 0 1 1 1 -0.0001 Z`
                  : `M 0 0 L ${startX} ${startY} A 1 1 0 0 1 ${endX} ${endY} Z`;

                // Calculate label position: midpoint of the arc, 60% out from center
                const midAngle = (startAngle + endAngle) / 2;
                const [labelX, labelY] = getCoordinatesForPercent(midAngle);
                const textRotation = midAngle * 360 + 90; // Rotate text to read along slice

                return (
                  <g key={opt.id}>
                    <path
                      d={pathData}
                      fill={COLORS[i % COLORS.length]}
                      stroke="white"
                      strokeWidth="0.02"
                    />
                    <text
                      x={labelX * 0.6}
                      y={labelY * 0.6}
                      fill="white"
                      fontSize="0.12"
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${textRotation}, ${labelX * 0.6}, ${labelY * 0.6})`}
                      style={{ textShadow: '0 0.005em 0.01em rgba(0,0,0,0.4)', pointerEvents: 'none' }}
                    >
                      {opt.text.length > 12 ? `${opt.text.slice(0, 12)}...` : opt.text}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Winner Display */}
        {winner && (
          <div className="mb-6 bg-lior-500 text-white px-6 py-4 rounded-2xl animate-elastic-pop text-center shadow-lg shadow-lior-500/30 ring-1 ring-lior-200">
            <p className="text-xs uppercase font-bold opacity-90 mb-1 tracking-wider">We are eating</p>
            <p className="text-2xl font-serif font-bold">{winner}</p>
          </div>
        )}

        <button
          onClick={startSpin}
          disabled={isSpinning || options.length < 2}
          className="w-full max-w-xs bg-lior-500 text-white py-4 rounded-2xl font-bold spring-press transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-8 shadow-xl shadow-lior-500/20 ring-1 ring-lior-200"
        >
          <RotateCw size={20} className={isSpinning ? 'animate-spin' : ''} />
          {isSpinning ? 'Spinning...' : 'Spin the Wheel'}
        </button>

        {/* List Editor */}
        <div className="w-full max-w-xs space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Add food option..."
              className="flex-1 shadow-inner rounded-xl px-4 py-3 focus:ring-2 focus:ring-lior-500/50 outline-none"
              style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)', color: 'var(--color-text-primary)' }}
            />
            <button
              onClick={handleAdd}
              className="text-lior-500 p-3 rounded-xl shadow-sm"
              style={{ background: 'rgba(var(--theme-particle-1-rgb),0.10)', border: '1px solid rgba(var(--theme-particle-1-rgb),0.20)' }}
            >
              <Plus size={24} />
            </button>
          </div>

          <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
            {options.map(opt => (
              <motion.div key={opt.id} variants={staggerItem} className="flex items-center justify-between glass-card shadow-sm p-3 rounded-xl spring-press" style={{ border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>
                <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{opt.text}</span>
                <button onClick={() => handleDelete(opt.id)} aria-label={`Delete ${opt.text}`} className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:rounded-lg focus-visible:ring-offset-1" style={{ color: 'var(--color-text-secondary)' }}>
                  <Trash2 size={18} />
                </button>
              </motion.div>
            ))}
            {options.length === 0 && (
              <div className="flex flex-col items-center text-center py-8 animate-fade-in glass-card rounded-[2rem] mt-4 shadow-sm" style={{ border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>
                <div className="relative mb-4">
                  <div className="absolute inset-0 bg-lior-100 rounded-full blur-xl" />
                  <div className="relative p-4 rounded-full shadow-inner" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)' }}>
                    <Utensils size={28} style={{ animation: 'wiggle-spring 2s ease-in-out infinite', color: 'var(--color-text-secondary)' }} />
                  </div>
                </div>
                <p className="text-sm font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>Add some options to spin</p>
                <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>You need at least 2 to get started</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};
