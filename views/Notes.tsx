import React, { useState, useEffect } from 'react';
import { Plus, X, PenLine, Trash2, ArrowLeft } from 'lucide-react';
import { ViewState, Note } from '../types';
import { StorageService } from '../services/storage';
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
    <div className="p-6 pt-8 pb-32 min-h-screen">
      <div className="flex justify-between items-center mb-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('home')} className="p-2 -ml-2 text-gray-600 rounded-full hover:bg-gray-50 active:scale-95 transition-transform">
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-2xl font-serif font-bold text-gray-800">Love Notes</h2>
        </div>
        <button 
          onClick={() => setIsEditing(true)}
          className="bg-gray-900 text-white p-3 rounded-full shadow-lg hover:scale-110 transition-transform"
        >
          <Plus size={24} />
        </button>
      </div>

      {isEditing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-pop-in">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold">New Note</h3>
                    <button onClick={() => setIsEditing(false)}><X size={24} className="text-gray-400" /></button>
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

      <div className="grid grid-cols-2 gap-4">
        {notes.map((note, index) => (
          <div 
            key={note.id} 
            className={`${note.color} p-4 rounded-3xl shadow-sm min-h-[160px] flex flex-col justify-between relative group transform rotate-1 hover:rotate-0 transition-transform duration-300 animate-pop-in opacity-0`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <p className="font-serif text-gray-800 leading-snug whitespace-pre-wrap text-sm">
                {note.content}
            </p>
            <div className="flex justify-between items-end mt-4">
                <span className="text-[10px] text-gray-500 font-medium opacity-60">
                    {new Date(note.createdAt).toLocaleDateString()}
                </span>
                <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}
                    className="p-1.5 bg-white/50 rounded-full text-gray-500 hover:bg-white hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                    <Trash2 size={14} />
                </button>
            </div>
          </div>
        ))}
      </div>
      
      {notes.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-20 opacity-40 animate-fade-in delay-200">
              <PenLine size={48} className="mb-2" />
              <p>Write a little note...</p>
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