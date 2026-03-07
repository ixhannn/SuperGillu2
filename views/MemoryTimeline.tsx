
import React, { useEffect, useState } from 'react';
import { Trash2, Calendar, X, Clock, Loader2, Image as ImageIcon, PlayCircle } from 'lucide-react';
import { ViewState, Memory } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { useTulikaMedia } from '../hooks/useTulikaImage';

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

    const { src: mediaUrl, isLoading } = useTulikaMedia(mediaIdToLoad, mediaDataToLoad);

    const MoodEmoji = ({ mood }: { mood: string }) => {
        const map: Record<string, string> = { love: '😍', funny: '😂', party: '🥳', peace: '😌', cute: '🥺' };
        return <span>{map[mood] || '✨'}</span>;
    };

    return (
        <div 
            onClick={onClick}
            className="bg-white rounded-3xl p-4 shadow-sm border border-white overflow-hidden group transition-all hover:shadow-md animate-slide-up cursor-pointer active:scale-[0.98] relative opacity-0"
            style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl bg-gray-50 w-10 h-10 flex items-center justify-center rounded-full shadow-sm">
                <MoodEmoji mood={memory.mood} />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {new Date(memory.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric' })}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(memory.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(memory.id); }}
              className="p-3 -mr-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all relative z-20"
            >
              <Trash2 size={20} />
            </button>
          </div>

          <div className="rounded-2xl overflow-hidden mb-4 shadow-inner bg-gray-50 aspect-video relative flex items-center justify-center group-hover:scale-[1.01] transition-transform duration-500">
            {isLoading ? (
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="animate-spin text-tulika-300" size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-tulika-200">Opening Vault...</span>
                </div>
            ) : mediaUrl ? (
                isVideo ? (
                    // Show Thumbnail + Play Button
                    <div className="relative w-full h-full bg-black flex items-center justify-center">
                        <img src={mediaUrl} className="w-full h-full object-cover opacity-80" alt="Video Thumbnail" loading="lazy" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                            <div className="bg-white/20 backdrop-blur-md p-3 rounded-full group-hover:scale-110 transition-transform">
                                <PlayCircle size={32} className="text-white" fill="currentColor" />
                            </div>
                        </div>
                    </div>
                ) : (
                    // Standard Image
                    <img src={mediaUrl} alt="Memory" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                )
            ) : (
                <div className="text-gray-200 flex flex-col items-center gap-2">
                    <ImageIcon size={32} />
                    {(memory.imageId || memory.videoId) && <span className="text-[8px] font-bold uppercase opacity-50">Checking Vault...</span>}
                </div>
            )}
          </div>

          {memory.text && (
            <p className="text-gray-700 leading-relaxed font-serif text-lg px-1 pb-1 line-clamp-3">
              {memory.text}
            </p>
          )}
        </div>
    );
};

const MemoryDetailModal = ({ memory, onClose, onDelete }: { memory: Memory, onClose: () => void, onDelete: (id: string) => void }) => {
    // In detail view, we actually load the VIDEO ID
    const { src: mediaUrl, isLoading } = useTulikaMedia(memory.videoId || memory.imageId, memory.video || memory.image);
    const isVideo = !!memory.video || !!memory.videoId;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-[2rem] w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl relative animate-pop-in flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 p-4 flex justify-between items-center bg-white/90 backdrop-blur-md z-10 border-b border-gray-50">
                    <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">{new Date(memory.date).toLocaleDateString()}</span>
                    <button onClick={onClose} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"><X size={20} /></button>
                </div>
                <div className="p-6 pt-6">
                    {isLoading ? (
                        <div className="w-full aspect-video bg-gray-50 rounded-3xl mb-6 flex items-center justify-center">
                            <Loader2 size={32} className="animate-spin text-tulika-300" />
                            <span className="ml-2 text-sm text-gray-400 font-medium">Loading Media...</span>
                        </div>
                    ) : mediaUrl && (
                        isVideo ? (
                            <video src={mediaUrl} controls autoPlay className="w-full h-auto rounded-3xl mb-6 shadow-md bg-black" />
                        ) : (
                            <img src={mediaUrl} className="w-full h-auto rounded-3xl mb-6 shadow-md" alt="Memory" />
                        )
                    )}
                    <p className="text-gray-800 font-serif text-xl leading-relaxed whitespace-pre-wrap">{memory.text}</p>
                    <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between text-gray-400 text-sm">
                        <div className="flex items-center gap-2"><Clock size={16} /><span>{new Date(memory.date).toLocaleTimeString()}</span></div>
                        <button onClick={() => onDelete(memory.id)} className="flex items-center gap-2 text-red-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={16} /><span>Delete</span></button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const MemoryTimeline: React.FC<MemoryTimelineProps> = ({ setView }) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);

  useEffect(() => {
    const load = () => setMemories(StorageService.getMemories());
    load();
    storageEventTarget.addEventListener('storage-update', load);
    return () => storageEventTarget.removeEventListener('storage-update', load);
  }, []);

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this memory forever?')) {
        if (selectedMemory?.id === id) setSelectedMemory(null);
        await StorageService.deleteMemory(id);
    }
  };

  const grouped = memories.reduce((acc, m) => {
      const key = new Date(m.date).toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
  }, {} as Record<string, Memory[]>);

  const keys = Object.keys(grouped).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return (
    <div className="p-6 pt-8 pb-32 min-h-screen">
      <div className="flex items-center gap-2 mb-8 animate-slide-down">
          <Calendar className="text-tulika-500" />
          <h2 className="text-2xl font-serif font-bold text-gray-800">Our Journey</h2>
      </div>
      
      {memories.length === 0 ? (
        <div className="text-center text-gray-400 py-20 animate-fade-in delay-200">
          <Calendar size={48} className="mx-auto mb-2 opacity-20" />
          <p>Your journey is waiting to be written.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {keys.map((key, groupIdx) => (
            <div key={key} className="animate-slide-up" style={{ animationDelay: `${groupIdx * 100}ms` }}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 ml-1 sticky top-0 bg-tulika-50/90 backdrop-blur-sm py-2 z-10">{key}</h3>
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
    </div>
  );
};
