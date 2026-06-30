import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Heart, Calendar } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { ViewState, SpecialDate } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { useThrottledReload } from '../hooks/useThrottledReload';
import { feedback } from '../utils/feedback';
import { toast } from '../utils/toast';
import { calendarDayDifference, dateInputValueToStoredDate, daysUntilDate, formatStoredDate, parseStoredDateOnly } from '../shared/dateOnly.js';

const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } }
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } }
};
import { ConfirmModal } from '../components/ConfirmModal';
import { listRemoveExit } from '../utils/motion';
import { generateId } from '../utils/ids';
import { useTapOrigin } from '../hooks/useTapOrigin';

interface SpecialDatesProps {
  setView: (view: ViewState) => void;
}

export const SpecialDates: React.FC<SpecialDatesProps> = ({ setView }) => {
  const [dates, setDates] = useState<SpecialDate[]>(() => StorageService.getSpecialDates());
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  // Dates hidden optimistically while their undo toast is open. The real
  // delete only happens in the toast's onExpire (deferred commit).
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  // Grow the add-date panel OUT OF the header "+" button that opened it instead
  // of popping from its own centre — matches the route/dialog open feel.
  const { ref: addPanelRef, origin: addPanelOrigin } = useTapOrigin<HTMLDivElement>(showAdd);

  const reloadDates = useThrottledReload(() => setDates(StorageService.getSpecialDates()));
  useEffect(() => {
    const onStorage = (event: Event) => {
      const table = (event as CustomEvent).detail?.table;
      if (table && table !== 'dates' && table !== 'init') return;
      reloadDates();
    };
    storageEventTarget.addEventListener('storage-update', onStorage);
    return () => storageEventTarget.removeEventListener('storage-update', onStorage);
  }, [reloadDates]);

  // Leaving the view commits any pending deferred delete right away.
  useEffect(() => () => toast.hide(), []);

  const handleAdd = () => {
    if (!newTitle || !newDate) return;
    const item: SpecialDate = {
      id: generateId(),
      title: newTitle,
      date: dateInputValueToStoredDate(newDate),
      type: 'other'
    };
    StorageService.saveSpecialDate(item);
    feedback.celebrate();
    setDates(prev => [...prev, item]);
    setNewTitle('');
    setNewDate('');
    setShowAdd(false);
  };

  const isDeleting = (id: string) => pendingDeleteIds.has(id);

  const clearPendingDelete = (id: string) => setPendingDeleteIds(prev => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });

  const handleDelete = (id: string) => {
    // Guard: rapid swipes can't queue multiple deletes of the same item.
    if (isDeleting(id)) return;
    setDeleteTarget(id);
  };

  const confirmDelete = () => {
    const id = deleteTarget;
    if (!id) return;
    setDeleteTarget(null);
    const item = dates.find(d => d.id === id);
    if (!item || isDeleting(id)) return;
    setPendingDeleteIds(prev => new Set([...prev, id]));
    toast.showUndo(`Deleted "${item.title}"`, {
      onUndo: () => clearPendingDelete(id),
      onExpire: () => {
        StorageService.deleteSpecialDate(id)
          .then(() => {
            clearPendingDelete(id);
            setDates(StorageService.getSpecialDates());
          })
          .catch(() => {
            clearPendingDelete(id);
            toast.show("Couldn't delete — it's back", 'error');
          });
      },
    });
  };

  const getDaysText = (dateStr: string) => {
    const targetDate = parseStoredDateOnly(dateStr);
    const today = new Date();
    if (!targetDate) return { count: 0, label: 'days' };
    
    const days = calendarDayDifference(targetDate, today);
    if (days >= 0) {
        const diff = daysUntilDate(targetDate, today);
        return { count: diff, label: 'days to go' };
    } else {
        const diff = Math.abs(days);
        return { count: diff, label: 'days since' };
    }
  };

  const visibleDates = dates.filter(d => !isDeleting(d.id));

  return (
    <div className="p-6 pt-8 pb-32 min-h-screen">
      <ViewHeader
        title="Special Dates"
        onBack={() => setView('home')}
        variant="simple"
        rightSlot={
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="bg-lior-500/15 text-lior-400 p-2 rounded-full transition-colors"
          >
            <Plus size={24} />
          </button>
        }
      />

      {showAdd && (
        <motion.div
          ref={addPanelRef}
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 30, stiffness: 380, mass: 0.8 }}
          style={{ transformOrigin: addPanelOrigin }}
          className="p-4 rounded-[2rem] shadow-sm mb-6 glass-card"
        >
          <input
            type="text"
            placeholder="Title (e.g. Anniversary)"
            className="w-full mb-3 p-3 rounded-xl font-serif focus:ring-2 focus:ring-lior-500/50 shadow-inner"
            style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)', color: 'var(--color-text-primary)' }}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
          />
          <input
            type="date"
            className="w-full mb-4 p-3 rounded-xl font-serif focus:ring-2 focus:ring-lior-500/50 shadow-inner"
            style={{ background: 'rgba(var(--theme-particle-2-rgb),0.08)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.15)', color: 'var(--color-text-primary)' }}
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
          />
          <button
            onClick={handleAdd}
            className="w-full text-white py-3 rounded-xl font-semibold shadow-md shadow-lior-500/20"
            style={{ background: 'var(--theme-nav-center-bg-active)' }}
          >
            Save Date
          </button>
        </motion.div>
      )}

      <motion.div className="space-y-4" variants={staggerContainer} initial="hidden" animate="show">
        {visibleDates.length === 0 && !showAdd && (
             <div className="flex flex-col items-center text-center py-16 animate-fade-in">
                <div className="relative mb-5">
                    <div className="absolute inset-0 bg-red-400/20 rounded-full blur-2xl animate-breathe-glow" />
                    <div className="relative p-5 glass-card rounded-full text-red-500/80">
                        <Calendar size={32} />
                    </div>
                </div>
                <p className="font-serif font-bold text-lg mb-1" style={{ color: 'var(--color-text-primary)' }}>No important dates saved yet</p>
                <p className="text-xs mb-5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Mark the moments that matter</p>
                <button
                    onClick={() => setShowAdd(true)}
                    className="px-5 py-2.5 bg-lior-500 text-white rounded-full text-sm font-bold shadow-lg shadow-lior-500/20 spring-press flex items-center gap-2"
                >
                    <Plus size={16} /> Add a Date
                </button>
             </div>
        )}
        <AnimatePresence mode="popLayout" initial={false}>
        {visibleDates.map((item, index) => {
            const { count, label } = getDaysText(item.date);
            return (
              <motion.div
                key={item.id}
                layout
                variants={staggerItem}
                exit={listRemoveExit}
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
                      feedback.tap(); // light "armed" tick; the destructive confirm fires on commit
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
                      <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{item.title}</h3>
                      <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{formatStoredDate(item.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-2xl font-bold text-lior-500">{count}</span>
                    <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
                  </div>
                </motion.div>
              </motion.div>
            );
        })}
        </AnimatePresence>
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
