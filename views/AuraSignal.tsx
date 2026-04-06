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

const SIGNAL_GROUPS = [
    {
        id: 'comfort',
        label: 'Comfort',
        signals: [
            {
                id: 'blue', color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.4)',
                title: 'I need a hug', subtitle: 'No fixing. Just you.',
                message: 'Feeling low and I just want your softness right now.',
                afterglow: 'A small reminder that you are my safe place.',
            },
            {
                id: 'yellow', color: '#eab308', glow: 'rgba(234, 179, 8, 0.42)',
                title: 'Anxious', subtitle: 'Stay close to me.',
                message: 'My mind feels loud. Your presence would calm me down.',
                afterglow: 'You do not have to solve it. Just stay with me.',
            },
            {
                id: 'red', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)',
                title: 'I need space', subtitle: 'Still yours. Just overwhelmed.',
                message: 'I need a little quiet, but I still want to feel your love.',
                afterglow: 'Distance from noise, not distance from us.',
            },
        ],
    },
    {
        id: 'love',
        label: 'Love',
        signals: [
            {
                id: 'green', color: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)',
                title: 'Thinking of you', subtitle: 'You crossed my heart again.',
                message: 'Nothing urgent. I just wanted you to feel me thinking of you.',
                afterglow: 'A soft little thread between us.',
            },
            {
                id: 'rose', color: '#ec4899', glow: 'rgba(236, 72, 153, 0.42)',
                title: 'Miss you badly', subtitle: 'Come closer somehow.',
                message: 'The distance feels heavy tonight. I really miss you.',
                afterglow: 'Until I can hold you, let this reach you first.',
            },
            {
                id: 'violet', color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.4)',
                title: 'Proud of you', subtitle: 'I see your effort.',
                message: 'I am proud of the way you are showing up, even from far away.',
                afterglow: 'You are deeply loved for who you are becoming.',
            },
        ],
    },
    {
        id: 'ritual',
        label: 'Ritual',
        signals: [
            {
                id: 'amber', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)',
                title: 'Need your voice', subtitle: 'Call me when you can.',
                message: 'I want the comfort of hearing you, even for a minute.',
                afterglow: 'Some nights your voice is the whole medicine.',
            },
            {
                id: 'teal', color: '#14b8a6', glow: 'rgba(20, 184, 166, 0.4)',
                title: 'Goodnight, love', subtitle: 'Fall asleep with me in mind.',
                message: 'Sending you my last soft thought before sleep.',
                afterglow: 'Let this be the feeling that stays beside you tonight.',
            },
        ],
    },
];

const SIGNALS = SIGNAL_GROUPS.flatMap((group) => group.signals);

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
    const [activeGroup, setActiveGroup] = useState<string>(SIGNAL_GROUPS[0].id);
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
            subtitle: activeSignal.subtitle,
            message: activeSignal.message,
            afterglow: activeSignal.afterglow,
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
                    <h2 className="font-serif text-4xl font-extrabold mb-2 drop-shadow-sm" style={{ color: 'var(--color-text-primary)' }}>
                        Vibe Check
                    </h2>
                    <p className="text-sm font-medium px-4" style={{ color: 'var(--color-text-secondary)' }}>
                        Send a felt presence, not just a message.
                    </p>
                </div>

                <div className="w-full max-w-sm mx-auto relative z-20 mb-5">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {SIGNAL_GROUPS.map((group) => (
                            <button
                                key={group.id}
                                onClick={() => { feedback.light(); setActiveGroup(group.id); }}
                                className="px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.22em] font-bold whitespace-nowrap transition-all"
                                style={{
                                    background: activeGroup === group.id ? 'rgba(17,24,39,0.88)' : 'rgba(255,255,255,0.64)',
                                    color: activeGroup === group.id ? '#fff' : 'var(--color-text-secondary)',
                                    border: activeGroup === group.id ? '1px solid rgba(17,24,39,0.88)' : '1px solid rgba(255,255,255,0.8)',
                                }}
                            >
                                {group.label}
                            </button>
                        ))}
                    </div>
                </div>

                {activeSignal && (
                    <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-sm mx-auto mb-5 rounded-[1.75rem] p-5 relative overflow-hidden"
                        style={{
                            background: 'rgba(255,255,255,0.68)',
                            border: '1px solid rgba(255,255,255,0.82)',
                            boxShadow: `0 14px 50px ${activeSignal.glow}`,
                            backdropFilter: 'blur(18px)',
                        }}
                    >
                        <div
                            className="absolute -right-16 -top-16 w-36 h-36 rounded-full blur-3xl opacity-50"
                            style={{ backgroundColor: activeSignal.color }}
                        />
                        <div className="relative z-10">
                            <p className="text-[10px] uppercase tracking-[0.28em] font-bold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                                They will feel
                            </p>
                            <h3 className="font-serif text-2xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                                {activeSignal.title}
                            </h3>
                            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
                                {activeSignal.subtitle}
                            </p>
                            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                                {activeSignal.afterglow}
                            </p>
                        </div>
                    </motion.div>
                )}

                <div className="flex-1 flex flex-col justify-center gap-4 max-w-sm mx-auto w-full relative z-20 pb-40">
                    {SIGNAL_GROUPS.find((group) => group.id === activeGroup)!.signals.map((signal, index) => {
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
                                className={`w-full relative overflow-hidden rounded-[1.75rem] p-5 text-left transition-all duration-500
                                    ${isSelected ? 'glass-card ring-2 ring-tulika-200' : 'glass-card shadow-sm'}
                                `}
                                style={{
                                    border: isSelected ? `1px solid rgba(var(--theme-particle-2-rgb),0.15)` : `1px solid rgba(var(--theme-particle-2-rgb),0.10)`,
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
                                        <h3 className={`font-serif font-bold text-xl mb-0.5 ${isSelected ? 'drop-shadow-sm' : ''}`} style={{ color: 'var(--color-text-primary)' }}>
                                            {signal.title}
                                        </h3>
                                        <p className={`text-sm ${isSelected ? 'font-medium' : ''}`} style={{ color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
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
                        <p className="mb-4 text-[11px] uppercase tracking-[0.28em] font-bold pointer-events-none" style={{ color: 'var(--color-text-secondary)' }}>
                            Hold to send your presence
                        </p>
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
