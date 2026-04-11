import React, { useState, useEffect } from 'react';
import { Mail, Plus, X, Heart, Trash2, MailOpen } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
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
  { bg: 'bg-red-500/12', text: 'text-red-600', bgOnly: 'bg-red-500/12' },
  { bg: 'bg-pink-500/12', text: 'text-pink-600', bgOnly: 'bg-pink-500/12' },
  { bg: 'bg-purple-500/12', text: 'text-purple-600', bgOnly: 'bg-purple-500/12' },
  { bg: 'bg-orange-500/12', text: 'text-orange-600', bgOnly: 'bg-orange-500/12' },
  { bg: 'bg-rose-500/12', text: 'text-rose-600', bgOnly: 'bg-rose-500/12' }
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
    <div className="pb-32 min-h-screen">
      <ViewHeader
        title="Open When..."
        subtitle="Letters for every moment"
        onBack={() => setView('home')}
        variant="simple"
        rightSlot={
          <button
            onClick={() => setIsCreating(true)}
            className="bg-lior-500 text-white p-3 rounded-full transition-transform"
          >
            <Plus size={24} />
          </button>
        }
      />

      <div className="px-6 pt-4">

      {/* Grid of Envelopes */}
      <motion.div className="grid grid-cols-2 gap-4" variants={staggerContainer} initial="hidden" animate="show">
        {envelopes.map((env) => (
          <motion.div
            key={env.id}
            variants={staggerItem}
            onClick={() => { feedback.tap(); openEnvelope(env); }}
            className={`aspect-[4/3] rounded-[2rem] relative p-4 flex flex-col items-center justify-center text-center spring-press cursor-pointer glass-card border border-white/40 shadow-sm ${
              env.isLocked ? 'opacity-95' : 'scale-[1.02] shadow-md ring-2 ring-lior-200'
            }`}
          >
            {/* Envelope Flap decoration */}
            <div className={`absolute top-0 left-0 right-0 h-1/2 rounded-t-[2rem] opacity-20 pointer-events-none ${env.color.split(' ')[0]}`}></div>
            
            <div className={`mb-3 p-3 rounded-full ${env.isLocked ? '' : env.color.split(' ')[0]}`} style={env.isLocked ? { background: 'rgba(var(--theme-particle-2-rgb),0.10)' } : {}}>
              {env.isLocked ? (
                <Mail size={24} style={{ color: 'var(--color-text-secondary)' }} />
              ) : (
                <MailOpen size={24} className={env.color.split(' ')[1]} />
              )}
            </div>

            <span className="text-xs font-bold leading-tight px-1" style={{ color: 'var(--color-text-primary)' }}>
              {env.label}
            </span>

            {/* Delete button */}
            <button
               onClick={(e) => handleDelete(env.id, e)}
               className="absolute top-2 right-2"
               style={{ color: 'var(--color-text-secondary)' }}
            >
              <Trash2 size={14} />
            </button>
          </motion.div>
        ))}

        {envelopes.length === 0 && (
          <div className="col-span-2 flex flex-col items-center text-center py-16 rounded-[2.5rem] animate-fade-in glass-card" style={{ border: '2px dashed rgba(var(--theme-particle-2-rgb),0.25)' }}>
            <div className="relative mb-5">
              <div className="absolute inset-0 bg-lior-200/40 rounded-full blur-2xl animate-breathe-glow" />
              <div className="relative p-5 glass-card rounded-full">
                <Mail size={32} className="text-lior-500" />
              </div>
            </div>
            <p className="font-serif font-bold text-lg mb-1" style={{ color: 'var(--color-text-primary)' }}>Write your first letter</p>
            <p className="text-xs font-medium mb-5" style={{ color: 'var(--color-text-secondary)' }}>Letters for every moment</p>
            <button
              onClick={() => setIsCreating(true)}
              className="px-5 py-2.5 bg-lior-500 text-white rounded-full text-sm font-bold spring-press"
            >
              Write a Letter
            </button>
          </div>
        )}
      </motion.div>
      </div>

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
        <div className="fixed inset-0 backdrop-blur-3xl z-50 flex items-center justify-center p-6 animate-fade-in" style={{ background: 'color-mix(in srgb, var(--color-surface) 90%, transparent)' }}>
          <div className="w-full max-w-sm p-6 animate-pop-in glass-card-hero">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-lg border-b-2 border-lior-200 pb-1" style={{ color: 'var(--color-text-primary)' }}>Write a Letter</h3>
              <button onClick={() => setIsCreating(false)} aria-label="Close" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-lior-500 focus-visible:rounded-full focus-visible:ring-offset-2" style={{ color: 'var(--color-text-secondary)' }}><X size={24} /></button>
            </div>

            <div className="flex items-center gap-2 mb-4 p-3 rounded-xl" style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)' }}>
              <span className="text-sm font-medium whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>Open when...</span>
              <input
                type="text"
                autoFocus
                placeholder="you miss me"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="bg-transparent w-full outline-none focus:outline-none font-medium"
                style={{ color: 'var(--color-text-primary)' }}
              />
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-48 p-4 rounded-2xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-lior-500/30 mb-4 font-serif leading-relaxed"
              placeholder="Write your heart out..."
              style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)', color: 'var(--color-text-primary)' }}
            />

            <button
              onClick={handleSave}
              className="w-full text-white py-3 rounded-xl font-semibold"
              style={{ background: 'var(--theme-nav-center-bg-active)' }}
            >
              Seal Envelope
            </button>
          </div>
        </div>
      )}

      {/* Read Modal */}
      {readingId && currentLetter && (
        <div className="fixed inset-0 z-50 flex flex-col animate-fade-in backdrop-blur-3xl" style={{ background: 'color-mix(in srgb, var(--color-surface) 95%, transparent)' }}>
          <div className="flex justify-between items-center p-6 pb-2">
            <button onClick={() => setReadingId(null)} aria-label="Close letter" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center glass-card border border-white/40 shadow-sm rounded-full cursor-pointer focus-visible:ring-2 focus-visible:ring-lior-500 focus-visible:ring-offset-2" style={{ color: 'var(--color-text-secondary)' }}>
              <X size={24} />
            </button>
            <span className="text-xs font-bold uppercase tracking-widest glass-card px-3 py-1 rounded-full border border-white/40 shadow-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {currentLetter.openedAt ? new Date(currentLetter.openedAt).toLocaleDateString() : 'Just now'}
            </span>
          </div>

          <div data-lenis-prevent className="lenis-inner flex-1 overflow-y-auto p-6">
            <div className="min-h-[70vh] p-8 relative overflow-hidden animate-slide-up glass-card-hero">
               {/* Paper texture/lines */}
               <div className="absolute top-0 left-0 right-0 h-8 bg-lior-100"></div>

               <h2 className="font-bold text-2xl mb-8 border-b-2 pb-4 border-lior-200 leading-snug font-serif" style={{ color: 'var(--color-text-primary)' }}>
                 {currentLetter.label}
               </h2>

               <div className="font-serif text-lg leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>
                 {currentLetter.content}
               </div>

               <div className="mt-12 flex justify-center text-lior-400">
                 <Heart fill="currentColor" size={24} />
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};