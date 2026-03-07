import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Trash2, Utensils, RotateCw } from 'lucide-react';
import { ViewState, DinnerOption } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { SyncService, syncEventTarget } from '../services/sync';

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
      id: Date.now().toString(),
      text: newOption.trim()
    };
    StorageService.saveDinnerOption(item);
    setNewOption('');
  };

  const handleDelete = (id: string) => {
    StorageService.deleteDinnerOption(id);
  };

  const startSpin = () => {
    if (isSpinning || options.length < 2) return;

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
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
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
    <div className="flex flex-col h-full bg-white min-h-screen">
      <div className="p-4 flex items-center gap-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <button onClick={() => setView('home')} className="p-2 -ml-2 text-gray-600 rounded-full hover:bg-gray-50">
          <ArrowLeft size={24} />
        </button>
        <span className="font-semibold text-lg text-gray-800">Dinner Decider</span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 pb-32 flex flex-col items-center">

        {/* The Wheel */}
        <div className="relative w-72 h-72 mb-8 mt-4">
          {/* Pointer */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-4 z-20 text-gray-800">
            <div className="w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-t-[30px] border-t-tulika-600 filter drop-shadow-md"></div>
          </div>

          {/* Spinning SVG */}
          <div
            className="w-full h-full rounded-full shadow-2xl overflow-hidden border-4 border-white transition-transform duration-[3000ms] cubic-bezier(0.15, 0.2, 0.25, 1)"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <svg viewBox="-1 -1 2 2" className="w-full h-full transform -rotate-90">
              {options.map((opt, i) => {
                // Draw slice
                const startAngle = i / options.length;
                const endAngle = (i + 1) / options.length;
                const [startX, startY] = getCoordinatesForPercent(startAngle);
                const [endX, endY] = getCoordinatesForPercent(endAngle);
                const largeArcFlag = options.length === 1 ? 0 : 0; // Simplified for >1 items

                // Construct Path
                const pathData = options.length === 1
                  ? `M 0 0 L 1 0 A 1 1 0 1 1 1 -0.0001 Z` // Full circle
                  : `M 0 0 L ${startX} ${startY} A 1 1 0 0 1 ${endX} ${endY} Z`;

                return (
                  <path
                    key={opt.id}
                    d={pathData}
                    fill={COLORS[i % COLORS.length]}
                    stroke="white"
                    strokeWidth="0.02"
                  />
                );
              })}
            </svg>

            {/* Labels (Overlay absolute divs to avoid SVG text rotation complexity) */}
            {options.map((opt, i) => {
              const angle = (i * 360 / options.length) + (360 / options.length / 2);
              return (
                <div
                  key={opt.id}
                  className="absolute top-1/2 left-1/2 w-[50%] h-[20px] origin-left flex items-center pl-8"
                  style={{
                    transform: `translateY(-50%) rotate(${angle}deg)`,
                  }}
                >
                  <span className="text-white font-bold text-xs truncate w-24 drop-shadow-sm transform text-right block" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                    {opt.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Winner Display */}
        {winner && (
          <div className="mb-6 bg-tulika-500 text-white px-6 py-3 rounded-2xl shadow-lg shadow-tulika-200 animate-elastic-pop text-center">
            <p className="text-xs uppercase font-bold opacity-80 mb-1">We are eating</p>
            <p className="text-2xl font-serif font-bold">{winner}! 🍽️</p>
          </div>
        )}

        <button
          onClick={startSpin}
          disabled={isSpinning || options.length < 2}
          className="w-full max-w-xs bg-gray-900 text-white py-4 rounded-2xl font-bold shadow-xl spring-press transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-8"
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
              className="flex-1 bg-gray-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-tulika-200 outline-none"
            />
            <button
              onClick={handleAdd}
              className="bg-tulika-100 text-tulika-600 p-3 rounded-xl hover:bg-tulika-200"
            >
              <Plus size={24} />
            </button>
          </div>

          <div className="space-y-2">
            {options.map(opt => (
              <div key={opt.id} className="flex items-center justify-between bg-white border border-gray-100 p-3 rounded-xl animate-spring-in spring-hover">
                <span className="font-medium text-gray-700">{opt.text}</span>
                <button onClick={() => handleDelete(opt.id)} className="text-gray-300 hover:text-red-500">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {options.length === 0 && (
              <div className="text-center text-gray-400 py-4 text-sm">
                Add at least 2 options to spin!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
