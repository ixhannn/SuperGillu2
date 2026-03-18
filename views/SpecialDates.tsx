import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Heart } from 'lucide-react';
import { ViewState, SpecialDate } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
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
      <div className="flex justify-between items-center mb-8 animate-fade-in">
        <h2 className="text-2xl font-serif font-bold text-gray-800">Special Dates</h2>
        <button 
          onClick={() => setShowAdd(!showAdd)}
          className="bg-tulika-100 text-tulika-600 p-2 rounded-full hover:bg-tulika-200 transition-colors"
        >
          <Plus size={24} />
        </button>
      </div>

      {showAdd && (
        <div className="bg-white p-4 rounded-3xl shadow-lg shadow-tulika-100 mb-6 animate-pop-in border border-tulika-100">
          <input 
            type="text" 
            placeholder="Title (e.g. Anniversary)"
            className="w-full mb-3 p-3 bg-gray-50 rounded-xl border-none focus:ring-1 focus:ring-tulika-300"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
          />
          <input 
            type="date" 
            className="w-full mb-4 p-3 bg-gray-50 rounded-xl border-none text-gray-600 focus:ring-1 focus:ring-tulika-300"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
          />
          <button 
            onClick={handleAdd}
            className="w-full bg-tulika-500 text-white py-3 rounded-xl font-semibold shadow-md shadow-tulika-200"
          >
            Save Date
          </button>
        </div>
      )}

      <div className="space-y-4">
        {dates.length === 0 && !showAdd && (
             <div className="text-center text-gray-400 py-10 animate-fade-in delay-200">
                <p>No important dates saved yet.</p>
             </div>
        )}
        {dates.map((item, index) => {
            const { count, label } = getDaysText(item.date);
            return (
              <div 
                key={item.id} 
                className="bg-white rounded-3xl p-5 shadow-sm border border-white flex items-center justify-between group animate-slide-up opacity-0 relative"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-400">
                    <Heart size={24} fill="currentColor" className="opacity-80" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{item.title}</h3>
                    <p className="text-xs text-gray-400">{new Date(item.date).toDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-2xl font-bold text-tulika-500">{count}</span>
                  <span className="text-[10px] uppercase font-bold text-gray-300">{label}</span>
                </div>
                <button 
                    onClick={() => handleDelete(item.id)}
                    className="absolute right-3 top-3 p-2 text-gray-300 hover:text-red-500 opacity-60 hover:opacity-100 transition-all"
                >
                    <Trash2 size={16} />
                </button>
              </div>
            );
        })}
      </div>

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
