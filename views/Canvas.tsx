import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Trash2, Eraser, Download, Undo2, Heart, BookmarkPlus, Check, X } from 'lucide-react';
import { ViewState, Memory } from '../types';
import { SyncService, syncEventTarget } from '../services/sync';
import { StorageService, storageEventTarget } from '../services/storage';

interface CanvasProps {
  setView: (view: ViewState) => void;
}

const COLORS = [
  '#f43f5e', // rose
  '#fb923c', // orange
  '#facc15', // yellow
  '#4ade80', // green
  '#38bdf8', // sky
  '#818cf8', // indigo
  '#e879f9', // fuchsia
  '#292524', // near-black
];

const BRUSH_SIZES = [
  { label: 'S', value: 2.5 },
  { label: 'M', value: 6 },
  { label: 'L', value: 14 },
];

const MAX_UNDO = 20;
const CANVAS_BG = '#fdfaf7'; // warm paper

export const Canvas: React.FC<CanvasProps> = ({ setView }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].value);
  const [isEraser, setIsEraser] = useState(false);
  const [isConnected, setIsConnected] = useState(SyncService.isConnected);
  const [canUndo, setCanUndo] = useState(false);
  const [showSaveSheet, setShowSaveSheet] = useState(false);
  const [saveCaption, setSaveCaption] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const undoStack = useRef<ImageData[]>([]);
  const profile = StorageService.getCoupleProfile();

  // ── Canvas helpers ────────────────────────────────────────────────────────

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  const getCoords = (e: any): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width * (window.devicePixelRatio || 1));
    const scaleY = canvas.height / (rect.height * (window.devicePixelRatio || 1));
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const applyDrawStyle = (ctx: CanvasRenderingContext2D, c: string, size: number, erase: boolean) => {
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (erase) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = c;
    }
  };

  const saveSnapshot = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.current = [...undoStack.current.slice(-MAX_UNDO + 1), snap];
    setCanUndo(true);
  };

  // ── Drawing ───────────────────────────────────────────────────────────────

  const startDrawing = (e: any) => {
    e.preventDefault();
    saveSnapshot();
    const { x, y } = getCoords(e);
    setIsDrawing(true);
    const ctx = getCtx();
    if (!ctx) return;
    applyDrawStyle(ctx, color, brushSize, isEraser);
    ctx.beginPath();
    ctx.moveTo(x, y);
    SyncService.sendSignal('DRAW', { x, y, type: 'start', color, brushSize, isEraser });
  };

  const handleMove = (e: any) => {
    e.preventDefault();
    if (!isDrawing) return;
    const { x, y } = getCoords(e);
    const ctx = getCtx();
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
    SyncService.sendSignal('DRAW', { x, y, type: 'move', color, brushSize, isEraser });
  };

  const stopDrawing = (e?: any) => {
    if (!isDrawing) return;
    e?.preventDefault?.();
    setIsDrawing(false);
    getCtx()?.beginPath();
    SyncService.sendSignal('DRAW', { type: 'end' });
  };

  // ── Remote drawing ────────────────────────────────────────────────────────

  const handleRemoteDraw = useCallback((payload: any) => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!ctx || !canvas) return;
    if (payload.type === 'start') {
      applyDrawStyle(ctx, payload.color, payload.brushSize, payload.isEraser);
      ctx.beginPath();
      ctx.moveTo(payload.x, payload.y);
    } else if (payload.type === 'move') {
      ctx.lineTo(payload.x, payload.y);
      ctx.stroke();
    } else if (payload.type === 'end') {
      ctx.beginPath();
    } else if (payload.type === 'clear') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      fillBackground();
    }
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const fillBackground = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!ctx || !canvas) return;
    saveSnapshot();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fillBackground();
    SyncService.sendSignal('DRAW', { type: 'clear' });
  };

  const undo = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx || undoStack.current.length === 0) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    ctx.putImageData(prev, 0, 0);
    setCanUndo(undoStack.current.length > 0);
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Composite with background for download
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx2 = offscreen.getContext('2d')!;
    ctx2.fillStyle = CANVAS_BG;
    ctx2.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx2.drawImage(canvas, 0, 0);
    const link = document.createElement('a');
    link.download = `draw-together-${Date.now()}.png`;
    link.href = offscreen.toDataURL('image/png');
    link.click();
  };

  const saveToMemory = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaveStatus('saving');
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx2 = offscreen.getContext('2d')!;
    ctx2.fillStyle = CANVAS_BG;
    ctx2.fillRect(0, 0, offscreen.width, offscreen.height);
    ctx2.drawImage(canvas, 0, 0);
    const dataUrl = offscreen.toDataURL('image/png');
    const memory: Memory = {
      id: `draw_${Date.now()}`,
      image: dataUrl,
      text: saveCaption.trim() || 'A drawing we made together ♡',
      date: new Date().toISOString(),
      mood: '🎨',
    };
    await StorageService.saveMemory(memory);
    storageEventTarget.dispatchEvent(new Event('storage-update'));
    setSaveStatus('done');
    setTimeout(() => {
      setShowSaveSheet(false);
      setSaveCaption('');
      setSaveStatus('idle');
    }, 1200);
  };

  // ── Setup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const parent = canvas.parentElement!;
      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      // Warm paper fill
      ctx.fillStyle = CANVAS_BG;
      ctx.fillRect(0, 0, w, h);
    }

    const handleSignal = (e: Event) => {
      const { signalType, payload } = (e as CustomEvent).detail;
      if (signalType === 'DRAW') handleRemoteDraw(payload);
    };
    const handleSyncStatus = () => setIsConnected(SyncService.isConnected);

    syncEventTarget.addEventListener('signal-received', handleSignal);
    syncEventTarget.addEventListener('sync-update', handleSyncStatus);
    return () => {
      syncEventTarget.removeEventListener('signal-received', handleSignal);
      syncEventTarget.removeEventListener('sync-update', handleSyncStatus);
    };
  }, [handleRemoteDraw]);

  // ── Render ────────────────────────────────────────────────────────────────

  const activeColor = isEraser ? null : color;

  return (
    <div
      className="flex flex-col h-full min-h-screen relative overflow-hidden touch-none select-none"
      style={{ background: '#0f0a14' }}
    >
      {/* ── Header ── */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-12 pb-3 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(15,10,20,0.9) 0%, transparent 100%)' }}
      >
        <button
          onClick={() => setView('home')}
          className="pointer-events-auto w-10 h-10 flex items-center justify-center rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <ArrowLeft size={18} className="text-white/80" />
        </button>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1.5">
            <Heart size={11} className="text-lior-400" fill="currentColor" />
            <span className="text-white/90 text-[13px] font-semibold tracking-wide">Draw Together</span>
            <Heart size={11} className="text-lior-400" fill="currentColor" />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: isConnected ? '#4ade80' : '#fb923c' }}
            />
            <span className="text-[10px]" style={{ color: isConnected ? 'rgba(74,222,128,0.8)' : 'rgba(251,146,60,0.8)' }}>
              {isConnected
                ? `${profile.partnerName} connected`
                : 'Offline — your strokes save locally'}
            </span>
          </div>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button
            onClick={() => setShowSaveSheet(true)}
            className="w-10 h-10 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(244,63,94,0.18)', border: '1px solid rgba(244,63,94,0.35)' }}
          >
            <BookmarkPlus size={16} className="text-lior-300" />
          </button>
          <button
            onClick={downloadCanvas}
            className="w-10 h-10 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <Download size={16} className="text-white/70" />
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="flex-1 w-full h-full" style={{ cursor: isEraser ? 'cell' : 'crosshair' }}>
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

      {/* ── Bottom toolbar ── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 flex flex-col gap-3 px-4 pb-8 pt-4"
        style={{ background: 'linear-gradient(to top, rgba(15,10,20,0.97) 0%, rgba(15,10,20,0.85) 70%, transparent 100%)' }}
      >
        {/* Color palette + actions row */}
        <div className="flex items-center justify-between">
          {/* Colors */}
          <div className="flex items-center gap-2.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { setColor(c); setIsEraser(false); }}
                className="relative flex-shrink-0 transition-transform active:scale-90"
                style={{
                  width: activeColor === c ? 28 : 22,
                  height: activeColor === c ? 28 : 22,
                  borderRadius: '50%',
                  background: c,
                  boxShadow: activeColor === c
                    ? `0 0 0 2.5px rgba(15,10,20,1), 0 0 0 4.5px ${c}`
                    : 'none',
                  transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                }}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="w-9 h-9 flex items-center justify-center rounded-full transition-opacity"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
                opacity: canUndo ? 1 : 0.35,
              }}
            >
              <Undo2 size={15} className="text-white/80" />
            </button>
            <button
              onClick={clearCanvas}
              className="w-9 h-9 flex items-center justify-center rounded-full"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <Trash2 size={15} className="text-white/80" />
            </button>
          </div>
        </div>

        {/* Brush size + eraser row */}
        <div className="flex items-center gap-2">
          {BRUSH_SIZES.map((b) => {
            const active = !isEraser && brushSize === b.value;
            return (
              <button
                key={b.value}
                onClick={() => { setBrushSize(b.value); setIsEraser(false); }}
                className="flex items-center justify-center transition-all active:scale-90"
                style={{
                  width: 42,
                  height: 36,
                  borderRadius: 12,
                  background: active ? 'rgba(244,63,94,0.15)' : 'rgba(255,255,255,0.06)',
                  border: active ? '1px solid rgba(244,63,94,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: b.value * 1.4,
                    height: b.value * 1.4,
                    borderRadius: '50%',
                    background: active ? color : 'rgba(255,255,255,0.45)',
                    maxWidth: 18,
                    maxHeight: 18,
                    minWidth: 4,
                    minHeight: 4,
                    transition: 'background 0.15s ease',
                  }}
                />
              </button>
            );
          })}

          <div className="flex-1" />

          <button
            onClick={() => setIsEraser((v) => !v)}
            className="flex items-center gap-2 px-3 h-9 rounded-xl transition-all active:scale-95"
            style={{
              background: isEraser ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
              border: isEraser ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Eraser size={14} className={isEraser ? 'text-white' : 'text-white/50'} />
            <span
              className="text-[11px] font-semibold"
              style={{ color: isEraser ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)' }}
            >
              Erase
            </span>
          </button>
        </div>
      </div>
      {/* ── Save to memories sheet ── */}
      {showSaveSheet && (
        <div
          className="absolute inset-0 z-30 flex items-end"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)' }}
          onClick={() => { if (saveStatus === 'idle') setShowSaveSheet(false); }}
        >
          <div
            className="w-full px-4 pb-10 pt-6 rounded-t-[2rem]"
            style={{ background: 'linear-gradient(160deg, #1a0d24 0%, #120820 100%)', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <BookmarkPlus size={16} className="text-lior-400" />
                <span className="text-white/90 font-semibold text-[14px]">Save to Memories</span>
              </div>
              {saveStatus === 'idle' && (
                <button onClick={() => setShowSaveSheet(false)} className="w-7 h-7 flex items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <X size={14} className="text-white/60" />
                </button>
              )}
            </div>

            <input
              type="text"
              value={saveCaption}
              onChange={e => setSaveCaption(e.target.value)}
              placeholder="Add a caption… (optional)"
              maxLength={120}
              disabled={saveStatus !== 'idle'}
              className="w-full px-4 py-3 rounded-xl text-sm text-white/90 placeholder-white/25 outline-none mb-4"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            />

            <button
              onClick={saveToMemory}
              disabled={saveStatus !== 'idle'}
              className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
              style={{
                background: saveStatus === 'done'
                  ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                  : 'linear-gradient(135deg, #f43f5e, #e11d48)',
                opacity: saveStatus === 'saving' ? 0.7 : 1,
              }}
            >
              {saveStatus === 'done'
                ? <><Check size={15} /> Saved to Memories!</>
                : saveStatus === 'saving'
                  ? 'Saving…'
                  : <><Heart size={14} fill="currentColor" /> Save Drawing</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
