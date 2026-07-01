import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudRain, Droplets, Flower2, Image as ImageIcon, Lock, Sparkles, Sprout, TreePine, X } from 'lucide-react';
import { BONSAI_NOTE_MAX } from '../../services/bonsai';
import { StorageService } from '../../services/storage';
import { BONSAI_DECORATIONS, BONSAI_STAGES, type GardenState } from '../../utils/bonsai/growth';
import { VoxelSceneRenderer } from '../../utils/bonsai/isoRenderer';
import {
  BONSAI_SPECIES,
  generateBonsaiModel,
  type BonsaiSpeciesId,
} from '../../utils/bonsai/voxelModel';
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

/* ── Day: a blossom is a real day — notes + the memory you kept ────── */

interface DaySheetProps {
  day: string | null;
  tree: BonsaiTreeState;
  partnerName: string;
  onClose: () => void;
}

const prettyDate = (day: string): string =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

export function BonsaiDaySheet({ day, tree, partnerName, onClose }: DaySheetProps) {
  const [memory, setMemory] = useState<{ text: string; image: string | null } | null>(null);

  useEffect(() => {
    if (!day) {
      setMemory(null);
      return;
    }
    let live = true;
    void (async () => {
      try {
        const match = StorageService.getMemories().find(
          (m) => (m.date || '').slice(0, 10) === day && (m.imageId || m.image || m.storagePath || m.text),
        );
        if (!match) {
          if (live) setMemory(null);
          return;
        }
        let image: string | null = null;
        try {
          image = await StorageService.getImage(match.imageId || '', match.image, match.storagePath);
        } catch {
          image = null;
        }
        if (live) setMemory({ text: (match.text || '').trim(), image });
      } catch {
        if (live) setMemory(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [day]);

  const notes = day
    ? tree.notes.filter((n) => n.day === day && (!n.forMe || n.unlocked))
    : [];

  return (
    <SheetShell open={day != null} onClose={onClose} label="A blossom day">
      {day && (
        <>
          <div className="bonsai-sheet__head">
            <Flower2 size={20} />
            <h3>{prettyDate(day)}</h3>
          </div>
          <p className="bonsai-sheet__sub">
            <Droplets size={12} style={{ display: 'inline', verticalAlign: '-1px' }} />{' '}
            {tree.twinDays.includes(day)
              ? 'A twin bloom — you watered within moments of each other.'
              : 'You both watered — this blossom is that day, kept.'}
          </p>
          <div className="bonsai-day__scroll">
            {memory?.image && (
              <img className="bonsai-day__photo" src={memory.image} alt="A memory from this day" />
            )}
            {memory && !memory.image && memory.text && (
              <p className="bonsai-day__memory-text">
                <ImageIcon size={13} /> “{memory.text}”
              </p>
            )}
            {memory?.image && memory.text && (
              <p className="bonsai-day__caption">“{memory.text}”</p>
            )}
            {notes.map((n) => (
              <div key={n.eventId} className="bonsai-day__note">
                <span>{n.forMe ? partnerName : 'You'}</span>
                <p>“{n.note}”</p>
              </div>
            ))}
            {!memory && notes.length === 0 && (
              <p className="bonsai-day__empty">
                A quiet one — no photos, no notes. Just the two of you showing up. That counts most.
              </p>
            )}
          </div>
        </>
      )}
    </SheetShell>
  );
}

/* ── Grove: every tree you've ever grown together ──────────────────── */

function GroveThumb({ seed, species, growth }: { seed: number; species: BonsaiSpeciesId; growth: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssSize = 128;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const renderer = new VoxelSceneRenderer(generateBonsaiModel(seed, species));
    renderer.layout(cssSize, cssSize, dpr);
    renderer.render({
      growth,
      bloomCount: 0,
      decorations: new Set(),
      resting: false,
      golden: false,
      season: 'spring',
    });
    renderer.composite(ctx, 0, 0, 0);
  }, [seed, species, growth]);
  return <canvas ref={canvasRef} className="bonsai-grove__thumb" />;
}

interface GroveSheetProps {
  open: boolean;
  garden: GardenState;
  currentGrowth: number;
  onClose: () => void;
}

export function BonsaiGroveSheet({ open, garden, currentGrowth, onClose }: GroveSheetProps) {
  const prettyRange = (a: string | null, b: string | null): string => {
    const fmt = (d: string) =>
      new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    if (!a) return '';
    return b && b !== a ? `${fmt(a)} — ${fmt(b)}` : fmt(a);
  };
  return (
    <SheetShell open={open} onClose={onClose} label="Your grove">
      <div className="bonsai-sheet__head">
        <TreePine size={20} />
        <h3>Your grove</h3>
      </div>
      <p className="bonsai-sheet__sub">
        Every finished tree stays. A grove, one season of you at a time.
      </p>
      <div className="bonsai-grove__scroll">
        {garden.completed.map((t) => (
          <div key={t.index} className="bonsai-grove__item">
            <GroveThumb seed={t.seed} species={t.species} growth={t.growth} />
            <strong>{BONSAI_SPECIES[t.species].name}</strong>
            <span>{t.bloomCount} blooms · {prettyRange(t.firstDay, t.lastDay)}</span>
          </div>
        ))}
        <div className="bonsai-grove__item is-current">
          <GroveThumb seed={garden.currentSeed} species={garden.currentSpecies} growth={currentGrowth} />
          <strong>{BONSAI_SPECIES[garden.currentSpecies].name}</strong>
          <span>growing now</span>
        </div>
      </div>
      {garden.completed.length === 0 && (
        <p className="bonsai-grove__hint">
          When this tree reaches Ancient, you&apos;ll plant the next one together — a new species,
          a new shape, same two gardeners.
        </p>
      )}
    </SheetShell>
  );
}

/* ── Species picker: begin the next tree ───────────────────────────── */

interface SpeciesPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (species: BonsaiSpeciesId) => void;
}

export function BonsaiSpeciesPicker({ open, onClose, onPick }: SpeciesPickerProps) {
  return (
    <SheetShell open={open} onClose={onClose} label="Plant the next tree">
      <div className="bonsai-sheet__head">
        <Sprout size={20} />
        <h3>Plant the next tree</h3>
      </div>
      <p className="bonsai-sheet__sub">
        This one is finished — it moves to your grove, blossoms and all. Choose what grows next.
      </p>
      <div className="bonsai-species">
        {(Object.values(BONSAI_SPECIES)).map((s) => (
          <button
            key={s.id}
            type="button"
            className="bonsai-species__option"
            onClick={() => {
              onPick(s.id);
              onClose();
            }}
          >
            <span className="bonsai-species__dots">
              {s.blossom.slice(0, 3).map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </span>
            <span className="bonsai-species__name">{s.name}</span>
            <span className="bonsai-species__line">{s.line}</span>
          </button>
        ))}
      </div>
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
        {tree.rainDays.length > 0 && (
          <p className="bonsai-story__hint bonsai-story__hint--rain">
            <CloudRain size={12} /> Rain covered {tree.rainDays.length} missed{' '}
            {tree.rainDays.length === 1 ? 'day' : 'days'} for you — one per month, on the house.
          </p>
        )}
      </div>
    </SheetShell>
  );
}
