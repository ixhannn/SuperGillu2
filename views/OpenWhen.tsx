import React, { useState, useEffect } from 'react';
import { Mail, Plus, X, Heart, Trash2, MailOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { ViewState, Envelope } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
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

interface OpenWhenProps {
  setView: (view: ViewState) => void;
}

const ENVELOPE_COLORS = [
  { bg: 'bg-red-100', text: 'text-red-600', bgOnly: 'bg-red-100' },
  { bg: 'bg-pink-100', text: 'text-pink-600', bgOnly: 'bg-pink-100' },
  { bg: 'bg-purple-100', text: 'text-purple-600', bgOnly: 'bg-purple-100' }, 
  { bg: 'bg-orange-100', text: 'text-orange-600', bgOnly: 'bg-orange-100' },
  { bg: 'bg-rose-100', text: 'text-rose-600', bgOnly: 'bg-rose-100' }
];

export const OpenWhen: React.FC<OpenWhenProps> = ({ setView }) => {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Form State
  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    const load = () => setEnvelopes(StorageService.getEnvelopes());
    load();
    const handleUpdate = () => load();
    storageEventTarget.addEventListener('storage-update', handleUpdate);
    return () => storageEventTarget.removeEventListener('storage-update', handleUpdate);
  }, []);

  const handleSave = () => {
    if (!label.trim() || !content.trim()) return;

    const colorObj = ENVELOPE_COLORS[Math.floor(Math.random() * ENVELOPE_COLORS.length)];

    const newEnvelope: Envelope = {
      id: generateId(),
      label: `Open when ${label}`,
      content: content,
      color: `${colorObj.bg} ${colorObj.text}`,
      isLocked: true
    };

    StorageService.saveEnvelope(newEnvelope);
    feedback.celebrate();
    setEnvelopes(prev => [...prev, newEnvelope]);
    setIsCreating(false);
    setLabel('');
    setContent('');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(id);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      StorageService.deleteEnvelope(deleteTarget);
      setEnvelopes(prev => prev.filter(e => e.id !== deleteTarget));
      if (readingId === deleteTarget) setReadingId(null);
      setDeleteTarget(null);
    }
  };

  const openEnvelope = (env: Envelope) => {
    setReadingId(env.id);
    if (env.isLocked) {
      const updated = { ...env, isLocked: false, openedAt: new Date().toISOString() };
      StorageService.saveEnvelope(updated);
      setEnvelopes(prev => prev.map(e => e.id === env.id ? updated : e));
    }
  };

  const currentLetter = envelopes.find(e => e.id === readingId);

  return (
    <div className="p-6 pt-8 pb-32 min-h-screen">
      <div className="flex justify-between items-center mb-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-serif font-bold text-gray-800">Open When...</h2>
          <p className="text-xs text-gray-500 mt-1">Letters for every moment</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-tulika-500 text-white p-3 rounded-full shadow-lg shadow-tulika-200 transition-transform"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Grid of Envelopes */}
      <motion.div className="grid grid-cols-2 gap-4" variants={staggerContainer} initial="hidden" animate="show">
        {envelopes.map((env) => (
          <motion.div
            key={env.id}
            variants={staggerItem}
            onClick={() => { feedback.tap(); openEnvelope(env); }}
            className={`aspect-[4/3] rounded-2xl relative p-4 flex flex-col items-center justify-center text-center shadow-sm border border-white/50 spring-press cursor-pointer ${
              env.isLocked ? 'bg-white' : 'bg-white/80'
            }`}
          >
            {/* Envelope Flap decoration */}
            <div className={`absolute top-0 left-0 right-0 h-1/2 rounded-t-2xl opacity-10 pointer-events-none ${env.color.split(' ')[0]}`}></div>
            
            <div className={`mb-3 p-3 rounded-full ${env.isLocked ? 'bg-gray-50' : env.color.split(' ')[0]}`}>
              {env.isLocked ? (
                <Mail size={24} className="text-gray-400" />
              ) : (
                <MailOpen size={24} className={env.color.split(' ')[1]} />
              )}
            </div>
            
            <span className="text-xs font-bold text-gray-600 leading-tight px-1">
              {env.label}
            </span>

            {/* Delete button (hidden unless long press or specific action in real app, simplified here) */}
            <button 
               onClick={(e) => handleDelete(env.id, e)}
               className="absolute top-2 right-2 text-gray-300"
            >
              <Trash2 size={14} />
            </button>
          </motion.div>
        ))}

        {envelopes.length === 0 && (
          <div className="col-span-2 flex flex-col items-center text-center py-16 border-2 border-dashed border-gray-200 rounded-3xl animate-fade-in bg-white/50">
            <div className="relative mb-5">
              <div className="absolute inset-0 bg-tulika-200/20 rounded-full blur-2xl animate-breathe-glow" />
              <div className="relative p-5 bg-tulika-50 rounded-full border border-tulika-100 shadow-sm">
                <Mail size={32} className="text-tulika-300" />
              </div>
            </div>
            <p className="font-serif text-gray-500 text-lg mb-1">Write your first letter</p>
            <p className="text-xs text-gray-400 mb-5">Letters for every moment</p>
            <button
              onClick={() => setIsCreating(true)}
              className="px-5 py-2.5 bg-tulika-500 text-white rounded-full text-sm font-bold shadow-lg shadow-tulika-200 spring-press"
            >
              Write a Letter
            </button>
          </div>
        )}
      </motion.div>

      <ConfirmModal
          isOpen={!!deleteTarget}
          title="Delete Letter"
          message="Are you sure you want to delete this letter?"
          confirmLabel="Delete"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
      />

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-pop-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-lg">Write a Letter</h3>
              <button onClick={() => setIsCreating(false)} aria-label="Close" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-tulika-500 focus-visible:rounded-full focus-visible:ring-offset-2"><X size={24} className="text-gray-400" /></button>
            </div>
            
            <div className="flex items-center gap-2 mb-4 bg-gray-50 p-3 rounded-xl">
              <span className="text-gray-400 text-sm font-medium whitespace-nowrap">Open when...</span>
              <input 
                type="text" 
                autoFocus
                placeholder="you miss me"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="bg-transparent w-full outline-none focus:outline-none text-gray-800 font-medium placeholder-gray-300"
              />
            </div>

            <textarea 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-48 bg-gray-50 p-4 rounded-xl text-base resize-none focus:outline-none mb-4 font-serif leading-relaxed text-gray-700"
              placeholder="Write your heart out..."
            />
            
            <button 
              onClick={handleSave}
              className="w-full bg-tulika-500 text-white py-3 rounded-xl font-semibold shadow-md shadow-tulika-200"
            >
              Seal Envelope
            </button>
          </div>
        </div>
      )}

      {/* Read Modal */}
      {readingId && currentLetter && (
        <div className="fixed inset-0 bg-tulika-50 z-50 flex flex-col animate-fade-in">
          <div className="flex justify-between items-center p-6 pb-2">
            <button onClick={() => setReadingId(null)} aria-label="Close letter" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-white rounded-full shadow-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-tulika-500 focus-visible:ring-offset-2">
              <X size={24} className="text-gray-600" />
            </button>
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
              {currentLetter.openedAt ? new Date(currentLetter.openedAt).toLocaleDateString() : 'Just now'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="bg-white min-h-[70vh] rounded-3xl p-8 shadow-sm border border-tulika-100 relative overflow-hidden animate-slide-up">
               {/* Paper texture/lines */}
               <div className="absolute top-0 left-0 right-0 h-8 bg-tulika-100/30"></div>
               
               <h2 className="font-bold text-xl text-gray-800 mb-8 border-b pb-4 border-gray-100 leading-snug">
                 {currentLetter.label}
               </h2>
               
               <div className="font-serif text-lg leading-relaxed text-gray-700 whitespace-pre-wrap">
                 {currentLetter.content}
               </div>

               <div className="mt-12 flex justify-center text-tulika-300">
                 <Heart fill="currentColor" size={24} />
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};