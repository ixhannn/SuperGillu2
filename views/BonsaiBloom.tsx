import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ViewState } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Heart, Leaf, Sparkles, Wind } from 'lucide-react';
import { feedback } from '../utils/feedback';
import { isSameDay, formatDistanceToNow } from 'date-fns';
import { Canvas } from '@react-three/fiber';
import { Float, Sparkles as DreiSparkles } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';

export interface BonsaiState {
    level: number;
    xp: number;
    myLastWatered: string;
    partnerLastWatered: string;
}

interface BonsaiBloomProps {
    setView: (view: ViewState) => void;
}

const RITUAL_RING = 2 * Math.PI * 52;
const GROWTH_MARKERS = [
    { label: 'Roots', threshold: 0.18, note: 'Trust settles into the soil.' },
    { label: 'Form', threshold: 0.46, note: 'Daily care shapes the trunk.' },
    { label: 'Bloom', threshold: 0.78, note: 'Shared rituals open the crown.' },
];

function hasWebGLSupport(): boolean {
    try {
        const canvas = document.createElement('canvas');
        return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
        return false;
    }
}

const FallingPetals: React.FC<{ energized: boolean }> = ({ energized }) => {
    const petals = useMemo(
        () =>
            Array.from({ length: 14 }, (_, index) => ({
                id: index,
                left: 4 + ((index * 17) % 88),
                size: 12 + (index % 4) * 4,
                drift: -34 + (index % 6) * 14,
                swing: 12 + (index % 5) * 6,
                duration: 16 + (index % 5) * 2.1,
                delay: (index % 7) * 1.15,
                rotate: -30 + (index % 6) * 24,
                opacity: 0.32 + (index % 3) * 0.14,
            })),
        []
    );

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {petals.map((petal, index) => (
                <motion.span
                    key={petal.id}
                    className="absolute block"
                    style={{
                        left: `${petal.left}%`,
                        top: '-12%',
                        width: `${petal.size}px`,
                        height: `${petal.size * 0.74}px`,
                        borderRadius: '65% 35% 58% 42% / 54% 44% 56% 46%',
                        background:
                            'radial-gradient(circle at 35% 35%, rgba(255,247,250,0.96) 0%, rgba(250,194,214,0.96) 45%, rgba(154,90,113,0.88) 100%)',
                        boxShadow: '0 0 16px rgba(247, 183, 205, 0.18)',
                        filter: index % 4 === 0 ? 'blur(0.45px)' : 'none',
                    }}
                    animate={{
                        x: [0, petal.drift, petal.drift - petal.swing],
                        y: ['-12%', '110%'],
                        rotate: [petal.rotate, petal.rotate + 130, petal.rotate + 300],
                        scale: [0.92, 1.04, 0.88],
                        opacity: [0, petal.opacity, petal.opacity * 0.94, 0],
                    }}
                    transition={{
                        duration: energized ? petal.duration * 0.78 : petal.duration,
                        delay: petal.delay,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                />
            ))}
        </div>
    );
};

const BonsaiScene: React.FC<{ growth: number; isWatering: boolean }> = ({ growth, isWatering }) => (
    <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
        className="absolute inset-0 z-0 pointer-events-none"
    >
        <ambientLight intensity={0.55} color="#ffe4d2" />
        <pointLight position={[2.6, 2.5, 3]} intensity={1.5 + growth * 0.8} color="#ffb2cc" distance={14} />
        <pointLight position={[-3, -1, 2]} intensity={0.8} color="#b4d4ad" distance={11} />
        <DreiSparkles
            position={[0, 0, 0]}
            count={Math.round(40 + growth * 42)}
            scale={9}
            size={5 + growth * 2.4}
            speed={0.15}
            opacity={0.28}
            color="#ffd2e3"
            noise={0.9}
        />
        <DreiSparkles position={[0, -2, -3]} count={18} scale={10} size={4} speed={0.05} opacity={0.12} color="#cfe7c7" noise={0.4} />
        {isWatering ? (
            <Float speed={2.1} rotationIntensity={0.18} floatIntensity={0.38}>
                <DreiSparkles
                    position={[0, -0.5, 1.2]}
                    count={130}
                    scale={6.2}
                    size={7.5}
                    speed={3.3}
                    opacity={0.86}
                    color="#fff4f8"
                    noise={1.8}
                />
            </Float>
        ) : null}
        <EffectComposer>
            <Bloom luminanceThreshold={0.18} luminanceSmoothing={0.72} intensity={isWatering ? 1.55 : 1.1} />
        </EffectComposer>
    </Canvas>
);

export const BonsaiBloom: React.FC<BonsaiBloomProps> = ({ setView }) => {
    const [state, setState] = useState<BonsaiState>({ level: 1, xp: 0, myLastWatered: '', partnerLastWatered: '' });
    const [holdProgress, setHoldProgress] = useState(0);
    const [webglAvailable, setWebglAvailable] = useState(true);

    const holdTimerRef = useRef<number | null>(null);
    const resetTimerRef = useRef<number | null>(null);
    const stateRef = useRef(state);
    const completionRef = useRef(false);

    const profile = StorageService.getCoupleProfile();
    const myName = profile.myName?.trim() || 'You';
    const partnerName = profile.partnerName?.trim() || 'Partner';

    const storage = StorageService as typeof StorageService & {
        getBonsaiState?: () => BonsaiState;
        saveBonsaiState?: (value: BonsaiState) => void;
    };

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => {
        if (storage.getBonsaiState) setState(storage.getBonsaiState());
        const handler = () => {
            if (storage.getBonsaiState) setState(storage.getBonsaiState());
        };
        storageEventTarget.addEventListener('bonsaiUpdated', handler);
        return () => storageEventTarget.removeEventListener('bonsaiUpdated', handler);
    }, []);

    useEffect(() => {
        setWebglAvailable(hasWebGLSupport());
    }, []);

    const clearTimers = () => {
        if (holdTimerRef.current !== null) {
            window.clearInterval(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        if (resetTimerRef.current !== null) {
            window.clearTimeout(resetTimerRef.current);
            resetTimerRef.current = null;
        }
    };

    useEffect(() => () => clearTimers(), []);

    const isMyWatered = isSameDay(new Date(), state.myLastWatered ? new Date(state.myLastWatered) : new Date(0));
    const isPartnerWatered = isSameDay(new Date(), state.partnerLastWatered ? new Date(state.partnerLastWatered) : new Date(0));
    const isSynergy = isMyWatered && isPartnerWatered;
    const normalizedGrowth = Math.min(1, (state.level * 100 + state.xp) / 2000);
    const isWatering = holdProgress > 0;
    const growthPercent = Math.round(normalizedGrowth * 100);
    const xpToNext = Math.max(0, 100 - state.xp);
    const xpFill = state.xp === 0 ? 0 : Math.max(state.xp, 8);

    const stageLabel =
        normalizedGrowth < 0.22
            ? 'Rooted in quiet care'
            : normalizedGrowth < 0.56
              ? 'Taking graceful shape'
              : normalizedGrowth < 0.84
                ? 'Canopy gathering light'
                : 'Blossoming into memory';

    const ritualHeadline = isSynergy
        ? 'Shared bloom unlocked'
        : isMyWatered
          ? `Waiting for ${partnerName}`
          : 'Your touch wakes the blossoms';

    const ritualSubline = isSynergy
        ? 'Both of you watered today, so the tree is glowing at full harmony.'
        : isMyWatered
          ? `${partnerName} can water next to trigger the shared bloom bonus.`
          : 'Press and hold to pour patience into the tree and shape the next bloom.';

    const growthMarkers = useMemo(
        () =>
            GROWTH_MARKERS.map((marker, index) => ({
                ...marker,
                active: normalizedGrowth >= marker.threshold || (index === GROWTH_MARKERS.length - 1 && isSynergy),
            })),
        [normalizedGrowth, isSynergy]
    );

    const careEntries = useMemo(
        () => [
            {
                label: myName,
                active: isMyWatered,
                accent: 'rgba(244, 184, 205, 0.22)',
                border: 'rgba(255, 216, 228, 0.22)',
                text: isMyWatered ? formatDistanceToNow(new Date(state.myLastWatered), { addSuffix: true }) : 'Needs water',
                stateLabel: isMyWatered ? 'Watered' : 'Waiting',
            },
            {
                label: partnerName,
                active: isPartnerWatered,
                accent: 'rgba(189, 212, 169, 0.18)',
                border: 'rgba(211, 230, 194, 0.18)',
                text: isPartnerWatered ? formatDistanceToNow(new Date(state.partnerLastWatered), { addSuffix: true }) : 'Needs water',
                stateLabel: isPartnerWatered ? 'Watered' : 'Waiting',
            },
        ],
        [isMyWatered, isPartnerWatered, myName, partnerName, state.myLastWatered, state.partnerLastWatered]
    );

    const completeNurture = () => {
        if (completionRef.current) return;
        completionRef.current = true;
        clearTimers();
        feedback.success();

        const current = stateRef.current;
        const partnerWateredToday = isSameDay(
            new Date(),
            current.partnerLastWatered ? new Date(current.partnerLastWatered) : new Date(0)
        );
        let newXp = current.xp + (partnerWateredToday ? 40 : 20);
        let newLvl = current.level;
        if (newXp >= 100) {
            newXp -= 100;
            newLvl += 1;
        }

        const nextState: BonsaiState = {
            ...current,
            level: newLvl,
            xp: newXp,
            myLastWatered: new Date().toISOString(),
        };

        if (storage.saveBonsaiState) storage.saveBonsaiState(nextState);
        stateRef.current = nextState;
        setState(nextState);
        setHoldProgress(100);

        resetTimerRef.current = window.setTimeout(() => {
            setHoldProgress(0);
            completionRef.current = false;
        }, 950);
    };

    const startNurture = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (isMyWatered || holdTimerRef.current !== null) return;
        event.preventDefault();
        feedback.light();
        clearTimers();

        holdTimerRef.current = window.setInterval(() => {
            setHoldProgress((previous) => {
                const next = Math.min(100, previous + 5);
                if (next > previous && next % 25 === 0) feedback.light();
                if (next >= 100 && !completionRef.current) {
                    window.setTimeout(() => completeNurture(), 0);
                }
                return next;
            });
        }, 45);
    };

    const stopNurture = () => {
        if (completionRef.current) return;
        clearTimers();
        resetTimerRef.current = window.setTimeout(() => setHoldProgress(0), 220);
    };

    return (
        <div
            className="relative w-full overflow-hidden select-none text-[#f6eee8]"
            style={{
                height: '100dvh',
                background:
                    'linear-gradient(180deg, #120d0e 0%, #1b1213 28%, #140f10 68%, #0d0a0b 100%)',
            }}
        >
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: `
                        radial-gradient(circle at 50% 14%, rgba(245, 191, 209, 0.16), transparent 26%),
                        radial-gradient(circle at 22% 24%, rgba(129, 93, 79, 0.18), transparent 26%),
                        radial-gradient(circle at 82% 20%, rgba(103, 84, 72, 0.15), transparent 24%),
                        linear-gradient(180deg, rgba(255,255,255,0.04), transparent 22%, transparent 78%, rgba(0,0,0,0.24))
                    `,
                }}
            />
            <div
                className="absolute inset-0 pointer-events-none opacity-40"
                style={{
                    backgroundImage:
                        'linear-gradient(90deg, transparent, rgba(255,255,255,0.028), transparent), linear-gradient(90deg, transparent 8%, rgba(255,255,255,0.016) 8%, rgba(255,255,255,0.016) 8.4%, transparent 8.4%, transparent 91.6%, rgba(255,255,255,0.016) 91.6%, rgba(255,255,255,0.016) 92%, transparent 92%)',
                    backgroundSize: '100% 100%, 100% 100%',
                }}
            />
            <FallingPetals energized={isWatering || isSynergy} />
            {webglAvailable ? <BonsaiScene growth={normalizedGrowth} isWatering={isWatering} /> : null}

            <div
                className="relative z-20 h-full overflow-y-auto px-4 pt-safe sm:px-6"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
            >
                <div className="mx-auto w-full max-w-[29rem]">
                    <div className="flex items-start justify-between pt-5">
                        <button
                            type="button"
                            onClick={() => setView('home')}
                            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95"
                            style={{
                                background: 'rgba(255, 244, 240, 0.06)',
                                border: '1px solid rgba(255, 231, 225, 0.08)',
                                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.18)',
                            }}
                            aria-label="Back to home"
                        >
                            <ArrowLeft size={19} className="text-[#f4ebe5]" />
                        </button>

                        <div className="flex flex-col items-center px-3 text-center">
                            <span className="text-[10px] uppercase tracking-[0.38em] text-[#d4b6ab]/60">Moonlit Ritual</span>
                            <h1 className="mt-1 font-serif text-[1.55rem] text-[#f8f1eb]">Bonsai Bloom</h1>
                            <p className="mt-1 text-[11px] text-[#dec7bf]/72">{stageLabel}</p>
                        </div>

                        <div
                            className="flex min-h-11 min-w-[2.9rem] items-center justify-center rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.24em]"
                            style={{
                                background: isSynergy ? 'rgba(248, 205, 153, 0.16)' : 'rgba(255, 244, 240, 0.06)',
                                border: isSynergy
                                    ? '1px solid rgba(248, 205, 153, 0.24)'
                                    : '1px solid rgba(255, 231, 225, 0.08)',
                                color: isSynergy ? '#f5d8ae' : '#edd8cf',
                            }}
                        >
                            {isSynergy ? 'Bloom' : `Lv ${state.level}`}
                        </div>
                    </div>

                    <div
                        className="mt-5 rounded-[2rem] p-4"
                        style={{
                            background: 'linear-gradient(180deg, rgba(40, 25, 26, 0.9), rgba(21, 15, 16, 0.78))',
                            border: '1px solid rgba(255, 225, 216, 0.08)',
                            boxShadow: '0 24px 70px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                        }}
                    >
                        <div className="flex items-start gap-4">
                            <div
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.25rem]"
                                style={{
                                    background: isSynergy ? 'rgba(246, 207, 146, 0.16)' : 'rgba(244, 184, 205, 0.14)',
                                    border: isSynergy
                                        ? '1px solid rgba(246, 207, 146, 0.2)'
                                        : '1px solid rgba(255, 218, 230, 0.14)',
                                }}
                            >
                                {isSynergy ? (
                                    <Sparkles size={20} className="text-[#f5d8ae]" />
                                ) : (
                                    <Heart size={18} className="text-[#f5bfd1]" fill={isMyWatered ? 'currentColor' : 'none'} />
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] uppercase tracking-[0.32em] text-[#d0b2a7]/58">Today's ritual</p>
                                <h2 className="mt-1 font-serif text-[1.2rem] leading-tight text-[#f7efe8]">{ritualHeadline}</h2>
                                <p className="mt-1 text-[13px] leading-relaxed text-[#dcc7c0]/82">{ritualSubline}</p>
                            </div>
                        </div>
                    </div>

                    <div className="relative mt-5 min-h-[27rem]">
                        <div
                            className="absolute inset-x-1 inset-y-0 rounded-[2.5rem]"
                            style={{
                                background: 'linear-gradient(180deg, rgba(35, 21, 22, 0.96), rgba(11, 8, 9, 0.96))',
                                border: '1px solid rgba(255, 223, 214, 0.08)',
                                boxShadow: '0 35px 120px rgba(0, 0, 0, 0.52), inset 0 1px 0 rgba(255,255,255,0.05)',
                            }}
                        />
                        <div
                            className="absolute inset-x-6 top-6 bottom-11 rounded-[2.2rem]"
                            style={{
                                border: '1px solid rgba(255, 228, 219, 0.06)',
                                background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0))',
                                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.014), inset 0 -36px 56px rgba(0,0,0,0.22)',
                            }}
                        />
                        <div
                            className="absolute left-1/2 top-7 h-64 w-64 -translate-x-1/2 rounded-full"
                            style={{
                                background:
                                    'radial-gradient(circle, rgba(250, 194, 214, 0.24) 0%, rgba(250, 194, 214, 0.08) 38%, transparent 74%)',
                                filter: 'blur(14px)',
                            }}
                        />
                        <div
                            className="absolute left-1/2 top-11 h-[15.5rem] w-[15.5rem] -translate-x-1/2 rounded-[48%_48%_38%_38%/46%_46%_26%_26%]"
                            style={{
                                background:
                                    'radial-gradient(circle at 50% 28%, rgba(252, 232, 238, 0.2), rgba(250, 194, 214, 0.12) 28%, rgba(62, 35, 43, 0.1) 58%, transparent 74%)',
                            }}
                        />

                        <motion.div
                            className="absolute inset-x-0 bottom-[4.2rem] flex justify-center pointer-events-none"
                            animate={{
                                scale: 1 + normalizedGrowth * 0.1 + (isWatering ? 0.035 : 0),
                                y: isWatering ? -8 : 0,
                            }}
                            transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                        >
                            <img
                                src="/bonsai.png"
                                alt="Bonsai centerpiece"
                                className="w-[92%] max-w-[26rem] object-contain"
                                style={{
                                    filter: `drop-shadow(0 34px 55px rgba(0,0,0,0.5)) brightness(${isSynergy ? 1.08 : isWatering ? 1.16 : 1.02}) saturate(${isSynergy ? 1.08 : 1.02})`,
                                    maskImage: 'radial-gradient(circle at 50% 44%, black 56%, transparent 88%)',
                                    WebkitMaskImage: 'radial-gradient(circle at 50% 44%, black 56%, transparent 88%)',
                                }}
                            />
                        </motion.div>

                        <div
                            className="absolute left-1/2 bottom-[2.2rem] h-14 w-[72%] max-w-[15rem] -translate-x-1/2 rounded-[999px]"
                            style={{
                                background:
                                    'radial-gradient(ellipse at center, rgba(129, 84, 73, 0.36), rgba(20, 13, 13, 0.04) 72%, transparent 78%)',
                                filter: 'blur(10px)',
                            }}
                        />
                        <div
                            className="absolute inset-x-6 bottom-3 rounded-[1.8rem] px-4 py-3"
                            style={{
                                background: 'linear-gradient(180deg, rgba(29, 18, 19, 0.94), rgba(15, 10, 11, 0.84))',
                                border: '1px solid rgba(255, 224, 214, 0.08)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                            }}
                        >
                            <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-[10px] uppercase tracking-[0.28em] text-[#c9afa5]/58">Harmony level</p>
                                    <div className="mt-1 flex items-end gap-2">
                                        <span className="font-serif text-[1.9rem] leading-none text-[#f7efe8]">Lv. {state.level}</span>
                                        <span className="pb-1 text-[11px] text-[#d8c5be]/72">{stageLabel}</span>
                                    </div>
                                </div>

                                <div className="w-28 shrink-0">
                                    <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-[#cdb7ae]/60">
                                        <span>Growth</span>
                                        <span>{growthPercent}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-[rgba(255,255,255,0.06)]">
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{ background: 'linear-gradient(90deg, #b9cb90 0%, #eeb2c4 55%, #f7d8b0 100%)' }}
                                            animate={{ width: `${xpFill}%` }}
                                            transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                                        />
                                    </div>
                                    <p className="mt-2 text-[11px] text-[#e4d5cd]/72">{xpToNext} XP until next shaping</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div
                        className="mt-5 rounded-[2rem] p-4"
                        style={{
                            background: 'linear-gradient(180deg, rgba(39, 24, 24, 0.88), rgba(19, 14, 14, 0.82))',
                            border: '1px solid rgba(255, 224, 214, 0.08)',
                            boxShadow: '0 22px 60px rgba(0, 0, 0, 0.24)',
                        }}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.32em] text-[#ccb0a5]/58">Care journal</p>
                                <p className="mt-1 font-serif text-[1.05rem] text-[#f8f1eb]">Two waters unlock the luminous bloom.</p>
                            </div>
                            <div
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em]"
                                style={{
                                    background: 'rgba(255, 244, 240, 0.06)',
                                    border: '1px solid rgba(255, 224, 214, 0.08)',
                                    color: '#e3cfc7',
                                }}
                            >
                                <Wind size={12} />
                                Petal weather
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            {careEntries.map((entry) => (
                                <div
                                    key={entry.label}
                                    className="rounded-[1.5rem] p-4"
                                    style={{
                                        background: entry.active
                                            ? `linear-gradient(180deg, ${entry.accent}, rgba(20, 14, 14, 0.12))`
                                            : 'rgba(255, 247, 243, 0.03)',
                                        border: `1px solid ${entry.active ? entry.border : 'rgba(255, 224, 214, 0.06)'}`,
                                    }}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-serif text-[1rem] text-[#f5ede7]">{entry.label}</span>
                                        <span
                                            className="rounded-full px-2 py-1 text-[9px] uppercase tracking-[0.2em]"
                                            style={{
                                                background: entry.active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                                                color: entry.active ? '#fff1f5' : '#d9c5be',
                                            }}
                                        >
                                            {entry.stateLabel}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-[12px] text-[#dbc8c0]/78">{entry.text}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2.5">
                            {growthMarkers.map((marker) => (
                                <div
                                    key={marker.label}
                                    className="rounded-[1.25rem] p-3"
                                    style={{
                                        background: marker.active
                                            ? 'linear-gradient(180deg, rgba(244, 191, 206, 0.16), rgba(246, 214, 160, 0.08))'
                                            : 'rgba(255, 247, 243, 0.03)',
                                        border: marker.active
                                            ? '1px solid rgba(255, 221, 208, 0.12)'
                                            : '1px solid rgba(255, 224, 214, 0.05)',
                                    }}
                                >
                                    <p className="text-[10px] uppercase tracking-[0.22em] text-[#d5bcb2]/60">{marker.label}</p>
                                    <p className="mt-2 text-[11px] leading-snug text-[#ebddd6]/72">{marker.note}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-5 pb-2">
                        <AnimatePresence mode="wait">
                            {!isMyWatered ? (
                                <motion.div
                                    key="action-water"
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -12 }}
                                    className="flex flex-col items-center gap-3"
                                >
                                    <motion.button
                                        type="button"
                                        aria-label="Hold to water the bonsai"
                                        onPointerDown={startNurture}
                                        onPointerUp={stopNurture}
                                        onPointerLeave={stopNurture}
                                        onPointerCancel={stopNurture}
                                        className="pointer-events-auto relative flex h-[7.6rem] w-[7.6rem] items-center justify-center rounded-full"
                                        style={{ touchAction: 'none' }}
                                        animate={{ scale: holdProgress > 0 ? 0.96 : 1 }}
                                        transition={{ type: 'spring', stiffness: 180, damping: 16 }}
                                    >
                                        <div
                                            className="absolute inset-0 rounded-full"
                                            style={{
                                                background:
                                                    'radial-gradient(circle at 30% 28%, rgba(255,246,249,0.18), rgba(244,186,205,0.07) 46%, rgba(17,12,12,0.96) 74%)',
                                                boxShadow: '0 24px 50px rgba(0, 0, 0, 0.32)',
                                            }}
                                        />
                                        <svg className="absolute inset-0 h-full w-full -rotate-90">
                                            <circle cx="60" cy="60" r="52" stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="none" />
                                            <motion.circle
                                                cx="60"
                                                cy="60"
                                                r="52"
                                                stroke="url(#bonsai-ritual-ring)"
                                                strokeWidth="4.5"
                                                fill="none"
                                                strokeLinecap="round"
                                                animate={{ strokeDashoffset: RITUAL_RING - (RITUAL_RING * holdProgress) / 100 }}
                                                transition={{ duration: 0.08 }}
                                                strokeDasharray={RITUAL_RING}
                                            />
                                            <defs>
                                                <linearGradient id="bonsai-ritual-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                                                    <stop offset="0%" stopColor="#d9e9b5" />
                                                    <stop offset="50%" stopColor="#f6bdd2" />
                                                    <stop offset="100%" stopColor="#f8d8ae" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                        <div
                                            className="relative flex h-[5.6rem] w-[5.6rem] flex-col items-center justify-center rounded-full"
                                            style={{
                                                background: 'linear-gradient(180deg, rgba(46, 28, 29, 0.94), rgba(18, 12, 12, 0.96))',
                                                border: '1px solid rgba(255, 228, 219, 0.1)',
                                            }}
                                        >
                                            <Leaf size={24} className={holdProgress > 0 ? 'text-[#f6c4d6]' : 'text-[#f0e1d9]'} />
                                            <span className="mt-1 text-[9px] uppercase tracking-[0.24em] text-[#d8c2ba]/68">Hold</span>
                                        </div>
                                    </motion.button>

                                    <div className="text-center">
                                        <p className="font-serif text-[1rem] text-[#f7eee8]">
                                            {holdProgress > 0 ? `Pouring patience ${holdProgress}%` : 'Press and hold to water'}
                                        </p>
                                        <p className="mt-1 text-[12px] text-[#dbc7c0]/74">
                                            Each quiet ritual adds {isPartnerWatered ? '40' : '20'} XP to your shared tree.
                                        </p>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="action-complete"
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -12 }}
                                    className="rounded-[2rem] p-4"
                                    style={{
                                        background: isSynergy
                                            ? 'linear-gradient(180deg, rgba(247, 214, 162, 0.18), rgba(244, 189, 209, 0.14))'
                                            : 'linear-gradient(180deg, rgba(244, 189, 209, 0.16), rgba(36, 25, 26, 0.82))',
                                        border: isSynergy
                                            ? '1px solid rgba(247, 214, 162, 0.22)'
                                            : '1px solid rgba(255, 220, 230, 0.14)',
                                        boxShadow: '0 20px 52px rgba(0, 0, 0, 0.24)',
                                    }}
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.25rem]"
                                            style={{
                                                background: isSynergy ? 'rgba(255, 244, 222, 0.2)' : 'rgba(255, 235, 241, 0.1)',
                                                border: isSynergy
                                                    ? '1px solid rgba(247, 214, 162, 0.24)'
                                                    : '1px solid rgba(255, 224, 234, 0.14)',
                                            }}
                                        >
                                            <Sparkles size={20} className={isSynergy ? 'text-[#f7d8ae]' : 'text-[#f4bfd0]'} />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] uppercase tracking-[0.3em] text-[#e2ccc3]/66">Today's ritual</p>
                                            <h3 className="mt-1 font-serif text-[1.1rem] text-[#fbf2ec]">
                                                {isSynergy ? 'The garden is in full bloom.' : 'Your side of the ritual is complete.'}
                                            </h3>
                                            <p className="mt-1 text-[13px] leading-relaxed text-[#efe0d8]/76">
                                                {isSynergy
                                                    ? 'Both hearts showed up today, and the bonsai answered with a warmer glow.'
                                                    : `${partnerName} can still water today to unlock the shared bloom bonus.`}
                                            </p>
                                        </div>
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
