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
  const colorName = (value: string) => ({
    '#f43f5e': 'rose',
    '#fb923c': 'orange',
    '#facc15': 'sun',
    '#4ade80': 'leaf',
    '#38bdf8': 'sky',
    '#818cf8': 'periwinkle',
    '#e879f9': 'orchid',
    '#292524': 'black',
  }[value] ?? 'color');

  return (
    <div
      className="draw-together-view relative select-none px-4 pt-3"
      style={{
        minHeight: '100dvh',
        paddingBottom: 'calc(7rem + max(env(safe-area-inset-bottom, 0px), 14px))',
        background: [
          'radial-gradient(circle at 12% 4%, rgba(255,204,216,0.58), transparent 30%)',
          'radial-gradient(circle at 92% 10%, rgba(202,218,255,0.48), transparent 28%)',
          'linear-gradient(180deg, rgba(255,248,251,0.96) 0%, rgba(250,231,241,0.94) 52%, rgba(239,232,255,0.92) 100%)',
        ].join(', '),
      }}
    >
      <header
        className="relative z-20 flex items-center gap-3 rounded-[1.55rem] px-3 py-3"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(255,245,250,0.76))',
          border: '1px solid rgba(255,255,255,0.82)',
          boxShadow: '0 12px 26px rgba(168,123,148,0.13), inset 0 1px 0 rgba(255,255,255,0.95)',
        }}
      >
        <button
          type="button"
          aria-label="Back to Us"
          onClick={() => setView('us')}
          className="w-11 h-11 flex items-center justify-center rounded-[1.05rem] spring-press"
          style={{
            background: 'linear-gradient(145deg, #ffffff, #f8edf5)',
            border: '1px solid rgba(183,152,174,0.20)',
            boxShadow: '0 5px 12px rgba(91,65,84,0.08), inset 0 1px 0 rgba(255,255,255,0.92)',
          }}
        >
          <ArrowLeft size={19} style={{ color: '#4b3140' }} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[0.58rem] font-extrabold uppercase tracking-[0.18em]"
              style={{ color: '#b06987' }}
            >
              Shared canvas
            </span>
            <span className="h-1 w-1 rounded-full" style={{ background: '#f0a9bf' }} />
            <span
              className="text-[0.58rem] font-extrabold uppercase tracking-[0.18em]"
              style={{ color: isConnected ? '#3b9f68' : '#c17942' }}
            >
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
          <h1
            className="mt-0.5 truncate font-serif text-[1.22rem] font-bold leading-none"
            style={{ color: '#2d1f25' }}
          >
            Draw Together
          </h1>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full flex-shrink-0"
              style={{ background: isConnected ? '#4ade80' : '#fb923c' }}
            />
            <span className="truncate text-[0.68rem] font-semibold" style={{ color: '#8f7583' }}>
              {isConnected
                ? `${profile.partnerName} is sketching with you`
                : 'Saves locally until sync'}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Save drawing to memories"
            onClick={() => setShowSaveSheet(true)}
            className="w-11 h-11 flex items-center justify-center rounded-[1.05rem] spring-press"
            style={{
              background: 'linear-gradient(145deg, rgba(255,220,232,0.95), rgba(251,182,207,0.88))',
              border: '1px solid rgba(232,128,166,0.34)',
              boxShadow: '0 7px 16px rgba(219,91,139,0.15), inset 0 1px 0 rgba(255,255,255,0.86)',
            }}
          >
            <BookmarkPlus size={17} style={{ color: '#7b304d' }} />
          </button>
          <button
            type="button"
            aria-label="Download drawing"
            onClick={downloadCanvas}
            className="w-11 h-11 flex items-center justify-center rounded-[1.05rem] spring-press"
            style={{
              background: 'linear-gradient(145deg, #ffffff, #edf5ff)',
              border: '1px solid rgba(142,161,202,0.22)',
              boxShadow: '0 5px 12px rgba(91,65,84,0.08), inset 0 1px 0 rgba(255,255,255,0.92)',
            }}
          >
            <Download size={17} style={{ color: '#496180' }} />
          </button>
        </div>
      </header>

      {/* ── Canvas ── */}
      <section
        data-testid="draw-together-stage"
        className="relative mt-3 overflow-hidden rounded-[1.8rem]"
        style={{
          height: 'clamp(250px, calc(100dvh - 22rem), 480px)',
          cursor: isEraser ? 'cell' : 'crosshair',
          background: [
            'linear-gradient(135deg, rgba(255,255,255,0.72), rgba(255,245,238,0.36))',
            `linear-gradient(${CANVAS_BG}, ${CANVAS_BG})`,
          ].join(', '),
          border: '1px solid rgba(198,155,174,0.24)',
          boxShadow: '0 18px 38px rgba(137,93,121,0.14), inset 0 1px 0 rgba(255,255,255,0.92)',
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(99,78,91,0.075) 1px, transparent 1.4px)',
            backgroundSize: '18px 18px',
            opacity: 0.42,
          }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 w-full h-full touch-none"
          aria-label="Shared drawing canvas"
          onMouseDown={startDrawing}
          onMouseMove={handleMove}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={handleMove}
          onTouchEnd={stopDrawing}
        />
        <div
          aria-hidden="true"
          className="absolute left-4 top-4 z-20 rounded-full px-3 py-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.16em]"
          style={{
            color: '#987386',
            background: 'rgba(255,255,255,0.70)',
            border: '1px solid rgba(255,255,255,0.76)',
          }}
        >
          Paper is live
        </div>
        <div
          aria-hidden="true"
          className="absolute -right-7 -bottom-7 z-0 h-28 w-28 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(251,182,207,0.32), transparent 70%)' }}
        />
      </section>

      {/* ── Bottom toolbar ── */}
      <div
        data-testid="draw-together-toolbar"
        className="relative z-20 mt-3 flex flex-col gap-2.5 rounded-[1.55rem] px-3 py-3"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.94), rgba(252,242,248,0.88))',
          border: '1px solid rgba(255,255,255,0.78)',
          boxShadow: '0 18px 38px rgba(98,73,91,0.18), inset 0 1px 0 rgba(255,255,255,0.95)',
        }}
      >
        {/* Color palette */}
        <div className="flex items-center justify-between gap-1">
          {/* Colors */}
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Use ${colorName(c)} ink`}
              onClick={() => { setColor(c); setIsEraser(false); }}
              className="relative flex-shrink-0 transition-transform active:scale-90 spring-press"
              style={{
                width: activeColor === c ? 34 : 30,
                height: activeColor === c ? 34 : 30,
                borderRadius: '50%',
                background: c,
                boxShadow: activeColor === c
                  ? `0 0 0 3px rgba(255,255,255,0.96), 0 0 0 5px ${c}, 0 6px 12px rgba(72,47,62,0.12)`
                  : 'inset 0 1px 0 rgba(255,255,255,0.42), 0 3px 8px rgba(72,47,62,0.09)',
                transition: 'width 0.18s cubic-bezier(0.34,1.56,0.64,1), height 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s cubic-bezier(0.34,1.56,0.64,1)',
              }}
            />
          ))}
        </div>

        {/* Brush size + eraser row */}
        <div className="flex items-center gap-1.5">
          {BRUSH_SIZES.map((b) => {
            const active = !isEraser && brushSize === b.value;
            return (
              <button
                key={b.value}
                type="button"
                aria-label={`Use ${b.label} brush`}
                onClick={() => { setBrushSize(b.value); setIsEraser(false); }}
                className="flex h-10 min-w-[42px] items-center justify-center rounded-[0.95rem] transition-all active:scale-90 spring-press"
                style={{
                  background: active ? 'rgba(255,220,232,0.92)' : 'rgba(255,255,255,0.62)',
                  border: active ? '1px solid rgba(236,72,153,0.28)' : '1px solid rgba(178,154,190,0.16)',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: b.value * 1.4,
                    height: b.value * 1.4,
                    borderRadius: '50%',
                    background: active ? color : 'rgba(97,78,91,0.36)',
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
            type="button"
            aria-label="Undo last stroke"
            onClick={undo}
            disabled={!canUndo}
            className="w-10 h-10 flex items-center justify-center rounded-[0.95rem] transition-opacity spring-press"
            style={{
              background: 'linear-gradient(145deg, #ffffff, #f2edf7)',
              border: '1px solid rgba(178,154,190,0.20)',
              opacity: canUndo ? 1 : 0.35,
            }}
          >
            <Undo2 size={16} style={{ color: '#6c5875' }} />
          </button>
          <button
            type="button"
            aria-label="Clear canvas"
            onClick={clearCanvas}
            className="w-10 h-10 flex items-center justify-center rounded-[0.95rem] spring-press"
            style={{
              background: 'linear-gradient(145deg, #fff7f7, #f7ecf0)',
              border: '1px solid rgba(214,137,154,0.24)',
            }}
          >
            <Trash2 size={16} style={{ color: '#8b5260' }} />
          </button>

          <button
            type="button"
            aria-label={isEraser ? 'Turn eraser off' : 'Use eraser'}
            onClick={() => setIsEraser((v) => !v)}
            className="flex h-10 items-center gap-1.5 rounded-[0.95rem] px-2.5 transition-all active:scale-95 spring-press"
            style={{
              background: isEraser ? 'linear-gradient(145deg, #ffffff, #e7f5ff)' : 'rgba(255,255,255,0.64)',
              border: isEraser ? '1px solid rgba(95,142,191,0.28)' : '1px solid rgba(178,154,190,0.16)',
            }}
          >
            <Eraser size={15} style={{ color: isEraser ? '#40627f' : '#7b6878' }} />
            <span
              className="text-[0.72rem] font-extrabold"
              style={{ color: isEraser ? '#40627f' : '#7b6878' }}
            >
              Erase
            </span>
          </button>
        </div>
      </div>
      {/* ── Save to memories sheet ── */}
      {showSaveSheet && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center px-4"
          style={{ background: 'rgba(49,31,42,0.42)', backdropFilter: 'blur(12px)' }}
          onClick={() => { if (saveStatus === 'idle') setShowSaveSheet(false); }}
        >
          <div
            className="w-full max-w-md rounded-t-[1.8rem] px-4 pb-10 pt-5"
            style={{
              background: 'linear-gradient(160deg, #fffafd 0%, #f8edf5 100%)',
              border: '1px solid rgba(255,255,255,0.86)',
              boxShadow: '0 -16px 42px rgba(64,42,58,0.20), inset 0 1px 0 rgba(255,255,255,0.92)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <BookmarkPlus size={16} style={{ color: '#c2557c' }} />
                <span className="font-semibold text-[14px]" style={{ color: '#2d1f25' }}>Save to Memories</span>
              </div>
              {saveStatus === 'idle' && (
                <button type="button" aria-label="Close save sheet" onClick={() => setShowSaveSheet(false)} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'rgba(94,73,87,0.08)' }}>
                  <X size={14} style={{ color: '#7b6878' }} />
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
              className="w-full px-4 py-3 rounded-xl text-[16px] outline-none mb-4"
              style={{
                color: '#3b2b34',
                background: 'rgba(255,255,255,0.82)',
                border: '1px solid rgba(198,155,174,0.24)',
              }}
            />

            <button
              type="button"
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
