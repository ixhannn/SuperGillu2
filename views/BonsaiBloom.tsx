import React, { useState, useEffect, useRef } from 'react';
import { ViewState } from '../types';
import { StorageService, storageEventTarget } from '../services/storage';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplet, Wind, Sparkles, ArrowLeft } from 'lucide-react';
import { feedback } from '../utils/feedback';
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

/* Shared trunk material color */
const TRUNK_COLOR = '#2e1508';

const Bloom: React.FC<{
    position: [number, number, number];
    radius: number;
    color: string;
    breatheOffset?: number;
    meshRef?: React.RefObject<THREE.Mesh | null>;
}> = ({ position, radius, color, breatheOffset = 0, meshRef }) => (
    <mesh ref={meshRef} position={position} castShadow>
        <sphereGeometry args={[radius, 14, 14]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.0} />
    </mesh>
);

const TreeModel = ({ growth, isWatering }: { growth: number; isWatering: boolean }) => {
    const targetScale = 0.55 + growth * 0.45;
    const treeGroupRef = useRef<THREE.Group>(null);
    const b0 = useRef<THREE.Mesh>(null);
    const b1 = useRef<THREE.Mesh>(null);
    const b2 = useRef<THREE.Mesh>(null);
    const b3 = useRef<THREE.Mesh>(null);
    const b4 = useRef<THREE.Mesh>(null);
    const b5 = useRef<THREE.Mesh>(null);
    const b6 = useRef<THREE.Mesh>(null);
    const b7 = useRef<THREE.Mesh>(null);
    const b8 = useRef<THREE.Mesh>(null);

    const bloomRefs = [b0, b1, b2, b3, b4, b5, b6, b7, b8];

    useFrame((state) => {
        if (treeGroupRef.current) {
            treeGroupRef.current.scale.lerp(
                new THREE.Vector3(targetScale, targetScale, targetScale),
                0.04
            );
        }
        const t = state.clock.getElapsedTime();
        bloomRefs.forEach((ref, i) => {
            if (ref.current) {
                const s = 1 + Math.sin(t * 1.4 + i * 0.8) * 0.025;
                ref.current.scale.setScalar(s);
            }
        });
    });

    const trunkMat = (
        <meshStandardMaterial color={TRUNK_COLOR} roughness={0.88} metalness={0.05} />
    );

    return (
        <group position={[0, -1.6, 0]}>
            {/* Bonsai pot — shallow rectangle */}
            <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
                <boxGeometry args={[2.6, 0.28, 1.55]} />
                <meshStandardMaterial color="#160a10" roughness={0.65} metalness={0.25} />
            </mesh>
            {/* Pot rim */}
            <mesh position={[0, 0.24, 0]}>
                <boxGeometry args={[2.72, 0.09, 1.67]} />
                <meshStandardMaterial color="#1e0e18" roughness={0.55} metalness={0.35} />
            </mesh>
            {/* Pot feet */}
            {([-0.95, 0.95] as number[]).map((x) =>
                ([-0.55, 0.55] as number[]).map((z) => (
                    <mesh key={`${x}${z}`} position={[x, -0.02, z]}>
                        <boxGeometry args={[0.18, 0.08, 0.18]} />
                        <meshStandardMaterial color="#160a10" roughness={0.8} />
                    </mesh>
                ))
            )}
            {/* Soil */}
            <mesh position={[0, 0.3, 0]} receiveShadow>
                <boxGeometry args={[2.5, 0.04, 1.45]} />
                <meshStandardMaterial color="#130a07" roughness={1} />
            </mesh>
            {/* Moss accent on soil */}
            <mesh position={[0.3, 0.31, 0.2]}>
                <sphereGeometry args={[0.28, 8, 8]} />
                <meshStandardMaterial color="#1a2e0a" roughness={1} />
            </mesh>
            <mesh position={[-0.4, 0.31, -0.1]}>
                <sphereGeometry args={[0.2, 8, 8]} />
                <meshStandardMaterial color="#162808" roughness={1} />
            </mesh>

            {/* Tree */}
            <group ref={treeGroupRef} position={[0, 0.32, 0]}>

                {/* Lower trunk — thick, leans slightly right */}
                <mesh position={[0.05, 0.75, 0]} rotation={[0, 0, -0.06]} castShadow>
                    <cylinderGeometry args={[0.2, 0.32, 1.5, 10]} />
                    {trunkMat}
                </mesh>

                {/* Mid trunk — leans left, thinner */}
                <mesh position={[-0.08, 1.7, 0]} rotation={[0, 0.1, 0.12]} castShadow>
                    <cylinderGeometry args={[0.11, 0.2, 1.0, 8]} />
                    {trunkMat}
                </mesh>

                {/* Branch 1 — sweeps right, low */}
                <group position={[0.18, 0.85, 0]} rotation={[0.08, 0.25, -0.75]}>
                    <mesh position={[0, 0.75, 0]} castShadow>
                        <cylinderGeometry args={[0.055, 0.11, 1.5, 7]} />
                        {trunkMat}
                    </mesh>
                    {/* sub-branch tip */}
                    <group position={[0, 1.5, 0]} rotation={[0, 0, -0.4]}>
                        <mesh position={[0, 0.4, 0]} castShadow>
                            <cylinderGeometry args={[0.03, 0.055, 0.8, 6]} />
                            {trunkMat}
                        </mesh>
                    </group>
                    <Bloom meshRef={b0} position={[-0.05, 1.85, 0.1]} radius={0.48} color="#f0548c" />
                    <Bloom meshRef={b1} position={[0.32, 1.65, -0.1]} radius={0.35} color="#ff8ab8" />
                    <Bloom position={[-0.28, 1.55, 0.2]} radius={0.27} color="#ffaacf" />
                </group>

                {/* Branch 2 — sweeps left, mid height */}
                <group position={[-0.18, 1.15, 0.05]} rotation={[-0.12, -0.2, 0.72]}>
                    <mesh position={[0, 0.8, 0]} castShadow>
                        <cylinderGeometry args={[0.05, 0.1, 1.6, 7]} />
                        {trunkMat}
                    </mesh>
                    <group position={[0, 1.55, 0]} rotation={[0, 0, 0.35]}>
                        <mesh position={[0, 0.35, 0]} castShadow>
                            <cylinderGeometry args={[0.028, 0.05, 0.7, 6]} />
                            {trunkMat}
                        </mesh>
                    </group>
                    <Bloom meshRef={b2} position={[0.12, 1.9, 0.1]} radius={0.55} color="#e8417a" />
                    <Bloom meshRef={b3} position={[-0.3, 1.7, -0.05]} radius={0.38} color="#ff7eb3" />
                    <Bloom position={[0.28, 1.5, -0.15]} radius={0.24} color="#ffc0dc" />
                </group>

                {/* Branch 3 — goes forward, mid-high */}
                <group position={[0.1, 1.55, 0.12]} rotation={[-0.6, 0.15, -0.35]}>
                    <mesh position={[0, 0.65, 0]} castShadow>
                        <cylinderGeometry args={[0.042, 0.085, 1.3, 7]} />
                        {trunkMat}
                    </mesh>
                    <Bloom meshRef={b4} position={[-0.05, 1.45, 0.12]} radius={0.52} color="#f06090" />
                    <Bloom position={[0.25, 1.3, -0.1]} radius={0.3} color="#ffb0d0" />
                </group>

                {/* Branch 4 — upper left crown */}
                <group position={[-0.22, 2.08, 0]} rotation={[0, 0.05, 0.28]}>
                    <mesh position={[0, 0.55, 0]} castShadow>
                        <cylinderGeometry args={[0.038, 0.075, 1.1, 7]} />
                        {trunkMat}
                    </mesh>
                    <Bloom meshRef={b5} position={[-0.18, 1.3, 0.05]} radius={0.5} color="#f24e85" />
                    <Bloom meshRef={b6} position={[0.22, 1.15, 0.1]} radius={0.33} color="#ffa8cc" />
                </group>

                {/* Branch 5 — upper right, back */}
                <group position={[0.15, 2.0, -0.08]} rotation={[0.2, 0.1, -0.3]}>
                    <mesh position={[0, 0.45, 0]} castShadow>
                        <cylinderGeometry args={[0.032, 0.065, 0.9, 6]} />
                        {trunkMat}
                    </mesh>
                    <Bloom meshRef={b7} position={[0.1, 1.05, -0.05]} radius={0.42} color="#e83870" />
                    <Bloom position={[-0.2, 0.95, 0.1]} radius={0.28} color="#ff9ec8" />
                </group>

                {/* Crown apex */}
                <Bloom meshRef={b8} position={[-0.06, 3.05, -0.08]} radius={0.6} color="#dd2e68" />
                <Bloom position={[0.18, 2.9, 0.1]} radius={0.36} color="#f06898" />
                <Bloom position={[-0.3, 2.75, -0.05]} radius={0.28} color="#ff94c0" />

                {/* Watering sparkles */}
                {isWatering && (
                    <DreiSparkles
                        position={[0, 2.5, 0]}
                        count={70}
                        scale={5}
                        size={5}
                        speed={2.5}
                        opacity={0.75}
                        color="#ffb6d9"
                    />
                )}
            </group>

            {/* Soft floor glow */}
            <mesh position={[0, -0.25, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[8, 8]} />
                <meshStandardMaterial color="#12020e" roughness={1} />
            </mesh>
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

    componentDidCatch() {}

    render() {
        if (this.state.hasError) {
            return <BasicTreeFallback growth={this.props.growth} isWatering={this.props.isWatering} />;
        }
        return this.props.children;
    }
}

/* -- R3F Canvas ------------------------------------------- */
const BonsaiScene: React.FC<{ growth: number; isWatering: boolean }> = ({ growth, isWatering }) => {
    return (
        <div className="absolute inset-0 pointer-events-none">
            <Canvas
                shadows
                camera={{ position: [0, 0.6, 7], fov: 42 }}
                className="pointer-events-auto"
                gl={{ antialias: true }}
            >
                {/* Background */}
                <color attach="background" args={['#0c0414']} />
                <fog attach="fog" args={['#0c0414', 14, 22]} />

                {/* Lights */}
                <ambientLight intensity={0.25} color="#ffe0f0" />
                <directionalLight
                    position={[4, 7, 4]}
                    intensity={1.1}
                    color="#fff4f8"
                    castShadow
                    shadow-mapSize={1024}
                />
                {/* Warm pink uplight from front */}
                <pointLight position={[0, -0.5, 4]} intensity={3.5} color="#ff4080" distance={10} decay={2} />
                {/* Cool purple rim from behind */}
                <pointLight position={[-3, 4, -3]} intensity={0.7} color="#9040ff" distance={12} decay={2} />
                {/* Soft fill */}
                <pointLight position={[3, 2, 2]} intensity={0.4} color="#ffb0d0" distance={8} decay={2} />

                <Float speed={1.5} rotationIntensity={0.05} floatIntensity={0.15}>
                    <TreeModel growth={growth} isWatering={isWatering} />
                </Float>

                <ContactShadows
                    position={[0, -2.05, 0]}
                    opacity={0.6}
                    scale={14}
                    blur={2.5}
                    far={5}
                    color="#4a0030"
                />

                <OrbitControls
                    enableZoom={false}
                    enablePan={false}
                    autoRotate
                    autoRotateSpeed={0.8}
                    maxPolarAngle={Math.PI / 2 + 0.05}
                    minPolarAngle={Math.PI / 4}
                />
            </Canvas>
        </div>
    );
};

/* -- SVG Fallback ----------------------------------------- */
const BasicTreeFallback: React.FC<{ growth: number; isWatering: boolean }> = ({ growth, isWatering }) => {
    const canopyScale = 0.8 + growth * 0.35;
    const trunkScale = 0.75 + growth * 0.25;

    return (
        <div
            className="absolute inset-0 flex items-center justify-center pt-28 pb-36"
            style={{ background: 'linear-gradient(170deg, #0c0414 0%, #180820 60%, #0c0414 100%)' }}
        >
            <svg viewBox="0 0 400 520" className="w-full h-full max-w-[380px]">
                <defs>
                    <radialGradient id="fg" cx="50%" cy="55%" r="48%">
                        <stop offset="0%" stopColor="rgba(255,60,130,0.25)" />
                        <stop offset="100%" stopColor="rgba(255,60,130,0)" />
                    </radialGradient>
                </defs>
                <ellipse cx="200" cy="310" rx="155" ry="110" fill="url(#fg)" />
                <g transform={`translate(200 340) scale(${trunkScale})`}>
                    <rect x="-14" y="-155" width="28" height="165" rx="12" fill="#2e1508" />
                    <rect x="7" y="-120" width="18" height="85" rx="9" transform="rotate(26)" fill="#2e1508" />
                    <rect x="-25" y="-105" width="16" height="80" rx="8" transform="rotate(-28)" fill="#2e1508" />
                </g>
                <g transform={`translate(200 180) scale(${canopyScale})`}>
                    <circle cx="0" cy="15" r="65" fill="#e8407a" />
                    <circle cx="-62" cy="30" r="46" fill="#f06090" />
                    <circle cx="60" cy="35" r="48" fill="#f06090" />
                    <circle cx="-28" cy="-20" r="38" fill="#ff7eb3" />
                    <circle cx="30" cy="-18" r="36" fill="#ff7eb3" />
                    <circle cx="0" cy="-48" r="30" fill="#ff9ec8" />
                </g>
                <rect x="155" y="415" width="90" height="22" rx="5" fill="#160a10" />
                <rect x="148" y="410" width="104" height="12" rx="4" fill="#1e0e18" />
                {isWatering && (
                    <g fill="#ffb6d9" opacity="0.85">
                        <circle cx="148" cy="115" r="4" />
                        <circle cx="178" cy="100" r="3" />
                        <circle cx="220" cy="108" r="4" />
                        <circle cx="252" cy="128" r="3" />
                        <circle cx="165" cy="90" r="2.5" />
                    </g>
                )}
            </svg>
        </div>
    );
};

/* -- Main View --------------------------------------------- */
export const BonsaiBloom: React.FC<BonsaiBloomProps> = ({ setView }) => {
    const [state, setState] = useState<BonsaiState>({ level: 1, xp: 0, myLastWatered: '', partnerLastWatered: '' });
    const [holdProgress, setHoldProgress] = useState(0);
    const [webglAvailable, setWebglAvailable] = useState(true);
    const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
        storageEventTarget.addEventListener('bonsaiUpdated', handler);
        return () => storageEventTarget.removeEventListener('bonsaiUpdated', handler);
    }, []);

    useEffect(() => {
        setWebglAvailable(hasWebGLSupport());
    }, []);

    useEffect(() => {
        return () => {
            if (holdRef.current) clearInterval(holdRef.current);
            if (resetHoldTimeoutRef.current) clearTimeout(resetHoldTimeoutRef.current);
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
        feedback.light();
        holdRef.current = setInterval(() => {
            setHoldProgress((prev) => {
                const next = Math.min(100, prev + 5);
                if (next % 20 === 0) feedback.light();
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
        feedback.success();
        let newXp = state.xp + 20;
        let newLvl = state.level;
        if (newXp >= 100) { newXp = 0; newLvl += 1; }
        const newState: BonsaiState = { ...state, level: newLvl, xp: newXp, myLastWatered: new Date().toISOString() };
        if (storage.saveBonsaiState) storage.saveBonsaiState(newState);
        setState(newState);
        if (resetHoldTimeoutRef.current) clearTimeout(resetHoldTimeoutRef.current);
        resetHoldTimeoutRef.current = setTimeout(() => {
            setHoldProgress(0);
            resetHoldTimeoutRef.current = null;
        }, 1000);
    };

    return (
        <div
            className="relative w-full overflow-hidden select-none"
            style={{ height: '100dvh', background: '#0c0414' }}
        >
            {/* 3D scene or SVG fallback */}
            {webglAvailable ? (
                <SceneErrorBoundary growth={normalizedGrowth} isWatering={isWatering}>
                    <BonsaiScene growth={normalizedGrowth} isWatering={isWatering} />
                </SceneErrorBoundary>
            ) : (
                <BasicTreeFallback growth={normalizedGrowth} isWatering={isWatering} />
            )}

            {/* Gradient vignette — top & bottom */}
            <div
                className="absolute inset-0 pointer-events-none z-[1]"
                style={{
                    background:
                        'linear-gradient(180deg, rgba(12,4,20,0.88) 0%, rgba(12,4,20,0) 22%, rgba(12,4,20,0) 65%, rgba(12,4,20,0.92) 100%)',
                }}
            />

            {/* UI overlay */}
            <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">

                {/* Custom dark header */}
                <div className="flex items-center justify-between px-5 pt-safe pt-4">
                    <button
                        onClick={() => setView('home')}
                        className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center"
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: 'rgba(255,255,255,0.8)',
                        }}
                    >
                        <ArrowLeft size={18} />
                    </button>

                    <div className="text-center absolute left-1/2 -translate-x-1/2">
                        <p className="text-xs uppercase tracking-[0.18em] font-semibold"
                            style={{ color: 'rgba(255,150,200,0.7)' }}>
                            Bonsai Bloom
                        </p>
                    </div>

                    <div className="w-10" />
                </div>

                {/* Level + XP */}
                <div className="mt-5 flex flex-col items-center gap-2.5 pointer-events-none">
                    <div
                        className="flex items-center gap-2.5 px-5 py-2"
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            backdropFilter: 'blur(16px)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '100px',
                        }}
                    >
                        <Sparkles className="w-3.5 h-3.5" style={{ color: '#ff7eb3' }} />
                        <span className="text-sm font-semibold tracking-wide" style={{ color: 'rgba(255,255,255,0.9)' }}>
                            Level {state.level}
                        </span>
                        <div className="w-px h-3.5" style={{ background: 'rgba(255,255,255,0.15)' }} />
                        <span className="text-xs" style={{ color: 'rgba(255,180,210,0.7)' }}>
                            {state.xp}/100 XP
                        </span>
                    </div>

                    {/* XP progress bar */}
                    <div
                        className="w-32 h-1 rounded-full overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.08)' }}
                    >
                        <motion.div
                            className="h-full rounded-full"
                            style={{ background: 'linear-gradient(90deg, #e8407a, #ff85b3)' }}
                            animate={{ width: `${state.xp}%` }}
                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        />
                    </div>
                </div>

                <div className="flex-1" />

                {/* Watering button */}
                <div className="pb-28 flex flex-col items-center gap-3 w-full pointer-events-auto">
                    <AnimatePresence mode="wait">
                        {!isWateredToday ? (
                            <motion.div
                                key="water-btn"
                                initial={{ scale: 0.85, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.85, opacity: 0 }}
                                className="flex flex-col items-center gap-3"
                                onPointerDown={startWatering}
                                onPointerUp={stopWatering}
                                onPointerLeave={stopWatering}
                                onPointerCancel={stopWatering}
                                style={{ touchAction: 'none' }}
                            >
                                {/* Ring progress */}
                                <div className="relative flex items-center justify-center">
                                    <svg className="absolute w-[88px] h-[88px] -rotate-90 pointer-events-none">
                                        <circle cx="44" cy="44" r="40" stroke="rgba(255,255,255,0.08)" strokeWidth="3" fill="none" />
                                        <motion.circle
                                            cx="44" cy="44" r="40"
                                            stroke="url(#wg)" strokeWidth="3.5" fill="none" strokeLinecap="round"
                                            strokeDasharray="251"
                                            animate={{ strokeDashoffset: 251 - (251 * holdProgress) / 100 }}
                                            transition={{ duration: 0.08 }}
                                        />
                                        <defs>
                                            <linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor="#ff85b3" />
                                                <stop offset="100%" stopColor="#e8204a" />
                                            </linearGradient>
                                        </defs>
                                    </svg>
                                    <motion.div
                                        className="w-16 h-16 rounded-full flex items-center justify-center"
                                        style={{
                                            background: 'linear-gradient(135deg, #ff4080 0%, #c8104a 100%)',
                                            boxShadow: '0 0 24px rgba(255,60,120,0.5), inset 0 1px 0 rgba(255,255,255,0.25)',
                                        }}
                                        animate={{ scale: holdProgress > 0 ? 0.88 : 1 }}
                                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                                    >
                                        <Droplet className="w-6 h-6 text-white" fill="rgba(255,255,255,0.2)" />
                                    </motion.div>
                                </div>
                                <p className="text-[11px] tracking-widest uppercase font-medium"
                                    style={{ color: 'rgba(255,150,190,0.7)' }}>
                                    Hold to water
                                </p>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="watered-msg"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-2.5 px-5 py-3 rounded-full pointer-events-none"
                                style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    backdropFilter: 'blur(12px)',
                                }}
                            >
                                <Wind className="w-4 h-4" style={{ color: 'rgba(255,160,200,0.7)' }} />
                                <span className="text-sm font-medium" style={{ color: 'rgba(255,200,220,0.8)' }}>
                                    Tree is flourishing today
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};
