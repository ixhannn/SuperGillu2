import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation } from 'framer-motion';

export type PetType = 'bear' | 'dog' | 'cat' | 'bunny';
export type PetMood = 'happy' | 'excited' | 'neutral' | 'sad' | 'sleeping';

/* ── Color Palettes ────────────────────────────────────────────── */
const PALETTES = {
    bear: {
        body: '#F0D8B8', bodyLight: '#FFF1DC', belly: '#FDE9C8',
        cheek: '#EE8868', earInner: '#E2A968', eye: '#5C3322',
        nose: '#5C3D20', shadow: 'rgba(176,120,48,0.22)', glow: '#FFC97A',
        irisGlow: '#FF9E45',
    },
    dog: {
        body: '#D6EAF6', bodyLight: '#F1F9FE', belly: '#E8F2FA',
        cheek: '#9FCDE8', earInner: '#8EC8EE', eye: '#0D3B5C',
        nose: '#3D4854', shadow: 'rgba(56,136,184,0.26)', glow: '#9FE0F8',
        irisGlow: '#3FB8E8',
    },
    cat: {
        body: '#DCD2EC', bodyLight: '#F4F0FC', belly: '#E5DDF1',
        cheek: '#C9A6D6', earInner: '#B6A6D4', eye: '#2B1A40',
        nose: '#7868A0', shadow: 'rgba(104,88,160,0.24)', glow: '#D0BFFF',
        irisGlow: '#A98EE8',
    },
    bunny: {
        body: '#FADBE2', bodyLight: '#FFEFF3', belly: '#FBE3E8',
        cheek: '#F488A0', earInner: '#F1B8C2', eye: '#3D1F30',
        nose: '#CC6880', shadow: 'rgba(208,104,128,0.24)', glow: '#FFB8CE',
        irisGlow: '#F47AA0',
    },
} as const;

type Palette = (typeof PALETTES)[PetType];

const isPetType = (value: unknown): value is PetType => (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(PALETTES, value)
);

/* ── Face geometry — shared across all pets now ─────────────────── */
const FACE = {
    bear:  { eyeY: 100, noseY: 116, mouthY: 130, cheekX: 70, cheekR: 9 },
    dog:   { eyeY: 100, noseY: 116, mouthY: 130, cheekX: 70, cheekR: 9 },
    cat:   { eyeY: 100, noseY: 116, mouthY: 130, cheekX: 70, cheekR: 9 },
    bunny: { eyeY: 100, noseY: 116, mouthY: 130, cheekX: 70, cheekR: 9 },
} as const;

/* ── Hat / accessory Y positions per type ──────────────────────── */
const HAT_Y:   Record<PetType, number> = { bear: 18, dog: 18, cat: 18, bunny: 18 };
const SCARF_Y: Record<PetType, number> = { bear: 162, dog: 162, cat: 162, bunny: 162 };

/* ═══════════════════════════════════════════════════════════════ */
/*  FLUFFY MONSTER BODY — shared shape for every pet              */
/* ═══════════════════════════════════════════════════════════════ */
const FluffyBody: React.FC<{ c: Palette; type: PetType }> = ({ c, type }) => (
    <g>
        {/* Outer fluff silhouette — jagged fur outline */}
        <path
            d="M100 14
               L92 30 L78 22 L66 36 L52 30 L46 48 L30 50 L32 70
               L18 78 L24 96 L12 110 L24 126 L18 144 L34 152
               L30 170 L48 174 L54 188 L72 184 L84 194 L100 188
               L116 194 L128 184 L146 188 L152 174 L170 170 L166 152
               L182 144 L176 126 L188 110 L176 96 L182 78 L168 70
               L170 50 L154 48 L148 30 L134 36 L122 22 L108 30 Z"
            fill={c.body}
        />
        {/* Inner softer body — gives a 3D fluffy core */}
        <path
            d="M100 26
               L88 42 L74 38 L62 56 L48 60 L46 78 L34 88 L40 102
               L30 120 L42 132 L40 152 L58 158 L62 174 L80 174 L92 184
               L108 184 L120 174 L138 174 L142 158 L160 152 L158 132
               L170 120 L160 102 L166 88 L154 78 L152 60 L138 56
               L126 38 L112 42 Z"
            fill={c.bodyLight}
            opacity={0.85}
        />
        {/* Belly highlight */}
        <ellipse cx={100} cy={140} rx={42} ry={32} fill={c.belly} opacity={0.55} />

        {/* Crystal horns — left */}
        <g>
            <path
                d="M70 36 L60 4 L82 30 Z"
                fill={c.bodyLight}
                stroke={c.earInner}
                strokeWidth={1.4}
                strokeLinejoin="round"
            />
            <path d="M70 36 L66 18 L78 28 Z" fill={c.earInner} opacity={0.5} />
            <path d="M62 14 L65 4 L70 18 Z" fill="#ffffff" opacity={0.7} />
        </g>
        {/* Crystal horns — right */}
        <g>
            <path
                d="M130 36 L140 4 L118 30 Z"
                fill={c.bodyLight}
                stroke={c.earInner}
                strokeWidth={1.4}
                strokeLinejoin="round"
            />
            <path d="M130 36 L134 18 L122 28 Z" fill={c.earInner} opacity={0.5} />
            <path d="M138 14 L135 4 L130 18 Z" fill="#ffffff" opacity={0.7} />
        </g>

        {/* Cat-only subtle stripes for differentiation */}
        {type === 'cat' && (
            <g opacity={0.18}>
                <path d="M62 88 Q72 92 82 86" stroke={c.earInner} strokeWidth={3} fill="none" strokeLinecap="round" />
                <path d="M118 86 Q128 92 138 88" stroke={c.earInner} strokeWidth={3} fill="none" strokeLinecap="round" />
                <path d="M58 110 Q70 114 80 110" stroke={c.earInner} strokeWidth={3} fill="none" strokeLinecap="round" />
                <path d="M120 110 Q130 114 142 110" stroke={c.earInner} strokeWidth={3} fill="none" strokeLinecap="round" />
            </g>
        )}

        {/* Bear-only forehead tuft */}
        {type === 'bear' && (
            <g opacity={0.6}>
                <path d="M88 50 L94 38 L100 48 L106 38 L112 50 Z" fill={c.earInner} />
            </g>
        )}

        {/* Bunny-only soft cheek blush spots — top */}
        {type === 'bunny' && (
            <>
                <circle cx={56} cy={92} r={5} fill={c.cheek} opacity={0.4} />
                <circle cx={144} cy={92} r={5} fill={c.cheek} opacity={0.4} />
            </>
        )}

        {/* Frosty top-of-head sheen */}
        <ellipse cx={92} cy={62} rx={26} ry={11} fill="#ffffff" opacity={0.55} />

        {/* Tiny fur flecks on body for texture */}
        <circle cx={60} cy={120} r={2.4} fill={c.earInner} opacity={0.55} />
        <circle cx={150} cy={108} r={2} fill={c.earInner} opacity={0.5} />
        <circle cx={144} cy={148} r={1.8} fill={c.earInner} opacity={0.5} />
        <circle cx={68} cy={152} r={1.6} fill={c.earInner} opacity={0.5} />
        <circle cx={100} cy={170} r={1.6} fill={c.earInner} opacity={0.5} />

        {/* Stubby paws peeking out */}
        <ellipse cx={42} cy={148} rx={10} ry={8} fill={c.bodyLight} />
        <ellipse cx={158} cy={148} rx={10} ry={8} fill={c.bodyLight} />
    </g>
);

const BODY_MAP: Record<PetType, React.FC<{ c: Palette; type: PetType }>> = {
    bear: FluffyBody, dog: FluffyBody, cat: FluffyBody, bunny: FluffyBody,
};

/* ── Big glowing monster eyes ───────────────────────────────────── */
const PetEyes: React.FC<{
    mood: PetMood; blinking: boolean; color: string; iris: string; glow: string; y: number;
}> = ({ mood, blinking, color, iris, glow, y }) => {
    if (mood === 'sleeping' || blinking) {
        const curve = mood === 'sleeping' ? 6 : 4;
        return (
            <>
                <path d={`M68 ${y} Q82 ${y + curve} 96 ${y}`} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
                <path d={`M104 ${y} Q118 ${y + curve} 132 ${y}`} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
            </>
        );
    }
    const ry = mood === 'excited' ? 16 : mood === 'sad' ? 12 : 14;
    const rx = mood === 'excited' ? 14 : mood === 'sad' ? 11 : 13;
    const irisR = mood === 'excited' ? 9 : 8;
    const pupilR = mood === 'excited' ? 3.6 : 3;
    return (
        <>
            {/* Soft glow halos behind eyes */}
            <circle cx={82} cy={y} r={20} fill={glow} opacity={0.42} />
            <circle cx={118} cy={y} r={20} fill={glow} opacity={0.42} />
            {/* Sclera */}
            <ellipse cx={82} cy={y} rx={rx} ry={ry} fill="#FFFFFF" stroke={color} strokeWidth={1.6} />
            <ellipse cx={118} cy={y} rx={rx} ry={ry} fill="#FFFFFF" stroke={color} strokeWidth={1.6} />
            {/* Iris glow ring */}
            <circle cx={82} cy={y} r={irisR + 1.5} fill={iris} opacity={0.35} />
            <circle cx={118} cy={y} r={irisR + 1.5} fill={iris} opacity={0.35} />
            {/* Iris solid */}
            <circle cx={82} cy={y} r={irisR} fill={iris} />
            <circle cx={118} cy={y} r={irisR} fill={iris} />
            {/* Iris inner gradient hint */}
            <circle cx={82} cy={y + 1} r={irisR - 1.5} fill={iris} opacity={0.6} />
            <circle cx={118} cy={y + 1} r={irisR - 1.5} fill={iris} opacity={0.6} />
            {/* Pupils */}
            <circle cx={82} cy={y} r={pupilR} fill={color} />
            <circle cx={118} cy={y} r={pupilR} fill={color} />
            {/* Catchlights */}
            <circle cx={79} cy={y - 3} r={1.8} fill="#FFFFFF" />
            <circle cx={115} cy={y - 3} r={1.8} fill="#FFFFFF" />
            <circle cx={84} cy={y + 3} r={0.9} fill="#FFFFFF" opacity={0.7} />
            <circle cx={120} cy={y + 3} r={0.9} fill="#FFFFFF" opacity={0.7} />
            {mood === 'sad' && (
                <>
                    <path d={`M70 ${y - 18} Q82 ${y - 22} 94 ${y - 18}`} stroke={color} strokeWidth="1.8" fill="none" opacity={0.45} strokeLinecap="round" />
                    <path d={`M106 ${y - 18} Q118 ${y - 22} 130 ${y - 18}`} stroke={color} strokeWidth="1.8" fill="none" opacity={0.45} strokeLinecap="round" />
                </>
            )}
        </>
    );
};

/* ── Toothy monster mouth ───────────────────────────────────────── */
const PetMouth: React.FC<{ mood: PetMood; y: number }> = ({ mood, y }) => {
    if (mood === 'sleeping') {
        return <path d={`M86 ${y} Q100 ${y + 4} 114 ${y}`} stroke="#2C1A2A" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity={0.7} />;
    }
    if (mood === 'sad') {
        return <path d={`M86 ${y + 5} Q100 ${y - 4} 114 ${y + 5}`} stroke="#2C1A2A" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity={0.7} />;
    }
    const wide = mood === 'excited' ? 1.05 : mood === 'happy' ? 0.95 : 0.82;
    const mw = 24 * wide;
    const mh = 12 * wide;
    return (
        <g>
            {/* Mouth interior */}
            <path
                d={`M${100 - mw} ${y - 2}
                    Q100 ${y - 8} ${100 + mw} ${y - 2}
                    Q${100 + mw - 2} ${y + mh + 2} 100 ${y + mh + 4}
                    Q${100 - mw + 2} ${y + mh + 2} ${100 - mw} ${y - 2} Z`}
                fill="#1A0E1A"
                opacity={0.95}
            />
            {/* Inner shadow */}
            <ellipse cx={100} cy={y + 4} rx={mw - 4} ry={mh * 0.6} fill="#3A1F30" opacity={0.6} />
            {/* Top jagged tooth row */}
            <path
                d={`M${100 - mw + 2} ${y - 1}
                    L${100 - mw + 5} ${y + 5}
                    L${100 - mw + 8} ${y - 1}
                    L${100 - mw + 11} ${y + 6}
                    L${100 - mw + 14} ${y - 1}
                    L${100 - mw + 17} ${y + 7}
                    L${100 - mw + 20} ${y - 1}
                    L${100 - mw + 23} ${y + 6}
                    L${100 - mw + 26} ${y - 1}
                    L${100 - mw + 29} ${y + 5}
                    L${100 - mw + 32} ${y - 1}
                    L${100 - mw + 35} ${y + 5}
                    L${100 - mw + 38} ${y - 1}
                    L${100 - mw + 41} ${y + 5}
                    L${100 - mw + 44} ${y - 1} Z`}
                fill="#FFFFFF"
                stroke="#D8DBE0"
                strokeWidth={0.5}
                strokeLinejoin="round"
            />
            {/* Bottom tooth row — fewer, smaller */}
            <path
                d={`M${100 - mw + 6} ${y + mh + 1}
                    L${100 - mw + 9} ${y + mh - 4}
                    L${100 - mw + 13} ${y + mh + 1}
                    L${100 - mw + 17} ${y + mh - 5}
                    L${100 - mw + 21} ${y + mh + 1}
                    L${100 - mw + 25} ${y + mh - 4}
                    L${100 - mw + 29} ${y + mh + 1}
                    L${100 - mw + 33} ${y + mh - 4}
                    L${100 - mw + 37} ${y + mh + 1} Z`}
                fill="#FFFFFF"
                stroke="#D8DBE0"
                strokeWidth={0.5}
                strokeLinejoin="round"
                opacity={0.92}
            />
            {/* Tongue hint */}
            <ellipse cx={100} cy={y + mh - 1} rx={mw * 0.32} ry={1.6} fill="#A65A78" opacity={0.75} />
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
        <circle cx={82} cy={y} r={14} fill="none" stroke="#3A3A4A" strokeWidth="2" />
        <circle cx={118} cy={y} r={14} fill="none" stroke="#3A3A4A" strokeWidth="2" />
        <line x1={94} y1={y} x2={106} y2={y} stroke="#3A3A4A" strokeWidth="1.8" />
        <line x1={55} y1={y - 2} x2={68} y2={y} stroke="#3A3A4A" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={132} y1={y} x2={145} y2={y - 2} stroke="#3A3A4A" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx={82} cy={y} r={13} fill="rgba(140,200,255,0.06)" />
        <circle cx={118} cy={y} r={13} fill="rgba(140,200,255,0.06)" />
    </g>
);
const AccScarf = ({ y }: { y: number }) => (
    <g>
        <rect x={62} y={y} width={76} height={12} rx={6} fill="#E84070" opacity={0.7} />
        <rect x={64} y={y + 2} width={72} height={8} rx={4} fill="#F06090" opacity={0.5} />
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
    const safeType = isPetType(type) ? type : 'bear';
    const colors = PALETTES[safeType];
    const face = FACE[safeType];
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

    const BodySVG = BODY_MAP[safeType];
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
                    : { scaleX: [1, 1.022, 1], scaleY: [1, 0.978, 1], y: [0, -3, 0] }
                }
                transition={{ duration: sleeping ? 4.5 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: '100%', height: '100%', transformOrigin: '50% 85%', position: 'relative', zIndex: 2 }}
            >
                {/* Ambient glow */}
                <motion.div
                    className="absolute pointer-events-none"
                    style={{
                        inset: '-18%', borderRadius: '50%',
                        background: `radial-gradient(circle, ${colors.glow}55 0%, ${colors.glow}18 45%, transparent 70%)`,
                        filter: 'blur(16px)', zIndex: 0,
                    }}
                    animate={
                        excited ? { scale: [1, 1.18, 1], opacity: [0.5, 0.85, 0.5] }
                        : mood === 'happy' ? { scale: [1, 1.1, 1], opacity: [0.4, 0.6, 0.4] }
                        : sleeping ? { opacity: [0.1, 0.18, 0.1] }
                        : { opacity: [0.18, 0.32, 0.18] }
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
                            ? `brightness(0.85) saturate(0.65) drop-shadow(0 6px 18px ${colors.shadow})`
                            : mood === 'sad'
                            ? `saturate(0.7) brightness(0.94) drop-shadow(0 8px 20px ${colors.shadow})`
                            : `drop-shadow(0 12px 30px ${colors.shadow}) drop-shadow(0 2px 8px rgba(0,0,0,0.22))`,
                        transition: 'filter 0.6s ease',
                    }}
                >
                    <defs>
                        <radialGradient id={`bg-${safeType}`} cx="38%" cy="26%" r="72%" gradientUnits="objectBoundingBox">
                            <stop offset="0%"   stopColor={colors.bodyLight} stopOpacity="1" />
                            <stop offset="55%"  stopColor={colors.body}      stopOpacity="1" />
                            <stop offset="100%" stopColor={colors.earInner}  stopOpacity="1" />
                        </radialGradient>
                        <radialGradient id={`belly-${safeType}`} cx="50%" cy="30%" r="60%">
                            <stop offset="0%"   stopColor={colors.belly}     stopOpacity="0.95" />
                            <stop offset="100%" stopColor={colors.body}      stopOpacity="0.45" />
                        </radialGradient>
                        <radialGradient id={`spec-${safeType}`} cx="30%" cy="20%" r="40%">
                            <stop offset="0%"   stopColor="rgba(255,255,255,0.42)" />
                            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                        </radialGradient>
                    </defs>

                    <BodySVG
                        type={safeType}
                        c={{
                            ...colors,
                            body:      `url(#bg-${safeType})`,
                            bodyLight: colors.bodyLight,
                            belly:     `url(#belly-${safeType})`,
                        } as any}
                    />

                    {/* Cheeks */}
                    <circle cx={face.cheekX} cy={face.eyeY + 14} r={face.cheekR} fill={colors.cheek} opacity={excited ? 0.55 : 0.4} />
                    <circle cx={200 - face.cheekX} cy={face.eyeY + 14} r={face.cheekR} fill={colors.cheek} opacity={excited ? 0.55 : 0.4} />

                    {/* Face */}
                    <PetEyes
                        mood={mood}
                        blinking={blinking}
                        color={colors.eye}
                        iris={colors.irisGlow}
                        glow={colors.glow}
                        y={face.eyeY}
                    />
                    <PetMouth mood={mood} y={face.mouthY} />

                    {/* Hat */}
                    {HatComp && <HatComp y={HAT_Y[safeType]} />}
                    {/* Accessory */}
                    {AccComp && (
                        equippedAccessory === 'acc_glasses'
                            ? <AccComp y={face.eyeY} />
                            : <AccComp y={SCARF_Y[safeType]} />
                    )}

                    {/* Specular sheen */}
                    <ellipse cx={88} cy={84} rx={48} ry={36}
                        fill={`url(#spec-${safeType})`}
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

                {/* Floating sparkle particles (always on, paused look when sleeping) */}
                <div className="absolute inset-0 pointer-events-none z-20 overflow-visible">
                    {[
                        { left: '8%',  top: '28%', delay: 0,   dur: 3.6, size: 6 },
                        { left: '88%', top: '34%', delay: 0.6, dur: 4.1, size: 5 },
                        { left: '18%', top: '70%', delay: 1.2, dur: 3.3, size: 4 },
                        { left: '82%', top: '74%', delay: 1.8, dur: 4.4, size: 7 },
                        { left: '50%', top: '6%',  delay: 0.3, dur: 3.8, size: 5 },
                        { left: '4%',  top: '54%', delay: 2.1, dur: 4.6, size: 4 },
                    ].map((p, i) => (
                        <motion.div
                            key={i}
                            className="absolute"
                            style={{
                                left: p.left, top: p.top, width: p.size, height: p.size,
                                borderRadius: '50%',
                                background: `radial-gradient(circle, ${colors.bodyLight} 0%, ${colors.glow} 60%, transparent 100%)`,
                                boxShadow: `0 0 8px ${colors.glow}`,
                                opacity: sleeping ? 0.3 : 1,
                            }}
                            animate={{
                                y: [0, -14, 0],
                                x: [0, i % 2 ? 6 : -6, 0],
                                opacity: sleeping ? [0.1, 0.3, 0.1] : [0.2, 0.9, 0.2],
                                scale: [0.8, 1.15, 0.8],
                            }}
                            transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
                        />
                    ))}
                </div>

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
