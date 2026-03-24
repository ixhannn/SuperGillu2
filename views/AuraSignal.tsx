import React, { useState, useEffect, useRef } from 'react';
import { ViewState } from '../types';
import { SyncService } from '../services/sync';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { CheckCircle2, Navigation } from 'lucide-react';
import { feedback } from '../utils/feedback';
import { ViewHeader } from '../components/ViewHeader';

interface AuraSignalProps {
    setView: (view: ViewState) => void;
}

const SIGNALS = [
    {
        id: 'red', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)',
        title: 'I need space', subtitle: 'But I still love you.',
        message: 'Need some quiet time to myself right now. Love you.'
    },
    {
        id: 'blue', color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.4)',
        title: 'I need a hug', subtitle: "Please don't ask what's wrong.",
        message: 'Feeling down and just need a hug. No questions please.'
    },
    {
        id: 'yellow', color: '#eab308', glow: 'rgba(234, 179, 8, 0.4)',
        title: 'Anxious', subtitle: 'Feeling overwhelmed.',
        message: 'Feeling really anxious and overwhelmed right now.'
    },
    {
        id: 'green', color: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)',
        title: 'Thinking of you', subtitle: 'Just sending love.',
        message: 'Just wanted to let you know I am thinking of you right now.'
    }
];

// Moving background blobs for the fluid effect
const FluidBackground = ({ color }: { color: string }) => {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
            className="absolute inset-0 z-0 overflow-hidden pointer-events-none mix-blend-screen"
        >
            <motion.div
                animate={{
                    x: ['-10%', '10%', '-10%'],
                    y: ['-10%', '10%', '-10%'],
                    scale: [1, 1.2, 1],
                }}
                transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute top-0 right-1/4 w-[40rem] h-[40rem] rounded-full blur-[120px] opacity-30"
                style={{ backgroundColor: color }}
            />
            <motion.div
                animate={{
                    x: ['10%', '-10%', '10%'],
                    y: ['10%', '-10%', '10%'],
                    scale: [1.2, 1, 1.2],
                }}
                transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute bottom-0 left-1/4 w-[30rem] h-[30rem] rounded-full blur-[100px] opacity-40"
                style={{ backgroundColor: color }}
            />
        </motion.div>
    );
};

export const AuraSignal: React.FC<AuraSignalProps> = ({ setView }) => {
    const [selected, setSelected] = useState<string | null>(null);
    const [sent, setSent] = useState(false);
    const [holdProgress, setHoldProgress] = useState(0);
    const holdIntervalRef = useRef<any>(null);

    const controls = useAnimation();

    useEffect(() => {
        if (sent) {
            controls.start({ scale: [1, 20], opacity: [1, 0], transition: { duration: 0.8 } });
        }
    }, [sent, controls]);

    const activeSignal = SIGNALS.find(s => s.id === selected);

    const startCharge = () => {
        if (!selected || sent) return;
        feedback.tap();
        let progress = 0;
        holdIntervalRef.current = setInterval(() => {
            progress += 2; // fills up in ~50 ticks (500ms)
            setHoldProgress(progress);
            if (progress % 20 === 0 && navigator.vibrate) navigator.vibrate(10); // Subtle tick haptic
            
            if (progress >= 100) {
                clearInterval(holdIntervalRef.current);
                fireSignal();
            }
        }, 10);
    };

    const cancelCharge = () => {
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        if (!sent) setHoldProgress(0);
    };

    const fireSignal = () => {
        if (!activeSignal || sent) return;
        SyncService.sendSignal('AURA_SIGNAL', {
            color: activeSignal.color,
            title: activeSignal.title,
            message: activeSignal.message
        });
        feedback.celebrate();
        setSent(true);
        setTimeout(() => {
            setSent(false);
            setSelected(null);
            setView('home');
        }, 2500);
    };

    return (
        <div className="flex flex-col h-full min-h-screen relative bg-gray-50 select-none">
            
            <AnimatePresence>
                {activeSignal && <FluidBackground color={activeSignal.color} />}
            </AnimatePresence>

            <div className={`relative z-10 p-6 flex flex-col h-full min-h-screen transition-opacity duration-1000 ${sent ? 'opacity-0 delay-500' : 'opacity-100'}`}>
                <ViewHeader title="Aura Signal" onBack={() => setView('home')} variant="transparent" />

                <div className="text-center mt-2 mb-8 relative z-20">
                    <h2 className="font-serif text-4xl font-extrabold text-gray-900 mb-2 drop-shadow-sm">
                        Vibe Check
                    </h2>
                    <p className="text-gray-600 text-sm font-medium px-4">
                        When words are too hard to find, send an aura instead.
                    </p>
                </div>

                <div className="flex-1 flex flex-col justify-center gap-4 max-w-sm mx-auto w-full relative z-20 pb-40">
                    {SIGNALS.map((signal, index) => {
                        const isSelected = selected === signal.id;
                        const isOtherSelected = selected && !isSelected;

                        return (
                            <motion.button
                                key={signal.id}
                                layout
                                onClick={() => { 
                                    if (sent) return;
                                    feedback.tap(); 
                                    setSelected(isSelected ? null : signal.id);
                                    setHoldProgress(0);
                                }}
                                initial={{ opacity: 0, y: 30 }}
                                animate={{
                                    opacity: isOtherSelected ? 0.2 : 1,
                                    scale: isSelected ? 1.02 : 1,
                                    y: 0
                                }}
                                transition={{ type: 'spring', stiffness: 400, damping: 25, delay: index * 0.08 }}
                                className={`w-full relative overflow-hidden rounded-[1.75rem] p-5 text-left transition-all duration-500 border
                                    ${isSelected ? 'glass-card border-gray-100 ring-2 ring-tulika-200' : 'bg-white border-gray-100 shadow-sm'}
                                `}
                                style={{
                                    boxShadow: isSelected ? `0 12px 40px ${signal.glow}` : 'none'
                                }}
                            >
                                {/* Active Orb Aura inside card */}
                                {isSelected && (
                                    <div 
                                        className="absolute -right-12 -bottom-12 w-32 h-32 rounded-full blur-2xl opacity-40 pointer-events-none" 
                                        style={{ backgroundColor: signal.color }} 
                                    />
                                )}

                                <div className="flex items-center gap-5 relative z-10">
                                    <div className="relative">
                                        <div
                                            className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center relative z-10"
                                            style={{ backgroundColor: signal.color, boxShadow: `0 4px 20px ${signal.glow}` }}
                                        >
                                            {isSelected && (
                                                <motion.div
                                                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                                                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                                    className="absolute inset-0 rounded-full bg-white mix-blend-overlay"
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className={`font-serif font-bold text-xl mb-0.5 ${isSelected ? 'text-gray-900 drop-shadow-sm' : 'text-gray-800'}`}>
                                            {signal.title}
                                        </h3>
                                        <p className={`text-sm ${isSelected ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                                            {signal.subtitle}
                                        </p>
                                    </div>
                                </div>
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            {/* Hold-to-Send Interface Area */}
            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ opacity: 0, y: 100 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 100, scale: 0.9 }}
                        transition={{ type: 'spring', damping: 22 }}
                        className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-gray-50/95 via-gray-50/80 to-transparent z-40 flex flex-col items-center justify-end pb-12 pointer-events-none"
                    >
                        {/* The charging orb */}
                        <div className="relative flex items-center justify-center pointer-events-auto">
                            
                            {/* SVG Ring Progress */}
                            <svg className="absolute w-32 h-32 -rotate-90 pointer-events-none">
                                <circle cx="64" cy="64" r="54" className="stroke-white/10" strokeWidth="4" fill="none" />
                                <motion.circle cx="64" cy="64" r="54" 
                                    className="stroke-white drop-shadow-glow" strokeWidth="4" fill="none" strokeLinecap="round"
                                    strokeDasharray={339.292} 
                                    strokeDashoffset={339.292 - (339.292 * holdProgress) / 100} 
                                    style={{ stroke: activeSignal?.color }}
                                />
                            </svg>

                            <motion.button
                                onPointerDown={startCharge}
                                onPointerUp={cancelCharge}
                                onPointerLeave={cancelCharge}
                                onContextMenu={(e) => e.preventDefault()}
                                animate={controls}
                                whileTap={{ scale: 0.9 }}
                                className={`w-24 h-24 rounded-full flex flex-col items-center justify-center text-white relative overflow-hidden ring-4 ring-black/50 shadow-2xl transition-all ${sent ? 'pointer-events-none' : ''}`}
                                style={{ 
                                    backgroundColor: activeSignal?.color,
                                    boxShadow: `0 0 ${holdProgress}px ${activeSignal?.color}`
                                }}
                            >
                                <div className="absolute inset-0 bg-black mix-blend-overlay opacity-20" />
                                
                                {sent ? (
                                    <CheckCircle2 size={36} className="relative z-10 text-white animate-pop-in" />
                                ) : (
                                    <>
                                        <Navigation size={24} fill="currentColor" className={`relative z-10 -mt-1 transition-transform ${holdProgress > 0 ? '-translate-y-1 scale-110' : ''}`} />
                                        <span className={`text-[10px] font-bold uppercase tracking-widest mt-1 relative z-10 opacity-80 transition-opacity ${holdProgress > 0 ? 'opacity-100' : ''}`}>
                                            Hold
                                        </span>
                                    </>
                                )}

                                {/* Inner charge wave */}
                                <motion.div 
                                    className="absolute bottom-0 left-0 right-0 bg-white mix-blend-overlay"
                                    style={{ height: `${holdProgress}%` }}
                                    transition={{ duration: 0.1 }}
                                />
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
