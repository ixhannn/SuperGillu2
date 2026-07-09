/**
 * OUR HOME — the shoebox.
 *
 * Every note either of you chose to keep, re-read in the hand that wrote it.
 * The box never counts out loud beyond its own lid, never expires anything —
 * it is the room's memory, opened by a tap.
 */
import React from 'react';
import { HomeInk, HomeNote } from './homeTypes';

const INK_CSS: Record<HomeInk, string> = { wine: '#7a3b4a', gold: '#a97e3c' };

const KeptStrokes = ({ strokes, ink }: { strokes: number[][]; ink: HomeInk }): React.JSX.Element => (
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="oh-kept-strokes">
    {strokes.map((s, i) => {
      const pts: string[] = [];
      for (let j = 0; j + 1 < s.length; j += 2) pts.push(`${s[j]},${s[j + 1]}`);
      return pts.length >= 2
        ? <polyline key={i} points={pts.join(' ')} fill="none" stroke={INK_CSS[ink]} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        : null;
    })}
  </svg>
);

export interface HomeShoeboxProps {
  /** Peeled (kept) notes, newest first. */
  notes: readonly HomeNote[];
  fromLineFor: (note: HomeNote) => string; // "from Maya · this morning"
  onClose: () => void;
}

export const HomeShoebox = ({ notes, fromLineFor, onClose }: HomeShoeboxProps): React.JSX.Element => (
  <div className="oh-sheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="oh-shoebox-sheet">
      <header className="oh-shoebox-head">
        <p className="oh-shoebox-title">the shoebox</p>
        <p className="oh-shoebox-sub">
          {notes.length === 0 ? 'empty, for now' : 'the ones you chose to keep'}
        </p>
      </header>
      <div className="oh-shoebox-scroll">
        {notes.length === 0 && (
          <p className="oh-shoebox-empty">
            When a note matters, choose <b>keep</b> instead of letting it
            flutter away — it will live in here.
          </p>
        )}
        {notes.map((n) => (
          <div key={n.id} className="oh-kept-note" style={{ transform: `rotate(${n.tilt / 2}deg)` }}>
            {n.strokes.length > 0
              ? <KeptStrokes strokes={n.strokes} ink={n.ink} />
              : <p className="oh-kept-text" style={{ color: INK_CSS[n.ink] }}>{n.text}</p>}
            <span className="oh-kept-from">{fromLineFor(n)}</span>
          </div>
        ))}
      </div>
      <button type="button" className="oh-quiet-btn oh-shoebox-close" onClick={onClose}>
        put the lid back
      </button>
    </div>
  </div>
);
