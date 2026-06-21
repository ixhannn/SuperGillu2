import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronRight, Calendar, Sparkles, MessageCircle, Lock, QrCode,
    Image as ImageIcon, Activity, Plus, Share2, Star,
} from 'lucide-react';
import { StorageService } from '../services/storage';
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
    | 'myName' | 'anniversary' | 'first-question' | 'done';

const FEEL_KEYS: Step[] = ['feel1', 'feel2', 'feel3', 'feel4', 'feel5', 'feel6'];

// Full step order — used to derive travel direction (forward vs back) so every
// layer animates in the same coordinated direction for a continuous feel.
const STEP_ORDER: Step[] = ['feel1', 'feel2', 'feel3', 'feel4', 'feel5', 'feel6', 'myName', 'anniversary', 'first-question', 'done'];

// Directional, depth-layered transition variants. `custom` carries the travel
// direction (+1 forward / -1 back). The headline copy travels furthest
// (foreground), the phone's screen content a little less (mid-ground) — together
// they read as one camera move from slide to slide.
const COPY_VARIANTS = {
    enter: (d: number) => ({ opacity: 0, x: d * 44 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -44 }),
};
const SCREEN_VARIANTS = {
    enter: (d: number) => ({ opacity: 0, x: d * 28 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -28 }),
};

const PHX = 147;   // phone centre x within the 294-wide composition column
const PHY = 190;   // phone centre y — memory cards erupt from here

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

interface ToneChip { icon: React.ReactNode; label: string; x: number; y: number; w: number; }

interface FeelSlide {
    key: Step;
    h: string;
    s: string;
    cta: string;
    sky: string;
    sun: number;
    glow: number;
    cons: number;
    mode: 'icon' | 'dev' | 'showcase' | 'finale';
    cards: CardDef[];
    tones?: ToneChip[];   // showcase mode — facet chips radiating from the icon
}

const ACT1: FeelSlide[] = [
    {
        key: 'feel1',
        h: 'A place that’s\nonly yours.',
        s: 'Every relationship deserves a world of its own.',
        cta: 'Start our story',
        sky: 'linear-gradient(180deg,#ffaf4d,#ffc873 20%,#ffe2ad 38%,#fffaf4 62%)',
        sun: 1, glow: 1, cons: 0, mode: 'icon', cards: [],
    },
    {
        key: 'feel2',
        h: 'Moments move\nfaster than\nwe can hold them.',
        s: 'The ordinary days are the ones we miss most.',
        cta: 'Continue',
        sky: 'linear-gradient(180deg,#ff9a5e,#ffbe83 22%,#ffdcb8 40%,#fffaf5 62%)',
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
        sky: 'linear-gradient(180deg,#ff8f7e,#ffb693 24%,#ffd9c4 42%,#fffaf6 62%)',
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
        sky: 'linear-gradient(180deg,#ff7d92,#ffaa8f 26%,#ffd2c2 44%,#fffaf6 62%)',
        sun: 0.6, glow: 0.55, cons: 0.72, mode: 'dev',
        cards: [
            { id: 'sync', content: dotsCard('in sync'), x: 28, y: 58, w: 122, r: -5, d: 7 },
            { id: 'song', content: memCard('linear-gradient(135deg,#ffc0d4,#c79bff)', 'our song', 'on repeat'), x: 172, y: 120, w: 114, r: 5, d: 8 },
            { id: 'rhythm', content: chipCard(<Activity size={15} style={{ color: '#e8657a' }} />, 'one rhythm'), x: 184, y: 176, w: 104, r: 4, d: 6.6 },
            { id: 'mem', content: chipCard(<Plus size={15} style={{ color: '#c4683a' }} />, '+1 memory'), x: 178, y: 232, w: 108, r: 6, d: 7.2 },
        ],
    },
    {
        key: 'feel5',
        h: 'Everything you share,\nin one place.',
        s: 'Memories, milestones, and the little things in between.',
        cta: 'Continue',
        sky: 'linear-gradient(180deg,#ff8763,#ffb07e 22%,#ffd4a6 42%,#fff6ec 64%)',
        sun: 0.85, glow: 0.78, cons: 0.55, mode: 'showcase', cards: [],
        tones: [
            { icon: <ImageIcon size={14} style={{ color: '#c4683a' }} />, label: 'Memories', x: 10, y: 100, w: 108 },
            { icon: <Star size={14} style={{ color: '#c4683a' }} />, label: 'Milestones', x: 176, y: 100, w: 108 },
            { icon: <MessageCircle size={14} style={{ color: '#c4683a' }} />, label: 'Little notes', x: 2, y: 202, w: 116 },
            { icon: <Sparkles size={14} style={{ color: '#e8657a' }} />, label: 'Quiet moments', x: 166, y: 202, w: 124 },
        ],
    },
    {
        key: 'feel6',
        h: 'This is where\nyour story lives.',
        s: 'Welcome to Lior.',
        cta: 'Begin',
        sky: 'linear-gradient(180deg,#ff8a63,#ffb27e 22%,#ffd6a8 42%,#fff6ec 64%)',
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
        case 'feel6':
            return (
                <>
                    <div className="dh">Your story</div>
                    <div className="dcons" />
                    <div className="dlabel">1,284 days together</div>
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
    sky: 'linear-gradient(180deg,#ff9a6a,#ffc28e 24%,#ffe0be 44%,#fffaf4 64%)',
    sun: 0.7, glow: 0.55, cons: 0.55,
};
const DONE_SCENE = {
    sky: 'linear-gradient(180deg,#ff8a63,#ffb27e 22%,#ffd6a8 42%,#fff6ec 64%)',
    sun: 0.95, glow: 0.9, cons: 1,
};

// ─── Main component ───────────────────────────────────────────────────────────

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onPairNow }) => {
    const [step, setStep] = useState<Step>('feel1');
    const [myName, setMyName] = useState('');
    const [anniversary, setAnniversary] = useState('');
    const [firstAnswer, setFirstAnswer] = useState('');
    const [firstQuestion, setFirstQuestion] = useState('');
    const nameRef = useRef<HTMLInputElement>(null);
    const answerRef = useRef<HTMLTextAreaElement>(null);

    const skyRef = useRef<HTMLCanvasElement>(null);
    const devCanvasRef = useRef<HTMLCanvasElement>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const intensityTargetRef = useRef(0.15);
    const panRef = useRef(0);          // transient background pan, kicked on each advance
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
    const isShowcase = feelSlide?.mode === 'showcase';
    const isFinale = feelSlide?.mode === 'finale';
    const isDev = feelSlide?.mode === 'dev';

    const scene = useMemo(() => {
        if (feelSlide) return { sky: feelSlide.sky, sun: feelSlide.sun, glow: feelSlide.glow, cons: feelSlide.cons };
        if (step === 'done') return DONE_SCENE;
        return ACT2_SCENE;
    }, [feelSlide, step]);

    useEffect(() => {
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
        // The "Building it" slide is where the two lights converge — an intimate
        // lub-dub instead of the usual light tick.
        if (next === 'feel4') void Haptics.heartbeat();
        else void Haptics.tap();
        const d = STEP_ORDER.indexOf(next) >= STEP_ORDER.indexOf(step) ? 1 : -1;
        setDir(d);
        panRef.current = -d * 22; // background drifts opposite to travel — parallax depth
        setStep(next);
    };

    // ── Persistence (ORDER IS LOAD-BEARING — unchanged) ──────────────────────
    //   1. saveCoupleProfile writes myName + anniversary. submitQuestionAnswer
    //      keys the answer by profile.myName, so the name MUST persist first.
    //   2. If a first answer was entered: getTodayQuestion(myName,'') to ensure
    //      today's QuestionEntry exists, THEN submitQuestionAnswer(answer).
    //   3. markOnboardingComplete last.
    const finalizeOnboarding = () => {
        const profile = StorageService.getCoupleProfile();
        const trimmedName = myName.trim();

        StorageService.saveCoupleProfile({
            ...profile,
            myName: trimmedName,
            anniversaryDate: anniversary
                ? dateInputValueToStoredDate(anniversary)
                : profile.anniversaryDate,
        });

        const trimmedAnswer = firstAnswer.trim();
        if (trimmedAnswer) {
            StorageService.getTodayQuestion(trimmedName, '');
            StorageService.submitQuestionAnswer(trimmedAnswer);
        }

        StorageService.markOnboardingComplete();
    };

    // Resolve today's ritual question only when reaching that step, so the text
    // matches exactly what getTodayQuestion will key the answer to at finalize.
    const enterFirstQuestion = () => {
        if (!firstQuestion) {
            const entry = StorageService.getTodayQuestion(myName.trim(), '');
            setFirstQuestion(entry.question);
        }
        advance('first-question');
    };

    const handleComplete = async () => {
        await Haptics.celebrate();
        finalizeOnboarding();
        setTimeout(() => onComplete(myName.trim(), ''), 240);
    };

    const handlePairNow = async () => {
        await Haptics.heartbeat();
        finalizeOnboarding();
        if (onPairNow) onPairNow(myName.trim(), '');
        else onComplete(myName.trim(), '');
    };

    useEffect(() => {
        if (step === 'myName') setTimeout(() => nameRef.current?.focus(), 420);
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

        let raf = 0, t = 0, intensity = 0.15;

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
            if (intensity > 0.04) {
                const pts = cstars.map(c => [c[0] * W + panRef.current, c[1] * H]);
                ctx.globalCompositeOperation = 'source-over';
                ctx.lineWidth = .7;
                for (let m = 0; m < pts.length; m++) {
                    for (let n = m + 1; n < pts.length; n++) {
                        const d = Math.hypot(pts[m][0] - pts[n][0], pts[m][1] - pts[n][1]);
                        if (d < 150) {
                            ctx.strokeStyle = `rgba(232,110,90,${(intensity * .4 * (1 - d / 150)).toFixed(3)})`;
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
            panRef.current += (0 - panRef.current) * 0.08; // ease the pan kick back to rest
            drawSky(); drawDev();
            raf = requestAnimationFrame(loop);
        };

        if (reduce) { intensity = intensityTargetRef.current; drawSky(); drawDev(); }
        else raf = requestAnimationFrame(loop);

        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', sizeSky); };
    }, []);

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
        if (step === 'myName') return { label: 'Continue', disabled: !myName.trim(), onClick: () => myName.trim() && advance('anniversary') };
        if (step === 'anniversary') return { label: 'Continue', onClick: () => enterFirstQuestion() };
        if (step === 'first-question') return { label: 'Save · continue', disabled: !firstAnswer.trim(), onClick: () => firstAnswer.trim() && advance('done') };
        return { label: 'Invite your partner', onClick: () => void handlePairNow() };
    };
    const cta = ctaForStep();

    return (
        <div className="lo-ob-shell" ref={shellRef}>
        <div className="lo-ob" style={{ background: scene.sky, color: '#2a211d' }}>
            <div className="lo-ob-glow" style={{ opacity: scene.glow }} />
            <div className="lo-ob-sun" style={{ opacity: scene.sun }} />
            <div className="lo-ob-rays" style={{ opacity: scene.sun * 0.85 }} />

            <div className="lo-ob-scene">
                <canvas ref={skyRef} className="lo-ob-sky" aria-hidden />
                <div className="lo-ob-cloud" />
                <div className="lo-ob-fade" />
            </div>

            {/* ── Act I: the phone-in-clouds hero ─────────────────────────── */}
            {isFeel && feelSlide && (
                <div className="lo-ob-comp">
                    {/* Mark — icon (slide 1), showcase (slide 5), finale (welcome).
                        CONDITIONALLY MOUNTED (not opacity-toggled) so the logo can
                        never linger or pop onto the phone slides. */}
                    {(isIconMode || isShowcase || isFinale) && (
                        <motion.div
                            key={`mark-${step}`}
                            className="lo-ob-markwrap"
                            initial={{ opacity: 0, scale: 0.94 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        >
                            {isFinale && <div className="lo-ob-finale-bloom" />}
                            {isFinale && <div className="lo-ob-finale-ring" />}
                            {isFinale && <div className="lo-ob-finale-ring r2" />}
                            {(isShowcase || isFinale) && <div className="lo-ob-beam" />}
                            <div
                                className="lo-ob-icon"
                                style={{ transform: isFinale ? 'scale(1.24)' : isShowcase ? 'scale(1.08)' : 'scale(1)' }}
                            >
                                <img src="/icon-128.png" alt="Lior" />
                            </div>
                            {isIconMode && <div className="lo-ob-name">Lior</div>}
                            {isShowcase && feelSlide.tones && (
                                <div className="lo-ob-tones">
                                    {feelSlide.tones.map((tn, i) => (
                                        <motion.div
                                            key={`${step}-tone-${i}`}
                                            className="lo-ob-tone"
                                            style={{ left: tn.x, top: tn.y, width: tn.w }}
                                            initial={{ opacity: 0, scale: 0.7, x: (PHX - (tn.x + tn.w / 2)) * 0.5, y: (160 - tn.y) * 0.5 }}
                                            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                                            transition={{ delay: 0.18 + i * 0.1, type: 'spring', damping: 24, stiffness: 240 }}
                                        >
                                            {tn.icon}<span>{tn.label}</span>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Phone — only the dev slides; the constant key persists it across them. */}
                    {isDev && (
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
                    )}

                    {isDev && <div className="lo-ob-mist" />}

                    <div className="lo-ob-cards">
                        <AnimatePresence>
                            {feelSlide.cards.map((c, i) => {
                                // Tiered springs: foreground cards snap in first (snappier),
                                // deeper layers settle gently — a layered "eruption", not a flat stagger.
                                const spring = i === 0
                                    ? { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.8 }
                                    : i === 1
                                        ? { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.9 }
                                        : { type: 'spring' as const, stiffness: 200, damping: 28, mass: 1.1 };
                                return (
                                    <motion.div
                                        key={`${step}-${c.id}`}
                                        className="lo-ob-card"
                                        style={{ left: c.x, top: c.y, width: c.w }}
                                        initial={{ x: PHX - (c.x + c.w / 2), y: PHY - (c.y + 22), scale: 0.32, opacity: 0, rotate: 0 }}
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
                </div>
            )}

            {/* ── Act II: setup steps (centered glass forms) ──────────────── */}
            {step === 'myName' && (
                <motion.div className="lo-ob-form" key="myName" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                    <p className="lo-ob-eyebrow">Step 1 of 3</p>
                    <div className="lo-ob-namebig">{myName ? myName : <span className="ph">your name</span>}</div>
                    <h2 className="lo-ob-formh">What should we call you?</h2>
                    <p className="lo-ob-forms">How you’ll appear in your shared space.</p>
                    <input
                        ref={nameRef}
                        className="lo-ob-input"
                        value={myName}
                        onChange={(e) => setMyName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && myName.trim()) advance('anniversary'); }}
                        autoCapitalize="words" autoCorrect="off" autoComplete="off" spellCheck={false}
                        maxLength={32} placeholder="Type your name…"
                    />
                </motion.div>
            )}

            {step === 'anniversary' && (
                <motion.div className="lo-ob-form" key="anniversary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                    <p className="lo-ob-eyebrow">Step 2 of 3</p>
                    <h2 className="lo-ob-formh">When did your story begin?</h2>
                    <p className="lo-ob-forms">The day everything changed.</p>
                    <div className="lo-ob-input" style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                        <Calendar size={20} style={{ color: '#e8657a', flexShrink: 0 }} />
                        <input
                            type="date" value={anniversary} max={todayInputValue()}
                            onChange={(e) => setAnniversary(e.target.value)}
                            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 16, fontWeight: 600, color: anniversary ? '#2a211d' : '#94897e', width: '100%', cursor: 'pointer' }}
                        />
                    </div>
                    {anniversary && daysApart > 0 && (
                        <div className="lo-ob-days">{daysDisplay.toLocaleString()}<small>days together — and counting</small></div>
                    )}
                </motion.div>
            )}

            {step === 'first-question' && (
                <motion.div className="lo-ob-form" key="first-question" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                    <p className="lo-ob-eyebrow">Step 3 of 3</p>
                    <div className="lo-ob-qcard">
                        <p className="lo-ob-qlabel">Today’s question</p>
                        <p className="lo-ob-qtext">“{firstQuestion}”</p>
                    </div>
                    <textarea
                        ref={answerRef}
                        className="lo-ob-ta"
                        value={firstAnswer}
                        onChange={(e) => { setFirstAnswer(e.target.value); if (e.target.value.length > 0) void Haptics.select(); }}
                        placeholder="Write your answer…"
                        rows={3} maxLength={300}
                        autoCapitalize="sentences" autoCorrect="on" spellCheck
                    />
                    <p className="lo-ob-seal"><Lock size={14} /> Sealed until your partner answers too.</p>
                </motion.div>
            )}

            {step === 'done' && (
                <motion.div className="lo-ob-form" key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                    <div className="lo-ob-icon" style={{ position: 'relative', left: 'auto', top: 'auto', margin: '0 auto 20px' }}>
                        <img src="/icon-128.png" alt="Lior" />
                    </div>
                    <p className="lo-ob-eyebrow">Welcome</p>
                    <h2 className="lo-ob-formh" style={{ fontSize: myName.length > 10 ? '30px' : '36px', marginBottom: 18 }}>{myName || 'You’re all set'}</h2>
                    <div className="lo-ob-invite">
                        <div className="lo-ob-qr"><QrCode size={40} /></div>
                        <div style={{ textAlign: 'left' }}>
                            <p className="lo-ob-qlabel">Their invite</p>
                            <div className="lo-ob-code">L·9K·4Q</div>
                            <p className="lo-ob-seal" style={{ justifyContent: 'flex-start', margin: '6px 0 0' }}><Share2 size={13} /> Show the code or share a link.</p>
                        </div>
                    </div>
                </motion.div>
            )}

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
                                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <h1 className="lo-ob-h">{feelSlide.h}</h1>
                                <p className="lo-ob-s">{feelSlide.s}</p>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                )}

                {isFeel && (
                    <div className="lo-ob-prog">
                        {FEEL_KEYS.map((k, i) => (
                            <div key={k} className={`lo-ob-tk${i === feelIndex ? ' on' : ''}`} />
                        ))}
                    </div>
                )}

                <button className="lo-ob-cta" disabled={cta.disabled} onClick={cta.onClick}>
                    <span>{cta.label}</span>
                    <span className="lo-ob-chevrons" aria-hidden>
                        <ChevronRight size={16} strokeWidth={2.6} />
                        <ChevronRight size={16} strokeWidth={2.6} />
                        <ChevronRight size={16} strokeWidth={2.6} />
                    </span>
                </button>

                {isFeel && (
                    <button className="lo-ob-skip" onClick={() => advance('myName')}>Skip intro</button>
                )}
                {step === 'anniversary' && (
                    <button className="lo-ob-skip" onClick={() => enterFirstQuestion()}>Skip for now</button>
                )}
                {step === 'first-question' && (
                    <button className="lo-ob-skip" onClick={() => { setFirstAnswer(''); advance('done'); }}>Skip for now</button>
                )}
                {step === 'done' && (
                    <button className="lo-ob-skip" onClick={() => void handleComplete()}>I’ll do it later</button>
                )}
            </div>
        </div>
        </div>
    );
};
