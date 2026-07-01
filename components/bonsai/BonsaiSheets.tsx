import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Flower2, Lock, Sparkles, X } from 'lucide-react';
import { BONSAI_NOTE_MAX } from '../../services/bonsai';
import { BONSAI_DECORATIONS, BONSAI_STAGES } from '../../utils/bonsai/growth';
import type { BlossomNote, BonsaiTreeState } from '../../utils/bonsai/types';

const SHEET_SPRING = { type: 'spring' as const, stiffness: 380, damping: 38 };

interface SheetShellProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}

function SheetShell({ open, onClose, label, children }: SheetShellProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="bonsai-sheet__scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="bonsai-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            exit={{ y: '105%' }}
            transition={SHEET_SPRING}
          >
            <button type="button" className="bonsai-sheet__close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Compose: tuck a note into today's blossom ─────────────────────── */

interface ComposeSheetProps {
  open: boolean;
  partnerName: string;
  onClose: () => void;
  onSave: (note: string) => void;
}

export function BonsaiComposeSheet({ open, partnerName, onClose, onSave }: ComposeSheetProps) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText('');
  }, [open]);

  return (
    <SheetShell open={open} onClose={onClose} label="Tuck a note into today's blossom">
      <div className="bonsai-sheet__head">
        <Flower2 size={20} />
        <h3>Tuck a note into today&apos;s blossom</h3>
      </div>
      <p className="bonsai-sheet__sub">
        It stays sealed until {partnerName} waters the tree. That&apos;s the deal — show up, then read.
      </p>
      <textarea
        className="bonsai-sheet__input"
        value={text}
        maxLength={BONSAI_NOTE_MAX}
        rows={3}
        placeholder="Something small and true…"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="bonsai-sheet__row">
        <span className="bonsai-sheet__count">{text.length}/{BONSAI_NOTE_MAX}</span>
        <button
          type="button"
          className="bonsai-cta"
          disabled={text.trim().length === 0}
          onClick={() => {
            onSave(text);
            onClose();
          }}
        >
          Seal it in
        </button>
      </div>
    </SheetShell>
  );
}

/* ── Read: open a blossom note ─────────────────────────────────────── */

interface ReadSheetProps {
  note: BlossomNote | null;
  partnerName: string;
  onClose: () => void;
  onOpened: (note: BlossomNote) => void;
}

export function BonsaiReadSheet({ note, partnerName, onClose, onOpened }: ReadSheetProps) {
  useEffect(() => {
    if (note && note.forMe && note.unlocked && !note.opened) onOpened(note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.eventId]);

  const day = note
    ? new Date(`${note.day}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
    : '';

  return (
    <SheetShell open={note != null} onClose={onClose} label="Blossom note">
      {note && !note.forMe && (
        <>
          <div className="bonsai-sheet__head">
            <Flower2 size={20} />
            <h3>Your note from {day}</h3>
          </div>
          <p className="bonsai-sheet__note">“{note.note}”</p>
          <p className="bonsai-sheet__sub">
            {note.opened ? `${partnerName} has opened this one.` : `Still sealed — ${partnerName} hasn't watered since.`}
          </p>
        </>
      )}
      {note && note.forMe && note.unlocked && (
        <>
          <div className="bonsai-sheet__head">
            <Sparkles size={20} />
            <h3>From {partnerName} · {day}</h3>
          </div>
          <p className="bonsai-sheet__note">“{note.note}”</p>
          <p className="bonsai-sheet__sub">Tucked into a blossom while watering your tree.</p>
        </>
      )}
      {note && note.forMe && !note.unlocked && (
        <>
          <div className="bonsai-sheet__head">
            <Lock size={20} />
            <h3>A sealed blossom</h3>
          </div>
          <p className="bonsai-sheet__sub">
            {partnerName} hid a note in here on {day}. Water the tree and it opens.
          </p>
        </>
      )}
    </SheetShell>
  );
}

/* ── Story: stages, streaks, decorations ───────────────────────────── */

interface StorySheetProps {
  open: boolean;
  tree: BonsaiTreeState;
  onClose: () => void;
}

export function BonsaiStorySheet({ open, tree, onClose }: StorySheetProps) {
  return (
    <SheetShell open={open} onClose={onClose} label="The story of your tree">
      <div className="bonsai-sheet__head">
        <Sparkles size={20} />
        <h3>The story of your tree</h3>
      </div>
      <div className="bonsai-story__stats">
        <div><strong>{tree.bloomDays.length}</strong><span>blooms together</span></div>
        <div><strong>{tree.streak}</strong><span>day streak</span></div>
        <div><strong>{tree.bestStreak}</strong><span>best streak</span></div>
      </div>

      <div className="bonsai-story__scroll">
        <h4 className="bonsai-story__label">Growth</h4>
        <div className="bonsai-story__stages">
          {BONSAI_STAGES.map((stage) => {
            const reached = tree.growth >= stage.at;
            const current = tree.stage.id === stage.id;
            return (
              <div
                key={stage.id}
                className={[
                  'bonsai-story__stage',
                  reached ? 'is-reached' : '',
                  current ? 'is-current' : '',
                ].join(' ')}
              >
                <span className="bonsai-story__dot" />
                <div>
                  <strong>{stage.name}</strong>
                  <p>{reached ? stage.line : `Grows in at ${stage.at} light`}</p>
                </div>
              </div>
            );
          })}
        </div>

        <h4 className="bonsai-story__label">Garden</h4>
        <div className="bonsai-story__decor">
          {BONSAI_DECORATIONS.map((decor) => {
            const unlocked = tree.decorations.some((d) => d.id === decor.id);
            return (
              <div key={decor.id} className={`bonsai-story__decor-item ${unlocked ? 'is-unlocked' : ''}`}>
                {unlocked ? <Flower2 size={16} /> : <Lock size={16} />}
                <div>
                  <strong>{decor.name}</strong>
                  <p>{decor.description}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="bonsai-story__hint">
          Watering together on the same day grows the tree 3× faster and opens a permanent blossom.
        </p>
      </div>
    </SheetShell>
  );
}
