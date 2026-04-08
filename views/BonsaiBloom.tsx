import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ViewState } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { motion, AnimatePresence } from 'framer-motion';
import { Wind, Sparkles, ArrowLeft, Heart, RefreshCw, Leaf } from 'lucide-react';
import { feedback } from '../utils/feedback';
import { isSameDay, formatDistanceToNow } from 'date-fns';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Float, ContactShadows, Sparkles as DreiSparkles, Environment } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

export interface BonsaiState {
    level: number;
    xp: number;
    myLastWatered: string;
    partnerLastWatered: string;
}

interface BonsaiBloomProps {
    setView: (view: ViewState) => void;
}

function hasWebGLSupport(): boolean {
    try {
        const canvas = document.createElement('canvas');
        return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
        return false;
    }
}

// ── 3D ZEN GARDEN COMPONENTS ──────────────────────────────────────

const BonsaiScene: React.FC<{ growth: number; isWatering: boolean }> = ({ growth, isWatering }) => {
    return (
        <Canvas
            shadows={false}
            camera={{ position: [0, 0, 8], fov: 45 }}
            gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
            className="absolute inset-0 z-0 pointer-events-none"
        >
            <ambientLight intensity={0.4} color="#e0f0ff" />
            <pointLight position={[0, 0, 4]} intensity={2} color="#ff3377" distance={15} decay={2} />

            {/* Subtle slow-moving ambient dust */}
            <DreiSparkles 
                position={[0, 0, 0]} 
                count={80} 
                scale={10} 
                size={8} 
                speed={0.2} 
                opacity={0.3} 
                color="#ff99bb" 
                noise={1}
            />

            {/* Intense active floating magic when watering */}
            {isWatering && (
                <Float speed={2} rotationIntensity={0.5}>
                    <DreiSparkles 
                        position={[0, -1, 2]} 
                        count={200} 
                        scale={8} 
                        size={12} 
                        speed={3} 
                        opacity={0.9} 
                        color="#ffffff" 
                        noise={2}
                    />
                </Float>
            )}

            {/* Depth particles behind the CSS tree layer */}
            <DreiSparkles 
                position={[0, 0, -4]} 
                count={40} 
                scale={12} 
                size={6} 
                speed={0.1} 
                opacity={0.15} 
                color="#aa4477" 
            />

            <EffectComposer>
                <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} opacity={1.5} />
            </EffectComposer>
        </Canvas>
    );
};

// ── UI OVERLAY COMPONENTS ─────────────────────────────────────────

export const BonsaiBloom: React.FC<BonsaiBloomProps> = ({ setView }) => {
    const [state, setState] = useState<BonsaiState>({ level: 1, xp: 0, myLastWatered: '', partnerLastWatered: '' });
    const [holdProgress, setHoldProgress] = useState(0);
    const [webglAvailable, setWebglAvailable] = useState(true);
    
    const partnerName = StorageService.getCoupleProfile().partnerName || "Partner";
    
    const storage = StorageService as typeof StorageService & {
        getBonsaiState?: () => BonsaiState;
        saveBonsaiState?: (value: BonsaiState) => void;
    };

    useEffect(() => {
        if (storage.getBonsaiState) setState(storage.getBonsaiState());
        const handler = () => { if (storage.getBonsaiState) setState(storage.getBonsaiState()); };
        storageEventTarget.addEventListener('bonsaiUpdated', handler);
        return () => storageEventTarget.removeEventListener('bonsaiUpdated', handler);
    }, []);

    useEffect(() => {
        setWebglAvailable(hasWebGLSupport());
    }, []);

    const isMyWatered = isSameDay(new Date(), state.myLastWatered ? new Date(state.myLastWatered) : new Date(0));
    const isPartnerWatered = isSameDay(new Date(), state.partnerLastWatered ? new Date(state.partnerLastWatered) : new Date(0));
    const isSynergy = isMyWatered && isPartnerWatered;
    
    const normalizedGrowth = Math.min(1, (state.level * 100 + state.xp) / 2000);
    const isWatering = holdProgress > 0;

    let holdTimer: NodeJS.Timeout | null = null;
    let resetTimer: NodeJS.Timeout | null = null;

    const clearTimers = () => {
        if (holdTimer) clearInterval(holdTimer);
        if (resetTimer) clearTimeout(resetTimer);
    };

    const startNurture = (e: React.TouchEvent | React.MouseEvent) => {
        if (isMyWatered) return;
        feedback.light();
        clearTimers();
        
        holdTimer = setInterval(() => {
            setHoldProgress(p => {
                const n = Math.min(100, p + 4);
                if (n % 20 === 0) feedback.light();
                if (n >= 100) {
                    clearTimers();
                    completeNurture();
                }
                return n;
            });
        }, 50);
    };

    const stopNurture = () => {
        clearTimers();
        resetTimer = setTimeout(() => setHoldProgress(0), 400);
    };

    const completeNurture = () => {
        feedback.success();
        let newXp = state.xp + (isPartnerWatered ? 40 : 20); // Synergy bonus
        let newLvl = state.level;
        if (newXp >= 100) { newXp -= 100; newLvl += 1; }
        
        const newState: BonsaiState = { ...state, level: newLvl, xp: newXp, myLastWatered: new Date().toISOString() };
        if (storage.saveBonsaiState) storage.saveBonsaiState(newState);
        setState(newState);
        
        resetTimer = setTimeout(() => setHoldProgress(0), 1000);
    };

    // Clean up timers on unmount
    useEffect(() => clearTimers, []);

    const formatTime = (iso: string) => {
        if (!iso) return 'Not yet';
        return formatDistanceToNow(new Date(iso), { addSuffix: true });
    };

    return (
        <div className="relative w-full overflow-hidden select-none bg-black" style={{ height: '100dvh' }}>
            
            {/* Museum-Quality 2D Bonsai Centerpiece */}
            <motion.div 
                className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none"
                animate={{
                    scale: 1 + (normalizedGrowth * 0.15) + (isWatering ? 0.03 : 0),
                    y: isWatering ? -5 : 0
                }}
                transition={{ type: 'spring', damping: 20, stiffness: 40 }}
            >
                <img 
                    src="/bonsai.png" 
                    alt="Bonsai Centerpiece" 
                    className="w-[140%] md:w-[100%] h-auto max-w-[800px] object-cover"
                    style={{ 
                        mixBlendMode: 'screen', // Magically knocks out the dark background
                        filter: `brightness(${isWatering ? 1.2 : 1.0}) contrast(1.1) saturate(1.1)`,
                        maskImage: 'radial-gradient(circle at center, black 50%, transparent 85%)',
                        WebkitMaskImage: 'radial-gradient(circle at center, black 50%, transparent 85%)'
                    }}
                />
            </motion.div>

            {/* 3D WebGL Atmosphere Layer (Particles only) */}
            {webglAvailable ? <BonsaiScene growth={normalizedGrowth} isWatering={isWatering} /> : 
                <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">WebGL Atmosphere Required</div>
            }

            {/* Atmosphere Overlays */}
            <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#05080A]/90 to-transparent pointer-events-none z-10" />
            <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#05080A]/95 via-[#05080A]/60 to-transparent pointer-events-none z-10" />

            {/* MAIN UI LAYER */}
            <div className="absolute inset-0 z-20 flex flex-col pointer-events-none">
                
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-safe pt-6">
                    <button
                        onClick={() => setView('home')}
                        className="pointer-events-auto w-11 h-11 rounded-full flex items-center justify-center spring-press backdrop-blur-xl"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                        <ArrowLeft size={20} className="text-white/80" />
                    </button>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/40 mb-1">Sanctuary</span>
                        <h1 className="font-serif text-xl text-white/90 drop-shadow-lg">Zen Garden</h1>
                    </div>
                    <div className="w-11" />
                </div>

                {/* Level / Harmony Status */}
                <div className="mt-8 px-5 flex flex-col items-center">
                    <motion.div 
                        className="flex items-center gap-3 px-5 py-2.5 rounded-full backdrop-blur-xl"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                        animate={isSynergy ? { boxShadow: '0 0 20px rgba(255, 51, 119, 0.3)' } : {}}
                    >
                        <Heart size={14} className={isSynergy ? "text-pink-400" : "text-white/40"} fill={isSynergy ? "currentColor" : "none"} />
                        <span className="font-serif text-sm text-white/90">Harmony Lvl {state.level}</span>
                        <div className="w-px h-3 bg-white/20" />
                        <span className="text-xs font-medium text-white/60">{state.xp} / 100</span>
                    </motion.div>
                </div>

                <div className="flex-1" />

                {/* Footer Dashboard */}
                <div className="pb-10 px-5 flex flex-col gap-6">
                    
                    {/* Synergy / Care Log Panel */}
                    <div className="p-5 rounded-3xl backdrop-blur-xl pointer-events-auto"
                         style={{ background: 'rgba(15, 20, 25, 0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-bold uppercase tracking-widest text-white/40">Today's Balance</span>
                            {isSynergy && <span className="text-[10px] font-bold uppercase tracking-wider text-pink-400 bg-pink-500/10 px-2 py-1 rounded border border-pink-500/20">Synergy Bonus</span>}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1 p-3 rounded-2xl" style={{ background: isMyWatered ? 'rgba(255, 51, 119, 0.1)' : 'rgba(255,255,255,0.03)' }}>
                                <span className={`text-sm font-semibold ${isMyWatered ? 'text-pink-300' : 'text-white/70'}`}>You</span>
                                <span className="text-[10px] text-white/40">{isMyWatered ? formatTime(state.myLastWatered) : 'Needs care'}</span>
                            </div>
                            <div className="flex flex-col gap-1 p-3 rounded-2xl" style={{ background: isPartnerWatered ? 'rgba(255, 51, 119, 0.1)' : 'rgba(255,255,255,0.03)' }}>
                                <span className={`text-sm font-semibold ${isPartnerWatered ? 'text-pink-300' : 'text-white/70'}`}>{partnerName}</span>
                                <span className="text-[10px] text-white/40">{isPartnerWatered ? formatTime(state.partnerLastWatered) : 'Needs care'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex justify-center pointer-events-auto">
                        <AnimatePresence mode="wait">
                            {!isMyWatered ? (
                                <motion.div
                                    key="action-nurture"
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    className="relative flex items-center justify-center"
                                    onPointerDown={startNurture}
                                    onPointerUp={stopNurture}
                                    onPointerLeave={stopNurture}
                                    onPointerCancel={stopNurture}
                                    style={{ touchAction: 'none' }}
                                >
                                    <svg className="absolute w-[100px] h-[100px] -rotate-90 pointer-events-none">
                                        <circle cx="50" cy="50" r="46" stroke="rgba(255,255,255,0.05)" strokeWidth="4" fill="none" />
                                        <motion.circle
                                            cx="50" cy="50" r="46"
                                            stroke="#ff3377" strokeWidth="4" fill="none" strokeLinecap="round"
                                            strokeDasharray="289"
                                            animate={{ strokeDashoffset: 289 - (289 * holdProgress) / 100 }}
                                            transition={{ duration: 0.1 }}
                                        />
                                    </svg>
                                    <motion.div
                                        className="w-20 h-20 rounded-full flex flex-col items-center justify-center gap-1 spring-press cursor-pointer"
                                        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}
                                        animate={{ scale: holdProgress > 0 ? 0.9 : 1 }}
                                    >
                                        <Leaf size={22} className={holdProgress > 0 ? "text-pink-400" : "text-white/60"} />
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">Hold</span>
                                    </motion.div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="action-done"
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="h-20 flex items-center justify-center"
                                >
                                    <div className="flex items-center gap-3 px-6 py-4 rounded-full backdrop-blur-xl"
                                         style={{ background: 'rgba(255, 51, 119, 0.15)', border: '1px solid rgba(255, 51, 119, 0.3)' }}>
                                        <Sparkles size={18} className="text-pink-400" />
                                        <span className="font-medium text-pink-100">Peace restored today</span>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                </div>
            </div>
        </div>
    );
};
