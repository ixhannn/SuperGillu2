import React, { useState, useEffect, useRef } from 'react';
import { ViewState } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplet, Wind, Sparkles } from 'lucide-react';
import { feedback } from '../utils/feedback';
import { ViewHeader } from '../components/ViewHeader';
import { isSameDay } from 'date-fns';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Float, ContactShadows, Sparkles as DreiSparkles } from '@react-three/drei';
import * as THREE from 'three';

export interface BonsaiState {
    level: number; xp: number;
    myLastWatered: string; partnerLastWatered: string;
}
interface BonsaiBloomProps { setView: (view: ViewState) => void; }

type SceneErrorBoundaryProps = {
    growth: number;
    isWatering: boolean;
    children: React.ReactNode;
};

type SceneErrorBoundaryState = {
    hasError: boolean;
};

function hasWebGLSupport(): boolean {
    try {
        const canvas = document.createElement('canvas');
        return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
        return false;
    }
}

const TreeModel = ({ growth, isWatering }: { growth: number; isWatering: boolean }) => {
    const targetScale = 0.5 + growth * 0.5;
    const treeGroupRef = useRef<THREE.Group>(null);
    const canopyRef1 = useRef<THREE.Mesh>(null);
    const canopyRef2 = useRef<THREE.Mesh>(null);
    const canopyRef3 = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (treeGroupRef.current) {
            treeGroupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.05);
        }
        const t = state.clock.getElapsedTime();
        const breathe = 1 + Math.sin(t * 2) * 0.02;
        if (canopyRef1.current) canopyRef1.current.scale.setScalar(breathe);
        if (canopyRef2.current) canopyRef2.current.scale.setScalar(breathe * 0.98);
        if (canopyRef3.current) canopyRef3.current.scale.setScalar(breathe * 1.02);
    });

    return (
        <group position={[0, -1.2, 0]}>
            {/* The Pot */}
            <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[1.2, 0.9, 0.4, 32]} />
                <meshStandardMaterial color="#1a141c" roughness={0.8} />
            </mesh>
            {/* Soil */}
            <mesh position={[0, 0.41, 0]} receiveShadow>
                <cylinderGeometry args={[1.1, 1.1, 0.02, 32]} />
                <meshStandardMaterial color="#2d1c16" roughness={1} />
            </mesh>

            {/* Scale-animated tree container */}
            <group ref={treeGroupRef} position={[0, 0.41, 0]}>
                
                {/* Main Trunk */}
                <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
                    <cylinderGeometry args={[0.15, 0.25, 2.4, 8]} />
                    <meshStandardMaterial color="#301E17" roughness={0.9} />
                </mesh>

                {/* Branch Right */}
                <group position={[0.1, 1.4, 0]} rotation={[0, 0, -0.6]}>
                    <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
                        <cylinderGeometry args={[0.08, 0.12, 1.2, 6]} />
                        <meshStandardMaterial color="#301E17" roughness={0.9} />
                    </mesh>
                    <mesh ref={canopyRef1} position={[0, 1.2, 0]} castShadow receiveShadow>
                        <sphereGeometry args={[0.9, 16, 16]} />
                        <meshStandardMaterial color="#ff7eb3" roughness={0.5} />
                    </mesh>
                </group>

                {/* Branch Left */}
                <group position={[-0.1, 1.8, 0.2]} rotation={[0.3, 0, 0.5]}>
                    <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
                        <cylinderGeometry args={[0.06, 0.1, 1, 6]} />
                        <meshStandardMaterial color="#301E17" roughness={0.9} />
                    </mesh>
                    <mesh ref={canopyRef2} position={[0, 1.1, 0]} castShadow receiveShadow>
                        <sphereGeometry args={[0.7, 16, 16]} />
                        <meshStandardMaterial color="#ff7eb3" roughness={0.5} />
                    </mesh>
                </group>

                {/* Top/Back Foliage */}
                <mesh ref={canopyRef3} position={[0, 2.5, -0.2]} castShadow receiveShadow>
                    <sphereGeometry args={[1.1, 16, 16]} />
                    <meshStandardMaterial color="#ff5e9e" roughness={0.5} />
                </mesh>
            </group>

            {/* Watering Sparkles */}
            {isWatering && (
                <DreiSparkles position={[0, 2, 0]} count={50} scale={3} size={4} speed={2} opacity={0.6} color="#ffa6c9" />
            )}
        </group>
    );
};

class SceneErrorBoundary extends React.Component<SceneErrorBoundaryProps, SceneErrorBoundaryState> {
    constructor(props: SceneErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): SceneErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch() {
        // Keep this view alive by falling back to SVG tree if WebGL scene crashes.
    }

    render() {
        if (this.state.hasError) {
            return <BasicTreeFallback growth={this.props.growth} isWatering={this.props.isWatering} />;
        }
        return this.props.children;
    }
}

/* -- R3F Canvas Component --------------------------------- */
const BonsaiScene: React.FC<{ growth: number; isWatering: boolean }> = ({ growth, isWatering }) => {
    return (
        <div className="absolute inset-0 pt-24 pb-32 pointer-events-none">
            <Canvas shadows camera={{ position: [0, 1, 6], fov: 45 }} className="pointer-events-auto">
                <ambientLight intensity={0.6} />
                <directionalLight position={[5, 8, 5]} intensity={1.5} castShadow shadow-mapSize={1024} />
                <spotLight position={[-5, 5, -5]} intensity={0.5} color="#ffebf0" />

                <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}>
                    <TreeModel growth={growth} isWatering={isWatering} />
                </Float>

                <ContactShadows position={[0, -1.8, 0]} opacity={0.5} scale={10} blur={2} far={4} color="#000000" />
                
                <OrbitControls 
                    enableZoom={false} 
                    enablePan={false} 
                    autoRotate 
                    autoRotateSpeed={1.0} 
                    maxPolarAngle={Math.PI / 2 + 0.1} 
                    minPolarAngle={Math.PI / 3} 
                />
            </Canvas>
        </div>
    );
};

const BasicTreeFallback: React.FC<{ growth: number; isWatering: boolean }> = ({ growth, isWatering }) => {
    const canopyScale = 0.8 + growth * 0.35;
    const trunkScale = 0.75 + growth * 0.25;

    return (
        <div className="absolute inset-0 pt-24 pb-32 flex items-center justify-center">
            <svg viewBox="0 0 400 520" className="w-full h-full max-w-[420px]">
                <defs>
                    <radialGradient id="fallbackGlow" cx="50%" cy="55%" r="50%">
                        <stop offset="0%" stopColor="rgba(255,120,170,0.2)" />
                        <stop offset="100%" stopColor="rgba(255,120,170,0)" />
                    </radialGradient>
                </defs>

                <ellipse cx="200" cy="300" rx="140" ry="120" fill="url(#fallbackGlow)" />

                <g transform={`translate(200 330) scale(${trunkScale})`}>
                    <rect x="-16" y="-160" width="32" height="170" rx="14" fill="#301E17" />
                    <rect x="8" y="-130" width="20" height="90" rx="10" transform="rotate(28)" fill="#301E17" />
                    <rect x="-28" y="-110" width="18" height="85" rx="9" transform="rotate(-30)" fill="#301E17" />
                </g>

                <g transform={`translate(200 170) scale(${canopyScale})`}>
                    <circle cx="0" cy="20" r="70" fill="#ff5e9e" />
                    <circle cx="-58" cy="36" r="48" fill="#ff7eb3" />
                    <circle cx="56" cy="38" r="50" fill="#ff7eb3" />
                </g>

                <ellipse cx="200" cy="410" rx="110" ry="32" fill="#120d0f" />
                <ellipse cx="200" cy="410" rx="118" ry="36" fill="none" stroke="#3d2633" strokeWidth="4" />

                {isWatering && (
                    <g fill="#ffa6c9" opacity="0.8">
                        <circle cx="150" cy="120" r="4" />
                        <circle cx="180" cy="105" r="3" />
                        <circle cx="220" cy="112" r="4" />
                        <circle cx="248" cy="130" r="3" />
                    </g>
                )}
            </svg>
        </div>
    );
};

/* -- Main View --------------------------------------------------- */
export const BonsaiBloom: React.FC<BonsaiBloomProps> = ({ setView }) => {
    const [state, setState] = useState<BonsaiState>({ level: 1, xp: 0, myLastWatered: '', partnerLastWatered: '' });
    const [holdProgress, setHoldProgress] = useState(0);
    const [webglAvailable, setWebglAvailable] = useState(true);
    const holdRef = useRef<any>(null);
    const resetHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const storage = StorageService as typeof StorageService & {
        getBonsaiState?: () => BonsaiState;
        saveBonsaiState?: (value: BonsaiState) => void;
    };

    useEffect(() => {
        if (storage.getBonsaiState) {
            setState(storage.getBonsaiState());
        }
        const handler = () => {
            if (storage.getBonsaiState) setState(storage.getBonsaiState());
        };
        storageEventTarget.addEventListener("bonsaiUpdated", handler);
        return () => storageEventTarget.removeEventListener("bonsaiUpdated", handler);
    }, []);

    useEffect(() => {
        setWebglAvailable(hasWebGLSupport());
    }, []);

    useEffect(() => {
        return () => {
            if (holdRef.current) {
                clearInterval(holdRef.current);
                holdRef.current = null;
            }
            if (resetHoldTimeoutRef.current) {
                clearTimeout(resetHoldTimeoutRef.current);
                resetHoldTimeoutRef.current = null;
            }
        };
    }, []);

    const isWateredToday = isSameDay(new Date(), state.myLastWatered ? new Date(state.myLastWatered) : new Date(0));
    
    const normalizedGrowth = Math.min(1, (state.level * 100 + state.xp) / 1000);
    const isWatering = holdProgress > 0;

    const startWatering = (e: React.TouchEvent | React.MouseEvent) => {
        if (isWateredToday || holdRef.current) return;
        e.preventDefault();
        
        if (resetHoldTimeoutRef.current) {
            clearTimeout(resetHoldTimeoutRef.current);
            resetHoldTimeoutRef.current = null;
        }
        
        feedback.impact('light');

        holdRef.current = setInterval(() => {
            setHoldProgress((previous) => {
                const next = Math.min(100, previous + 5);

                if (next % 20 === 0) {
                    feedback.impact('light');
                }

                if (next >= 100) {
                    if (holdRef.current) {
                        clearInterval(holdRef.current);
                        holdRef.current = null;
                    }
                    completeWatering();
                }

                return next;
            });
        }, 50);
    };

    const stopWatering = () => {
        if (!holdRef.current) return;
        clearInterval(holdRef.current);
        holdRef.current = null;
        
        resetHoldTimeoutRef.current = setTimeout(() => {
            setHoldProgress(0);
            resetHoldTimeoutRef.current = null;
        }, 500);
    };

    const completeWatering = () => {
        feedback.notification('success');
        
        let newXp = state.xp + 20;
        let newLvl = state.level;
        if (newXp >= 100) {
            newXp = 0;
            newLvl += 1;
        }

        const newState: BonsaiState = {
            ...state,
            level: newLvl,
            xp: newXp,
            myLastWatered: new Date().toISOString()
        };

        if (storage.saveBonsaiState) {
            storage.saveBonsaiState(newState);
        }
        setState(newState);
        if (resetHoldTimeoutRef.current) {
            clearTimeout(resetHoldTimeoutRef.current);
        }
        resetHoldTimeoutRef.current = setTimeout(() => {
            setHoldProgress(0);
            resetHoldTimeoutRef.current = null;
        }, 1000);
    };

    return (
        <div className="relative w-full h-full bg-[#0a0508] overflow-hidden select-none">
            {webglAvailable ? (
                <SceneErrorBoundary growth={normalizedGrowth} isWatering={isWatering}>
                    <BonsaiScene growth={normalizedGrowth} isWatering={isWatering} />
                </SceneErrorBoundary>
            ) : (
                <BasicTreeFallback growth={normalizedGrowth} isWatering={isWatering} />
            )}

            {/* UI Top Layer (pointer-events-none to let touch pass to canvas) */}
            <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
                <div className="pointer-events-auto">
                    <ViewHeader title="Bonsai Bloom" onBack={() => setView('home')} />
                </div>

                {/* Level Badge */}
                <div className="mt-8 flex justify-center w-full pointer-events-none">
                    <div className="bg-black/30 backdrop-blur-xl px-5 py-2.5 rounded-full border border-pink-500/20 flex items-center space-x-3 shadow-[0_0_20px_rgba(255,100,150,0.1)]">
                        <Sparkles className="w-4 h-4 text-pink-400" />
                        <span className="text-white/90 font-medium tracking-wide">Lvl {state.level}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-pink-500/50" />
                        <span className="text-white/60 font-medium">{state.xp}/100 XP</span>
                    </div>
                </div>

                <div className="flex-1" />

                {/* Watering Button Area */}
                <div className="pb-12 flex justify-center w-full pointer-events-auto">
                    <AnimatePresence mode="wait">
                        {!isWateredToday ? (
                            <motion.div 
                                key="water-btn"
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                className="relative flex items-center justify-center"
                                onPointerDown={startWatering}
                                onPointerUp={stopWatering}
                                onPointerLeave={stopWatering}
                                onPointerCancel={stopWatering}
                                style={{ touchAction: 'none' }}
                            >
                                <svg className="absolute w-24 h-24 -rotate-90 pointer-events-none">
                                    <circle cx="48" cy="48" r="44" stroke="rgba(255,255,255,0.1)" strokeWidth="3" fill="none" />
                                    <motion.circle 
                                        cx="48" cy="48" r="44" 
                                        stroke="url(#waterGrad)" strokeWidth="4" fill="none" strokeLinecap="round"
                                        strokeDasharray="276"
                                        animate={{ strokeDashoffset: 276 - (276 * holdProgress) / 100 }}
                                        transition={{ duration: 0.1 }}
                                    />
                                    <defs>
                                        <linearGradient id="waterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#ff7eb3" />
                                            <stop offset="100%" stopColor="#ff1493" />
                                        </linearGradient>
                                    </defs>
                                </svg>

                                <motion.div 
                                    className="w-16 h-16 bg-gradient-to-br from-pink-400 to-rose-600 rounded-full flex items-center justify-center shadow-lg cursor-pointer"
                                    animate={{ scale: holdProgress > 0 ? 0.9 : 1 }}
                                >
                                    <Droplet className="w-7 h-7 text-white fill-white/20" />
                                </motion.div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="watered-msg"
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                className="bg-white/5 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 flex items-center space-x-3 text-pink-200/80 pointer-events-none"
                            >
                                <Wind className="w-5 h-5 opacity-60" />
                                <span className="text-sm font-medium tracking-wide">Tree is flourishing today</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};
