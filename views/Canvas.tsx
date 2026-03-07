import React, { useRef, useState, useEffect } from 'react';
import { ArrowLeft, Trash2, Palette, Eraser, Download } from 'lucide-react';
import { ViewState } from '../types';
import { SyncService, syncEventTarget } from '../services/sync';

interface CanvasProps {
  setView: (view: ViewState) => void;
}

export const Canvas: React.FC<CanvasProps> = ({ setView }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#f43f5e'); // Tulika-500
  const [lineWidth, setLineWidth] = useState(4);
  const [isConnected, setIsConnected] = useState(SyncService.isConnected);

  // Helper to get coordinates for both Touch and Mouse
  const getCoords = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: any) => {
    // e.preventDefault(); // Prevent scrolling (commented out to allow some UI interaction, handled in CSS)
    const { x, y } = getCoords(e);
    setIsDrawing(true);
    draw(x, y, false);
    
    SyncService.sendSignal('DRAW', { x, y, type: 'start', color, lineWidth });
  };

  const draw = (x: number, y: number, isMove: boolean) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;

    if (!isMove) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const handleMove = (e: any) => {
    if (!isDrawing) return;
    const { x, y } = getCoords(e);
    draw(x, y, true);
    
    // Throttle slightly in production, but for local P2P raw is okay-ish
    SyncService.sendSignal('DRAW', { x, y, type: 'move', color, lineWidth });
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    ctx?.beginPath(); // Reset path
    SyncService.sendSignal('DRAW', { type: 'end' });
  };

  // Remote Drawing Logic
  const handleRemoteDraw = (payload: any) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    if (payload.type === 'start') {
      ctx.lineWidth = payload.lineWidth;
      ctx.lineCap = 'round';
      ctx.strokeStyle = payload.color;
      ctx.beginPath();
      ctx.moveTo(payload.x, payload.y);
    } else if (payload.type === 'move') {
      ctx.lineWidth = payload.lineWidth; // Ensure we use sender's width
      ctx.strokeStyle = payload.color;
      ctx.lineTo(payload.x, payload.y);
      ctx.stroke();
    } else if (payload.type === 'end') {
      ctx.beginPath();
    } else if (payload.type === 'clear') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      SyncService.sendSignal('DRAW', { type: 'clear' });
    }
  };

  useEffect(() => {
    // Set canvas size to match screen resolution for sharpness
    const canvas = canvasRef.current;
    if (canvas) {
        const parent = canvas.parentElement;
        if (parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }
    }

    const handleSignal = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail.signalType === 'DRAW') {
            handleRemoteDraw(detail.payload);
        }
    };

    const handleSyncStatus = () => setIsConnected(SyncService.isConnected);

    syncEventTarget.addEventListener('signal-received', handleSignal);
    syncEventTarget.addEventListener('sync-update', handleSyncStatus);

    return () => {
        syncEventTarget.removeEventListener('signal-received', handleSignal);
        syncEventTarget.removeEventListener('sync-update', handleSyncStatus);
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-white min-h-screen relative overflow-hidden touch-none">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between pointer-events-none z-10">
        <button 
            onClick={() => setView('home')} 
            className="p-3 bg-white/80 backdrop-blur shadow-sm rounded-full text-gray-600 pointer-events-auto"
        >
          <ArrowLeft size={24} />
        </button>
        
        <div className="flex gap-2 pointer-events-auto">
             {!isConnected && (
                 <span className="bg-red-100 text-red-500 px-3 py-1 rounded-full text-xs font-bold flex items-center">
                     Offline
                 </span>
             )}
             <button onClick={clearCanvas} className="p-3 bg-white/80 backdrop-blur shadow-sm rounded-full text-gray-600 hover:text-red-500">
                <Trash2 size={24} />
             </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 w-full h-full bg-gray-50 cursor-crosshair">
          <canvas
            ref={canvasRef}
            className="w-full h-full touch-none"
            onMouseDown={startDrawing}
            onMouseMove={handleMove}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={handleMove}
            onTouchEnd={stopDrawing}
          />
      </div>

      {/* Tools Footer */}
      <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl p-4 flex items-center justify-between z-10 safe-pb">
        <div className="flex items-center gap-4">
            {['#f43f5e', '#3b82f6', '#22c55e', '#eab308', '#000000'].map((c) => (
                <button
                    key={c}
                    onClick={() => { setColor(c); setLineWidth(4); }}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        color === c && lineWidth !== 20 ? 'border-gray-400 scale-125' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                />
            ))}
        </div>
        <div className="w-px h-8 bg-gray-200 mx-2"></div>
        <button 
            onClick={() => { setColor('#f9fafb'); setLineWidth(20); }} // Eraser mode (paint background color)
            className={`p-2 rounded-full transition-colors ${
                lineWidth === 20 ? 'bg-tulika-100 text-tulika-600' : 'text-gray-400'
            }`}
        >
            <Eraser size={24} />
        </button>
      </div>
    </div>
  );
};
