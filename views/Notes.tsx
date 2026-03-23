import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, X, PenLine, Trash2, ArrowLeft } from 'lucide-react';
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

const COLORS = ['bg-yellow-100', 'bg-pink-100', 'bg-blue-100', 'bg-green-100', 'bg-purple-100'];

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
    <div className="px-5 pt-10 pb-32 min-h-screen">
      <div className="flex justify-between items-center mb-8 animate-fade-in">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('home')} aria-label="Go back" className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-warmgray-500 rounded-full spring-press">
            <ArrowLeft size={22} />
          </button>
          <h2 className="text-headline font-serif text-gray-900">Love Notes</h2>
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="bg-warmgray-900 text-white p-3 rounded-2xl shadow-elevated spring-press"
        >
          <Plus size={22} />
        </button>
      </div>

      {isEditing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-pop-in">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold">New Note</h3>
                    <button onClick={() => setIsEditing(false)} aria-label="Close" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-tulika-500 focus-visible:rounded-full focus-visible:ring-offset-2"><X size={24} className="text-gray-400" /></button>
                </div>
                <textarea 
                    autoFocus
                    value={currentNote}
                    onChange={(e) => setCurrentNote(e.target.value)}
                    className="w-full h-40 bg-yellow-50 p-4 rounded-xl text-lg resize-none focus:outline-none mb-4 font-serif leading-relaxed"
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
            className={`${note.color} p-4 rounded-3xl shadow-sm min-h-[160px] flex flex-col justify-between relative group transform rotate-1 spring-press ${longPressId === note.id ? 'scale-[1.02] shadow-md ring-2 ring-red-200' : ''} transition-all`}
            onPointerDown={() => handlePointerDown(note.id)}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onClick={() => { if (longPressId && longPressId !== note.id) setLongPressId(null); }}
          >
            <p className="font-serif text-gray-800 leading-snug whitespace-pre-wrap text-sm">
                {note.content}
            </p>
            <div className="flex justify-between items-end mt-4">
                <span className="text-[10px] text-gray-500 font-medium opacity-60">
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
                  <div className="absolute inset-0 bg-yellow-200/30 rounded-full blur-2xl animate-breathe-glow" />
                  <div className="relative p-6 bg-yellow-50 rounded-full border border-yellow-100 shadow-sm">
                      <PenLine size={36} className="text-yellow-400/60" />
                  </div>
              </div>
              <p className="font-serif text-gray-500 text-lg mb-2">Write a little note...</p>
              <p className="text-xs text-gray-400 mb-6">Leave sweet words for each other</p>
              <button
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-3 bg-warmgray-900 text-white rounded-full text-sm font-bold uppercase tracking-wider shadow-lg spring-press flex items-center gap-2"
              >
                  <Plus size={18} /> Write a Note
              </button>
          </div>
      )}

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