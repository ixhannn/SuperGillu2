import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Trash2, Utensils, RotateCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { ViewState, DinnerOption } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService, syncEventTarget } from '../services/sync';
import { generateId } from '../utils/ids';
import { feedback } from '../utils/feedback';

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } }
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }
};

interface DinnerDeciderProps {
  setView: (view: ViewState) => void;
}

export const DinnerDecider: React.FC<DinnerDeciderProps> = ({ setView }) => {
  const [options, setOptions] = useState<DinnerOption[]>([]);
  const [newOption, setNewOption] = useState('');
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setOptions(StorageService.getDinnerOptions());
    load();

    const handleUpdate = () => load();
    storageEventTarget.addEventListener('storage-update', handleUpdate);

    // Listen for Sync signals (e.g., Partner spun the wheel)
    const handleSignal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.signalType === 'SPIN') {
        performSpin(detail.payload.finalRotation);
      }
    };
    syncEventTarget.addEventListener('signal-received', handleSignal);

    return () => {
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

    // Calculate a new random rotation
    // Ensure at least 5 full spins (360 * 5) + random segment
    const segmentSize = 360 / options.length;
    const randomSegment = Math.floor(Math.random() * options.length);
    const extraRotation = 360 * 5 + (randomSegment * segmentSize);
    const finalRotation = rotation + extraRotation;

    // Send signal to partner
    SyncService.sendSignal('SPIN', { finalRotation });

    // Perform local spin
    performSpin(finalRotation);
  };

  const performSpin = (finalRot: number) => {
    setIsSpinning(true);
    setWinner(null);
    setRotation(finalRot);

    // Wait for animation to finish (3s matches CSS)
    setTimeout(() => {
      setIsSpinning(false);
      calculateWinner(finalRot);
    }, 3000);
  };

  const calculateWinner = (rot: number) => {
    // Determine which segment is at the top (Pointer is usually at top 0deg)
    // The wheel rotates clockwise, so the index is determined by (360 - (rot % 360))
    const normalizedRot = rot % 360;
    const segmentSize = 360 / options.length;
    // Offset for pointer position (if pointer is at top)
    // We need to account that 0 rotation puts item 0 at 3 o'clock in SVG usually, 
    // but let's assume standard math where we rotated the group.

    // Simple logic:
    // index = Math.floor(((360 - normalizedRot) % 360) / segmentSize)
    const index = Math.floor(((360 - normalizedRot) % 360) / segmentSize);

    if (options[index]) {
      setWinner(options[index].text);
      feedback.celebrate();
    }
  };

  // Colors for wheel segments
  const COLORS = ['#f43f5e', '#fb7185', '#fecdd3', '#e11d48', '#fda4af', '#fff1f2'];

  const getCoordinatesForPercent = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="flex flex-col h-full min-h-screen">
      <div className="p-4 flex items-center gap-4 border-b border-white/10 sticky top-0 z-10" style={{ background: 'rgba(15,10,20,0.8)', backdropFilter: 'blur(12px)' }}>
        <button onClick={() => setView('home')} aria-label="Go back" className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 rounded-full hover:bg-white/5 cursor-pointer focus-visible:ring-2 focus-visible:ring-tulika-500 focus-visible:ring-offset-2">
          <ArrowLeft size={24} />
        </button>
        <span className="font-semibold text-lg text-gray-100">Dinner Decider</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 pb-32 flex flex-col items-center">

        {/* The Wheel */}
        <div className="relative w-72 h-72 mb-8 mt-4">
          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-4 z-20 text-gray-100">
            <div className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[30px] border-t-tulika-600 filter drop-shadow-md"></div>
          </div>

          {/* Spinning SVG */}
          <div
            className="w-full h-full rounded-full overflow-hidden border-4 border-white/20 transition-transform duration-[3000ms] ease-[cubic-bezier(0.15,0.2,0.25,1)] transform-gpu"
            style={{ transform: `rotate(${rotation}deg) translateZ(0)`, willChange: 'transform' }}
          >
            <svg viewBox="-1 -1 2 2" className="w-full h-full transform -rotate-90">
              {options.map((opt, i) => {
                // Draw slice
                const startAngle = i / options.length;
                const endAngle = (i + 1) / options.length;
                const [startX, startY] = getCoordinatesForPercent(startAngle);
                const [endX, endY] = getCoordinatesForPercent(endAngle);

                // Construct Path
                const pathData = options.length === 1
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
                      {opt.text.length > 12 ? opt.text.slice(0, 12) + '…' : opt.text}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Winner Display */}
        {winner && (
          <div className="mb-6 bg-tulika-500 text-white px-6 py-3 rounded-2xl animate-elastic-pop text-center">
            <p className="text-xs uppercase font-bold opacity-80 mb-1">We are eating</p>
            <p className="text-2xl font-serif font-bold">{winner}! 🍽️</p>
          </div>
        )}

        <button
          onClick={startSpin}
          disabled={isSpinning || options.length < 2}
          className="w-full max-w-xs bg-white/10 border border-white/12 text-white py-4 rounded-2xl font-bold spring-press transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-8"
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
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-gray-200 placeholder-gray-500 focus:ring-2 focus:ring-tulika-200 outline-none"
            />
            <button
              onClick={handleAdd}
              className="bg-tulika-500/15 text-tulika-400 p-3 rounded-xl border border-white/10"
            >
              <Plus size={24} />
            </button>
          </div>

          <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
            {options.map(opt => (
              <motion.div key={opt.id} variants={staggerItem} className="flex items-center justify-between bg-white/6 border border-white/8 p-3 rounded-xl spring-press">
                <span className="font-medium text-gray-200">{opt.text}</span>
                <button onClick={() => handleDelete(opt.id)} aria-label={`Delete ${opt.text}`} className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:rounded-lg focus-visible:ring-offset-1">
                  <Trash2 size={18} />
                </button>
              </motion.div>
            ))}
            {options.length === 0 && (
              <div className="flex flex-col items-center text-center py-8 animate-fade-in">
                <div className="relative mb-4">
                  <div className="absolute inset-0 bg-tulika-500/10 rounded-full blur-xl" />
                  <div className="relative p-4 bg-white/5 rounded-full border border-white/10">
                    <Utensils size={28} className="text-gray-500" style={{ animation: 'wiggle-spring 2s ease-in-out infinite' }} />
                  </div>
                </div>
                <p className="text-sm font-medium text-gray-400 mb-1">Add some options to spin the wheel</p>
                <p className="text-xs text-gray-500">You need at least 2 to get started</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};
