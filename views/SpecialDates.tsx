import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Heart, Calendar } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { motion } from 'framer-motion';
import { ViewState, SpecialDate } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { feedback } from '../utils/feedback';

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } }
};

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
};
import { differenceInDays, isFuture } from 'date-fns';
import { ConfirmModal } from '../components/ConfirmModal';
import { generateId } from '../utils/ids';

interface SpecialDatesProps {
  setView: (view: ViewState) => void;
}

export const SpecialDates: React.FC<SpecialDatesProps> = ({ setView }) => {
  const [dates, setDates] = useState<SpecialDate[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setDates(StorageService.getSpecialDates());
    load();
    const handleUpdate = () => load();
    storageEventTarget.addEventListener('storage-update', handleUpdate);
    return () => storageEventTarget.removeEventListener('storage-update', handleUpdate);
  }, []);

  const handleAdd = () => {
    if (!newTitle || !newDate) return;
    const item: SpecialDate = {
      id: generateId(),
      title: newTitle,
      date: new Date(newDate).toISOString(),
      type: 'other'
    };
    StorageService.saveSpecialDate(item);
    feedback.celebrate();
    setDates(prev => [...prev, item]);
    setNewTitle('');
    setNewDate('');
    setShowAdd(false);
  };

  const handleDelete = (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
        StorageService.deleteSpecialDate(deleteTarget);
        setDates(prev => prev.filter(d => d.id !== deleteTarget));
        setDeleteTarget(null);
    }
  };

  const getDaysText = (dateStr: string) => {
    const targetDate = new Date(dateStr);
    const today = new Date();
    
    if (isFuture(targetDate)) {
        const diff = differenceInDays(targetDate, today);
        return { count: diff, label: 'days to go' };
    } else {
        const diff = differenceInDays(today, targetDate);
        return { count: diff, label: 'days since' };
    }
  };

  return (
    <div className="p-6 pt-8 pb-32 min-h-screen">
      <ViewHeader
        title="Special Dates"
        onBack={() => setView('home')}
        variant="simple"
        rightSlot={
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="bg-tulika-500/15 text-tulika-400 p-2 rounded-full transition-colors"
          >
            <Plus size={24} />
          </button>
        }
      />

      {showAdd && (
        <div className="p-4 rounded-[2rem] shadow-sm mb-6 animate-pop-in glass-card">
          <input 
            type="text" 
            placeholder="Title (e.g. Anniversary)"
            className="w-full mb-3 p-3 bg-white rounded-xl border border-gray-100 font-serif text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-tulika-500/50 shadow-inner"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
          />
          <input 
            type="date" 
            className="w-full mb-4 p-3 bg-white rounded-xl border border-gray-100 font-serif text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-tulika-500/50 shadow-inner"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
          />
          <button 
            onClick={handleAdd}
            className="w-full bg-tulika-500 text-white py-3 rounded-xl font-semibold shadow-md shadow-tulika-500/20"
          >
            Save Date
          </button>
        </div>
      )}

      <motion.div className="space-y-4" variants={staggerContainer} initial="hidden" animate="show">
        {dates.length === 0 && !showAdd && (
             <div className="flex flex-col items-center text-center py-16 animate-fade-in">
                <div className="relative mb-5">
                    <div className="absolute inset-0 bg-red-400/20 rounded-full blur-2xl animate-breathe-glow" />
                    <div className="relative p-5 glass-card rounded-full text-red-500/80">
                        <Calendar size={32} />
                    </div>
                </div>
                <p className="font-serif text-gray-800 font-bold text-lg mb-1">No important dates saved yet</p>
                <p className="text-xs text-gray-500 mb-5 font-medium">Mark the moments that matter</p>
                <button
                    onClick={() => setShowAdd(true)}
                    className="px-5 py-2.5 bg-tulika-500 text-white rounded-full text-sm font-bold shadow-lg shadow-tulika-500/20 spring-press flex items-center gap-2"
                >
                    <Plus size={16} /> Add a Date
                </button>
             </div>
        )}
        {dates.map((item, index) => {
            const { count, label } = getDaysText(item.date);
            return (
              <motion.div
                key={item.id}
                variants={staggerItem}
                className="relative overflow-hidden rounded-3xl"
              >
                {/* Delete zone behind card */}
                <div className="absolute inset-0 bg-red-500 rounded-3xl flex items-center justify-end pr-6">
                  <Trash2 size={22} className="text-white" />
                </div>
                {/* Swipeable card */}
                <motion.div
                  drag="x"
                  dragConstraints={{ left: -120, right: 0 }}
                  dragElastic={0.1}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -80) {
                      feedback.error();
                      handleDelete(item.id);
                    }
                  }}
                  className="rounded-[2rem] p-5 flex items-center justify-between relative spring-press cursor-grab active:cursor-grabbing glass-card"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center text-red-400">
                      <Heart size={24} fill="currentColor" className="opacity-80" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">{item.title}</h3>
                      <p className="text-xs text-gray-500 font-medium">{new Date(item.date).toDateString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-2xl font-bold text-tulika-500">{count}</span>
                    <span className="text-[10px] uppercase font-bold text-gray-500">{label}</span>
                  </div>
                </motion.div>
              </motion.div>
            );
        })}
      </motion.div>

      <ConfirmModal
          isOpen={!!deleteTarget}
          title="Remove Date"
          message="Are you sure you want to remove this special date?"
          confirmLabel="Remove"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
