import React, { useState, useEffect, useRef } from 'react';
import { ViewState } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Droplet, Sparkles, Navigation, Info, TreeDeciduous, Wind } from 'lucide-react';
import { feedback } from '../utils/feedback';
import { ViewHeader } from '../components/ViewHeader';
import { isSameDay } from 'date-fns';

export interface BonsaiState {
    level: number;
    xp: number;
    myLastWatered: string;
    partnerLastWatered: string;
}

interface BonsaiBloomProps {
    setView: (view: ViewState) => void;
}

// Glowing particles inside the terrarium
const TerrariumParticles = () => {
    return (
        <div className="absolute inset-0 z-10 overflow-hidden rounded-full pointer-events-none mix-blend-screen mask-radial">
            {[...Array(15)].map((_, i) => (
                <motion.div
                    key={i}
                    animate={{
                        y: [-10, -150],
                        x: [Math.sin(i) * 20, Math.cos(i) * 30],
                        opacity: [0, 0.8, 0],
                        scale: [0, 1.5, 0]
                    }}
                    transition={{
                        duration: 4 + Math.random() * 4,
                        repeat: Infinity,
                        ease: 'easeOut',
                        delay: Math.random() * 5
                    }}
                    className="absolute bottom-10 w-1.5 h-1.5 rounded-full blur-[1px] bg-emerald-300"
                    style={{ left: `${40 + (Math.random() * 20)}%` }}
                />
            ))}
        </div>
    );
};

// A breathtaking minimalist tree constructed from premium overlapping glows and shapes
const EtherealTree = ({ level, isWatering }: { level: number, isWatering: boolean }) => {
    const scaleMultiplier = Math.min(1 + (level * 0.1), 1.5);
    
    return (
        <motion.div 
            animate={{ 
                scaleY: [1, 1.01, 1],
                rotate: isWatering ? [-0.5, 0.5, -0.5] : [0, 0, 0]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="relative z-20 flex flex-col items-center justify-end origin-bottom"
            style={{ transform: `scale(${scaleMultiplier})` }}
        >
            {/* The Ethereal Canopy */}
            <div className="relative w-40 h-40 flex items-center justify-center -mb-8">
                {/* Core Glow */}
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-2xl" />
                
                {/* Geometric/Ethereal Leaves representation */}
                <motion.div 
                    animate={{ rotate: 360 }} 
                    transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
                    className="absolute w-32 h-32 border border-emerald-400/30 rounded-full flex items-center justify-center"
                >
                    <div className="w-2 h-2 bg-emerald-300 rounded-full absolute -top-1 blur-[1px]" />
                    <div className="w-1 h-1 bg-emerald-200 rounded-full absolute -bottom-0.5 blur-[1px]" />
                </motion.div>

                <motion.div 
                    animate={{ rotate: -360 }} 
                    transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
                    className="absolute w-24 h-24 border border-emerald-300/40 rounded-full flex items-center justify-center"
                >
                    <div className="w-1.5 h-1.5 bg-emerald-100 rounded-full absolute -left-0.5 blur-[1px]" />
                </motion.div>

                <TreeDeciduous size={48} className="text-emerald-300 drop-shadow-[0_0_15px_rgba(110,231,183,1)] relative z-10" strokeWidth={1.5} />
            </div>

            {/* The base/roots indicator */}
            <div className="w-16 h-2 bg-gradient-to-r from-transparent via-emerald-800/80 to-transparent blur-sm rounded-full" />
            <div className="w-8 h-1 bg-emerald-600/50 blur-[1px] rounded-full mt-1" />
        </motion.div>
    );
};

export const BonsaiBloom: React.FC<BonsaiBloomProps> = ({ setView }) => {
    const [state, setState] = useState<BonsaiState>({ level: 1, xp: 0, myLastWatered: '', partnerLastWatered: '' });
    const [holdProgress, setHoldProgress] = useState(0);
    const holdIntervalRef = useRef<any>(null);

    const now = new Date();

    useEffect(() => {
        const load = () => {
            // @ts-ignore
            const s = StorageService.getBonsaiState?.() || { level: 1, xp: 0, myLastWatered: '', partnerLastWatered: '' };
            setState(s);
        };
        load();
        storageEventTarget.addEventListener('storage-update', load);
        return () => storageEventTarget.removeEventListener('storage-update', load);
    }, []);

    const myWa = state.myLastWatered ? new Date(state.myLastWatered) : null;
    const ptWa = state.partnerLastWatered ? new Date(state.partnerLastWatered) : null;
    const iWateredToday = myWa ? isSameDay(myWa, now) : false;
    const partnerWateredToday = ptWa ? isSameDay(ptWa, now) : false;
    const bothWateredToday = iWateredToday && partnerWateredToday;

    const startWatering = () => {
        if (iWateredToday) return;
        feedback.tap();
        let progress = 0;
        holdIntervalRef.current = setInterval(() => {
            progress += 1.2; // ~83 ticks (~830ms)
            setHoldProgress(progress);
            if (progress % 15 === 0 && navigator.vibrate) navigator.vibrate([10]); // Deep throb
            
            if (progress >= 100) {
                clearInterval(holdIntervalRef.current);
                completeWatering();
            }
        }, 10);
    };

    const cancelWatering = () => {
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        if (holdProgress < 100) setHoldProgress(0);
    };

    const completeWatering = () => {
        feedback.celebrate();
        const newState = { ...state, myLastWatered: now.toISOString() };
        newState.xp += 10;
        if (partnerWateredToday) newState.xp += 15;

        let leveledUp = false;
        if (newState.xp >= newState.level * 100) {
            newState.level += 1;
            newState.xp = 0;
            leveledUp = true;
        }

        // @ts-ignore
        StorageService.saveBonsaiState?.(newState);
        setState(newState);
        
        // Let progress ring stay full briefly, then fade out
        setTimeout(() => setHoldProgress(0), 1000);
    };

    const xpTarget = state.level * 100;
    const progressPercent = Math.min(100, Math.max(0, (state.xp / xpTarget) * 100));

    return (
        <div className="flex flex-col min-h-screen relative overflow-hidden bg-[#0A0D10] select-none text-slate-100">
            
            {/* Premium Cinematic Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-emerald-900/10 rounded-full blur-[120px]" />
                <div className="absolute -bottom-40 -left-20 w-[40rem] h-[40rem] bg-teal-900/20 rounded-full blur-[100px]" />
                
                {/* SVG Noise Overlay for premium matte finish */}
                <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
            </div>
            
            <div className="relative z-20 pb-10 flex flex-col h-full min-h-screen">
                <div className="px-6 py-4 pt-12">
                    <ViewHeader title="Shared Growth" onBack={() => setView('home')} variant="transparent" />
                </div>

                <div className="flex-1 flex flex-col items-center justify-center -mt-10 relative px-6">
                    
                    {/* The Glass Terrarium (Central Focus) */}
                    <div className="relative flex items-center justify-center w-[22rem] h-[22rem]">
                        
                        {/* Terrarium Sphere / Dome */}
                        <div className="absolute inset-0 rounded-full border border-white/10 bg-gradient-to-b from-white/5 to-transparent backdrop-blur-md shadow-[0_30px_60px_rgba(0,0,0,0.5),inset_0_2px_20px_rgba(255,255,255,0.05)] overflow-hidden flex items-center justify-center">
                            
                            {/* Inner depth shadow */}
                            <div className="absolute inset-0 rounded-full shadow-[inset_0_-20px_50px_rgba(0,0,0,0.8)] pointer-events-none" />
                            
                            {/* Tree Element */}
                            <EtherealTree level={state.level} isWatering={holdProgress > 0 && holdProgress < 100} />
                            
                            {/* Ambient Particles */}
                            <TerrariumParticles />

                            {/* Water pouring effect */}
                            <AnimatePresence>
                                {holdProgress > 0 && holdProgress < 100 && (
                                    <motion.div 
                                        initial={{ opacity: 0, scaleY: 0 }}
                                        animate={{ opacity: 1, scaleY: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute top-0 w-32 h-64 bg-gradient-to-b from-blue-400/0 via-blue-400/20 to-transparent blur-md origin-top mix-blend-screen"
                                    />
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Ring Progress mapping to XP */}
                        <svg className="absolute -inset-4 w-[24rem] h-[24rem] -rotate-90 pointer-events-none drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                            <circle cx="192" cy="192" r="184" className="stroke-white/5" strokeWidth="2" fill="none" />
                            <motion.circle 
                                cx="192" cy="192" r="184" 
                                className="stroke-emerald-400" 
                                strokeWidth="4" 
                                fill="none" 
                                strokeLinecap="round"
                                strokeDasharray={1156} 
                                strokeDashoffset={1156 - (1156 * progressPercent) / 100} 
                                transition={{ duration: 1.5, ease: "easeOut" }}
                            />
                        </svg>

                        {/* Level Badge Float */}
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full shadow-xl">
                            <span className="font-serif font-bold text-emerald-300 text-sm tracking-widest uppercase">Lvl {state.level}</span>
                        </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="w-full max-w-sm mt-12 grid grid-cols-2 gap-4">
                        <div className="bg-white/5 border border-white/5 rounded-3xl p-5 backdrop-blur-sm flex flex-col items-center justify-center relative overflow-hidden group">
                            <div className={`absolute inset-0 bg-gradient-to-t from-emerald-500/10 to-transparent transition-opacity duration-700 ${iWateredToday ? 'opacity-100' : 'opacity-0'}`} />
                            <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2 relative z-10">You</span>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-700 relative z-10 ${iWateredToday ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]' : 'bg-white/10 text-gray-400'}`}>
                                <Droplet size={18} fill={iWateredToday ? "currentColor" : "none"} />
                            </div>
                        </div>
                        
                        <div className="bg-white/5 border border-white/5 rounded-3xl p-5 backdrop-blur-sm flex flex-col items-center justify-center relative overflow-hidden">
                            <div className={`absolute inset-0 bg-gradient-to-t from-emerald-500/10 to-transparent transition-opacity duration-700 ${partnerWateredToday ? 'opacity-100' : 'opacity-0'}`} />
                            <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-2 relative z-10">Tulika</span>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-700 relative z-10 ${partnerWateredToday ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]' : 'bg-white/10 text-gray-400'}`}>
                                <Droplet size={18} fill={partnerWateredToday ? "currentColor" : "none"} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* The Sleek Circular Hold Button Area */}
                <div className="fixed bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black via-black/80 to-transparent z-40 flex items-center justify-center pb-8 pointer-events-none">
                    
                    <div className="relative pointer-events-auto">
                        
                        {/* Hold Progress Ring */}
                        <svg className="absolute -inset-4 w-28 h-28 -rotate-90 pointer-events-none">
                            <circle cx="56" cy="56" r="50" className="stroke-transparent" strokeWidth="4" fill="none" />
                            <motion.circle 
                                cx="56" cy="56" r="50" 
                                className="stroke-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" 
                                strokeWidth="4" fill="none" strokeLinecap="round"
                                strokeDasharray={314} 
                                strokeDashoffset={314 - (314 * holdProgress) / 100} 
                            />
                        </svg>

                        <motion.button
                            onPointerDown={startWatering}
                            onPointerUp={cancelWatering}
                            onPointerLeave={cancelWatering}
                            onContextMenu={(e) => e.preventDefault()}
                            disabled={iWateredToday}
                            whileTap={{ scale: iWateredToday ? 1 : 0.92 }}
                            className={`w-20 h-20 rounded-full flex flex-col items-center justify-center relative overflow-hidden shadow-2xl transition-all duration-300
                                ${iWateredToday 
                                    ? 'bg-white/5 border border-white/10 text-emerald-400 cursor-not-allowed opacity-80' 
                                    : 'bg-white/10 border border-white/20 text-white hover:bg-white/15 active:bg-blue-500/20 active:border-blue-400'
                                }
                            `}
                        >
                            <div className="absolute inset-0 bg-black mix-blend-overlay opacity-30" />
                            
                            {iWateredToday ? (
                                <Droplet size={28} fill="currentColor" className="relative z-10" />
                            ) : (
                                <>
                                    <Droplet size={24} className={`relative z-10 transition-transform ${holdProgress > 0 ? '-translate-y-1 text-blue-300' : ''}`} />
                                    <span className={`text-[9px] font-bold uppercase tracking-widest mt-1 relative z-10 transition-opacity ${holdProgress > 0 ? 'opacity-100 text-blue-200' : 'opacity-60'}`}>
                                        Hold
                                    </span>
                                </>
                            )}

                            {/* Inner Water Fill Effect during hold */}
                            <motion.div 
                                className="absolute bottom-0 left-0 right-0 bg-blue-500/40 mix-blend-screen"
                                style={{ height: `${holdProgress}%` }}
                                transition={{ duration: 0.1 }}
                            />
                        </motion.button>
                    </div>

                    {/* Helper text floating nearby */}
                    <div className="absolute bottom-6 w-full text-center pointer-events-none">
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                            {iWateredToday ? `${partnerWateredToday ? 'Both watered today' : 'Waiting for partner'}` : 'Nourish Daily'}
                        </span>
                    </div>

                </div>
            </div>
        </div>
    );
};
