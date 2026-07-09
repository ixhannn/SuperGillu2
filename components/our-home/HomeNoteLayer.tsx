/**
 * OUR HOME — handwritten notes.
 *
 * Raw finger-stroke capture: their actual handwriting, wobble and all, on a
 * cream square. Composing happens on a big sheet; the note then sticks where
 * you tap, slightly crooked, in your ink. Reading enlarges it; keep it (the
 * shoebox) or let it flutter away.
 */
import React, { useCallback, useRef, useState } from 'react';
import { HomeInk, HomeNote } from './homeTypes';

const INK_CSS: Record<HomeInk, string> = { wine: '#7a3b4a', gold: '#a97e3c' };

/* ── composer ────────────────────────────────────────────────── */

export interface NoteComposerProps {
  ink: HomeInk;
  onDone: (strokes: number[][]) => void;
  onCancel: () => void;
  /** 'fog' = the night window: dusk glass, breath-white strokes. */
  variant?: 'note' | 'fog';
  hint?: string;
  doneLabel?: string;
}

export const HomeNoteComposer = ({
  ink, onDone, onCancel, variant = 'note', hint, doneLabel,
}: NoteComposerProps): React.JSX.Element => {
  const [strokes, setStrokes] = useState<number[][]>([]);
  const live = useRef<number[] | null>(null);
  const drawing = useRef(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [, bump] = useState(0);

  const toNote = useCallback((e: React.PointerEvent): [number, number] | null => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    if (x < -2 || x > 102 || y < -2 || y > 102) return null;
    return [Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))];
  }, []);

  const strokeColor = variant === 'fog' ? 'rgba(255, 255, 255, 0.92)' : INK_CSS[ink];
  return (
    <div className="oh-sheet-scrim">
      <div className="oh-note-sheet">
        <p className="oh-sheet-hint">{hint ?? 'write something — your hand, not a font'}</p>
        <div
          ref={boxRef}
          className={variant === 'fog' ? 'oh-note-paper oh-note-paper--fog' : 'oh-note-paper'}
          onPointerDown={(e) => {
            const p = toNote(e);
            if (!p) return;
            try {
              (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            } catch {
              // pointer may already be gone — capture is best-effort
            }
            drawing.current = true;
            live.current = [Math.round(p[0]), Math.round(p[1])];
            bump((v) => v + 1);
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !live.current) return;
            const p = toNote(e);
            if (!p) return;
            const s = live.current;
            const lx = s[s.length - 2];
            const ly = s[s.length - 1];
            if (Math.hypot(p[0] - lx, p[1] - ly) > 1.4) {
              s.push(Math.round(p[0]), Math.round(p[1]));
              bump((v) => v + 1);
            }
          }}
          onPointerUp={() => {
            if (live.current && live.current.length >= 4) {
              const done = live.current;
              setStrokes((prev) => [...prev, done]);
            }
            live.current = null;
            drawing.current = false;
          }}
          onPointerCancel={() => {
            live.current = null;
            drawing.current = false;
          }}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {[...strokes, ...(live.current ? [live.current] : [])].map((s, i) => {
              const pts: string[] = [];
              for (let j = 0; j + 1 < s.length; j += 2) pts.push(`${s[j]},${s[j + 1]}`);
              return pts.length >= 2
                ? <polyline key={i} points={pts.join(' ')} fill="none" stroke={strokeColor} strokeWidth={variant === 'fog' ? 2.8 : 2.2} strokeLinecap="round" strokeLinejoin="round" />
                : null;
            })}
          </svg>
        </div>
        <div className="oh-sheet-actions">
          <button type="button" className="oh-quiet-btn" onClick={onCancel}>never mind</button>
          {strokes.length > 0 && (
            <button type="button" className="oh-quiet-btn" onClick={() => setStrokes([])}>start over</button>
          )}
          <button
            type="button"
            className="oh-warm-btn"
            disabled={strokes.length === 0}
            onClick={() => onDone(strokes)}
          >
            {doneLabel ?? 'leave it somewhere'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── reader ──────────────────────────────────────────────────── */

export interface NoteReaderProps {
  note: HomeNote;
  fromLine: string; // "from Maya · yesterday"
  mine: boolean;
  onKeep: () => void;
  onFlutter: () => void;
  onClose: () => void;
}

export const HomeNoteReader = ({
  note, fromLine, mine, onKeep, onFlutter, onClose,
}: NoteReaderProps): React.JSX.Element => (
  <div className="oh-sheet-scrim" onPointerDown={onClose}>
    <div className="oh-note-sheet oh-note-read" onPointerDown={(e) => e.stopPropagation()}>
      <div className="oh-note-paper oh-note-paper-read" style={{ transform: `rotate(${note.tilt}deg)` }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {note.strokes.map((s, i) => {
            const pts: string[] = [];
            for (let j = 0; j + 1 < s.length; j += 2) pts.push(`${s[j]},${s[j + 1]}`);
            return pts.length >= 2
              ? <polyline key={i} points={pts.join(' ')} fill="none" stroke={INK_CSS[note.ink]} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              : null;
          })}
          {note.strokes.length === 0 && note.text && (
            <text x="50" y="52" textAnchor="middle" fontSize="9" fill={INK_CSS[note.ink]} fontStyle="italic">
              {note.text.slice(0, 60)}
            </text>
          )}
        </svg>
      </div>
      <p className="oh-sheet-hint">{fromLine}</p>
      <div className="oh-sheet-actions">
        {!mine && <button type="button" className="oh-quiet-btn" onClick={onFlutter}>let it flutter away</button>}
        <button type="button" className="oh-warm-btn" onClick={onKeep}>keep it — the shoebox</button>
      </div>
    </div>
  </div>
);
