
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Memory, Note, UserStatus, PetStats } from '../types';
import { StorageService } from '../services/storage';
import { syncEventTarget, SyncService } from '../services/sync';
import { PetAIService } from '../services/pet';
import { Heart, Utensils, Settings, X, Crown, MessageCircle, Zap, Bell, Hand, Sparkles } from 'lucide-react';

interface CouplePetProps {
    memories: Memory[];
    notes: Note[];
    status: UserStatus;
    partnerName: string;
}

const PET_TYPES = [
    { id: 'bear', emoji: '🧸', label: 'Teddy' },
    { id: 'dog', emoji: '🐶', label: 'Puppy' },
    { id: 'cat', emoji: '🐱', label: 'Kitty' },
    { id: 'bunny', emoji: '🐰', label: 'Bunny' }
];

export const CouplePet: React.FC<CouplePetProps> = ({ memories, notes, status, partnerName }) => {
    const [stats, setStats] = useState<PetStats>(StorageService.getPetStats());
    const [action, setAction] = useState<'idle' | 'petting' | 'feeding' | 'nudge' | 'sleeping'>('idle');
    const [dialogue, setDialogue] = useState("Checking in on you... ✨");
    const [isAILoading, setIsAILoading] = useState(false);
    const [isFlashback, setIsFlashback] = useState(false);
    const [clickHearts, setClickHearts] = useState<{id: number, x: number, y: number}[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [editName, setEditName] = useState(stats.name);
    const [editType, setEditType] = useState(stats.type);
    
    const nudgeTimeoutRef = useRef<any>(null);

    // Evolution Stats
    const xp = (memories.length * 15) + (notes.length * 8);
    let level = Math.floor(xp / 100) + 1;
    let stage = level > 5 ? 'Guardian' : level > 3 ? 'Adult' : level > 1 ? 'Child' : 'Baby';

    const refreshAI = useCallback(async () => {
        if (isAILoading) return;
        setIsAILoading(true);
        const profile = StorageService.getCoupleProfile();
        const res = await PetAIService.generateDialogue(stats, profile, memories.slice(0, 10), notes.slice(0, 10));
        setDialogue(res.text);
        setIsFlashback(res.isFlashback);
        setIsAILoading(false);
    }, [stats, memories, notes, isAILoading]);

    useEffect(() => {
        const stored = StorageService.getPetStats();
        setStats(stored);
        setEditName(stored.name);
        setEditType(stored.type);
        refreshAI();
    }, []);

    // Signal Listeners (Feature 6 & 7)
    useEffect(() => {
        const handleSignal = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            
            if (detail.signalType === 'PET_ACTION') {
                const { actionType, partner } = detail.payload;
                setDialogue(`${partner} just ${actionType === 'feed' ? 'gave me a treat' : 'petted me'}! 🥰`);
                if (actionType === 'pet') {
                    setAction('petting');
                    setTimeout(() => setAction('idle'), 1000);
                }
            } else if (detail.signalType === 'PET_NUDGE') {
                // Feature 6: Partner nudged us!
                const { partner } = detail.payload;
                setDialogue(`${partner} is thinking of you! *Nudge nudge* 🐾`);
                setAction('nudge');
                if (navigator.vibrate) navigator.vibrate([100, 30, 100, 30, 100]);
                setTimeout(() => setAction('idle'), 2000);
            } else if (detail.signalType === 'PET_HUNGER_ALERT') {
                // Feature 7: Partner's app detected pet is starving
                setDialogue(`I'm so hungry... someone please feed me! 🍩`);
            }
        };
        syncEventTarget.addEventListener('signal-received', handleSignal);
        return () => syncEventTarget.removeEventListener('signal-received', handleSignal);
    }, []);

    const handlePet = (e: React.MouseEvent) => {
        if (status.state === 'sleeping') return;
        setAction('petting');
        
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const newHeart = {
            id: Date.now(),
            x: e.clientX - rect.left - 10 + (Math.random() * 20),
            y: e.clientY - rect.top - 10 + (Math.random() * 20)
        };
        setClickHearts(prev => [...prev, newHeart]);
        setTimeout(() => setClickHearts(prev => prev.filter(h => h.id !== newHeart.id)), 1000);

        const newStats = { ...stats, lastPetted: new Date().toISOString(), happiness: Math.min(100, stats.happiness + 5) };
        setStats(newStats);
        StorageService.savePetStats(newStats);
        
        SyncService.sendSignal('PET_ACTION', { actionType: 'pet', partner: StorageService.getCoupleProfile().myName });

        if (Math.random() > 0.8) refreshAI();
        setTimeout(() => setAction('idle'), 500);
        if (navigator.vibrate) navigator.vibrate(40);
    };

    // Feature 6: Nudge/Tickle on Long Press
    const handleNudgeStart = () => {
        if (status.state === 'sleeping') return;
        nudgeTimeoutRef.current = setTimeout(() => {
            setAction('nudge');
            SyncService.sendSignal('PET_NUDGE', { partner: StorageService.getCoupleProfile().myName });
            setDialogue(`Sending a poke to ${partnerName}... 👉`);
            if (navigator.vibrate) navigator.vibrate(200);
            setTimeout(() => setAction('idle'), 1000);
        }, 800);
    };

    const handleNudgeEnd = () => {
        if (nudgeTimeoutRef.current) clearTimeout(nudgeTimeoutRef.current);
    };

    const handleFeed = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (status.state === 'sleeping' || action === 'feeding') return;
        setAction('feeding');
        
        const newStats = { ...stats, lastFed: new Date().toISOString(), happiness: Math.min(100, stats.happiness + 15) };
        setStats(newStats);
        StorageService.savePetStats(newStats);
        
        SyncService.sendSignal('PET_ACTION', { actionType: 'feed', partner: StorageService.getCoupleProfile().myName });

        setTimeout(() => {
            setAction('idle');
            refreshAI();
        }, 2000);
    };

    const saveSettings = () => {
        const newStats = { ...stats, name: editName, type: editType };
        setStats(newStats);
        StorageService.savePetStats(newStats);
        setShowSettings(false);
    };

    const hoursSinceFed = (new Date().getTime() - new Date(stats.lastFed).getTime()) / (1000 * 3600);
    const petEmoji = PET_TYPES.find(t => t.id === stats.type)?.emoji || '🧸';

    // Feature 7: Shared Hunger Check
    useEffect(() => {
        if (hoursSinceFed > 24 && stats.happiness > 10) {
            const interval = setInterval(() => {
                const newStats = { ...stats, happiness: Math.max(0, stats.happiness - 1) };
                setStats(newStats);
                StorageService.savePetStats(newStats);
                if (Math.random() > 0.9) {
                   SyncService.sendSignal('PET_HUNGER_ALERT', { level: 'starving' });
                }
            }, 60000);
            return () => clearInterval(interval);
        }
    }, [hoursSinceFed, stats]);

    return (
        <div className="relative mb-6 group animate-slide-up">
            <div className={`
                relative p-5 rounded-[2.5rem] border-2 transition-all duration-700 overflow-hidden
                ${status.state === 'sleeping' 
                    ? 'bg-slate-900 border-slate-800 text-slate-400 shadow-none' 
                    : 'bg-white border-white shadow-xl shadow-tulika-100/50 hover:shadow-2xl'}
                ${action === 'nudge' ? 'ring-4 ring-tulika-400 ring-opacity-50' : ''}
            `}>
                <div className={`absolute -right-4 -top-4 w-32 h-32 rounded-full blur-3xl opacity-20 transition-colors duration-1000 ${
                    status.state === 'sleeping' ? 'bg-blue-500' : stats.happiness > 80 ? 'bg-pink-500' : 'bg-orange-500'
                }`}></div>

                <div className="flex gap-4 relative z-10">
                    <div className="flex flex-col items-center">
                        <div 
                            onMouseDown={handleNudgeStart}
                            onMouseUp={handleNudgeEnd}
                            onTouchStart={handleNudgeStart}
                            onTouchEnd={handleNudgeEnd}
                            onClick={handlePet}
                            className={`
                                w-24 h-24 rounded-[2rem] flex items-center justify-center text-6xl shadow-inner relative transition-all duration-500 cursor-pointer select-none
                                ${status.state === 'sleeping' ? 'bg-slate-800' : 'bg-tulika-50 group-hover:bg-tulika-100'}
                                ${action === 'petting' ? 'scale-110 rotate-3' : ''}
                                ${action === 'feeding' ? 'animate-bounce' : ''}
                                ${action === 'nudge' ? 'animate-wiggle' : ''}
                            `}
                        >
                            {level >= 3 && status.state !== 'sleeping' && (
                                <Crown size={20} className="absolute -top-6 left-1/2 -translate-x-1/2 text-yellow-400 animate-pulse" fill="currentColor" />
                            )}
                            
                            <span className={`transition-transform duration-300 ${status.state === 'sleeping' ? 'grayscale opacity-50' : ''}`}>
                                {status.state === 'sleeping' ? '💤' : petEmoji}
                            </span>

                            {/* Flashback Badge (Feature 4) */}
                            {isFlashback && status.state !== 'sleeping' && (
                                <div className="absolute -bottom-1 -right-1 bg-blue-500 p-1.5 rounded-full border-2 border-white shadow-sm text-white animate-bounce">
                                    {/* Fix: use Sparkles instead of undefined SparklesIcon */}
                                    <Sparkles size={12} />
                                </div>
                            )}

                            {clickHearts.map(h => (
                                <div key={h.id} className="absolute pointer-events-none animate-float text-red-500" style={{ left: h.x, top: h.y }}>❤️</div>
                            ))}
                            
                            {hoursSinceFed > 24 && status.state !== 'sleeping' && (
                                <div className="absolute top-0 right-0 p-1.5 bg-red-500 rounded-full border-2 border-white text-white animate-pulse">
                                    <Bell size={10} />
                                </div>
                            )}
                        </div>
                        
                        <div className="mt-3 flex items-center gap-1.5 px-3 py-1 bg-white/50 rounded-full border border-gray-100 shadow-sm">
                            <Zap size={10} className="text-orange-400" fill="currentColor" />
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Lv.{level}</span>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col pt-1">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className={`font-serif font-bold text-lg leading-tight flex items-center gap-2 ${status.state === 'sleeping' ? 'text-white' : 'text-gray-800'}`}>
                                    {stats.name}
                                    <button onClick={() => setShowSettings(true)} className="opacity-0 group-hover:opacity-40 hover:opacity-100 transition-opacity">
                                        <Settings size={14} />
                                    </button>
                                </h3>
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-tulika-400">
                                    {isFlashback ? 'Memory Flashback ✨' : stage}
                                </p>
                            </div>
                            <div className="flex gap-1">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleNudgeStart(); setTimeout(handleNudgeEnd, 1000); }}
                                    className={`p-2 rounded-xl transition-all ${status.state === 'sleeping' ? 'bg-slate-800 text-slate-600' : 'bg-tulika-50 text-tulika-500 active:scale-90'}`}
                                    title="Nudge Partner"
                                >
                                    <Hand size={16} />
                                </button>
                                <button 
                                    onClick={handleFeed}
                                    className={`p-2 rounded-xl transition-all ${status.state === 'sleeping' ? 'bg-slate-800 text-slate-600' : 'bg-orange-50 text-orange-500 active:scale-90'}`}
                                >
                                    <Utensils size={16} />
                                </button>
                                <button 
                                    onClick={refreshAI}
                                    disabled={isAILoading}
                                    className={`p-2 rounded-xl transition-all ${status.state === 'sleeping' ? 'bg-slate-800 text-slate-600' : 'bg-blue-50 text-blue-500 active:scale-90'}`}
                                >
                                    <MessageCircle size={16} className={isAILoading ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>

                        <div className={`
                            flex-1 p-3 rounded-2xl rounded-tl-none relative transition-all duration-500
                            ${isFlashback ? 'bg-blue-50 border-blue-100 text-blue-800 shadow-md' : status.state === 'sleeping' ? 'bg-slate-800 text-slate-400' : 'bg-gray-50 text-gray-600 border border-gray-100 shadow-sm'}
                        `}>
                            <p className="text-xs font-medium leading-relaxed italic">
                                "{dialogue}"
                            </p>
                        </div>

                        <div className="mt-3">
                            <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                                <span>{hoursSinceFed > 24 ? 'Hungry!' : 'Happiness'}</span>
                                <span>{stats.happiness}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full transition-all duration-1000 ${hoursSinceFed > 24 ? 'bg-red-500' : 'bg-gradient-to-r from-tulika-400 to-tulika-600'}`}
                                    style={{ width: `${stats.happiness}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showSettings && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-pop-in">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-serif font-bold text-xl text-gray-800">Pet Settings</h3>
                            <button onClick={() => setShowSettings(false)} className="p-2 bg-gray-50 rounded-full text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Pet Name</label>
                                <input 
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="w-full bg-gray-50 p-4 rounded-2xl border-none focus:ring-2 focus:ring-tulika-200 font-bold text-gray-800"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Pet Type</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {PET_TYPES.map(t => (
                                        <button 
                                            key={t.id}
                                            onClick={() => setEditType(t.id as any)}
                                            className={`p-3 rounded-2xl transition-all ${editType === t.id ? 'bg-tulika-500 text-white shadow-lg' : 'bg-gray-50 text-gray-400'}`}
                                        >
                                            <span className="text-2xl block mb-1">{t.emoji}</span>
                                            <span className="text-[8px] font-bold uppercase">{t.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button 
                                onClick={saveSettings}
                                className="w-full bg-tulika-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-tulika-200 active:scale-95 transition-all"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
