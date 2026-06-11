import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Clock, Heart, RotateCcw, Sparkles } from 'lucide-react';
import { GOLD, GOLD_PRESS_SPRING, GOLD_SOFT_SPRING, GoldCTA } from '../GoldKit';
import { DATE_CATEGORIES, type DateIdea } from '../../../content/dateIdeas';
import { feedback } from '../../../utils/feedback';

/**
 * The Date Studio deck — a stack of gold-backed cards. Tapping the top
 * card flips it in 3D to reveal a drawn idea; "Draw again" returns it
 * to the deck and flips the next one out.
 */

interface DateDeckProps {
    idea: DateIdea | null;
    revealed: boolean;
    remaining: number;
    total: number;
    onDraw: () => void;
    onDrawAgain: () => void;
    onKeep: () => void;
}

const BACK_BG = [
    'radial-gradient(circle at 50% 44%, rgba(246,199,104,0.14) 0%, transparent 40%)',
    'repeating-linear-gradient(45deg, rgba(246,199,104,0.06) 0px, rgba(246,199,104,0.06) 1px, transparent 1px, transparent 13px)',
    'repeating-linear-gradient(-45deg, rgba(246,199,104,0.06) 0px, rgba(246,199,104,0.06) 1px, transparent 1px, transparent 13px)',
    'linear-gradient(160deg, #2a1430 0%, #190b1d 58%, #221024 100%)',
].join(', ');

const FRONT_BG = 'linear-gradient(165deg, #251127 0%, #170b19 58%, #1e0e21 100%)';

const CORNER_DOTS: Array<React.CSSProperties> = [
    { top: 18, left: 18 },
    { top: 18, right: 18 },
    { bottom: 18, left: 18 },
    { bottom: 18, right: 18 },
];

/** Ornamental card back — gold filigree lattice with a centre medallion. */
const CardBack: React.FC<{ dim?: boolean }> = ({ dim }) => (
    <div
        className="relative h-full w-full overflow-hidden rounded-[26px] flex flex-col items-center justify-center"
        style={{
            background: BACK_BG,
            border: dim ? '1px solid rgba(246,199,104,0.22)' : undefined,
            boxShadow: dim ? 'none' : '0 26px 60px rgba(8,3,10,0.5)',
        }}
    >
        {/* Inner hairline frame */}
        <div
            className="absolute inset-[11px] rounded-[18px] pointer-events-none"
            style={{ border: '1px solid rgba(246,199,104,0.26)' }}
        />
        {CORNER_DOTS.map((pos, i) => (
            <span
                key={i}
                className="absolute w-[4px] h-[4px] rounded-full pointer-events-none"
                style={{ ...pos, background: 'rgba(246,199,104,0.45)' }}
            />
        ))}

        <span
            className="absolute top-[26px] text-[8.5px] font-bold uppercase tracking-[0.38em]"
            style={{ color: 'rgba(246,199,104,0.55)' }}
        >
            Lior
        </span>

        {/* Centre medallion */}
        <div
            className="flex items-center justify-center w-[62px] h-[62px] rounded-[16px]"
            style={{
                transform: 'rotate(45deg)',
                background: 'rgba(246,199,104,0.08)',
                border: '1px solid rgba(246,199,104,0.45)',
                boxShadow: '0 0 32px rgba(246,199,104,0.16), inset 0 1px 0 rgba(253,238,201,0.2)',
            }}
        >
            <Heart
                size={22}
                strokeWidth={1.6}
                style={{ transform: 'rotate(-45deg)', color: GOLD.primary }}
            />
        </div>

        {!dim && (
            <span
                className="absolute bottom-[26px] inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.3em]"
                style={{ color: 'rgba(246,199,104,0.7)' }}
            >
                <Sparkles size={10} />
                Tap to draw
            </span>
        )}
    </div>
);

/** Tiny pill for energy / cost / time on the revealed card. */
const MetaChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.06em]"
        style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,246,230,0.62)',
        }}
    >
        {children}
    </span>
);

const fmtMinutes = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = minutes / 60;
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded} hr`;
};

/** The revealed face of the drawn card. */
const CardFront: React.FC<{ idea: DateIdea }> = ({ idea }) => {
    const cat = DATE_CATEGORIES.find((c) => c.id === idea.category);
    const tint = cat?.tint ?? GOLD.primary;
    return (
        <div
            className="relative h-full w-full overflow-hidden rounded-[26px] flex flex-col"
            style={{ background: FRONT_BG, boxShadow: '0 26px 60px rgba(8,3,10,0.5)' }}
        >
            <div
                className="h-[3px] w-full shrink-0"
                style={{ background: `linear-gradient(90deg, transparent, ${tint}cc, transparent)` }}
            />
            <div className="flex-1 flex flex-col items-center justify-center text-center px-5 py-4 gap-3 min-h-0">
                {cat && (
                    <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.2em]"
                        style={{ background: `${tint}1c`, border: `1px solid ${tint}40`, color: tint }}
                    >
                        {cat.emoji} {cat.label}
                    </span>
                )}
                <span className="lp-float text-[44px] leading-none" aria-hidden="true">{idea.emoji}</span>
                <h3
                    className="font-serif text-[1.4rem] leading-[1.1]"
                    style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}
                >
                    {idea.title}
                </h3>
                <p className="text-[11.5px] leading-[1.6]" style={{ color: GOLD.textMid }}>
                    {idea.desc}
                </p>
            </div>
            <div className="shrink-0 flex items-center justify-center gap-1.5 pb-5 px-4 flex-wrap">
                <MetaChip>{'⚡'.repeat(idea.energy)}</MetaChip>
                <MetaChip>{idea.cost === 0 ? 'Free' : '$'.repeat(idea.cost)}</MetaChip>
                <MetaChip>
                    <Clock size={10} strokeWidth={2.4} />
                    {fmtMinutes(idea.minutes)}
                </MetaChip>
            </div>
        </div>
    );
};

export const DateDeck: React.FC<DateDeckProps> = ({
    idea,
    revealed,
    remaining,
    total,
    onDraw,
    onDrawAgain,
    onKeep,
}) => {
    const reducedMotion = useReducedMotion();

    return (
        <div>
            {/* The deck */}
            <div
                className="relative mx-auto"
                style={{ width: 'min(74vw, 282px)', aspectRatio: '5 / 7', perspective: 1200 }}
            >
                {/* Resting cards underneath */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ transform: 'rotate(-5deg) translate3d(-4px, 10px, 0) scale(0.97)', opacity: 0.5 }}
                    aria-hidden="true"
                >
                    <CardBack dim />
                </div>
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ transform: 'rotate(3.5deg) translate3d(3px, 5px, 0) scale(0.985)', opacity: 0.72 }}
                    aria-hidden="true"
                >
                    <CardBack dim />
                </div>

                {/* Top card — 3D flip */}
                <motion.button
                    type="button"
                    onClick={revealed ? undefined : onDraw}
                    aria-label={revealed && idea ? `Drawn card: ${idea.title}` : 'Draw a card'}
                    whileTap={revealed ? undefined : { scale: 0.97 }}
                    animate={{ rotateY: revealed ? 180 : 0 }}
                    transition={reducedMotion ? { duration: 0 } : GOLD_SOFT_SPRING}
                    className="relative block w-full h-full"
                    style={{ transformStyle: 'preserve-3d', cursor: revealed ? 'default' : 'pointer' }}
                >
                    {/* Back face (the deck side) */}
                    <div
                        className="absolute inset-0"
                        style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                    >
                        <div className="lp-foil h-full w-full" style={{ borderRadius: 27 }}>
                            <CardBack />
                        </div>
                    </div>
                    {/* Front face (the drawn idea) */}
                    <div
                        className="absolute inset-0"
                        style={{
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)',
                        }}
                    >
                        <div className="lp-foil h-full w-full" style={{ borderRadius: 27 }}>
                            {idea ? <CardFront idea={idea} /> : <CardBack />}
                        </div>
                    </div>
                </motion.button>
            </div>

            <p className="mt-4 text-center text-[10.5px]" style={{ color: GOLD.textLow }}>
                {remaining} of {total} cards left in this draw
            </p>

            {/* Actions under the drawn card */}
            <div className="mt-4 min-h-[62px]">
                <AnimatePresence mode="wait" initial={false}>
                    {revealed && idea ? (
                        <motion.div
                            key="actions"
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={GOLD_SOFT_SPRING}
                            className="grid grid-cols-[1fr_1.5fr] gap-2.5"
                        >
                            <motion.button
                                whileTap={{ scale: 0.96 }}
                                transition={GOLD_PRESS_SPRING}
                                onClick={() => { feedback.tap(); onDrawAgain(); }}
                                className="h-[54px] rounded-2xl inline-flex items-center justify-center gap-2 text-[13.5px] font-semibold"
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    color: 'rgba(255,246,230,0.7)',
                                }}
                            >
                                <RotateCcw size={15} strokeWidth={2.2} />
                                Draw again
                            </motion.button>
                            <GoldCTA onClick={onKeep}>
                                <span className="inline-flex items-center justify-center gap-2">
                                    <Heart size={15} strokeWidth={2.4} fill="currentColor" />
                                    Keep it
                                </span>
                            </GoldCTA>
                        </motion.div>
                    ) : (
                        <motion.p
                            key="hint"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="pt-4 text-center text-[12px]"
                            style={{ color: GOLD.textMid }}
                        >
                            Tap the deck — fate handles the rest.
                        </motion.p>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
