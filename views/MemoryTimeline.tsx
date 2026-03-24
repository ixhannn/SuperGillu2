
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Trash2, Calendar, X, Clock, Loader2, Image as ImageIcon, PlayCircle, Plus } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { ViewState, Memory } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { feedback } from '../utils/feedback';
import { useTulikaMedia } from '../hooks/useTulikaImage';
import { Skeleton } from '../components/Skeleton';
import { PullToRefresh } from '../components/PullToRefresh';
import { ConfirmModal } from '../components/ConfirmModal';
import { motion, useScroll, useTransform } from 'framer-motion';

interface MemoryTimelineProps {
  setView: (view: ViewState) => void;
}

const MemoryCard: React.FC<{ memory: Memory; index: number; onClick: () => void; onDelete: (id: string) => void }> = ({ memory, index, onClick, onDelete }) => {
    // OPTIMIZATION: 
    // If it's a video, 'memory.image' holds the thumbnail. We load that instead of the video ID.
    // This makes scrolling list extremely fast.
    const isVideo = !!memory.video || !!memory.videoId;
    const mediaIdToLoad = isVideo ? memory.imageId : (memory.imageId || memory.videoId);
    const mediaDataToLoad = isVideo ? memory.image : (memory.image || memory.video);

    const { src: mediaUrl, isLoading } = useTulikaMedia(mediaIdToLoad, mediaDataToLoad, memory.storagePath);

    const MoodEmoji = ({ mood }: { mood: string }) => {
        const map: Record<string, string> = { love: '😍', funny: '😂', party: '🥳', peace: '😌', cute: '🥺' };
        return <span>{map[mood] || '✨'}</span>;
    };

    return (
        <div
            onClick={() => { feedback.light(); onClick(); }}
            className="glass-card p-3 overflow-hidden group transition-all animate-slide-up cursor-pointer spring-press relative opacity-0"
            style={{ animationDelay: `${index * 80}ms` }}
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2.5">
              <span className="text-xl bg-tulika-500/15 w-9 h-9 flex items-center justify-center rounded-full">
                <MoodEmoji mood={memory.mood} />
              </span>
              <div>
                <p className="text-[13px] font-bold text-gray-800 leading-tight">
                  {new Date(memory.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
                <p className="text-[10px] text-gray-500 font-medium">
                  {new Date(memory.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(memory.id); }}
              className="p-2 -mr-1 text-gray-600 rounded-full transition-all relative z-20"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="rounded-[1.25rem] overflow-hidden mb-3 shadow-inner bg-gray-50 aspect-square relative flex items-center justify-center transition-transform duration-500">
            {isLoading ? (
                <Skeleton type="image" className="absolute inset-0 w-full h-full rounded-none" />
            ) : mediaUrl ? (
                isVideo ? (
                    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
                        <motion.img 
                            initial={{ y: -40, scale: 1.15 }}
                            whileInView={{ y: 0, scale: 1 }}
                            viewport={{ once: false, margin: "100px 0px" }}
                            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                            src={mediaUrl} 
                            className="w-full h-full object-cover opacity-90" 
                            alt="Video Thumbnail" 
                            loading="lazy" 
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors">
                            <div className="bg-white/30 backdrop-blur-md p-2.5 rounded-full border border-white/40 shadow-xl transition-transform">
                                <PlayCircle size={28} className="text-white" fill="currentColor" />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="w-full h-full overflow-hidden">
                        <motion.img 
                            initial={{ y: -40, scale: 1.15 }}
                            whileInView={{ y: 0, scale: 1 }}
                            viewport={{ once: false, margin: "100px 0px" }}
                            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                            src={mediaUrl} 
                            alt="Memory" 
                            className="w-full h-full object-cover transition-transform duration-700"
                            loading="lazy" 
                        />
                    </div>
                )
            ) : (
                <div className="text-gray-600 flex flex-col items-center gap-2">
                    <ImageIcon size={28} className="opacity-40" />
                </div>
            )}
          </div>

          {memory.text && (
            <p className="text-gray-700 leading-snug font-serif text-base px-2 pb-1 line-clamp-2">
              {memory.text}
            </p>
          )}
        </div>
    );
};


const MemoryDetailModal = ({ memory, onClose, onDelete }: { memory: Memory, onClose: () => void, onDelete: (id: string) => void }) => {
    // In detail view, we actually load the VIDEO ID
    const { src: mediaUrl, isLoading } = useTulikaMedia(memory.videoId || memory.imageId, memory.video || memory.image, memory.videoStoragePath || memory.storagePath);
    const isVideo = !!memory.video || !!memory.videoId;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div className="glass-card-hero w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl relative animate-pop-in flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 p-4 flex justify-between items-center backdrop-blur-md z-10 border-b border-white/60" style={{ background: 'rgba(255,255,255,0.5)' }}>
                    <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">{new Date(memory.date).toLocaleDateString()}</span>
                    <button onClick={onClose} aria-label="Close" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-gray-100 rounded-full text-gray-500 transition-colors cursor-pointer hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-tulika-500 focus-visible:ring-offset-2"><X size={20} /></button>
                </div>
                <div className="p-6 pt-6">
                    {isLoading ? (
                        <div className="w-full h-64 mb-6 rounded-3xl overflow-hidden relative">
                            <Skeleton type="image" className="absolute inset-0 w-full h-full rounded-none" />
                        </div>
                    ) : mediaUrl && (
                        isVideo ? (
                            <video src={mediaUrl} controls autoPlay className="w-full h-auto rounded-3xl mb-6 shadow-md bg-black" />
                        ) : (
                            <img src={mediaUrl} className="w-full h-auto rounded-3xl mb-6 shadow-md" alt="Memory" />
                        )
                    )}
                    <p className="text-gray-800 font-serif text-xl leading-relaxed whitespace-pre-wrap">{memory.text}</p>
                    <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between text-gray-500 text-sm">
                        <div className="flex items-center gap-2"><Clock size={16} /><span>{new Date(memory.date).toLocaleTimeString()}</span></div>
                        <button onClick={() => onDelete(memory.id)} className="flex items-center gap-2 text-red-500 px-3 py-1.5 rounded-lg transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"><Trash2 size={16} /><span>Delete</span></button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export const MemoryTimeline: React.FC<MemoryTimelineProps> = ({ setView }) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setMemories(StorageService.getMemories());
    load();
    storageEventTarget.addEventListener('storage-update', load);
    return () => storageEventTarget.removeEventListener('storage-update', load);
  }, []);

  const handleRefresh = async () => {
      // simulate network wait for haptics and aesthetic
      await new Promise(r => setTimeout(r, 1200));
      setMemories(StorageService.getMemories());
  };

  const handleDelete = async (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (deleteTarget) {
        if (selectedMemory?.id === deleteTarget) setSelectedMemory(null);
        await StorageService.deleteMemory(deleteTarget);
        setDeleteTarget(null);
    }
  };

  const grouped = memories.reduce((acc, m) => {
      const key = new Date(m.date).toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
  }, {} as Record<string, Memory[]>);

  // Sort by the actual date of the first memory in each group (reliable across locales)
  const keys = Object.keys(grouped).sort((a, b) => {
    const dateA = new Date(grouped[a][0].date).getTime();
    const dateB = new Date(grouped[b][0].date).getTime();
    return dateB - dateA;
  });

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="p-6 pt-8 pb-32 min-h-screen relative">
        <ViewHeader
            title="Our Journey"
            onBack={() => setView('home')}
            variant="simple"
        />
      
      {memories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-tulika-200/40 rounded-full blur-2xl animate-breathe-glow" />
            <div className="relative p-6 glass-card rounded-full text-tulika-400">
              <Calendar size={40} />
            </div>
          </div>
          <p className="font-serif text-gray-800 font-bold text-center text-lg mb-2">Your journey is waiting to be written</p>
          <p className="text-xs text-gray-500 mb-6">Capture your first memory together</p>
          <button
            onClick={() => setView('add-memory')}
            className="px-6 py-3 bg-tulika-500 text-white rounded-full text-sm font-bold uppercase tracking-wider shadow-lg shadow-tulika-500/20 spring-press flex items-center gap-2"
          >
            <Plus size={18} /> Add Memory
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {keys.map((key, groupIdx) => (
            <div key={key} className="animate-slide-up relative" style={{ animationDelay: `${groupIdx * 100}ms` }}>
              <div className="sticky top-24 z-10 flex justify-center mb-6 pointer-events-none">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-tulika-600 px-4 py-2 glass-card rounded-full shadow-sm" style={{ backdropFilter: 'blur(16px)' }}>
                  {key}
                </h3>
              </div>

              <div className="space-y-4">
                {grouped[key].map((m, i) => (
                  <MemoryCard 
                    key={m.id} 
                    index={i} 
                    memory={m} 
                    onClick={() => setSelectedMemory(m)} 
                    onDelete={handleDelete} 
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedMemory && (
        <MemoryDetailModal 
            memory={selectedMemory} 
            onClose={() => setSelectedMemory(null)} 
            onDelete={handleDelete} 
        />
      )}

      <ConfirmModal
          isOpen={!!deleteTarget}
          title="Delete Memory"
          message="Delete this memory forever? This can't be undone."
          confirmLabel="Delete Forever"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
      />
      </div>
    </PullToRefresh>
  );
};
