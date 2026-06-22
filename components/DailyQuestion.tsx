import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Flame, Bell, Lock } from 'lucide-react';
import { CoupleProfile } from '../types';
import { StorageService } from '../services/storage';
import { NotificationsService } from '../services/notifications';
import { getRitualStreak, getTodayPair, submitAnswer, type DailyPair } from '../services/dailyRitual';
import { syncEventTarget } from '../services/sync';
import { Haptics } from '../services/haptics';
import { Audio } from '../services/audio';
import { toast } from '../utils/toast';
import { HeartbeatParticles, HeartbeatParticlesHandle } from './HeartbeatParticlesLazy';
import { PrimingModal } from './PrimingModal';
import { useRelationship } from '../hooks/useRelationship';

// Asked AT MOST once, ever: the first mutual reveal is the highest-consent
// moment to request notification permission (vs a cold prompt at startup).
const NOTIF_PRIMER_SHOWN_KEY = 'notif_primer_shown';

function notifPrimerAlreadyShown(): boolean {
  try {
    return localStorage.getItem(NOTIF_PRIMER_SHOWN_KEY) === '1';
  } catch {
    return false;
  }
}

function markNotifPrimerShown(): void {
  try {
    localStorage.setItem(NOTIF_PRIMER_SHOWN_KEY, '1');
  } catch {
    /* storage unavailable — worst case the primer can show again next reveal */
  }
}

interface DailyQuestionProps {
    profile: CoupleProfile;
    onUpdate: () => void;
}

export const DailyQuestion: React.FC<DailyQuestionProps> = ({ profile, onUpdate }) => {
    // Authoritative "do I actually have a partner?" — the same signal Home uses.
    // Never trust profile.partnerName, which falls back to a phantom "Partner"
    // when unlinked. Gates the post-answer waiting copy below.
    const { isLinked } = useRelationship();
    // Today's question + both answers, read through the sealed-reveal service.
    // `pair.revealed`/`pair.partnerAnswer` are the gate: the service returns the
    // partner answer ONLY when the seal has opened (server-side under the cloud
    // RLS; locally when both answered). source==='local' is the pre-migration
    // fallback and renders identically.
    const [pair, setPair] = useState<DailyPair | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [draft, setDraft] = useState('');
    const [showNotifPrimer, setShowNotifPrimer] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const particlesRef = useRef<HeartbeatParticlesHandle>(null);
    // Guards the one-shot reveal flourish so it fires once per reveal, never on
    // re-render. Keyed by the entry date so a brand-new day can celebrate again.
    const celebratedRef = useRef<string | null>(null);
    const hasLoadedRef = useRef(false);
    // True when the reveal arrived via the live 'daily-answers-update' path (a
    // partner answering on another device). SyncService already shows the reveal
    // toast for that case, so the card plays only its flourish (haptic + chime +
    // particles) and skips its own toast to avoid a duplicate. A submit/local
    // reveal leaves this false and the card owns the toast as before.
    const liveRevealRef = useRef(false);

    const ctx = { myName: profile.myName, partnerName: profile.partnerName };

    // Async best-effort load. getTodayPair never throws and degrades to the
    // local baseline, so a missing table / no .env still resolves a usable pair.
    // Guard against a stale resolve overwriting newer state across profile swaps.
    useEffect(() => {
        let alive = true;
        void (async () => {
            const p = await getTodayPair({ myName: profile.myName, partnerName: profile.partnerName });
            if (!alive) return;
            // On the very first load, if today is ALREADY revealed (the app
            // reopened after both answered earlier), pre-mark it celebrated so
            // the flourish only fires on a genuine in-session reveal transition —
            // never as a replay on mount.
            if (!hasLoadedRef.current) {
                hasLoadedRef.current = true;
                if (p.revealed) celebratedRef.current = p.date;
            }
            if (p.source === 'cloud') StorageService.setRitualCloudActive(true);
            setPair(p);
        })();
        return () => { alive = false; };
    }, [profile]);

    // Live reveal: when the partner's answer reaches this device (realtime, or the
    // periodic reconcile safety net), SyncService dispatches 'daily-answers-update'.
    // Re-read through the sealed-reveal service — getTodayPair stays gated, so this
    // never leaks the partner answer early; it only flips `revealed` once the seal
    // is open, which drives the existing one-shot celebration effect.
    useEffect(() => {
        let alive = true;
        const onDailyAnswers = () => {
            void (async () => {
                const p = await getTodayPair({ myName: profile.myName, partnerName: profile.partnerName });
                if (!alive) return;
                if (p.source === 'cloud') StorageService.setRitualCloudActive(true);
                // Mark this as a live (partner-driven) reveal so the celebration
                // effect plays the flourish but defers the toast to SyncService.
                if (p.revealed && celebratedRef.current !== p.date) liveRevealRef.current = true;
                setPair(p);
            })();
        };
        syncEventTarget.addEventListener('daily-answers-update', onDailyAnswers);
        return () => {
            alive = false;
            syncEventTarget.removeEventListener('daily-answers-update', onDailyAnswers);
        };
    }, [profile]);

    const myAnswer = pair?.myAnswer ?? undefined;
    // Partner answer is surfaced by the service ONLY when the seal is open, so we
    // can render it directly — it stays null pre-reveal and never leaks early.
    const partnerAnswer = pair?.partnerAnswer ?? undefined;
    // Reveal gate comes straight from the service (server-enforced in cloud mode,
    // both-answered locally) — never inferred from the partner string in the UI.
    const isRevealed = Boolean(pair?.revealed);

    const streak = getRitualStreak(profile.questions);

    // ── One-beat reveal flourish ────────────────────────────────────────────
    // When the card first enters its revealed state, play a single celebratory
    // beat: one Heavy haptic + one chime + a brief particle gather + one toast.
    // No spam, no multi-second ceremony — warm-minimal.
    //
    // The toast uses type 'info' (not 'heart'/'success') on purpose: DynamicToast
    // auto-fires feedback.celebrate() (a success haptic + success chime) for
    // celebratory toast types, which would stack a full SECOND beat on top of
    // the explicit Heavy + chime below. 'info' downgrades that to the lightest
    // available toast feedback (a single Medium tick), keeping the intended one
    // Heavy haptic + 'confirm' chime as the dominant — and effectively single — beat.
    useEffect(() => {
        if (!isRevealed || !pair) return;
        if (celebratedRef.current === pair.date) return;
        celebratedRef.current = pair.date;
        // A live (partner-driven) reveal: SyncService owns the toast + the
        // de-dupe flag + the local notification, so the card plays ONLY its
        // flourish here and consumes the live marker. A submit/local/initial
        // reveal (marker false) keeps the original behaviour: claim the per-day
        // flag so SyncService's background path won't also alert, then toast.
        const wasLive = liveRevealRef.current;
        liveRevealRef.current = false;
        if (!wasLive) StorageService.setDailyRevealNotified(pair.date);

        void Haptics.heavy();
        Audio.play('confirm');
        const rect = cardRef.current?.getBoundingClientRect();
        if (rect) {
            particlesRef.current?.triggerReceive(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
        if (!wasLive) toast.show('Your story grew', 'info');
    }, [isRevealed, pair?.date]);

    if (!pair) return null;

    const handleCardClick = () => {
        if (!myAnswer && !expanded) {
            setExpanded(true);
            setTimeout(() => textareaRef.current?.focus(), 350);
        }
    };

    const handleSubmit = () => {
        if (!draft.trim()) return;
        const answer = draft.trim();
        // Capture the seal state BEFORE writing. Just-revealed = "was sealed,
        // now open" — the single transition that earns the push + flourish.
        const wasRevealed = Boolean(pair?.revealed);
        setExpanded(false);
        setDraft('');
        void (async () => {
            const res = await submitAnswer(answer, ctx);
            if (res.usedCloud) StorageService.setRitualCloudActive(true);
            // Re-fetch the canonical pair so `revealed`/`partnerAnswer` reflect
            // the sealed-reveal outcome (server-side in cloud mode, local
            // otherwise). Setting `pair` to a revealed state drives the
            // one-shot celebration effect (guarded by celebratedRef) — so the
            // flourish plays exactly once and is never double-fired here.
            const updated = await getTodayPair(ctx);
            if (updated.source === 'cloud') StorageService.setRitualCloudActive(true);
            setPair(updated);
            // Fire-and-forget partner push ONCE, only on the sealed→open
            // transition that THIS submit completed.
            if (!wasRevealed && updated.revealed) {
                void NotificationsService.triggerPartnerNudge('daily_answer', profile.myName);
                void maybePrimeNotifications();
            }
            onUpdate();
        })();
    };

    // The first mutual reveal is the highest-consent moment to ask for
    // notification permission. We ask AT MOST once (notif_primer_shown flag) and
    // ONLY when the OS state is still undecided ('default'). Strictly sequenced
    // AFTER the reveal flourish (Heavy haptic + chime + particles + toast that
    // the celebration effect fires this same render) via a short delay, so we
    // never stomp that beat.
    const maybePrimeNotifications = async () => {
        if (notifPrimerAlreadyShown()) return;
        let status: NotificationPermission = 'denied';
        try {
            status = await NotificationsService.getPermissionStatus();
        } catch {
            return;
        }
        if (status !== 'default') return;
        window.setTimeout(() => setShowNotifPrimer(true), 1100);
    };

    const handleNotifPrimerConfirm = () => {
        markNotifPrimerShown();
        setShowNotifPrimer(false);
        void (async () => {
            try {
                // Explicit user consent — request (prompting) then schedule now
                // that permission may be granted. requestPermission registers
                // the push token on grant; applySchedule lays down the reminders.
                await NotificationsService.requestPermission();
                await NotificationsService.applySchedule();
            } catch {
                /* best-effort — never block the reveal moment */
            }
        })();
    };

    const handleNotifPrimerCancel = () => {
        markNotifPrimerShown();
        setShowNotifPrimer(false);
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded(false);
        setDraft('');
    };

    return (
        <motion.div
            ref={cardRef}
            layout="size"
            onClick={handleCardClick}
            className="w-full rounded-[1.75rem] p-5 mb-5 relative overflow-hidden"
            style={{
                background: 'rgba(255,255,255,0.88)',
                backdropFilter: 'blur(24px) saturate(140%)',
                WebkitBackdropFilter: 'blur(24px) saturate(140%)',
                border: '1px solid rgba(255,255,255,0.95)',
                boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,1), 0 2px 16px rgba(232,160,176,0.10)',
                cursor: !myAnswer ? 'pointer' : 'default',
            }}
            transition={{ layout: { type: 'spring', stiffness: 400, damping: 32 } }}
        >
            <HeartbeatParticles ref={particlesRef} />

            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                    <Sparkles size={12} className="text-rose-400" />
                    <span className="text-[10px] uppercase tracking-widest font-bold text-rose-400">
                        Today's Question
                    </span>
                </div>
                {streak >= 2 && (
                    <div
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                        style={{
                            background: 'rgba(251,146,60,0.10)',
                            border: '1px solid rgba(251,146,60,0.18)',
                        }}
                    >
                        <Flame size={11} className="text-orange-400" />
                        <span className="text-[10px] font-bold text-orange-500">
                            {streak} days in a row
                        </span>
                    </div>
                )}
            </div>

            {/* Question text */}
            <p className="font-serif text-[1.1rem] italic leading-snug text-gray-800 mb-3">
                "{pair.question}"
            </p>

            {/* State content */}
            <AnimatePresence mode="wait">
                {isRevealed ? (
                    /* Both answered — reveal inline (gated on revealedAt) */
                    <motion.div
                        key="revealed"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="space-y-2 mt-1"
                        onClick={e => e.stopPropagation()}
                    >
                        <AnswerBubble name="You" answer={myAnswer ?? ''} isMe />
                        <AnswerBubble name={profile.partnerName} answer={partnerAnswer ?? ''} isMe={false} />
                    </motion.div>

                ) : myAnswer ? (
                    /* Answered. Paired: waiting for the partner's answer. Solo
                       (no real partner yet): reframe as preparation — answer is
                       saved and will be shared once connected. No phantom name. */
                    <motion.div
                        key="waiting"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={isLinked ? 'relative overflow-hidden flex items-center gap-2.5 px-3 py-2.5 rounded-2xl' : 'px-3 py-2.5 rounded-2xl'}
                        style={
                            isLinked
                                ? { background: 'rgba(251,146,60,0.07)', border: '1px solid rgba(251,146,60,0.16)' }
                                : { background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)' }
                        }
                    >
                        {isLinked ? (
                            <>
                                {/* Faint shimmer sweeping across the sealed pill — both
                                    answers stay hidden behind the seal until the reveal. */}
                                <motion.div
                                    aria-hidden
                                    className="absolute inset-0 pointer-events-none"
                                    style={{
                                        background:
                                            'linear-gradient(105deg, transparent 30%, rgba(251,146,60,0.14) 50%, transparent 70%)',
                                    }}
                                    initial={{ x: '-120%' }}
                                    animate={{ x: '120%' }}
                                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.2 }}
                                />
                                <div
                                    className="relative flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
                                    style={{ background: 'rgba(251,146,60,0.16)' }}
                                >
                                    <Lock size={11} strokeWidth={2.25} style={{ color: '#ea7c30' }} />
                                </div>
                                <span className="relative text-sm italic" style={{ color: '#b06a36' }}>
                                    Sealed until {profile.partnerName} answers
                                </span>
                            </>
                        ) : (
                            <div className="flex items-start gap-2.5">
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: '#fb923c' }} />
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm text-gray-500 italic">
                                        Saved — your partner will see this once you're connected
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        Your answer is saved and waiting to be shared.
                                    </span>
                                </div>
                            </div>
                        )}
                    </motion.div>

                ) : expanded ? (
                    /* Expanded input — inline answer */
                    <motion.div
                        key="input"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            placeholder="Write your answer..."
                            rows={3}
                            maxLength={300}
                            inputMode="text"
                            enterKeyHint="send"
                            autoCapitalize="sentences"
                            autoCorrect="on"
                            spellCheck
                            className="w-full resize-none rounded-2xl px-4 py-3 text-[16px] outline-none mb-2.5"
                            style={{
                                background: 'rgba(0,0,0,0.04)',
                                border: '1px solid rgba(0,0,0,0.07)',
                                color: '#2D1F25',
                                caretColor: '#f43f5e',
                            }}
                        />
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={handleCancel}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-400"
                                style={{ background: 'rgba(0,0,0,0.05)' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!draft.trim()}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold text-white"
                                style={{
                                    background: draft.trim() ? 'linear-gradient(135deg, #f43f5e, #e11d48)' : 'rgba(0,0,0,0.12)',
                                    color: draft.trim() ? 'white' : 'rgba(0,0,0,0.25)',
                                }}
                            >
                                <Send size={11} />
                                Send
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 text-center">
                            {profile.partnerName} won't see this until they answer too.
                        </p>
                    </motion.div>

                ) : (
                    /* Default — prompt to answer */
                    <motion.div
                        key="prompt"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl"
                        style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.04)' }}
                    >
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'rgba(180,180,180,0.6)' }} />
                        <span className="text-sm text-gray-400 italic">
                            Tap to answer today's question
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Notification priming — opens AFTER the reveal flourish, at most once.
                Portals to document.body, so it sits outside the card visually. */}
            <PrimingModal
                isOpen={showNotifPrimer}
                title="Stay in sync, even apart"
                body={`Get a gentle nudge when ${profile.partnerName} answers — so you never miss the moment your story grows.`}
                confirmLabel="Turn on nudges"
                cancelLabel="Not now"
                icon={<Bell size={24} strokeWidth={2} />}
                onConfirm={handleNotifPrimerConfirm}
                onCancel={handleNotifPrimerCancel}
            />
        </motion.div>
    );
};

const AnswerBubble: React.FC<{ name: string; answer: string; isMe: boolean }> = ({ name, answer, isMe }) => (
    <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: isMe ? 0 : 0.12 }}
        className="rounded-2xl px-4 py-3"
        style={{
            background: isMe ? 'rgba(244,63,94,0.07)' : 'rgba(0,0,0,0.04)',
            border: isMe ? '1px solid rgba(244,63,94,0.14)' : '1px solid rgba(0,0,0,0.05)',
        }}
    >
        <p className="text-[10px] uppercase tracking-widest font-bold mb-1.5"
            style={{ color: isMe ? '#e11d48' : '#9B7B84' }}>
            {isMe ? 'You' : name}
        </p>
        <p className="text-sm leading-relaxed font-serif text-gray-700">{answer}</p>
    </motion.div>
);
