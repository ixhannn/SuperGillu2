import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, PenLine, Trash2 } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewState, Note } from '../types';
import { StorageService } from '../services/storage';
import { feedback } from '../utils/feedback';

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } }
};

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as any } }
};
import { ConfirmModal } from '../components/ConfirmModal';
import { generateId } from '../utils/ids';

interface NotesProps {
  setView: (view: ViewState) => void;
}

const COLORS = ['bg-yellow-500/15', 'bg-pink-500/15', 'bg-blue-500/15', 'bg-green-500/15', 'bg-purple-500/15'];

export const Notes: React.FC<NotesProps> = ({ setView }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [currentNote, setCurrentNote] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [longPressId, setLongPressId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = useCallback((id: string) => {
    longPressTimer.current = setTimeout(() => {
      feedback.medium();
      setLongPressId(id);
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => {
    setNotes(StorageService.getNotes());
  }, []);

  const handleSave = () => {
    if (!currentNote.trim()) {
        setIsEditing(false);
        return;
    }
    const note: Note = {
      id: generateId(),
      content: currentNote,
      createdAt: new Date().toISOString(),
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    };
    StorageService.saveNote(note);
    feedback.celebrate();
    setNotes(prev => [note, ...prev]);
    setCurrentNote('');
    setIsEditing(false);
  };

  const handleDelete = (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
        StorageService.deleteNote(deleteTarget);
        setNotes(prev => prev.filter(n => n.id !== deleteTarget));
        setDeleteTarget(null);
    }
  };

  return (
    <div className="pb-32 min-h-screen">
      <ViewHeader
        title="Love Notes"
        onBack={() => setView('home')}
        variant="simple"
        rightSlot={
          <button
            onClick={() => setIsEditing(true)}
            className="p-3 rounded-2xl spring-press glass-card"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <Plus size={22} />
          </button>
        }
      />

      <div className="px-5">

      <AnimatePresence>
      {isEditing && (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        >
            <motion.div 
                initial={{ scale: 0.94, opacity: 0, y: 8 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.96, opacity: 0, y: 4 }}
                transition={{ type: 'spring', damping: 26, stiffness: 340 }}
                className="w-full max-w-sm p-6 glass-card-hero"
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>New Note</h3>
                    <button onClick={() => setIsEditing(false)} aria-label="Close" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-lior-500 focus-visible:rounded-full focus-visible:ring-offset-2" style={{ color: 'var(--color-text-secondary)' }}><X size={24} /></button>
                </div>
                <textarea
                    autoFocus
                    value={currentNote}
                    onChange={(e) => setCurrentNote(e.target.value)}
                    className="w-full h-40 p-4 rounded-2xl text-lg resize-none focus:outline-none mb-4 font-serif leading-relaxed focus:ring-2 focus:ring-lior-500/30 shadow-inner"
                    placeholder="Write something sweet..."
                    style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', color: 'var(--color-text-primary)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)' }}
                />
                <button
                    onClick={handleSave}
                    className="w-full text-white py-3 rounded-xl font-semibold"
                    style={{ background: 'var(--theme-nav-center-bg-active)' }}
                >
                    Save Note
                </button>
            </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <motion.div className="grid grid-cols-2 gap-4" variants={staggerContainer} initial="hidden" animate="show">
        {notes.map((note) => (
          <motion.div
            key={note.id}
            variants={staggerItem}
            className={`${note.color} p-4 rounded-[2rem] min-h-[160px] flex flex-col justify-between relative group transform rotate-1 spring-press glass-card border border-white/30 ${longPressId === note.id ? 'scale-[1.02] ring-2 ring-red-400/40' : ''} transition-all`}
            onPointerDown={() => handlePointerDown(note.id)}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onClick={() => { if (longPressId && longPressId !== note.id) setLongPressId(null); }}
          >
            <p className="font-serif leading-snug whitespace-pre-wrap text-[15px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {note.content}
            </p>
            <div className="flex justify-between items-end mt-4">
                <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    {new Date(note.createdAt).toLocaleDateString()}
                </span>
                <AnimatePresence>
                  {longPressId === note.id && (
                    <motion.button
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      onClick={(e) => { e.stopPropagation(); handleDelete(note.id); setLongPressId(null); }}
                      className="p-2 bg-red-500 rounded-full text-white shadow-lg shadow-red-200"
                    >
                      <Trash2 size={14} />
                    </motion.button>
                  )}
                </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </motion.div>
      
      {notes.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-20 animate-fade-in">
              <div className="relative mb-6">
                  <div className="absolute inset-0 bg-yellow-500/10 rounded-full blur-2xl animate-breathe-glow" />
                  <div className="relative p-6 bg-yellow-500/10 rounded-full border border-yellow-500/20">
                      <PenLine size={36} className="text-yellow-400/40" />
                  </div>
              </div>
              <p className="font-serif font-bold text-lg mb-2" style={{ color: 'var(--color-text-primary)' }}>Write a little note...</p>
              <p className="text-xs mb-6 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Leave sweet words for each other</p>
              <button
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-3 glass-card text-lior-600 font-bold uppercase tracking-wider spring-press flex items-center gap-2"
              >
                  <Plus size={18} /> Write a Note
              </button>
          </div>
      )}
      </div>

      <ConfirmModal
          isOpen={!!deleteTarget}
          title="Delete Note"
          message="Are you sure you want to delete this note?"
          confirmLabel="Delete"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};