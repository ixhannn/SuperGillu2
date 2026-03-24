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
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
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
            className="text-white p-3 rounded-2xl spring-press"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <Plus size={22} />
          </button>
        }
      />

      <div className="px-5">

      {isEditing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
            <div className="w-full max-w-sm rounded-3xl p-6 animate-pop-in" style={{ background: 'rgba(20,15,28,0.92)', backdropFilter: 'blur(40px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-gray-100">New Note</h3>
                    <button onClick={() => setIsEditing(false)} aria-label="Close" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-tulika-500 focus-visible:rounded-full focus-visible:ring-offset-2"><X size={24} className="text-gray-500" /></button>
                </div>
                <textarea 
                    autoFocus
                    value={currentNote}
                    onChange={(e) => setCurrentNote(e.target.value)}
                    className="w-full h-40 bg-white/5 p-4 rounded-xl text-lg resize-none focus:outline-none mb-4 font-serif leading-relaxed text-gray-200 placeholder:text-gray-600"
                    placeholder="Write something sweet..."
                />
                <button 
                    onClick={handleSave}
                    className="w-full bg-tulika-500 text-white py-3 rounded-xl font-semibold"
                >
                    Save Note
                </button>
            </div>
        </div>
      )}

      <motion.div className="grid grid-cols-2 gap-4" variants={staggerContainer} initial="hidden" animate="show">
        {notes.map((note) => (
          <motion.div
            key={note.id}
            variants={staggerItem}
            className={`${note.color} p-4 rounded-3xl min-h-[160px] flex flex-col justify-between relative group transform rotate-1 spring-press ${longPressId === note.id ? 'scale-[1.02] ring-2 ring-red-400/40' : ''} transition-all`}
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            onPointerDown={() => handlePointerDown(note.id)}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onClick={() => { if (longPressId && longPressId !== note.id) setLongPressId(null); }}
          >
            <p className="font-serif text-gray-200 leading-snug whitespace-pre-wrap text-sm">
                {note.content}
            </p>
            <div className="flex justify-between items-end mt-4">
                <span className="text-[10px] text-gray-500 font-medium">
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
              <p className="font-serif text-gray-400 text-lg mb-2">Write a little note...</p>
              <p className="text-xs text-gray-500 mb-6">Leave sweet words for each other</p>
              <button
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-3 bg-white/10 text-white rounded-full text-sm font-bold uppercase tracking-wider spring-press flex items-center gap-2"
                  style={{ border: '1px solid rgba(255,255,255,0.12)' }}
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