import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation } from 'framer-motion';

export type PetType = 'bear' | 'dog' | 'cat' | 'bunny';
export type PetMood = 'happy' | 'excited' | 'neutral' | 'sad' | 'sleeping';

/* ── Color Palettes ────────────────────────────────────────────── */
const PALETTES = {
    bear: {
        body: '#F0B060', bodyLight: '#F8CC80', belly: '#FDE9C8',
        cheek: '#EE8868', earInner: '#D89838', eye: '#3D2B1F',
        nose: '#5C3D20', shadow: 'rgba(176,120,48,0.18)', glow: '#FFCC80',
    },
    dog: {
        body: '#82C4E4', bodyLight: '#A8D8F0', belly: '#D4EAF6',
        cheek: '#EE9CA8', earInner: '#68ACD0', eye: '#2D3644',
        nose: '#3D4854', shadow: 'rgba(56,136,184,0.18)', glow: '#A8D8F0',
    },
    cat: {
        body: '#A494C4', bodyLight: '#BAB0D6', belly: '#D4CCE4',
        cheek: '#CC94B4', earInner: '#8878B0', eye: '#2B2340',
        nose: '#7868A0', shadow: 'rgba(104,88,160,0.18)', glow: '#D0C8F0',
    },
    bunny: {
        body: '#EE9CAC', bodyLight: '#F4B4C0', belly: '#F8D0D8',
        cheek: '#F488A0', earInner: '#D88898', eye: '#3D2030',
        nose: '#CC6880', shadow: 'rgba(208,104,128,0.18)', glow: '#FFCCD8',
    },
} as const;

type Palette = (typeof PALETTES)[PetType];

/* ── Face geometry per type ────────────────────────────────────── */
const FACE = {
    bear:  { eyeY: 104, noseY: 114, mouthY: 122, cheekX: 72, cheekR: 9 },
    dog:   { eyeY: 102, noseY: 112, mouthY: 120, cheekX: 74, cheekR: 8 },
    cat:   { eyeY: 106, noseY: 116, mouthY: 124, cheekX: 72, cheekR: 8 },
    bunny: { eyeY: 110, noseY: 120, mouthY: 128, cheekX: 73, cheekR: 9 },
} as const;

/* ── Hat / accessory Y positions per type ──────────────────────── */
const HAT_Y:   Record<PetType, number> = { bear: 32, dog: 50, cat: 28, bunny: 0 };
const SCARF_Y: Record<PetType, number> = { bear: 158, dog: 156, cat: 162, bunny: 160 };

/* ── Body Shapes (pure SVG) ────────────────────────────────────── */
const BearBody: React.FC<{ c: Palette }> = ({ c }) => (
    <g>
        <circle cx={66} cy={60} r={22} fill={c.body} />
        <circle cx={134} cy={60} r={22} fill={c.body} />
        <circle cx={66} cy={60} r={12} fill={c.earInner} opacity={0.55} />
        <circle cx={134} cy={60} r={12} fill={c.earInner} opacity={0.55} />
        <ellipse cx={100} cy={118} rx={64} ry={60} fill={c.body} />
        <ellipse cx={100} cy={130} rx={38} ry={32} fill={c.belly} opacity={0.65} />
    </g>
);

const DogBody: React.FC<{ c: Palette }> = ({ c }) => (
    <g>
        <ellipse cx={42} cy={100} rx={18} ry={30} fill={c.body} transform="rotate(-12 42 100)" />
        <ellipse cx={158} cy={100} rx={18} ry={30} fill={c.body} transform="rotate(12 158 100)" />
        <ellipse cx={42} cy={100} rx={10} ry={20} fill={c.earInner} opacity={0.4} transform="rotate(-12 42 100)" />
        <ellipse cx={158} cy={100} rx={10} ry={20} fill={c.earInner} opacity={0.4} transform="rotate(12 158 100)" />
        <ellipse cx={100} cy={116} rx={62} ry={58} fill={c.body} />
        <ellipse cx={100} cy={128} rx={36} ry={30} fill={c.belly} opacity={0.55} />
        <ellipse cx={100} cy={116} rx={16} ry={12} fill={c.belly} opacity={0.35} />
    </g>
);

const CatBody: React.FC<{ c: Palette }> = ({ c }) => (
    <g>
        <path d="M62 80 Q68 44 82 78" fill={c.body} />
        <path d="M118 78 Q132 44 138 80" fill={c.body} />
        <path d="M66 78 Q70 52 80 76" fill={c.earInner} opacity={0.45} />
        <path d="M120 76 Q130 52 134 78" fill={c.earInner} opacity={0.45} />
        <ellipse cx={100} cy={120} rx={56} ry={58} fill={c.body} />
        <ellipse cx={100} cy={132} rx={32} ry={28} fill={c.belly} opacity={0.5} />
    </g>
);

const BunnyBody: React.FC<{ c: Palette }> = ({ c }) => (
    <g>
        <ellipse cx={76} cy={48} rx={15} ry={42} fill={c.body} transform="rotate(-5 76 48)" />
        <ellipse cx={124} cy={48} rx={15} ry={42} fill={c.body} transform="rotate(5 124 48)" />
        <ellipse cx={76} cy={48} rx={8} ry={32} fill={c.earInner} opacity={0.45} transform="rotate(-5 76 48)" />
        <ellipse cx={124} cy={48} rx={8} ry={32} fill={c.earInner} opacity={0.45} transform="rotate(5 124 48)" />
        <ellipse cx={100} cy={124} rx={58} ry={52} fill={c.body} />
        <ellipse cx={100} cy={136} rx={34} ry={28} fill={c.belly} opacity={0.55} />
    </g>
);

const BODY_MAP: Record<PetType, React.FC<{ c: Palette }>> = {
    bear: BearBody, dog: DogBody, cat: CatBody, bunny: BunnyBody,
};

/* ── Eyes ───────────────────────────────────────────────────────── */
const PetEyes: React.FC<{ mood: PetMood; blinking: boolean; color: string; y: number }> = ({
    mood, blinking, color, y,
}) => {
    if (mood === 'sleeping' || blinking) {
        const curve = mood === 'sleeping' ? 5 : 3;
        return (
            <>
                <path d={`M73 ${y} Q82 ${y + curve} 91 ${y}`} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
                <path d={`M109 ${y} Q118 ${y + curve} 127 ${y}`} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </>
        );
    }
    if (mood === 'happy') {
        return (
            <>
                <path d={`M73 ${y + 2} Q82 ${y - 6} 91 ${y + 2}`} stroke={color} strokeWidth="2.8" fill="none" strokeLinecap="round" />
                <path d={`M109 ${y + 2} Q118 ${y - 6} 127 ${y + 2}`} stroke={color} strokeWidth="2.8" fill="none" strokeLinecap="round" />
            </>
        );
    }
    const ry = mood === 'excited' ? 13 : mood === 'sad' ? 10 : 11;
    const rx = mood === 'excited' ? 10.5 : mood === 'sad' ? 9 : 9.5;
    const hlR = mood === 'excited' ? 4.5 : 3.5;
    return (
        <>
            <ellipse cx={82} cy={y} rx={rx} ry={ry} fill={color} />
            <circle cx={78} cy={y - 3.5} r={hlR} fill="white" opacity={0.92} />
            <circle cx={86} cy={y + 2} r={1.8} fill="white" opacity={0.45} />
            {mood === 'excited' && <circle cx={76} cy={y - 6} r={1.5} fill="white" opacity={0.6} />}
            <ellipse cx={118} cy={y} rx={rx} ry={ry} fill={color} />
            <circle cx={114} cy={y - 3.5} r={hlR} fill="white" opacity={0.92} />
            <circle cx={122} cy={y + 2} r={1.8} fill="white" opacity={0.45} />
            {mood === 'excited' && <circle cx={112} cy={y - 6} r={1.5} fill="white" opacity={0.6} />}
            {mood === 'sad' && (
                <>
                    <path d={`M72 ${y - 16} Q82 ${y - 20} 92 ${y - 16}`} stroke={color} strokeWidth="1.5" fill="none" opacity={0.35} strokeLinecap="round" />
                    <path d={`M108 ${y - 16} Q118 ${y - 20} 128 ${y - 16}`} stroke={color} strokeWidth="1.5" fill="none" opacity={0.35} strokeLinecap="round" />
                </>
            )}
        </>
    );
};

/* ── Nose ──────────────────────────────────────────────────────── */
const PetNose: React.FC<{ type: PetType; color: string; y: number }> = ({ type, color, y }) => {
    if (type === 'cat') return <path d={`M97 ${y - 2} L100 ${y + 2} L103 ${y - 2} Z`} fill={color} opacity={0.4} />;
    if (type === 'bunny') return <circle cx={100} cy={y} r={3.5} fill={color} opacity={0.35} />;
    return <ellipse cx={100} cy={y} rx={5} ry={3.5} fill={color} opacity={0.45} />;
};

/* ── Mouth ─────────────────────────────────────────────────────── */
const PetMouth: React.FC<{ mood: PetMood; y: number }> = ({ mood, y }) => {
    const c = '#4A3030';
    if (mood === 'excited') return <ellipse cx={100} cy={y} rx={5.5} ry={4.5} fill={c} opacity={0.2} />;
    if (mood === 'happy' || mood === 'sleeping') return <path d={`M91 ${y - 2} Q100 ${y + 5} 109 ${y - 2}`} stroke={c} strokeWidth="1.8" fill="none" opacity={0.2} strokeLinecap="round" />;
    if (mood === 'sad') return <path d={`M93 ${y + 2} Q100 ${y - 3} 107 ${y + 2}`} stroke={c} strokeWidth="1.8" fill="none" opacity={0.2} strokeLinecap="round" />;
    return <path d={`M94 ${y} Q100 ${y + 2.5} 106 ${y}`} stroke={c} strokeWidth="1.6" fill="none" opacity={0.15} strokeLinecap="round" />;
};

/* ── Cat whiskers ──────────────────────────────────────────────── */
const PetWhiskers: React.FC<{ type: PetType; color: string; y: number }> = ({ type, color, y }) => {
    if (type !== 'cat') return null;
    return (
        <g opacity={0.2}>
            <line x1={60} y1={y - 2} x2={80} y2={y} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <line x1={58} y1={y + 4} x2={80} y2={y + 4} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <line x1={120} y1={y} x2={140} y2={y - 2} stroke={color} strokeWidth={1} strokeLinecap="round" />
            <line x1={120} y1={y + 4} x2={142} y2={y + 4} stroke={color} strokeWidth={1} strokeLinecap="round" />
        </g>
    );
};

/* ── Hats ──────────────────────────────────────────────────────── */
const HatCrown = ({ y }: { y: number }) => (
    <g transform={`translate(100, ${y})`}>
        <path d="M-22 8 L-18 -8 L-8 2 L0 -14 L8 2 L18 -8 L22 8 Z" fill="#F0C040" stroke="#D4A020" strokeWidth="1" />
        <rect x={-22} y={8} width={44} height={6} rx={2} fill="#F0C040" stroke="#D4A020" strokeWidth="0.8" />
        <circle cx={0} cy={-2} r={2.5} fill="#E84070" />
        <circle cx={-12} cy={2} r={2} fill="#60A0E0" />
        <circle cx={12} cy={2} r={2} fill="#60D070" />
    </g>
);
const HatParty = ({ y }: { y: number }) => (
    <g transform={`translate(100, ${y})`}>
        <path d="M-18 12 L0 -16 L18 12 Z" fill="#E84070" opacity={0.85} />
        <line x1={-12} y1={8} x2={12} y2={-8} stroke="#F8D040" strokeWidth="1.2" opacity={0.5} />
        <circle cx={0} cy={-16} r={4} fill="#F8D040" />
    </g>
);
const HatCowboy = ({ y }: { y: number }) => (
    <g transform={`translate(100, ${y})`}>
        <ellipse cx={0} cy={8} rx={30} ry={5} fill="#B08050" />
        <path d="M-16 8 Q-14 -8 0 -12 Q14 -8 16 8 Z" fill="#C09060" />
        <ellipse cx={0} cy={8} rx={30} ry={4} fill="none" stroke="#906838" strokeWidth="1" />
    </g>
);
const HatWizard = ({ y }: { y: number }) => (
    <g transform={`translate(100, ${y})`}>
        <path d="M-20 12 L0 -26 L20 12 Z" fill="#5040A0" opacity={0.85} />
        <circle cx={6} cy={-10} r={2} fill="#F0D040" opacity={0.7} />
        <circle cx={-4} cy={-2} r={1.5} fill="#F0D040" opacity={0.5} />
        <circle cx={2} cy={4} r={1.8} fill="#F0D040" opacity={0.6} />
    </g>
);
const HatHalo = ({ y }: { y: number }) => (
    <g>
        <ellipse cx={100} cy={y - 6} rx={20} ry={5} fill="none" stroke="#F8D860" strokeWidth="2.5" opacity={0.7} />
        <ellipse cx={100} cy={y - 6} rx={20} ry={5} fill="none" stroke="#FFF0A0" strokeWidth="1" opacity={0.4} />
    </g>
);

const HAT_MAP: Record<string, React.FC<{ y: number }>> = {
    hat_crown: HatCrown, hat_party: HatParty, hat_cowboy: HatCowboy,
    hat_wizard: HatWizard, hat_halo: HatHalo,
};

/* ── Accessories ───────────────────────────────────────────────── */
const AccGlasses = ({ y }: { y: number }) => (
    <g opacity={0.65}>
        <circle cx={82} cy={y} r={12} fill="none" stroke="#3A3A4A" strokeWidth="2" />
        <circle cx={118} cy={y} r={12} fill="none" stroke="#3A3A4A" strokeWidth="2" />
        <line x1={94} y1={y} x2={106} y2={y} stroke="#3A3A4A" strokeWidth="1.8" />
        <line x1={55} y1={y - 2} x2={70} y2={y} stroke="#3A3A4A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={130} y1={y} x2={145} y2={y - 2} stroke="#3A3A4A" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx={82} cy={y} r={11} fill="rgba(140,200,255,0.06)" />
        <circle cx={118} cy={y} r={11} fill="rgba(140,200,255,0.06)" />
    </g>
);
const AccScarf = ({ y }: { y: number }) => (
    <g>
        <rect x={65} y={y} width={70} height={12} rx={6} fill="#E84070" opacity={0.7} />
        <rect x={67} y={y + 2} width={66} height={8} rx={4} fill="#F06090" opacity={0.5} />
    </g>
);
const AccBow = ({ y }: { y: number }) => (
    <g transform={`translate(100, ${y + 6})`}>
        <path d="M-3 0 Q-14 -8 -14 0 Q-14 8 -3 0" fill="#E84070" opacity={0.7} />
        <path d="M3 0 Q14 -8 14 0 Q14 8 3 0" fill="#E84070" opacity={0.7} />
        <circle cx={0} cy={0} r={3} fill="#D03060" />
    </g>
);

const ACC_MAP: Record<string, React.FC<{ y: number }>> = {
    acc_glasses: AccGlasses, acc_scarf: AccScarf, acc_bow: AccBow,
};

/* ── Props ─────────────────────────────────────────────────────── */
export interface PetCharacterProps {
    type: PetType;
    mood: PetMood;
    controls: ReturnType<typeof useAnimation>;
    equippedHat?: string;
    equippedAccessory?: string;
    level?: number;
    size?: number;
    onClick?: React.MouseEventHandler;
    onMouseDown?: React.MouseEventHandler;
    onMouseUp?: React.MouseEventHandler;
    onTouchStart?: React.TouchEventHandler;
    onTouchEnd?: React.TouchEventHandler;
}

/* ── Main Component ────────────────────────────────────────────── */
export const PetCharacter: React.FC<PetCharacterProps> = ({
    type, mood, controls, equippedHat, equippedAccessory,
    level = 1, size = 130, onClick, onMouseDown, onMouseUp, onTouchStart, onTouchEnd,
}) => {
    const [blinking, setBlinking] = useState(false);
    const blinkRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const colors = PALETTES[type];
    const face = FACE[type];
    const sleeping = mood === 'sleeping';
    const excited = mood === 'excited';

    const sc = Math.min(1 + (level - 1) * 0.04, 1.3);
    const w = Math.round(size * sc);
    const h = Math.round(size * sc);

    /* Blink loop — random interval for natural feel */
    useEffect(() => {
        if (sleeping) return;
        const schedule = () => {
            blinkRef.current = setTimeout(() => {
                setBlinking(true);
                setTimeout(() => { setBlinking(false); schedule(); }, 110);
            }, 2200 + Math.random() * 2800);
        };
        schedule();
        return () => { if (blinkRef.current) clearTimeout(blinkRef.current); };
    }, [sleeping]);

    const BodySVG = BODY_MAP[type];
    const HatComp = equippedHat ? HAT_MAP[equippedHat] : null;
    const AccComp = equippedAccessory ? ACC_MAP[equippedAccessory] : null;

    return (
        <motion.div
            animate={controls}
            onClick={onClick}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="relative cursor-pointer select-none"
            whileTap={{ scaleX: 1.08, scaleY: 0.92 }}
            style={{ width: w, height: h }}
        >
            {/* Ground shadow */}
            <motion.div
                className="absolute pointer-events-none"
                style={{
                    bottom: -4, left: '18%', width: '64%', height: 14,
                    borderRadius: '50%', background: colors.shadow,
                    filter: 'blur(6px)', zIndex: 1,
                }}
                animate={sleeping
                    ? { scaleX: [1, 1.03, 1], opacity: [0.5, 0.35, 0.5] }
                    : { scaleX: [1, 1.06, 1], opacity: [0.55, 0.38, 0.55] }
                }
                transition={{ duration: sleeping ? 4.5 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Breathing wrapper */}
            <motion.div
                animate={sleeping
                    ? { scaleX: [1, 1.008, 1], scaleY: [1, 0.992, 1], y: [0, -1, 0] }
                    : { scaleX: [1, 1.018, 1], scaleY: [1, 0.982, 1], y: [0, -2.5, 0] }
                }
                transition={{ duration: sleeping ? 4.5 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: '100%', height: '100%', transformOrigin: '50% 85%', position: 'relative', zIndex: 2 }}
            >
                {/* Ambient glow */}
                <motion.div
                    className="absolute pointer-events-none"
                    style={{
                        inset: '-16%', borderRadius: '50%',
                        background: `radial-gradient(circle, ${colors.glow}40 0%, ${colors.glow}10 45%, transparent 68%)`,
                        filter: 'blur(14px)', zIndex: 0,
                    }}
                    animate={
                        excited ? { scale: [1, 1.15, 1], opacity: [0.4, 0.75, 0.4] }
                        : mood === 'happy' ? { scale: [1, 1.08, 1], opacity: [0.3, 0.5, 0.3] }
                        : sleeping ? { opacity: [0.06, 0.12, 0.06] }
                        : { opacity: [0.12, 0.22, 0.12] }
                    }
                    transition={{ duration: excited ? 1.2 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
                />

                {/* Character SVG */}
                <svg
                    viewBox="0 0 200 200"
                    width="100%"
                    height="100%"
                    className="relative z-10"
                    style={{
                        filter: sleeping
                            ? `brightness(0.82) saturate(0.6) drop-shadow(0 6px 18px ${colors.shadow})`
                            : mood === 'sad'
                            ? `saturate(0.65) brightness(0.92) drop-shadow(0 8px 20px ${colors.shadow})`
                            : `drop-shadow(0 10px 28px ${colors.shadow}) drop-shadow(0 2px 8px rgba(0,0,0,0.22))`,
                        transition: 'filter 0.6s ease',
                    }}
                >
                    <defs>
                        {/* Radial body gradient — light top-left, deep bottom-right */}
                        <radialGradient id={`bg-${type}`} cx="36%" cy="28%" r="68%" gradientUnits="objectBoundingBox">
                            <stop offset="0%"   stopColor={colors.bodyLight} stopOpacity="1" />
                            <stop offset="55%"  stopColor={colors.body}      stopOpacity="1" />
                            <stop offset="100%" stopColor={colors.earInner}  stopOpacity="1" />
                        </radialGradient>
                        {/* Belly gradient */}
                        <radialGradient id={`belly-${type}`} cx="50%" cy="30%" r="60%">
                            <stop offset="0%"   stopColor={colors.belly}     stopOpacity="0.9" />
                            <stop offset="100%" stopColor={colors.body}      stopOpacity="0.4" />
                        </radialGradient>
                        {/* Specular highlight */}
                        <radialGradient id={`spec-${type}`} cx="30%" cy="20%" r="40%">
                            <stop offset="0%"   stopColor="rgba(255,255,255,0.38)" />
                            <stop offset="100%" stopColor="rgba(255,255,255,0)"    />
                        </radialGradient>
                    </defs>
                    {/* Render with gradient fills via a clone using the defined gradient ids */}
                    <BodySVG c={{
                        ...colors,
                        body:      `url(#bg-${type})`,
                        bodyLight: colors.bodyLight,
                        belly:     `url(#belly-${type})`,
                    } as any} />
                    {/* Cheeks */}
                    <circle cx={face.cheekX} cy={face.eyeY + 8} r={face.cheekR} fill={colors.cheek} opacity={excited ? 0.45 : 0.3} />
                    <circle cx={200 - face.cheekX} cy={face.eyeY + 8} r={face.cheekR} fill={colors.cheek} opacity={excited ? 0.45 : 0.3} />
                    {/* Face */}
                    <PetEyes mood={mood} blinking={blinking} color={colors.eye} y={face.eyeY} />
                    <PetNose type={type} color={colors.nose} y={face.noseY} />
                    <PetWhiskers type={type} color={colors.nose} y={face.noseY} />
                    <PetMouth mood={mood} y={face.mouthY} />
                    {/* Hat */}
                    {HatComp && <HatComp y={HAT_Y[type]} />}
                    {/* Accessory */}
                    {AccComp && (
                        equippedAccessory === 'acc_glasses'
                            ? <AccComp y={face.eyeY} />
                            : <AccComp y={SCARF_Y[type]} />
                    )}
                    {/* Specular highlight — top-left sheen for 3D roundness */}
                    <ellipse cx={88} cy={82} rx={44} ry={34}
                        fill={`url(#spec-${type})`}
                        style={{ pointerEvents: 'none' }}
                    />
                </svg>

                {/* Pulse ring for excited */}
                {excited && (
                    <motion.div
                        className="absolute inset-0 pointer-events-none z-0"
                        style={{
                            borderRadius: '50%',
                            border: `2px solid ${colors.glow}`,
                            margin: '12%',
                        }}
                        animate={{ scale: [1, 1.35, 1.5], opacity: [0.45, 0.12, 0] }}
                        transition={{ duration: 1.3, repeat: Infinity, ease: 'easeOut' }}
                    />
                )}

                {/* Sleeping z's */}
                {sleeping && (
                    <div className="absolute z-20 pointer-events-none" style={{ right: '8%', top: '10%' }}>
                        {[0, 1].map(i => (
                            <motion.span
                                key={i}
                                className="absolute font-medium"
                                style={{
                                    color: colors.eye, fontSize: 10 + i * 3,
                                    right: i * 6, top: -i * 12, opacity: 0,
                                }}
                                animate={{ opacity: [0, 0.4, 0.4, 0], y: [0, -6, -10, -18] }}
                                transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.8 }}
                            >z</motion.span>
                        ))}
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};
