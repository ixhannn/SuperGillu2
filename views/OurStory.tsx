import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Clapperboard, Lock, Play, Sparkles } from 'lucide-react';
import type { ViewState } from '../types';
import { StorageService } from '../services/storage';
import { feedback } from '../utils/feedback';
import { GoldShell } from '../components/premium/GoldShell';
import { GOLD, GoldCard, GoldCTA, GoldSectionHeader, goldRise, goldStagger } from '../components/premium/GoldKit';
import { PremiumModal } from '../components/PremiumModal';
import { buildStoryFilm, FREE_CHAPTER_LIMIT, runtimeLabel } from '../components/premium/our-story/chapters';
import { StoryPlayer } from '../components/premium/our-story/StoryPlayer';
import '../styles/premium-hub.css';

const ACCENT = '#f6c768';

interface OurStoryViewProps {
    setView: (view: ViewState) => void;
}

/**
 * OUR STORY — the film of the relationship.
 * Lobby (this view): film poster + reel strip. Player: full-screen,
 * tap-through premiere auto-generated from the couple's real data.
 */
export const OurStoryView: React.FC<OurStoryViewProps> = ({ setView }) => {
    const [film] = useState(() => buildStoryFilm());
    const [isPremium, setIsPremium] = useState(() => !!StorageService.getCoupleProfile().isPremium);
    const [playerOpen, setPlayerOpen] = useState(false);
    const [paywallOpen, setPaywallOpen] = useState(false);

    const chapterCount = film.chapters.length;
    const runtime = runtimeLabel(chapterCount);
    const gated = !isPremium && chapterCount > FREE_CHAPTER_LIMIT;

    const beginPremiere = useCallback(() => {
        feedback.tap();
        setPlayerOpen(true);
    }, []);

    const handleUnlockFromPlayer = useCallback(() => {
        setPlayerOpen(false);
        setPaywallOpen(true);
    }, []);

    const handlePaywallClose = useCallback(() => {
        setPaywallOpen(false);
        setIsPremium(!!StorageService.getCoupleProfile().isPremium);
    }, []);

    return (
        <GoldShell eyebrow="Our Story" accent={ACCENT}>
            <motion.div initial="hidden" animate="visible" variants={goldStagger}>
                {/* ── Intro ─────────────────────────────────────────── */}
                <motion.div variants={goldRise} className="pt-6 pb-6 text-center">
                    <h1 className="font-serif text-[1.9rem] leading-[1.12]" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                        A film only two people
                        <br />
                        <span className="lp-shimmer-text">could have made</span>
                    </h1>
                    <p className="mt-3 mx-auto max-w-[30ch] text-[13px] leading-relaxed" style={{ color: GOLD.textMid }}>
                        Cut from your real memories, moods and voices — premiering whenever you are.
                    </p>
                </motion.div>

                {/* ── Film poster ───────────────────────────────────── */}
                <motion.div variants={goldRise} className="lp-foil">
                    <div
                        className="relative overflow-hidden rounded-[27px] px-7 py-7"
                        style={{
                            aspectRatio: '3 / 4',
                            background:
                                'radial-gradient(120% 80% at 50% 0%, rgba(94,48,84,0.5) 0%, transparent 55%), linear-gradient(160deg, #271229 0%, #160a18 55%, #1f0f22 100%)',
                        }}
                    >
                        <div className="lp-holo-sheen" />
                        <div className="relative z-10 flex h-full flex-col items-center justify-between text-center">
                            {/* Studio card */}
                            <div className="flex flex-col items-center">
                                <Clapperboard size={16} strokeWidth={1.8} style={{ color: `${ACCENT}cc` }} />
                                <span className="mt-2.5 text-[9.5px] font-bold uppercase tracking-[0.4em]" style={{ color: GOLD.eyebrow }}>
                                    A Lior Original
                                </span>
                            </div>

                            {/* Title block */}
                            <div className="flex flex-col items-center px-2">
                                <span className="text-[10px] font-semibold uppercase tracking-[0.26em]" style={{ color: GOLD.textLow }}>
                                    The story so far
                                </span>
                                <h2 className="mt-4 font-serif text-[2rem] leading-[1.08]" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                                    {film.myName}
                                </h2>
                                <span className="font-serif italic text-[1.2rem] leading-none my-1" style={{ color: ACCENT }}>&amp;</span>
                                <h2 className="font-serif text-[2rem] leading-[1.08]" style={{ color: GOLD.textHigh, letterSpacing: '-0.02em' }}>
                                    {film.partnerName}
                                </h2>
                                <p className="mt-4 text-[11.5px]" style={{ color: GOLD.textMid }}>
                                    {film.days > 0 ? `${film.days.toLocaleString()} days in the making` : 'A story just beginning'}
                                </p>
                            </div>

                            {/* Billing block */}
                            <div className="w-full">
                                <div className="mx-auto mb-3.5 h-px w-3/4" style={{ background: 'linear-gradient(90deg, transparent, rgba(246,199,104,0.35), transparent)' }} />
                                <div className="flex items-center justify-center gap-2 text-[9.5px] font-bold uppercase tracking-[0.2em]" style={{ color: GOLD.textLow }}>
                                    <span>{chapterCount} scenes</span>
                                    <span aria-hidden="true" style={{ color: `${ACCENT}88` }}>·</span>
                                    <span>{runtime}</span>
                                    <span aria-hidden="true" style={{ color: `${ACCENT}88` }}>·</span>
                                    <span style={{ color: `${ACCENT}d9` }}>Now showing</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ── Begin the premiere ────────────────────────────── */}
                <motion.div variants={goldRise} className="mt-5">
                    <GoldCTA onClick={beginPremiere} className="flex items-center justify-center gap-2">
                        <Play size={15} fill="currentColor" strokeWidth={0} />
                        Begin the premiere
                    </GoldCTA>
                    {gated && (
                        <p className="mt-3 text-center text-[11px]" style={{ color: GOLD.textLow }}>
                            First {FREE_CHAPTER_LIMIT} scenes free · Lior Gold screens the full film
                        </p>
                    )}
                </motion.div>

                {/* ── The reel ──────────────────────────────────────── */}
                <motion.div variants={goldRise}>
                    <GoldSectionHeader label="The reel" />
                </motion.div>

                <motion.div variants={goldRise}>
                    <GoldCard className="p-0">
                        {film.chapters.map((c, i) => {
                            const lockedRow = gated && i >= FREE_CHAPTER_LIMIT;
                            return (
                                <div
                                    key={c.id}
                                    className="flex items-center gap-4 px-5 py-3.5"
                                    style={{
                                        borderBottom: i < chapterCount - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                        opacity: lockedRow ? 0.55 : 1,
                                    }}
                                >
                                    <span
                                        className="font-serif text-[1.05rem] w-7 shrink-0 text-right"
                                        style={{ color: lockedRow ? GOLD.textLow : ACCENT }}
                                    >
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <p className="flex-1 min-w-0 truncate text-[13px] font-semibold" style={{ color: GOLD.textHigh }}>
                                        {c.slate}
                                    </p>
                                    {lockedRow ? (
                                        <Lock size={12} className="shrink-0" style={{ color: 'rgba(255,246,230,0.35)' }} />
                                    ) : (
                                        <span className="shrink-0 text-[10px] font-semibold tabular-nums" style={{ color: GOLD.textLow }}>
                                            0:06
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </GoldCard>
                </motion.div>

                {/* ── Trust note ────────────────────────────────────── */}
                <motion.div
                    variants={goldRise}
                    className="mt-4 flex items-start gap-2.5 px-4 py-3.5 rounded-2xl"
                    style={{ background: 'rgba(246,199,104,0.06)', border: '1px solid rgba(246,199,104,0.16)' }}
                >
                    <Sparkles size={13} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />
                    <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,246,230,0.55)' }}>
                        Cut together from your own memories, moods and voices — and it re-edits itself as your story grows.
                    </p>
                </motion.div>
            </motion.div>

            <StoryPlayer
                open={playerOpen}
                film={film}
                isPremium={isPremium}
                onClose={() => setPlayerOpen(false)}
                onUnlock={handleUnlockFromPlayer}
            />
            <PremiumModal isOpen={paywallOpen} onClose={handlePaywallClose} featureContext="generic" />
        </GoldShell>
    );
};
