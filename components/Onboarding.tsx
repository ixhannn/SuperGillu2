import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, MotionConfig, LayoutGroup } from 'framer-motion';
import {
    ArrowRight, Bell, Calendar, Sparkles, MessageCircle, Lock, QrCode,
    Image as ImageIcon, Activity, Plus, Share2, Star,
} from 'lucide-react';
import { StorageService } from '../services/storage';
import { NotificationsService } from '../services/notifications';
import { Haptics } from '../services/haptics';
import { dateInputValueToStoredDate, daysTogetherFrom, parseStoredDateOnly, todayInputValue } from '../shared/dateOnly.js';
import '../styles/onboarding.css';

interface OnboardingProps {
    onComplete: (myName: string, partnerName: string) => void;
    /**
     * Optional: invoked instead of onComplete when the user chooses to pair
     * with their partner right away. Onboarding is finalized identically
     * (profile + completion flag persisted) BEFORE this fires, so the caller
     * can safely navigate straight to the pairing hub.
     */
    onPairNow?: (myName: string, partnerName: string) => void;
}

// Act I = five emotion slides (the phone-in-clouds hero). Act II = the
// reskinned setup steps. The Step order + the finalizeOnboarding sequence are
// load-bearing and unchanged from the previous design.
type Step =
    | 'feel1' | 'feel2' | 'feel3' | 'feel4' | 'feel5' | 'feel6'
    | 'myName' | 'partnerName' | 'anniversary' | 'first-question' | 'notify' | 'done';

const FEEL_KEYS: Step[] = ['feel1', 'feel2', 'feel3', 'feel4', 'feel5', 'feel6'];

// Full step order — used to derive travel direction (forward vs back) so every
// layer animates in the same coordinated direction for a continuous feel.
const STEP_ORDER: Step[] = ['feel1', 'feel2', 'feel3', 'feel4', 'feel5', 'feel6', 'myName', 'partnerName', 'anniversary', 'first-question', 'notify', 'done'];

// Premium deceleration curve (matches --lior-ease-silk used app-wide).
const SILK = [0.16, 1, 0.3, 1] as const;
const EXIT_EASE = [0.4, 0, 0.2, 1] as const;

// ── Smooth, confident transition system ──────────────────────────────────────
// `custom` carries the travel direction (+1 forward / -1 back). Layers move on
// slightly different depths (copy furthest, phone-screen less) so a slide change
// reads as one calm camera move — clearly present but never busy (premium through
// restraint, à la Brainrot). transform + opacity only, transition-triggered (no
// idle cost). Under <MotionConfig reducedMotion="user"> the travel collapses to a
// plain fade.
const COPY_VARIANTS = {
    enter: (d: number) => ({ opacity: 0, x: d * 60, scale: 0.97 }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (d: number) => ({ opacity: 0, x: d * -52, scale: 0.98 }),
};
// The phone's inner screen content cross-fades a little less than the copy.
const SCREEN_VARIANTS = {
    enter: (d: number) => ({ opacity: 0, x: d * 28 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -28 }),
};
// Act II setup steps: the card slides in (directional) and settles from a gentle
// scale while its fields rise in a soft cascade.
const FORM_VARIANTS = {
    enter: (d: number) => ({ opacity: 0, x: d * 50, scale: 0.97 }),
    center: {
        opacity: 1, x: 0, scale: 1,
        transition: { duration: 0.55, ease: SILK, when: 'beforeChildren' as const, staggerChildren: 0.06, delayChildren: 0.1 },
    },
    exit: (d: number) => ({ opacity: 0, x: d * -50, scale: 0.98, transition: { duration: 0.3, ease: EXIT_EASE } }),
};
const FIELD_VARIANTS = {
    enter: { opacity: 0, y: 22 },
    center: { opacity: 1, y: 0, transition: { duration: 0.5, ease: SILK } },
};

// Smooth masked-line reveal: each \n line rises up from behind an overflow clip,
// staggered — razor-sharp, no blur, no flip. Clean and editorial.
const HEADLINE_VARIANTS = {
    enter: {},
    center: { transition: { staggerChildren: 0.09, delayChildren: 0.06 } },
    exit: {},
};
const LINE_VARIANTS = {
    enter: { y: '115%' },
    center: { y: '0%', transition: { duration: 0.74, ease: SILK } },
    exit: { y: '0%' },
};
// Subcopy follows the headline: it rises softly AFTER the last line settles, so
// the type reads in rhythm — line, line, breath, whisper.
const SUB_VARIANTS = {
    enter: { opacity: 0, y: 14 },
    center: { opacity: 1, y: 0, transition: { delay: 0.42, duration: 0.6, ease: SILK } },
    exit: { opacity: 0, transition: { duration: 0.18 } },
};

const PHX = 147;   // phone centre x within the 294-wide composition column
const PHY = 226;   // phone centre y — memory cards erupt from here (tracks the enlarged, lowered phone)

const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Card content builders (lucide icons — no hearts) ─────────────────────────

const memCard = (grad: string, a: string, b: string): React.ReactNode => (
    <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, flex: 'none', background: grad }} />
        <div style={{ lineHeight: 1.25 }}>
            <div className="ttl">{a}</div>
            <div className="sub">{b}</div>
        </div>
    </div>
);

const chipCard = (icon: React.ReactNode, text: string): React.ReactNode => (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        {icon}
        <span className="ttl">{text}</span>
    </div>
);

const waveCard = (text: string): React.ReactNode => (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {[6, 12, 8, 14, 9, 11].map((h, i) => (
                <span key={i} style={{ width: 2, height: h, borderRadius: 2, background: '#f0a36b' }} />
            ))}
        </span>
        <span className="ttl">{text}</span>
    </div>
);

const dotsCard = (text: string): React.ReactNode => (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <span style={{ display: 'flex', gap: 3 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff9fb6', boxShadow: '0 0 9px #ff9fb6' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffcd92', boxShadow: '0 0 9px #ffcd92' }} />
        </span>
        <span className="ttl">{text}</span>
    </div>
);

const menuCard: React.ReactNode = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <MessageCircle size={13} style={{ color: '#c4683a' }} /><span className="ttl">Reply</span>
        </div>
        <div style={{ height: 1, background: 'rgba(120,60,40,.1)' }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ImageIcon size={13} style={{ color: '#c4683a' }} /><span className="ttl">Keep</span>
        </div>
    </div>
);

interface CardDef { id: string; content: React.ReactNode; x: number; y: number; w: number; r: number; d: number; }

interface FeelSlide {
    key: Step;
    h: string;
    s: string;
    cta: string;
    sky: string;
    sun: number;
    glow: number;
    cons: number;
    mode: 'icon' | 'dev' | 'finale';
    cards: CardDef[];
}

const ACT1: FeelSlide[] = [
    {
        key: 'feel1',
        h: 'A place that’s\nonly yours.',
        s: 'Every relationship deserves a world of its own.',
        cta: 'Start our story',
        sky: 'linear-gradient(180deg,#ff8656,#ffa781 22%,#ffceba 42%,#fff3ec 64%)',
        sun: 1, glow: 1, cons: 0, mode: 'icon', cards: [],
    },
    {
        key: 'feel2',
        h: 'Moments move\nfaster than\nwe can hold them.',
        s: 'The ordinary days are the ones we miss most.',
        cta: 'Continue',
        sky: 'linear-gradient(180deg,#ff7168,#ff938c 22%,#ffc0bc 42%,#fff1ef 64%)',
        sun: 0.8, glow: 0.7, cons: 0.12, mode: 'dev',
        cards: [
            { id: 'm', content: memCard('linear-gradient(135deg,#ffd3a0,#ff9bb6)', 'Jun 14', 'Sea Point'), x: 28, y: 56, w: 152, r: -5, d: 7 },
            { id: 'v', content: waveCard('0:12'), x: 190, y: 150, w: 94, r: 6, d: 8 },
            { id: 'a', content: chipCard(<Calendar size={15} style={{ color: '#c4683a' }} />, '3 years'), x: 186, y: 210, w: 96, r: 4, d: 6.5 },
        ],
    },
    {
        key: 'feel3',
        h: 'The little things\nbecome\nthe big things.',
        s: 'A small note. A quiet question. A day remembered.',
        cta: 'Continue',
        sky: 'linear-gradient(180deg,#f85f72,#ff8496 22%,#ffb4c2 42%,#fff0f3 64%)',
        sun: 0.7, glow: 0.6, cons: 0.28, mode: 'dev',
        cards: [
            { id: 'q', content: chipCard(<MessageCircle size={15} style={{ color: '#c4683a' }} />, 'a quiet question'), x: 28, y: 58, w: 150, r: -5, d: 7.5 },
            { id: 'menu', content: menuCard, x: 184, y: 150, w: 104, r: 5, d: 8 },
            { id: 'n', content: <div className="ttl" style={{ fontStyle: 'italic', color: '#5a4a42' }}>“thinking of you”</div>, x: 40, y: 214, w: 120, r: -3, d: 6.8 },
        ],
    },
    {
        key: 'feel4',
        h: 'Not just keeping\nyour story.\nBuilding it.',
        s: 'Two of you, gathering into something only you share.',
        cta: 'Continue',
        sky: 'linear-gradient(180deg,#e6537f,#ff7aa0 22%,#ffa8c8 42%,#feeff5 64%)',
        sun: 0.6, glow: 0.55, cons: 0.72, mode: 'dev',
        cards: [
            { id: 'sync', content: dotsCard('in sync'), x: 28, y: 40, w: 122, r: -5, d: 7 },
            { id: 'song', content: memCard('linear-gradient(135deg,#ffc0d4,#c79bff)', 'our song', 'on repeat'), x: 172, y: 118, w: 114, r: 5, d: 8 },
            { id: 'rhythm', content: chipCard(<Activity size={15} style={{ color: '#e8657a' }} />, 'one rhythm'), x: 184, y: 180, w: 104, r: 4, d: 6.6 },
            { id: 'mem', content: chipCard(<Plus size={15} style={{ color: '#c4683a' }} />, '+1 memory'), x: 178, y: 240, w: 108, r: 6, d: 7.2 },
        ],
    },
    {
        // Same phone as feel2–4 (it persists across dev slides — no remount): its
        // screen turns to "Your world" while the four categories erupt from it as
        // cards, in exactly the language the previous slides taught.
        key: 'feel5',
        h: 'Everything you share,\nin one place.',
        s: 'Memories, milestones, and everything in between.',
        cta: 'Continue',
        sky: 'linear-gradient(180deg,#cf4d8a,#ee74ac 22%,#ffa2cc 42%,#fceef6 64%)',
        sun: 0.85, glow: 0.78, cons: 0.55, mode: 'dev',
        cards: [
            { id: 'mile', content: chipCard(<Star size={15} style={{ color: '#c8566e' }} />, 'Milestones'), x: 28, y: 52, w: 124, r: -5, d: 7 },
            { id: 'quiet', content: chipCard(<Sparkles size={15} style={{ color: '#e8657a' }} />, 'Quiet moments'), x: 156, y: 122, w: 136, r: 5, d: 8 },
            { id: 'mems', content: chipCard(<ImageIcon size={15} style={{ color: '#c8566e' }} />, 'Memories'), x: 176, y: 196, w: 112, r: 4, d: 6.6 },
            { id: 'notes', content: chipCard(<MessageCircle size={15} style={{ color: '#c8566e' }} />, 'Little notes'), x: 32, y: 214, w: 120, r: -4, d: 7.2 },
        ],
    },
    {
        key: 'feel6',
        h: 'This is where\nyour story lives.',
        s: 'Welcome to Lior.',
        cta: 'Begin',
        sky: 'linear-gradient(180deg,#b8478a,#dd6ea8 22%,#f59ec9 42%,#faebf4 64%)',
        sun: 0.95, glow: 0.9, cons: 1, mode: 'finale',
        cards: [],
    },
];

// In-phone screen content per Act-I slide (cross-fades as the user advances).
const devContentFor = (step: Step): React.ReactNode => {
    switch (step) {
        case 'feel2':
            return (
                <>
                    <div className="dh">Memories</div>
                    <div className="dgrid">
                        {['linear-gradient(135deg,#ffd0a4,#ff9fb6)', 'linear-gradient(135deg,#ffc0d4,#c79bff)', 'linear-gradient(135deg,#ffe3a4,#ffb27e)', 'linear-gradient(135deg,#c0e0ff,#ffc0d4)', 'linear-gradient(135deg,#ffe3a4,#ff9fb6)', 'linear-gradient(135deg,#ffd0a4,#c79bff)'].map((g, i) => (
                            <span key={i} style={{ background: g }} />
                        ))}
                    </div>
                    <div className="dlabel">127 moments saved</div>
                </>
            );
        case 'feel3':
            return (
                <>
                    <div className="dh">Today</div>
                    <div className="dcard">
                        <div className="dq">“What made you smile today?”</div>
                        <div className="dpill">your turn</div>
                    </div>
                    <div className="drow" />
                </>
            );
        case 'feel4':
            return (
                <>
                    <div className="dh">Us</div>
                    <div className="dtwo"><span className="a" /><span className="b" /></div>
                    <div className="dlabel">in sync · 48 days</div>
                </>
            );
        case 'feel5':
            return (
                <>
                    <div className="dh">Your world</div>
                    <div className="dcons" />
                    <div className="dlabel">everything, in one place</div>
                </>
            );
        default:
            return null;
    }
};

// ─── Status-bar icons (inline SVG so they never depend on an icon font) ────────

const StatusIcons: React.FC<{ color: string; h: number }> = ({ color, h }) => {
    const w = Math.round(h * 5.05);
    return (
        <svg width={w} height={h} viewBox="0 0 62 12" fill="none" style={{ display: 'block' }} aria-hidden>
            <rect x="0" y="6.5" width="3" height="4.5" rx=".8" fill={color} />
            <rect x="4.6" y="4.6" width="3" height="6.4" rx=".8" fill={color} />
            <rect x="9.2" y="2.7" width="3" height="8.3" rx=".8" fill={color} />
            <rect x="14.1" y="1" width="3" height="10" rx=".8" fill={color} />
            <path d="M30 11 L24.3 6.3 A7.3 7.3 0 0 1 35.7 6.3 Z" fill={color} />
            <rect x="43.5" y="2.4" width="14.6" height="7.7" rx="2.4" fill="none" stroke={color} strokeWidth="1" opacity=".55" />
            <rect x="44.9" y="3.7" width="10" height="5.1" rx="1.4" fill={color} />
            <path d="M59.4 4.7 a1.6 1.6 0 0 1 0 2.6" stroke={color} strokeWidth="1.1" fill="none" opacity=".55" strokeLinecap="round" />
        </svg>
    );
};

// ─── The living sky: dust + a constellation that builds with each slide ────────

const ACT2_SCENE = {
    sky: 'linear-gradient(180deg,#dd6098,#f584b4 24%,#ffb2d2 44%,#fceef6 64%)',
    sun: 0.7, glow: 0.55, cons: 0.55,
};
const DONE_SCENE = {
    sky: 'linear-gradient(180deg,#b8478a,#dd6ea8 22%,#f59ec9 42%,#faebf4 64%)',
    sun: 0.95, glow: 0.9, cons: 1,
};

// ─── Main component ───────────────────────────────────────────────────────────

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onPairNow }) => {
    const [step, setStep] = useState<Step>('feel1');
    const [myName, setMyName] = useState('');
    const [partnerName, setPartnerName] = useState('');
    const [anniversary, setAnniversary] = useState('');
    const [firstAnswer, setFirstAnswer] = useState('');
    const [firstQuestion, setFirstQuestion] = useState('');
    const nameRef = useRef<HTMLInputElement>(null);
    const partnerRef = useRef<HTMLInputElement>(null);
    const answerRef = useRef<HTMLTextAreaElement>(null);

    const skyRef = useRef<HTMLCanvasElement>(null);
    const devCanvasRef = useRef<HTMLCanvasElement>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const intensityTargetRef = useRef(0.15);
    const panRef = useRef(0);          // transient background pan, kicked on each advance
    // Two-lights convergence: the couple's two souls find each other across Act I.
    // 0 = far apart (feel1) → 1 = merged at centre (finale + Act II).
    const soulTargetRef = useRef(0);
    // Persists the eased convergence across canvas-effect re-runs (which fire on
    // every slide) so the lights progress smoothly instead of snapping apart.
    const soulCurRef = useRef(0);
    // One-shot spark burst the instant the two lights finally touch (fires once
    // per session; persists across canvas re-runs). Wall-clock timed so a fast
    // "Begin" tap (which re-runs the canvas effect) can't cut it mid-flight, and
    // gated to the finale so a skipped intro never spends the payoff unstaged.
    const burstDoneRef = useRef(false);
    const burstT0Ref = useRef(-1);
    const finaleRef = useRef(false);
    // Persists the ambient clock across effect re-runs so star-twinkle / firefly
    // blink phase never snaps when a slide advances.
    const tRef = useRef(0);
    const [dir, setDir] = useState(1); // travel direction (+1 forward / -1 back)

    // Desktop preview only: scale the fixed 402x872 phone frame uniformly to fit
    // the window so the true 9:19.5 aspect is never distorted (the @media frame
    // reads --lo-ob-scale). No-op on real mobile (full-bleed, scale stays 1).
    useEffect(() => {
        const el = shellRef.current;
        if (!el || typeof window === 'undefined') return;
        const fit = () => {
            const s = Math.min(1, (window.innerHeight - 24) / 872, (window.innerWidth - 24) / 402);
            el.style.setProperty('--lo-ob-scale', String(Math.max(0.4, s)));
        };
        fit();
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, []);

    const isFeel = FEEL_KEYS.includes(step);
    const feelIndex = FEEL_KEYS.indexOf(step);
    const feelSlide = isFeel ? ACT1[feelIndex] : null;
    const isIconMode = feelSlide?.mode === 'icon';
    const isFinale = feelSlide?.mode === 'finale';
    const isDev = feelSlide?.mode === 'dev';

    const scene = useMemo(() => {
        if (feelSlide) return { sky: feelSlide.sky, sun: feelSlide.sun, glow: feelSlide.glow, cons: feelSlide.cons };
        if (step === 'done') return DONE_SCENE;
        return ACT2_SCENE;
    }, [feelSlide, step]);

    useEffect(() => {
        // Two-lights convergence drives across the whole flow: the two souls start
        // far apart and draw together slide by slide, merging at the welcome + setup.
        const SOUL_BY_STEP: Partial<Record<Step, number>> = {
            feel1: 0, feel2: 0.22, feel3: 0.42, feel4: 0.66, feel5: 0.82, feel6: 1,
        };
        soulTargetRef.current = SOUL_BY_STEP[step] ?? 1; // Act II steps → stay merged
        finaleRef.current = step === 'feel6';            // the spark-burst kiss is a finale beat

        // Signature "gather" beat on the welcome slide: the lights gather to
        // ~0.82, take a brief breath, then bloom to full — felt, not a linear fade.
        if (step === 'feel6') {
            intensityTargetRef.current = 0.82;
            const id = setTimeout(() => { intensityTargetRef.current = 1; }, 260);
            return () => clearTimeout(id);
        }
        intensityTargetRef.current = scene.cons;
    }, [step, scene.cons]);

    const daysApart = useMemo(() => {
        if (!anniversary) return 0;
        const parsed = parseStoredDateOnly(anniversary);
        return parsed ? daysTogetherFrom(parsed) : 0;
    }, [anniversary]);

    const advance = (next: Step) => {
        // Tactile choreography: "Building it" (feel4) = the two lights converge → an
        // intimate lub-dub; arriving at the welcome (feel6) = a quiet celebratory
        // milestone; everything else = the workhorse light tick.
        if (next === 'feel4') void Haptics.heartbeat();
        else if (next === 'feel6') void Haptics.milestone();
        else void Haptics.tap();
        const d = STEP_ORDER.indexOf(next) >= STEP_ORDER.indexOf(step) ? 1 : -1;
        setDir(d);
        panRef.current = -d * 22; // background drifts opposite to travel — parallax depth
        setStep(next);
    };

    // ── Persistence (ORDER IS LOAD-BEARING — unchanged) ──────────────────────
    //   1. saveCoupleProfile writes myName + partnerName + anniversary.
    //      submitQuestionAnswer keys the answer by profile.myName, so the name
    //      MUST persist first.
    //   2. If a first answer was entered: getTodayQuestion(myName, partnerName)
    //      to ensure today's QuestionEntry exists, THEN submitQuestionAnswer.
    //   3. markOnboardingComplete last.
    const finalizeOnboarding = () => {
        const profile = StorageService.getCoupleProfile();
        const trimmedName = myName.trim();
        const trimmedPartner = partnerName.trim();

        StorageService.saveCoupleProfile({
            ...profile,
            myName: trimmedName,
            // Skipped → keep whatever the profile already had (pairing will
            // reconcile the partner's real name later anyway).
            partnerName: trimmedPartner || profile.partnerName,
            anniversaryDate: anniversary
                ? dateInputValueToStoredDate(anniversary)
                : profile.anniversaryDate,
        });

        const trimmedAnswer = firstAnswer.trim();
        if (trimmedAnswer) {
            StorageService.getTodayQuestion(trimmedName, trimmedPartner);
            StorageService.submitQuestionAnswer(trimmedAnswer);
        }

        StorageService.markOnboardingComplete();
    };

    // Resolve today's ritual question only when reaching that step, so the text
    // matches exactly what getTodayQuestion will key the answer to at finalize
    // (same name args in both places — partnerName is final by this step).
    const enterFirstQuestion = () => {
        if (!firstQuestion) {
            const entry = StorageService.getTodayQuestion(myName.trim(), partnerName.trim());
            setFirstQuestion(entry.question);
        }
        advance('first-question');
    };

    // After the first answer is sealed: show the notification primer only when a
    // system prompt is actually available ('default' = never asked); already-
    // granted or hard-denied users go straight to the welcome.
    const enterAfterSeal = () => {
        void (async () => {
            const status = await NotificationsService.getPermissionStatus().catch(() => 'denied' as const);
            advance(status === 'default' ? 'notify' : 'done');
        })();
    };

    const handleComplete = async () => {
        await Haptics.celebrate();
        finalizeOnboarding();
        setTimeout(() => onComplete(myName.trim(), partnerName.trim()), 240);
    };

    const handlePairNow = async () => {
        await Haptics.heartbeat();
        finalizeOnboarding();
        if (onPairNow) onPairNow(myName.trim(), partnerName.trim());
        else onComplete(myName.trim(), partnerName.trim());
    };

    useEffect(() => {
        if (step === 'myName') setTimeout(() => nameRef.current?.focus(), 420);
        if (step === 'partnerName') setTimeout(() => partnerRef.current?.focus(), 420);
        if (step === 'first-question') setTimeout(() => answerRef.current?.focus(), 450);
    }, [step]);

    // ── Canvas: dust + constellation (+ tiny in-phone constellation) ─────────
    useEffect(() => {
        const sky = skyRef.current;
        if (!sky) return;
        const ctx = sky.getContext('2d');
        if (!ctx) return;
        const reduce = prefersReducedMotion();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let W = 0, H = 0;

        const sizeSky = () => {
            W = sky.clientWidth || 460;
            H = sky.clientHeight || 452;
            sky.width = W * dpr;
            sky.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        sizeSky();
        window.addEventListener('resize', sizeSky);

        const rnd = (a: number, b: number) => a + Math.random() * (b - a);
        const warm = ['#ffe1b0', '#ffb7c8', '#fff1e2', '#ffcd92', '#ff9fb6'];
        const sprite = (col: string) => {
            const s = document.createElement('canvas');
            s.width = s.height = 36;
            const g = s.getContext('2d')!;
            const rg = g.createRadialGradient(18, 18, 0, 18, 18, 18);
            rg.addColorStop(0, col); rg.addColorStop(.4, col); rg.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = rg; g.beginPath(); g.arc(18, 18, 18, 0, 6.2832); g.fill();
            return s;
        };
        const sprites: Record<string, HTMLCanvasElement> = {};
        warm.forEach(c => { sprites[c] = sprite(c); });

        const dust = Array.from({ length: 26 }, () => ({
            x: Math.random(), y: rnd(0, .6), r: rnd(.5, 1.7), a: rnd(.18, .55),
            ph: Math.random() * 6.2832, sp: rnd(.3, .9), c: warm[(Math.random() * warm.length) | 0],
        }));
        const cstars = [[.34, .25], [.46, .16], [.6, .27], [.5, .36], [.4, .43], [.6, .43], [.5, .52]];
        // Warm monsoon drizzle — faint, slow light-streaks slipping down through the
        // sunset. Just a few thin additive lines; barely-there atmosphere, cheap.
        const drizzle = Array.from({ length: 18 }, () => ({
            x: Math.random(), y: Math.random(), len: rnd(22, 54), sp: rnd(.12, .26), a: rnd(.1, .24),
        }));
        // Evening stars — FIXED positions (deterministic, so they never jump when the
        // effect re-runs on a slide change). They fade in as the sun sets (soul rises):
        // the sky trades its sun for stars, and the couple's constellation forms among them.
        const estars = Array.from({ length: 28 }, (_, i) => {
            // Golden-ratio stride (no lag-N aliasing → no accidental double-stars),
            // mapped into the VISIBLE band [0.18, 0.82] — the sky canvas is 156%
            // wide, so raw [0,1] would strand a third of the stars in the overscan.
            const x = 0.18 + ((i * 0.618034 + 0.07) % 1) * 0.64;
            let y = ((i * 0.3049 + 0.02) % 1) * 0.5;           // upper sky only
            if (Math.abs(y - 0.155) < 0.035) y += 0.075;       // stay clear of the soul-lights line
            return { x, y, s: 3 + (i % 3), ph: i * 1.71, sp: 0.5 + (i % 4) * 0.17 };
        });
        // Fireflies — a handful of warm motes waking near the cloud line at dusk.
        // Deterministic anchors; they wander gently and blink on their own cadence.
        // Anchors sit in the visible band and ride ABOVE the cloud top (canvas
        // y≈250) so the motes hover AT the cloud line instead of behind the
        // opaque puffs — they must actually read on screen.
        const flies = Array.from({ length: 9 }, (_, i) => ({
            x: 0.2 + i * 0.075, y: 0.47 + ((i * 0.37) % 1) * 0.1,
            ph: i * 2.3, wx: 16 + (i % 3) * 8, wy: 10 + (i % 2) * 6,
        }));

        let raf = 0, t = tRef.current, intensity = 0.15, soul = soulCurRef.current;

        const drawSky = () => {
            ctx.clearRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';
            for (const p of dust) {
                const tw = .5 + .5 * Math.sin(t * p.sp + p.ph);
                const px = p.x * W + Math.sin(t * .3 + p.ph) * 4 + panRef.current * 0.6;
                const py = p.y * H + Math.cos(t * .24 + p.ph) * 4;
                ctx.globalAlpha = p.a * tw * .8;
                const sz = p.r * 7;
                ctx.drawImage(sprites[p.c], px - sz / 2, py - sz / 2, sz, sz);
            }
            // Monsoon drizzle — faint warm streaks falling through the dusk (additive).
            // The rain arrives WITH the evening: barely-there at the first slide,
            // present (never loud) by the magenta dusk.
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255,220,214,1)';
            const evening = 0.45 + soul * 0.75;
            for (const r of drizzle) {
                const y = ((r.y + t * r.sp) % 1.12) * H - H * 0.06;
                const x = r.x * W + panRef.current * 0.4;
                ctx.globalAlpha = r.a * evening;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2.5, y + r.len); ctx.stroke();
            }
            // Evening stars — night arrives DECISIVELY: the sky visibly fills with
            // bright stars as dusk deepens, and individual stars flare-sparkle.
            if (soul > 0.3) {
                const nightfall = Math.min(1, (soul - 0.3) / 0.45);
                for (const s of estars) {
                    const tw = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
                    const f = Math.max(0, Math.sin(t * s.sp * 1.6 + s.ph * 2.3));
                    const flare = f * f * f * f * f * f;             // occasional bright sparkle
                    ctx.globalAlpha = Math.min(1, nightfall * (0.35 + tw * 0.65) * (1 + flare * 0.8));
                    const px = s.x * W + panRef.current * 0.8;
                    const py = s.y * H;
                    const sz = s.s * (2 + flare * 1.6);
                    ctx.drawImage(sprites['#fff1e2'], px - sz / 2, py - sz / 2, sz, sz);
                }
            }
            // Fireflies — waking near the cloud line as the light goes down.
            // Fuller blink curve + bigger motes so the embers genuinely glow.
            if (soul > 0.4) {
                const wake = Math.min(1, (soul - 0.4) / 0.4);
                for (const f of flies) {
                    const blink = Math.max(0, Math.sin(t * 0.9 + f.ph));
                    const glow = Math.pow(blink, 1.8);
                    if (glow < 0.05) continue;
                    const px = f.x * W + Math.sin(t * 0.24 + f.ph) * f.wx + panRef.current * 0.5;
                    const py = f.y * H + Math.cos(t * 0.31 + f.ph * 1.7) * f.wy;
                    ctx.globalAlpha = Math.min(1, wake * glow);
                    ctx.drawImage(sprites['#ffcd92'], px - 6, py - 6, 12, 12);
                }
            }
            if (intensity > 0.04) {
                const pts = cstars.map(c => [c[0] * W + panRef.current, c[1] * H]);
                ctx.globalCompositeOperation = 'source-over';
                ctx.lineWidth = .7;
                for (let m = 0; m < pts.length; m++) {
                    for (let n = m + 1; n < pts.length; n++) {
                        const d = Math.hypot(pts[m][0] - pts[n][0], pts[m][1] - pts[n][1]);
                        if (d < 150) {
                            ctx.strokeStyle = `rgba(236,110,140,${(intensity * .4 * (1 - d / 150)).toFixed(3)})`;
                            ctx.beginPath(); ctx.moveTo(pts[m][0], pts[m][1]); ctx.lineTo(pts[n][0], pts[n][1]); ctx.stroke();
                        }
                    }
                }
                ctx.globalCompositeOperation = 'lighter';
                for (let k = 0; k < pts.length; k++) {
                    const tw = .6 + .4 * Math.sin(t * .9 + k);
                    ctx.globalAlpha = intensity * tw;
                    const sz = 7 + intensity * 5;
                    ctx.drawImage(sprites[warm[k % warm.length]], pts[k][0] - sz / 2, pts[k][1] - sz / 2, sz, sz);
                }
            }

            // ── Two soul-lights: the couple finding each other across the slides.
            // They start far apart and converge to the centre; a filament between
            // them brightens as they near, and a warm bloom ignites where they meet
            // (the "growing world"). Cheap — a few draws on the existing canvas. ──
            {
                const cx = W * 0.5 + panRef.current;
                const sy = H * 0.155;
                const spread = (1 - soul) * (W * 0.3) + W * 0.022;
                const ax = cx - spread, bx = cx + spread;
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = `rgba(255,172,190,${(0.08 + soul * 0.38).toFixed(3)})`;
                ctx.lineWidth = 1.2 + soul * 1.8;
                ctx.beginPath(); ctx.moveTo(ax, sy); ctx.lineTo(bx, sy); ctx.stroke();
                ctx.globalCompositeOperation = 'lighter';
                const orb = (x: number, col: string, ph: number) => {
                    const r = (13 + soul * 9) * (0.92 + 0.08 * Math.sin(t * 1.3 + ph));
                    ctx.globalAlpha = 0.6 + soul * 0.4;
                    ctx.drawImage(sprites[col], x - r, sy - r, r * 2, r * 2);
                };
                orb(ax, '#ff9fb6', 0);          // one soul — warm rose
                orb(bx, '#ffcd92', 2.1);        // the other — warm amber
                if (soul > 0.55) {              // they meet → the world ignites
                    const m = (soul - 0.55) / 0.45;
                    ctx.globalAlpha = m * 0.7 * (0.86 + 0.14 * Math.sin(t * 1.1));
                    const mr = 28 + m * 30;
                    ctx.drawImage(sprites['#fff1e2'], cx - mr, sy - mr, mr * 2, mr * 2);
                }
                // The KISS: the instant the lights truly touch AT THE FINALE, a
                // one-shot ring of sparks bursts from the meeting point (once per
                // session; wall-clock so an effect re-run can't cut it mid-flight).
                if (soul > 0.96 && finaleRef.current && !burstDoneRef.current) { burstDoneRef.current = true; burstT0Ref.current = performance.now(); }
                if (burstT0Ref.current >= 0) {
                    const bp = (performance.now() - burstT0Ref.current) / 1400;   // 0→1 over 1.4s
                    if (bp < 1) {
                        const ease = 1 - Math.pow(1 - bp, 3);
                        for (let q = 0; q < 16; q++) {
                            const ang = (q / 16) * 6.2832 + 0.31;
                            const dist = ease * (58 + (q % 3) * 18);
                            const px = cx + Math.cos(ang) * dist;
                            const py = sy + Math.sin(ang) * dist * 0.8;
                            ctx.globalAlpha = (1 - bp) * 0.95;
                            const ss = 7 - ease * 3.5;
                            ctx.drawImage(sprites[q % 2 ? '#ff9fb6' : '#ffcd92'], px - ss, py - ss, ss * 2, ss * 2);
                        }
                    }
                }
            }
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        };

        const drawDev = () => {
            const dev = devCanvasRef.current;
            if (!dev) return;
            const dcx = dev.getContext('2d');
            if (!dcx) return;
            dcx.clearRect(0, 0, dev.width, dev.height);
            if (intensity > 0.45) {
                dcx.globalCompositeOperation = 'lighter';
                const dp = [[40, 70], [64, 58], [88, 72], [52, 86], [76, 86]];
                for (let q = 0; q < dp.length; q++) {
                    const a = (intensity - .4) * 1.4 * (.6 + .4 * Math.sin(t + q));
                    dcx.globalAlpha = Math.min(1, a);
                    dcx.fillStyle = '#ff9c5a';
                    dcx.beginPath(); dcx.arc(dp[q][0], dp[q][1], 2, 0, 6.2832); dcx.fill();
                }
                dcx.globalAlpha = (intensity - .4) * .8;
                dcx.strokeStyle = 'rgba(255,150,110,.7)';
                dcx.lineWidth = .8;
                dcx.beginPath(); dcx.moveTo(40, 70); dcx.lineTo(64, 58); dcx.lineTo(88, 72); dcx.stroke();
                dcx.globalAlpha = 1; dcx.globalCompositeOperation = 'source-over';
            }
        };

        const loop = () => {
            t += 0.016;
            intensity += (intensityTargetRef.current - intensity) * 0.05;
            soul += (soulTargetRef.current - soul) * 0.045;   // souls ease together
            soulCurRef.current = soul;                        // persist across re-runs
            tRef.current = t;                                 // ambient clock survives re-runs
            panRef.current += (0 - panRef.current) * 0.08; // ease the pan kick back to rest
            drawSky(); drawDev();
            raf = requestAnimationFrame(loop);
        };

        if (reduce) { intensity = intensityTargetRef.current; soul = soulTargetRef.current; soulCurRef.current = soul; burstDoneRef.current = true; drawSky(); drawDev(); }
        else raf = requestAnimationFrame(loop);

        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', sizeSky); };
        // Re-run on constellation-intensity change so the reduced-motion static
        // redraw reflects the current slide's target (the rAF path is unaffected:
        // cleanup cancels the prior frame and a fresh loop restarts).
    }, [scene.cons]);

    // ── Live animated days counter for the anniversary step ──────────────────
    const [daysDisplay, setDaysDisplay] = useState(0);
    useEffect(() => {
        if (!daysApart) { setDaysDisplay(0); return; }
        let raf = 0; const start = performance.now();
        const tick = (now: number) => {
            const p = Math.min(1, (now - start) / 1000);
            const e = 1 - Math.pow(1 - p, 3);
            setDaysDisplay(Math.round(daysApart * e));
            if (p < 1) raf = requestAnimationFrame(tick);
            else void Haptics.milestone();   // a soft tactile "landing" as the count settles
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [daysApart]);

    // ── Bottom CTA wiring per step ───────────────────────────────────────────
    const ctaForStep = (): { label: string; onClick: () => void; disabled?: boolean } => {
        if (isFeel) {
            const next = feelIndex < FEEL_KEYS.length - 1 ? FEEL_KEYS[feelIndex + 1] : 'myName';
            return { label: feelSlide!.cta, onClick: () => advance(next) };
        }
        if (step === 'myName') return { label: 'Continue', disabled: !myName.trim(), onClick: () => myName.trim() && advance('partnerName') };
        if (step === 'partnerName') return { label: 'Continue', disabled: !partnerName.trim(), onClick: () => partnerName.trim() && advance('anniversary') };
        if (step === 'anniversary') return { label: 'Continue', onClick: () => enterFirstQuestion() };
        if (step === 'first-question') return { label: 'Save · continue', disabled: !firstAnswer.trim(), onClick: () => { if (firstAnswer.trim()) { void Haptics.success(); enterAfterSeal(); } } };
        if (step === 'notify') {
            return {
                label: 'Notify me',
                onClick: () => {
                    void (async () => {
                        await NotificationsService.requestPermission().catch(() => {});
                        advance('done');
                    })();
                },
            };
        }
        return { label: partnerName.trim() ? `Invite ${partnerName.trim().split(/\s+/)[0]}` : 'Invite your partner', onClick: () => void handlePairNow() };
    };
    const cta = ctaForStep();
    const firstName = myName.trim().split(/\s+/)[0] || '';   // warm, personal greeting on the welcome
    const partnerFirst = partnerName.trim().split(/\s+/)[0] || '';   // personalizes seal/notify/invite copy
    // The sun SETS across the flow — it sinks (and the sky deepens) slide by slide,
    // fully down by the welcome + setup. 0 = high (feel1) → 1 = set (feel6 / Act II).
    const sunSet = isFeel ? feelIndex / (FEEL_KEYS.length - 1) : 1;

    return (
        <MotionConfig reducedMotion="user">
        <LayoutGroup>
        <div className="lo-ob-shell" ref={shellRef}>
        <div className="lo-ob" style={{ background: scene.sky, color: '#2a211d' }}>
            <div className="lo-ob-glow" style={{ opacity: scene.glow }} />
            <div className="lo-ob-sun" style={{ opacity: scene.sun, transform: `translateY(${Math.round(sunSet * 168)}px) scale(${(1 + sunSet * 0.38).toFixed(3)})` }} />
            <div className="lo-ob-rays" style={{ opacity: scene.sun * 0.85, transform: `translateY(${Math.round(sunSet * 84)}px)` }} />

            <div className="lo-ob-scene">
                <canvas ref={skyRef} className="lo-ob-sky" aria-hidden />
                <div className="lo-ob-cloud" />
                <div className="lo-ob-fade" />
            </div>


            {/* ── Act I: the phone-in-clouds hero ─────────────────────────── */}
            {/* AnimatePresence stays mounted across feel1‑6 (stable key) and only
                fires on the Act I → Act II hand‑off: the whole scene lifts and
                dissolves upward as the setup card blooms in from centre. */}
            <AnimatePresence>
            {isFeel && feelSlide && (
                <motion.div
                    className="lo-ob-comp"
                    key="act1-comp"
                    initial={{ opacity: 0, scale: 0.9, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.95, ease: SILK, delay: 0.15 } }}
                    /* Opacity-only exit: keeps the finale mark's box untransformed so the
                       shared-element morph into the Act II header mark projects cleanly. */
                    exit={{ opacity: 0, transition: { duration: 0.44, ease: SILK } }}
                >
                    {/* Mark — icon (slide 1) + finale (welcome). CONDITIONALLY MOUNTED
                        (not opacity-toggled) so the logo can never linger or pop onto
                        the phone slides. */}
                    {(isIconMode || isFinale) && (
                        <motion.div
                            key={`mark-${step}`}
                            className="lo-ob-markwrap"
                            initial={{ opacity: 0, scale: 0.94 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        >
                            {isFinale && <div className="lo-ob-finale-bloom" />}
                            {isFinale && <div className="lo-ob-ignite" />}
                            {isFinale && <div className="lo-ob-finale-ring" />}
                            {isFinale && <div className="lo-ob-finale-ring r2" />}
                            {isFinale && <div className="lo-ob-beam" />}
                            {/* On the finale, the mark carries layoutId="lior-mark" so it
                                morphs into the Act II header mark on the hand-off. Its
                                enlarged size is a CSS modifier (not an inline scale) so the
                                FLIP interpolates size cleanly without a transform clash. */}
                            {isFinale ? (
                                // borderRadius in inline style (not just the CSS class) so
                                // Framer scrapes it as a projection value and counter-scales
                                // the squircle corners through the FLIP into the header mark.
                                <motion.div className="lo-ob-icon is-finale" layoutId="lior-mark" style={{ borderRadius: 32 }}>
                                    <img src="/icon-128.png" alt="Lior" />
                                </motion.div>
                            ) : (
                                <div className="lo-ob-icon">
                                    <img src="/icon-128.png" alt="Lior" />
                                </div>
                            )}
                            {isIconMode && <div className="lo-ob-name">Lior</div>}
                        </motion.div>
                    )}

                    {/* Phone — only the dev slides; the constant key persists it across
                        them. devwrap owns the layout box; devdrift runs the continuous
                        gentle float on its own node so CSS never fights Framer. */}
                    {isDev && (
                        <div className="lo-ob-devwrap">
                        <div className="lo-ob-devdrift">
                        <motion.div
                            key="phone"
                            className="lo-ob-dev"
                            initial={{ opacity: 0, y: 24, scale: 0.94 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        >
                            <div className="lo-ob-devscr">
                                <div className="lo-ob-devisland" />
                                <div className="lo-ob-devstat"><span>9:41</span><StatusIcons color="#8a4436" h={7.5} /></div>
                                <div className="lo-ob-devbody-wrap">
                                    <AnimatePresence custom={dir}>
                                        <motion.div
                                            className="lo-ob-devbody"
                                            key={`devbody-${step}`}
                                            custom={dir}
                                            variants={SCREEN_VARIANTS}
                                            initial="enter"
                                            animate="center"
                                            exit="exit"
                                            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                                        >
                                            {devContentFor(step)}
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                                <canvas ref={devCanvasRef} className="lo-ob-devcons" width={144} height={318} aria-hidden />
                            </div>
                        </motion.div>
                        </div>
                        </div>
                    )}

                    {isDev && <div className="lo-ob-mist" />}

                    <div className="lo-ob-cards">
                        <AnimatePresence>
                            {feelSlide.cards.map((c, i) => {
                                // Smooth tiered eruption: cards rise out of the phone and settle
                                // gently into place, foreground first — calm, well-damped springs
                                // (no spin, no overshoot), a layered reveal rather than an explosion.
                                const spring = i === 0
                                    ? { type: 'spring' as const, stiffness: 360, damping: 32, mass: 0.8 }
                                    : i === 1
                                        ? { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.9 }
                                        : { type: 'spring' as const, stiffness: 210, damping: 29, mass: 1.05 };
                                return (
                                    <motion.div
                                        key={`${step}-${c.id}`}
                                        className="lo-ob-card"
                                        style={{ left: c.x, top: c.y, width: c.w }}
                                        initial={{ x: PHX - (c.x + c.w / 2), y: PHY - (c.y + 22), scale: 0.34, opacity: 0, rotate: 0 }}
                                        animate={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: c.r }}
                                        exit={{ x: PHX - (c.x + c.w / 2), y: PHY - (c.y + 22), scale: 0.3, opacity: 0, rotate: 0, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] } }}
                                        transition={{ delay: 0.16 + i * 0.1, ...spring }}
                                    >
                                        <div className="lo-ob-cfloat" style={{ ['--d' as string]: `${c.d}s` } as React.CSSProperties}>
                                            {c.content}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
            </AnimatePresence>

            {/* ── Act II: setup steps (centered glass forms) ──────────────────
                One stage, one AnimatePresence. Each step is a card that slides in
                the travel direction while its fields cascade upward (FIELD_VARIANTS
                stagger); the outgoing step slides the opposite way and dissolves,
                so consecutive steps read as one continuous "page turn". The shared
                grid cell keeps both stacked + centred during the brief overlap.
                The header mark persists across all Act II steps and carries
                layoutId="lior-mark", so the Act I finale mark MORPHS down into it on
                the hand-off and it stays as the quiet brand anchor through setup. */}
            <div className="lo-ob-formstage">
                {!isFeel && (
                    <motion.div
                        className="lo-ob-headmark"
                        layoutId="lior-mark"
                        aria-hidden
                        style={{ borderRadius: 17 }}
                        transition={{ layout: { type: 'spring', bounce: 0, duration: 0.62 } }}
                    >
                        <img src="/icon-128.png" alt="" />
                    </motion.div>
                )}
                <div className="lo-ob-forms-grid">
                <AnimatePresence custom={dir}>
                    {step === 'myName' && (
                        <motion.div className="lo-ob-form" key="myName" variants={FORM_VARIANTS} custom={dir} initial="enter" animate="center" exit="exit">
                            <motion.p className="lo-ob-eyebrow" variants={FIELD_VARIANTS}>Step 1 of 4</motion.p>
                            <motion.div className="lo-ob-namebig" variants={FIELD_VARIANTS}>{myName ? myName : <span className="ph">your name</span>}</motion.div>
                            <motion.h2 className="lo-ob-formh" variants={FIELD_VARIANTS}>What should we call you?</motion.h2>
                            <motion.p className="lo-ob-forms" variants={FIELD_VARIANTS}>How you’ll appear in your shared space.</motion.p>
                            <motion.input
                                ref={nameRef}
                                variants={FIELD_VARIANTS}
                                className="lo-ob-input"
                                value={myName}
                                onChange={(e) => setMyName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && myName.trim()) advance('partnerName'); }}
                                autoCapitalize="words" autoCorrect="off" autoComplete="off" spellCheck={false}
                                maxLength={32} placeholder="Type your name…"
                            />
                        </motion.div>
                    )}

                    {step === 'partnerName' && (
                        <motion.div className="lo-ob-form" key="partnerName" variants={FORM_VARIANTS} custom={dir} initial="enter" animate="center" exit="exit">
                            <motion.p className="lo-ob-eyebrow" variants={FIELD_VARIANTS}>Step 2 of 4</motion.p>
                            <motion.div className="lo-ob-namebig" variants={FIELD_VARIANTS}>{partnerName ? partnerName : <span className="ph">their name</span>}</motion.div>
                            <motion.h2 className="lo-ob-formh" variants={FIELD_VARIANTS}>And who is this world for?</motion.h2>
                            <motion.p className="lo-ob-forms" variants={FIELD_VARIANTS}>The other half of your story.</motion.p>
                            <motion.input
                                ref={partnerRef}
                                variants={FIELD_VARIANTS}
                                className="lo-ob-input"
                                value={partnerName}
                                onChange={(e) => setPartnerName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && partnerName.trim()) advance('anniversary'); }}
                                autoCapitalize="words" autoCorrect="off" autoComplete="off" spellCheck={false}
                                maxLength={32} placeholder="Type their name…"
                            />
                        </motion.div>
                    )}

                    {step === 'anniversary' && (
                        <motion.div className="lo-ob-form" key="anniversary" variants={FORM_VARIANTS} custom={dir} initial="enter" animate="center" exit="exit">
                            <motion.p className="lo-ob-eyebrow" variants={FIELD_VARIANTS}>Step 3 of 4</motion.p>
                            <motion.h2 className="lo-ob-formh" variants={FIELD_VARIANTS}>When did your story begin?</motion.h2>
                            <motion.p className="lo-ob-forms" variants={FIELD_VARIANTS}>The day everything changed.</motion.p>
                            <motion.div className="lo-ob-input" variants={FIELD_VARIANTS} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                                <Calendar size={20} style={{ color: '#e8657a', flexShrink: 0 }} />
                                <input
                                    type="date" value={anniversary} max={todayInputValue()}
                                    onChange={(e) => setAnniversary(e.target.value)}
                                    style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 16, fontWeight: 600, color: anniversary ? '#2a211d' : '#94897e', width: '100%', cursor: 'pointer' }}
                                />
                            </motion.div>
                            {anniversary && daysApart > 0 && (
                                <div className="lo-ob-days">{daysDisplay.toLocaleString()}<small>days together — and counting</small></div>
                            )}
                        </motion.div>
                    )}

                    {step === 'first-question' && (
                        <motion.div className="lo-ob-form" key="first-question" variants={FORM_VARIANTS} custom={dir} initial="enter" animate="center" exit="exit">
                            <motion.p className="lo-ob-eyebrow" variants={FIELD_VARIANTS}>Step 4 of 4</motion.p>
                            <motion.div className="lo-ob-qcard" variants={FIELD_VARIANTS}>
                                <p className="lo-ob-qlabel">Today’s question</p>
                                <p className="lo-ob-qtext">“{firstQuestion}”</p>
                            </motion.div>
                            <motion.textarea
                                ref={answerRef}
                                variants={FIELD_VARIANTS}
                                className="lo-ob-ta"
                                value={firstAnswer}
                                onChange={(e) => { setFirstAnswer(e.target.value); if (e.target.value.length > 0) void Haptics.select(); }}
                                placeholder="Write your answer…"
                                rows={3} maxLength={300}
                                autoCapitalize="sentences" autoCorrect="on" spellCheck
                            />
                            <motion.p className="lo-ob-seal" variants={FIELD_VARIANTS}><Lock size={14} /> Sealed until {partnerFirst || 'your partner'} answers too.</motion.p>
                        </motion.div>
                    )}

                    {step === 'notify' && (
                        <motion.div className="lo-ob-form" key="notify" variants={FORM_VARIANTS} custom={dir} initial="enter" animate="center" exit="exit">
                            <motion.p className="lo-ob-eyebrow" variants={FIELD_VARIANTS}>Almost there</motion.p>
                            <motion.div className="lo-ob-qcard" variants={FIELD_VARIANTS} style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
                                <div className="lo-ob-qr" style={{ width: 54, height: 54 }}><Bell size={26} /></div>
                                <p className="lo-ob-qtext" style={{ fontSize: 17, fontStyle: 'normal' }}>Your answer is sealed.</p>
                            </motion.div>
                            <motion.h2 className="lo-ob-formh" variants={FIELD_VARIANTS}>Know the moment {partnerFirst || 'they'} {partnerFirst ? 'answers' : 'answer'}.</motion.h2>
                            <motion.p className="lo-ob-forms" variants={FIELD_VARIANTS}>One gentle nudge when something is waiting for you. Never noise.</motion.p>
                        </motion.div>
                    )}

                    {step === 'done' && (
                        <motion.div className="lo-ob-form" key="done" variants={FORM_VARIANTS} custom={dir} initial="enter" animate="center" exit="exit">
                            {/* The Lior mark is the persistent header mark above the stage
                                (it morphed in from Act I) — no separate icon here. */}
                            <motion.p className="lo-ob-eyebrow" variants={FIELD_VARIANTS}>{firstName ? 'Welcome,' : 'Welcome'}</motion.p>
                            <motion.h2 className="lo-ob-formh" variants={FIELD_VARIANTS} style={{ fontSize: firstName.length > 10 ? '30px' : '38px', marginBottom: 18 }}>{firstName || 'You’re all set'}</motion.h2>
                            <motion.div className="lo-ob-invite" variants={FIELD_VARIANTS}>
                                <div className="lo-ob-qr"><QrCode size={40} /></div>
                                <div style={{ textAlign: 'left' }}>
                                    <p className="lo-ob-qlabel">One last step</p>
                                    <p className="lo-ob-seal" style={{ justifyContent: 'flex-start', margin: '6px 0 0' }}><Share2 size={13} /> Tap “{partnerFirst ? `Invite ${partnerFirst}` : 'Invite your partner'}” to get your real code.</p>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
                </div>
            </div>

            {/* ── Bottom panel: copy (Act I) + progress + CTA ─────────────── */}
            <div className="lo-ob-panel">
                {isFeel && feelSlide && (
                    <div className="lo-ob-copy-wrap">
                        <AnimatePresence custom={dir}>
                            <motion.div
                                className="lo-ob-copy"
                                key={`copy-${step}`}
                                custom={dir}
                                variants={COPY_VARIANTS}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <motion.h1 className="lo-ob-h" variants={HEADLINE_VARIANTS}>
                                    {feelSlide.h.split('\n').map((line, i) => (
                                        <span className="lo-ob-h-line" key={i}>
                                            <motion.span className="lo-ob-h-inner" variants={LINE_VARIANTS}>{line}</motion.span>
                                        </span>
                                    ))}
                                </motion.h1>
                                <motion.p className="lo-ob-s" variants={SUB_VARIANTS}>{feelSlide.s}</motion.p>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                )}

                {isFeel && (
                    <div className="lo-ob-prog" role="progressbar" aria-valuemin={1} aria-valuemax={FEEL_KEYS.length} aria-valuenow={feelIndex + 1} aria-label={`Step ${feelIndex + 1} of ${FEEL_KEYS.length}`}>
                        {FEEL_KEYS.map((k, i) => {
                            const cls = i === feelIndex ? 'now' : i > feelIndex ? 'next' : '';
                            return <span key={k} className={`lo-ob-bead${cls ? ' ' + cls : ''}`} aria-hidden />;
                        })}
                    </div>
                )}

                <button className="lo-ob-cta" disabled={cta.disabled} onClick={cta.onClick}>
                    <span className="lo-ob-cta-inner">
                        <span>{cta.label}</span>
                        <span className="lo-ob-cta-arrow" aria-hidden><ArrowRight size={15} strokeWidth={2.4} /></span>
                    </span>
                </button>

                {isFeel && (
                    <button className="lo-ob-skip" onClick={() => advance('myName')}>Skip intro</button>
                )}
                {step === 'partnerName' && (
                    <button className="lo-ob-skip" onClick={() => advance('anniversary')}>Skip for now</button>
                )}
                {step === 'anniversary' && (
                    <button className="lo-ob-skip" onClick={() => enterFirstQuestion()}>Skip for now</button>
                )}
                {step === 'first-question' && (
                    <button className="lo-ob-skip" onClick={() => { setFirstAnswer(''); advance('done'); }}>Skip for now</button>
                )}
                {step === 'notify' && (
                    <button className="lo-ob-skip" onClick={() => advance('done')}>Not now</button>
                )}
                {step === 'done' && (
                    <button className="lo-ob-skip" onClick={() => void handleComplete()}>I’ll do it later</button>
                )}
            </div>
        </div>
        </div>
        </LayoutGroup>
        </MotionConfig>
    );
};
