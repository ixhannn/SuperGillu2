import React, { useEffect, useId, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    BookOpen,
    Cake,
    Calendar as CalendarIcon,
    Camera,
    Coffee,
    Eye,
    EyeOff,
    Feather,
    Flower2,
    Gift,
    Heart,
    Loader2,
    Lock,
    Mail,
    MapPin,
    MessageCircle,
    Moon,
    Music,
    PenLine,
    Sparkles,
    Star,
    X,
} from 'lucide-react';
import { SupabaseService } from '../services/supabase';
import { feedback } from '../utils/feedback';

// ══════════════════════════════════════════════════════════════════════
// Supabase auth helpers — unchanged from the previous design. The visual
// shell is what's being redesigned; the auth logic is preserved verbatim.
// ══════════════════════════════════════════════════════════════════════
const getSupabaseAuthConfig = () => {
    // Credentials are POSTed to this URL, so it must come from the validated
    // config path (env var, or a localStorage value verified to be a real
    // *.supabase.co host) — never from a raw localStorage read.
    const { url, anonKey: key } = SupabaseService.getProjectConfig();
    return { url, key, isConfigured: Boolean(url && key) };
};

// Email redirect target used by every auth flow that sends the user a
// link (signup confirmation, password reset). On native we deep-link
// back into the app via the custom URL scheme; on web we return to the
// page origin. Both targets must be on Supabase's redirect allow-list.
const getEmailRedirectTo = (): string => {
    const isNative = typeof window !== 'undefined'
        && Boolean((window as any).Capacitor?.isNativePlatform?.());
    return isNative
        ? 'com.lior.app://auth/callback'
        : window.location.origin;
};

async function authProxy(type: 'login' | 'signup' | 'reset' | 'resend', email: string, password?: string) {
    const { url, key, isConfigured } = getSupabaseAuthConfig();
    if (!isConfigured) {
        return { error: 'Cloud sync is not configured yet. Add your Supabase URL and anon key first.', status: 0 };
    }
    try {
        const res = await fetch(`${url}/functions/v1/auth-proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': key,
                'Authorization': `Bearer ${key}`,
            },
            body: JSON.stringify({
                type,
                email,
                password,
                // Pass the redirect target so the edge function can forward
                // it to Supabase auth APIs. The function may ignore this
                // field; in that case Supabase falls back to the Site URL
                // configured in the project's Auth settings.
                redirectTo: getEmailRedirectTo(),
            }),
        });
        let body: any = {};
        try { body = await res.json(); }
        catch { return { error: 'Auth gateway unavailable.', status: res.status, proxyUnavailable: true }; }
        return { ...body, status: res.status };
    } catch {
        return { error: 'Auth gateway unavailable.', status: 0, proxyUnavailable: true };
    }
}

async function directAuthFallback(type: 'login' | 'signup' | 'reset' | 'resend', email: string, password?: string) {
    const sb = SupabaseService.client;
    if (!sb) return { error: 'Supabase client is not configured.' };
    const emailRedirectTo = getEmailRedirectTo();
    if (type === 'login') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: password ?? '' });
        return error ? { error: error.message } : { data };
    }
    if (type === 'signup') {
        const { data, error } = await sb.auth.signUp({
            email,
            password: password ?? '',
            options: { emailRedirectTo },
        });
        return error ? { error: error.message } : { data };
    }
    if (type === 'resend') {
        const { error } = await sb.auth.resend({
            type: 'signup',
            email,
            options: { emailRedirectTo },
        });
        return error ? { error: error.message } : { data: {} };
    }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: emailRedirectTo });
    return error ? { error: error.message } : { data: {} };
}

// Map a direct-Supabase fallback result to a proxy-shaped HTTP status so the
// 429 cooldown branch still fires when the auth proxy is unavailable. The
// direct path has no status of its own; Supabase surfaces rate limits in the
// error message ("...you can only request this after N seconds"), so we detect
// that and report 429. retry_after_seconds is absent on the fallback, but the
// existing `?? 600` default at each call site covers the cooldown duration.
function statusFromFallback(r: { error?: string; data?: unknown }): number {
    const msg = (r.error ?? '').toLowerCase();
    if (/only request this after|rate limit|too many|after \d+\s*seconds?/.test(msg)) return 429;
    return r.error ? 400 : 200;
}

interface AuthProps {
    onLogin: () => void;
    onPrivacyPolicy?: () => void;
    onTerms?: () => void;
}

// ══════════════════════════════════════════════════════════════════════
// Visual palette — deep rose/burgundy night sky with pink/violet glows.
// Inherits the app's brand colours but reads as a theatrical, immersive
// entry scene (think: the reverse of the rest of the app).
// ══════════════════════════════════════════════════════════════════════
const palette = {
    // Deep wine / burgundy night-sky — warmer, more romantic. The cream
    // phone bezel + bolder pen-stroke doodles give it the depth we need
    // without leaning fully purple.
    bg0: '#150410',
    bg1: '#240a1c',
    bg2: '#3a0d2a',
    accentPink:   '#f472b6',
    accentRose:   '#ec4899',
    accentViolet: '#a855f7',
    textHi:  'rgba(255,255,255,0.95)',
    textMid: 'rgba(255,255,255,0.72)',
    textLo:  'rgba(255,255,255,0.48)',
    textXLo: 'rgba(255,255,255,0.32)',
} as const;

// ══════════════════════════════════════════════════════════════════════
// Decoration — hand-drawn-style icons scattered behind the phone mockup.
// Each item has a position, rotation, size and the icon component.
// ══════════════════════════════════════════════════════════════════════
interface DecorationItem {
    Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }>;
    top: string;
    left?: string;
    right?: string;
    size: number;
    rotate: number;
    opacity: number;
}

// ── Custom hand-drawn doodle SVGs ─────────────────────────────────────
// Each one is a unique couple-memory illustration drawn in the same
// chunky pen-line style as the reference's productivity doodles.

const DoodlePolaroid: React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }> = ({ size = 24, strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
        <rect x="4" y="3" width="16" height="18" rx="1.4" />
        <rect x="6" y="5" width="12" height="11" rx="0.6" />
        <circle cx="9" cy="9" r="1.2" />
        <path d="M7 14 L10.5 11 L14 13 L17 10" />
    </svg>
);

const DoodleWineGlasses: React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }> = ({ size = 24, strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
        {/* Left glass */}
        <path d="M5 4 L8.5 4 L8 9 a2.25 2.25 0 0 1 -3 0 z" />
        <path d="M6.5 9.5 L6.5 17" />
        <path d="M5 17 L8 17" />
        {/* Right glass */}
        <path d="M15.5 4 L19 4 L18.5 9 a2.25 2.25 0 0 1 -3 0 z" />
        <path d="M17 9.5 L17 17" />
        <path d="M15.5 17 L18.5 17" />
        {/* Clink line between */}
        <path d="M9 6.5 L14.5 6.5" />
    </svg>
);

const DoodleHeartEnvelope: React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }> = ({ size = 24, strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
        <rect x="3" y="6" width="18" height="13" rx="1.2" />
        <path d="M3 7 L12 14 L21 7" />
        {/* Tiny heart on the flap */}
        <path d="M12 11.5 c-1.4 -1 -2.6 -2 -2.6 -3 a1.3 1.3 0 0 1 2.6 0 a1.3 1.3 0 0 1 2.6 0 c0 1 -1.2 2 -2.6 3 z" />
    </svg>
);

const DoodlePressedFlower: React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }> = ({ size = 24, strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
        <path d="M12 20 L12 11" />
        {/* Petals */}
        <circle cx="12" cy="7" r="2.2" />
        <circle cx="8" cy="9" r="1.6" />
        <circle cx="16" cy="9" r="1.6" />
        <circle cx="12" cy="3.8" r="1.6" />
        <circle cx="12" cy="9.5" r="0.8" />
        {/* Leaves */}
        <path d="M12 14 q -3 -1 -4 1" />
        <path d="M12 16 q 3 -1 4 1" />
    </svg>
);

const DoodleTicket: React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }> = ({ size = 24, strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
        <path d="M3 7 a2 2 0 0 1 2 -2 h14 a2 2 0 0 1 2 2 v2 a2 2 0 0 0 0 4 v3 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 v-3 a2 2 0 0 0 0 -4 z" />
        <path d="M11 6 L11 18" strokeDasharray="1.5 1.5" />
    </svg>
);

const DoodleSparkleStar: React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }> = ({ size = 24, strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
        <path d="M12 3 L13 11 L21 12 L13 13 L12 21 L11 13 L3 12 L11 11 z" />
    </svg>
);

const DoodleHeartArrow: React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }> = ({ size = 24, strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
        <path d="M12 20 C 6 16 3 12 3 8.5 A 4.5 4.5 0 0 1 12 7 A 4.5 4.5 0 0 1 21 8.5 C 21 12 18 16 12 20 z" />
        <path d="M3 4 L9 8" />
        <path d="M3 4 L6 4 M3 4 L3 7" />
    </svg>
);

const DoodleHomeKey: React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }> = ({ size = 24, strokeWidth = 2, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
        <circle cx="8" cy="12" r="3.5" />
        <path d="M11.5 12 L21 12" />
        <path d="M18 12 L18 15" />
        <path d="M15 12 L15 15" />
    </svg>
);

// Official Google "G" mark — four-colour inline SVG. Used inside the
// "Continue with Google" button in the form sheet.
const GoogleLogo: React.FC<{ size?: number }> = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238c-.438.398 6.591-4.81 6.591-14.809 0-1.341-.138-2.65-.389-3.917z" />
    </svg>
);

// Randomized scatter — positions generated once with a seeded LCG so the
// arrangement is deterministic (no hydration jitter) but visually feels
// chaotic / hand-placed. Positions that would land on the centered phone
// mockup are rejected so icons cluster naturally around the edges instead.
type DecorIcon = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }>;

// Mix of bespoke couple-memory doodles (chunky pen-stroke, full character)
// and softer lucide outlines so the scatter feels hand-curated, not stock.
// The custom doodles come first so the LCG biases toward them.
const DECOR_POOL: DecorIcon[] = [
    DoodlePolaroid, DoodleWineGlasses, DoodleHeartEnvelope, DoodlePressedFlower,
    DoodleTicket, DoodleSparkleStar, DoodleHeartArrow, DoodleHomeKey,
    Heart, Sparkles, Music, Mail, Star, MessageCircle, Camera, BookOpen,
    Coffee, Gift, CalendarIcon, Feather, Flower2, Moon, MapPin, PenLine, Cake,
];

const generateDecorations = (count: number): DecorationItem[] => {
    let seed = 9173;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
    };
    // Fisher–Yates shuffle of the pool, then take icons without replacement so
    // no doodle repeats. Count is clamped to pool length.
    const pool = [...DECOR_POOL];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const n = Math.min(count, pool.length);
    // Alternate left/right per item so the scatter stays balanced. Left band:
    // 4–24%. Right band: 76–96%. Phone occupies the middle, so this also
    // avoids the centre zone entirely. Y is jittered within evenly-spaced
    // bands so vertically the spread is consistent too (no clumping).
    const items: DecorationItem[] = [];
    for (let i = 0; i < n; i++) {
        const onLeft = i % 2 === 0;
        const xPct = onLeft ? 4 + rand() * 20 : 76 + rand() * 20;
        const bandIndex = Math.floor(i / 2);             // 0..(n/2 - 1)
        const bandCount = Math.ceil(n / 2);
        const bandSize = 100 / bandCount;
        const yPct = bandIndex * bandSize + rand() * bandSize;
        items.push({
            Icon: pool[i],
            top: `${yPct.toFixed(1)}%`,
            left: `${xPct.toFixed(1)}%`,
            size: 13 + Math.floor(rand() * 7),   // 13–20px — smaller, subtler
            rotate: Math.floor(-18 + rand() * 36),
            opacity: 0.10 + rand() * 0.08,        // 0.10–0.18 — more subtle
        });
    }
    return items;
};

const decorations: DecorationItem[] = generateDecorations(12);

const DecorationLayer: React.FC<{ reducedMotion: boolean | null }> = ({ reducedMotion }) => (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
        {decorations.map((d, i) => {
            const Icon = d.Icon;
            // Custom doodles get a bolder stroke; lucide icons get hairline.
            // Index into the pool determines treatment.
            const isCustom = i % 3 !== 0; // most are custom; sprinkled lucide
            const stroke = isCustom ? 1.9 : 1.5;
            return (
                <motion.span
                    key={i}
                    className="absolute"
                    style={{
                        top: d.top,
                        left: d.left,
                        right: d.right,
                        transform: `rotate(${d.rotate}deg)`,
                        // Warm cream stroke — matches the cream phone bezel
                        // and reads bold against the wine backdrop, just like
                        // the reference's chunky pen drawings.
                        color: '#fbe4ee',
                        opacity: d.opacity,
                        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))',
                    }}
                    animate={reducedMotion ? undefined : { y: [0, -6, 0], opacity: [d.opacity, d.opacity * 1.35, d.opacity] }}
                    transition={reducedMotion ? undefined : { duration: 5 + (i % 5), delay: i * 0.22, repeat: Infinity, ease: 'easeInOut' }}
                >
                    <Icon size={d.size} strokeWidth={stroke} />
                </motion.span>
            );
        })}
    </div>
);

// ══════════════════════════════════════════════════════════════════════
// Drifting ambient layer — soft hearts and sparkles that slowly float
// upward across the scene. Sits BEHIND the phone mockup; adds living
// motion without competing with the doodle layer. Capped to ~5 elements
// for performance and to avoid visual noise.
// ══════════════════════════════════════════════════════════════════════
interface DriftItem {
    x: number;       // % across viewport
    delay: number;
    duration: number;
    size: number;
    kind: 'heart' | 'sparkle';
    tint: string;
}

const generateDrifters = (count: number): DriftItem[] => {
    let seed = 71717;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
    };
    return Array.from({ length: count }, () => ({
        x: 6 + rand() * 88,
        delay: rand() * 14,
        duration: 16 + rand() * 12,
        size: 10 + rand() * 8,
        kind: rand() < 0.55 ? 'heart' : 'sparkle',
        tint: rand() < 0.5 ? 'rgba(244,114,182,0.55)' : 'rgba(255,210,228,0.50)',
    }));
};

const DRIFTERS = generateDrifters(5);

const DriftLayer: React.FC<{ reducedMotion: boolean | null }> = ({ reducedMotion }) => {
    if (reducedMotion) return null;
    return (
        <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
            {DRIFTERS.map((d, i) => (
                <motion.span
                    key={i}
                    className="absolute"
                    style={{
                        left: `${d.x}%`,
                        bottom: '-8%',
                        color: d.tint,
                        filter: `drop-shadow(0 0 6px ${d.tint})`,
                    }}
                    initial={{ y: 0, opacity: 0 }}
                    animate={{
                        y: ['0vh', '-115vh'],
                        opacity: [0, 0.85, 0.85, 0],
                        x: [0, 18, -12, 8, 0],
                    }}
                    transition={{
                        duration: d.duration,
                        delay: d.delay,
                        repeat: Infinity,
                        ease: 'linear',
                        times: [0, 0.1, 0.9, 1],
                    }}
                >
                    {d.kind === 'heart' ? (
                        <Heart size={d.size} strokeWidth={2.2} fill={d.tint} />
                    ) : (
                        <Sparkles size={d.size} strokeWidth={2.0} />
                    )}
                </motion.span>
            ))}
        </div>
    );
};

// ══════════════════════════════════════════════════════════════════════
// Star field — pseudo-random twinkling dots scattered across the dark
// backdrop for celestial depth. Uses a stable seed so positions don't
// jitter on re-render. Three "magnitudes" of stars: tiny, small, soft.
// ══════════════════════════════════════════════════════════════════════
interface StarItem {
    x: number;       // % across viewport
    y: number;       // % down viewport
    r: number;       // px radius
    delay: number;
    duration: number;
    twinkleAmp: number;
    color: string;
}

const STAR_COLORS = ['#ffe4ee', '#ffd4e4', '#f9a8d4', '#fbc4d8'];

const generateStars = (count: number): StarItem[] => {
    // Simple LCG so the field is deterministic and won't reshuffle every render.
    let seed = 31415;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
    };
    return Array.from({ length: count }, () => {
        const big = rand() < 0.18;
        return {
            x: rand() * 100,
            y: rand() * 100,
            r: big ? 1.4 + rand() * 0.9 : 0.6 + rand() * 0.7,
            delay: rand() * 6,
            duration: 2.8 + rand() * 4,
            twinkleAmp: big ? 0.75 : 0.45,
            color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)],
        };
    });
};

const STARS = generateStars(46);

const StarField: React.FC<{ reducedMotion: boolean | null }> = ({ reducedMotion }) => (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
        {STARS.map((s, i) => (
            <motion.span
                key={i}
                className="absolute rounded-full"
                style={{
                    left: `${s.x}%`,
                    top: `${s.y}%`,
                    width: s.r * 2,
                    height: s.r * 2,
                    background: s.color,
                    boxShadow: s.r > 1.2 ? `0 0 ${s.r * 4}px ${s.color}` : `0 0 ${s.r * 2}px ${s.color}88`,
                    opacity: 0.55,
                }}
                animate={
                    reducedMotion
                        ? undefined
                        : {
                              opacity: [0.55, 0.55 + s.twinkleAmp * 0.35, 0.55],
                              scale: [1, 1 + s.twinkleAmp * 0.2, 1],
                          }
                }
                transition={
                    reducedMotion
                        ? undefined
                        : { duration: s.duration, repeat: Infinity, ease: 'easeInOut', delay: s.delay }
                }
            />
        ))}
    </div>
);

// ══════════════════════════════════════════════════════════════════════
// Mock-screen helpers — tiny inline status bar + dock icons. Kept as
// dedicated SVGs because at this scale lucide strokes alias badly.
// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// Phone mockup — deliberately symbolic, not a tiny dashboard. It conveys:
// two people, one private shared memory space, and time kept together.
// ══════════════════════════════════════════════════════════════════════
const PhoneMockup: React.FC<{ reducedMotion: boolean | null }> = ({ reducedMotion }) => (
    <motion.div
        initial={reducedMotion ? undefined : { opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
        data-testid="auth-phone-mockup"
        // Width is the primary scale so the phone reads as a hero object.
        // The 24dvh guard keeps short Android screens from pushing CTAs away.
        style={{
            '--mock-phone-width': 'clamp(148px, min(40vw, 24dvh), 190px)',
            width: 'var(--mock-phone-width)',
        } as React.CSSProperties}
    >
        {/* ── Side buttons — slim cosmetic accents (volume left, power right) */}
        <span
            aria-hidden
            className="absolute left-[-2px] rounded-full"
            style={{
                top: '14%',
                width: 3, height: 22,
                background: 'linear-gradient(90deg, #c7a8b6, #e8d4de 60%, #c7a8b6)',
                boxShadow: '0 0 1px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
        />
        <span
            aria-hidden
            className="absolute left-[-2px] rounded-full"
            style={{
                top: '23%',
                width: 3, height: 38,
                background: 'linear-gradient(90deg, #c7a8b6, #e8d4de 60%, #c7a8b6)',
                boxShadow: '0 0 1px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
        />
        <span
            aria-hidden
            className="absolute left-[-2px] rounded-full"
            style={{
                top: '34%',
                width: 3, height: 38,
                background: 'linear-gradient(90deg, #c7a8b6, #e8d4de 60%, #c7a8b6)',
                boxShadow: '0 0 1px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
        />
        <span
            aria-hidden
            className="absolute right-[-2px] rounded-full"
            style={{
                top: '27%',
                width: 3, height: 56,
                background: 'linear-gradient(-90deg, #c7a8b6, #e8d4de 60%, #c7a8b6)',
                boxShadow: '0 0 1px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
        />

        {/* ── Outer bezel — slim warm-cream frame for high contrast against
            the deep purple backdrop (matches the reference's light phone /
            dark scene composition). Single thin layer, not the heavy
            titanium ring we had before. */}
        <div
            className="relative"
            style={{
                padding: 'clamp(2px, calc(var(--mock-phone-width) * 0.018), 4px)',
                // Concentric radii: each ring's radius = parent's radius − its
                // padding, so corners nest cleanly with no visible wedge.
                // Bezel: 0.205. Padding: 0.018. → frame radius: 0.187.
                borderRadius: 'calc(var(--mock-phone-width) * 0.205)',
                background:
                    'linear-gradient(160deg, #f7eaf0 0%, #efdce6 35%, #e6cfdb 65%, #d9bdcd 100%)',
                boxShadow:
                    '0 36px 70px rgba(8,2,16,0.55), 0 14px 30px rgba(8,2,16,0.40), 0 0 0 1px rgba(255,255,255,0.18), inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -1px 0 rgba(120,80,98,0.18)',
            }}
        >
            {/* ── Inner black hairline — a single thin halo around the screen.
                Radius = bezel radius − bezel padding for concentric corners.
                Frame: 0.187. Padding: 0.018. → screen radius: 0.169. */}
            <div
                className="relative"
                style={{
                    padding: 'calc(var(--mock-phone-width) * 0.018)',
                    borderRadius: 'calc(var(--mock-phone-width) * 0.187)',
                    background: '#1a0a14',
                    boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.06)',
                }}
            >
                {/* ── Screen ─────────────────────────────────────────────── */}
                <div
                    data-testid="auth-phone-screen"
                    className="relative overflow-hidden"
                    style={{
                        aspectRatio: '9 / 19.5',
                        // 0.187 (frame) − 0.018 (frame padding) = 0.169. The
                        // screen corner now sits exactly inside the frame
                        // corner with no visible wedge.
                        borderRadius: 'calc(var(--mock-phone-width) * 0.169)',
                        // Light cream → faint blush — keeps the screen feeling
                        // bright against the purple backdrop instead of muted.
                        background: 'linear-gradient(180deg, #fbf2f5 0%, #f4e6ed 55%, #ecd6e0 100%)',
                    }}
                >
                    {/* ── DYNAMIC ISLAND ─────────────────────────────────── */}
                    <div className="absolute left-1/2 -translate-x-1/2 z-[12]" style={{ top: 'calc(var(--mock-phone-width) * 0.035)' }}>
                        <span
                            className="block"
                            style={{
                                width: 'calc(var(--mock-phone-width) * 0.31)',
                                height: 'calc(var(--mock-phone-width) * 0.082)',
                                borderRadius: 999,
                                background: '#000',
                                boxShadow:
                                    '0 0 0 0.5px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.55), inset 0 0.5px 0 rgba(255,255,255,0.06)',
                            }}
                        />
                    </div>

                    {/* ── SCREEN LIGHTING ──────────────────────────────────
                        Softer, more even cream wash with a gentle mood bloom
                        under the orb position. Pulled back from the previous
                        bright center (0.85 alpha) — now feels lit rather than
                        floodlit. The reference's phone screen reads calm, not
                        glowing-hot, so we follow that. */}
                    <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background:
                                // Subtle warm centre lift — opaque-ish in middle, fades naturally
                                'radial-gradient(70% 40% at 50% 42%, rgba(255,224,238,0.45), transparent 75%), ' +
                                // Soft pink mood under the orb position
                                'radial-gradient(56% 30% at 50% 44%, rgba(244,114,182,0.16), transparent 65%), ' +
                                // Cool violet whisper lower-center
                                'radial-gradient(54% 28% at 50% 76%, rgba(168,85,247,0.10), transparent 70%)',
                        }}
                    />
                    {/* Top vignette — even softer than before */}
                    <div
                        aria-hidden
                        className="absolute inset-x-0 top-0 pointer-events-none"
                        style={{
                            height: '22%',
                            background: 'linear-gradient(to bottom, rgba(112,72,98,0.12), transparent)',
                        }}
                    />
                    {/* Bottom vignette */}
                    <div
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 pointer-events-none"
                        style={{
                            height: '22%',
                            background: 'linear-gradient(to top, rgba(112,72,98,0.16), transparent)',
                        }}
                    />

                    {/* ── HERO: rotating aura orb — the app's signature visual.
                        One unmistakable element, large, centered. No competing
                        couple-header strip; no dock; no tiny dots. */}
                    <div
                        className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center"
                        style={{ top: '24%' }}
                    >
                        <div
                            className="relative"
                            style={{
                                width: 'calc(var(--mock-phone-width) * 0.46)',
                                height: 'calc(var(--mock-phone-width) * 0.46)',
                            }}
                        >
                            {/* Outer breathing halo */}
                            <motion.span
                                aria-hidden
                                className="absolute rounded-full"
                                style={{
                                    inset: 'calc(var(--mock-phone-width) * -0.14)',
                                    background: 'radial-gradient(circle, rgba(244,114,182,0.45), transparent 65%)',
                                    filter: 'blur(14px)',
                                }}
                                animate={reducedMotion ? undefined : { scale: [1, 1.12, 1], opacity: [0.55, 0.85, 0.55] }}
                                transition={reducedMotion ? undefined : { duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            {/* Orb body — conic gradient slowly rotating */}
                            <motion.span
                                aria-hidden
                                className="absolute inset-0 rounded-full"
                                style={{
                                    background:
                                        'conic-gradient(from 0deg, #f472b6 0deg, #ec4899 90deg, #a855f7 180deg, #ec4899 270deg, #f472b6 360deg)',
                                    boxShadow:
                                        '0 10px 24px rgba(244,114,182,0.40), inset 0 0 0 1.5px rgba(255,255,255,0.42), inset 0 0 14px rgba(255,255,255,0.18)',
                                }}
                                animate={reducedMotion ? undefined : { rotate: 360, scale: [1, 1.04, 1] }}
                                transition={reducedMotion ? undefined : {
                                    rotate: { duration: 18, repeat: Infinity, ease: 'linear' },
                                    scale: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' },
                                }}
                            />
                            {/* Glass highlight */}
                            <span
                                aria-hidden
                                className="absolute rounded-full"
                                style={{
                                    top: '14%', left: '20%',
                                    width: '36%', height: '24%',
                                    background: 'radial-gradient(ellipse, rgba(255,255,255,0.65), transparent 60%)',
                                    filter: 'blur(2px)',
                                }}
                            />
                        </div>

                        {/* Caption right under the orb — simple, readable */}
                        <p
                            className="mt-3 font-serif text-center leading-none"
                            style={{
                                color: '#33232c',
                                fontSize: 'calc(var(--mock-phone-width) * 0.085)',
                                fontWeight: 600,
                                letterSpacing: '-0.01em',
                            }}
                        >
                            Day 978 together.
                        </p>
                    </div>

                    {/* Two soft pills near the bottom — quick "you / them" mood
                        indicator. Just enough product-truth to feel like the
                        real Lior, but no longer a tiny illegible dock. */}
                    <div
                        className="absolute inset-x-0 flex items-center justify-center gap-2"
                        style={{ bottom: 'calc(var(--mock-phone-width) * 0.13)' }}
                    >
                        {[
                            { label: 'You',  color: '#ec4899' },
                            { label: 'Them', color: '#a855f7' },
                        ].map((p) => (
                            <span
                                key={p.label}
                                className="inline-flex items-center gap-1"
                                style={{
                                    height: 'calc(var(--mock-phone-width) * 0.10)',
                                    padding: '0 calc(var(--mock-phone-width) * 0.05)',
                                    background: 'rgba(255,255,255,0.78)',
                                    border: '1px solid rgba(255,255,255,0.92)',
                                    boxShadow: '0 4px 10px rgba(91,57,77,0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
                                    borderRadius: 999,
                                }}
                            >
                                <span
                                    className="rounded-full"
                                    style={{
                                        width: 'calc(var(--mock-phone-width) * 0.034)',
                                        height: 'calc(var(--mock-phone-width) * 0.034)',
                                        background: p.color,
                                        boxShadow: `0 0 4px ${p.color}`,
                                    }}
                                />
                                <span
                                    style={{
                                        color: '#7d4a62',
                                        fontWeight: 800,
                                        letterSpacing: '0.18em',
                                        fontSize: 'calc(var(--mock-phone-width) * 0.042)',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {p.label}
                                </span>
                            </span>
                        ))}
                    </div>

                {/* Home indicator bar */}
                <div className="absolute inset-x-0 bottom-1 flex justify-center" style={{ zIndex: 12 }}>
                    <span className="h-[3px] rounded-full" style={{ width: 'calc(var(--mock-phone-width) * 0.46)', background: 'rgba(58,42,53,0.55)' }} />
                </div>

                {/* Screen glass shine — diagonal sheen for that pane-of-glass feel */}
                <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background:
                            'linear-gradient(120deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.08) 18%, transparent 32%, transparent 70%, rgba(255,255,255,0.05) 100%)',
                        mixBlendMode: 'overlay',
                        zIndex: 13,
                    }}
                />
                {/* Subtle inner stroke around the screen edge — radius must
                    match the screen's so the stroke hugs the corner cleanly. */}
                <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        borderRadius: 'calc(var(--mock-phone-width) * 0.169)',
                        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)',
                        zIndex: 14,
                    }}
                />
                </div> {/* screen */}
            </div> {/* inner frame */}

            {/* Bezel outer highlight — barely-there sheen on the cream rim */}
            <div
                aria-hidden
                className="absolute inset-x-6 top-[2px] h-[2px] pointer-events-none"
                style={{
                    background:
                        'linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent)',
                    borderRadius: 4,
                    opacity: 0.55,
                }}
            />
        </div>

    </motion.div>
);

// ══════════════════════════════════════════════════════════════════════
// Form sheet primitives — soft private-card fields tuned for mobile.
// ══════════════════════════════════════════════════════════════════════
const DarkBanner: React.FC<{ tone: 'error' | 'success' | 'warning'; message: React.ReactNode }> = ({ tone, message }) => {
    // Tones tuned for the dark wine-glass sheet — soft pastel text on a
    // translucent tinted background so banners feel like temperature shifts
    // in the same room, not popups from a different design language.
    const tones = {
        error:   { color: '#ffc4d7', border: 'rgba(255,120,180,0.32)', bg: 'rgba(255,120,180,0.10)', icon: <AlertCircle size={14} className="mt-0.5 shrink-0" /> },
        success: { color: '#a7f3d0', border: 'rgba(120,220,180,0.32)', bg: 'rgba(80,200,150,0.10)', icon: <Sparkles size={14} className="mt-0.5 shrink-0" /> },
        warning: { color: '#ffd9a3', border: 'rgba(245,180,80,0.32)', bg: 'rgba(245,180,80,0.10)', icon: <Lock size={14} className="mt-0.5 shrink-0" /> },
    } as const;
    const t = tones[tone];
    return (
        <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }}
            className="overflow-hidden"
        >
            <div
                className="rounded-2xl px-3.5 py-2.5 text-[12px] font-semibold"
                style={{
                    color: t.color,
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                }}
            >
                <div className="flex items-start gap-2.5">
                    {t.icon}
                    <div className="leading-[1.55]">{message}</div>
                </div>
            </div>
        </motion.div>
    );
};

type DarkFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    invalid?: boolean;
    hint?: string | null;
    /** Optional leading icon rendered inside the field. */
    leadingIcon?: React.ReactNode;
};

// Floating-label glass field — calm and minimal. No leading icon needed:
// the label itself communicates intent, and removing icons gives the field
// more breathing room. Focus state is a hairline shift, not a glow.
const DarkField: React.FC<DarkFieldProps> = ({ label, invalid, hint, leadingIcon: _ignored, type, value, onFocus, onBlur, id, ...props }) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [revealed, setRevealed] = useState(false);
    const [focused, setFocused] = useState(false);
    const filled = value != null && String(value).length > 0;
    const lifted = focused || filled;
    const isPassword = type === 'password';
    const effectiveType = isPassword && revealed ? 'text' : type;
    return (
        <div className="relative">
            <div
                className="relative rounded-2xl transition-all duration-200"
                style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${invalid ? 'rgba(255,160,195,0.40)' : focused ? 'rgba(255,210,230,0.22)' : 'rgba(255,255,255,0.07)'}`,
                    boxShadow: invalid
                        ? '0 0 0 2px rgba(255,140,180,0.08)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                }}
            >
                <input
                    {...props}
                    id={inputId}
                    type={effectiveType}
                    value={value}
                    aria-invalid={invalid || undefined}
                    onFocus={(e) => { setFocused(true); onFocus?.(e); }}
                    onBlur={(e) => { setFocused(false); onBlur?.(e); }}
                    placeholder=""
                    className={`peer w-full bg-transparent pl-4 ${isPassword ? 'pr-11' : 'pr-4'} pt-[20px] pb-[8px] text-[15px] font-medium outline-none`}
                    style={{ color: '#f4e0e8', caretColor: 'rgba(244,114,182,0.85)' }}
                />
                <motion.label
                    htmlFor={inputId}
                    initial={false}
                    animate={{
                        top: lifted ? 6 : 22,
                        scale: lifted ? 0.7 : 1,
                    }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute left-4 pointer-events-none origin-left"
                    style={{
                        color: invalid
                            ? 'rgba(255,170,200,0.78)'
                            : lifted
                                ? 'rgba(255,210,230,0.62)'
                                : 'rgba(255,232,242,0.40)',
                        fontSize: 14,
                        fontWeight: 400,
                        letterSpacing: '0.005em',
                    }}
                >
                    {label}
                </motion.label>
                {isPassword && (
                    <button
                        type="button"
                        onClick={() => { feedback.tap(); setRevealed((v) => !v); }}
                        aria-label={revealed ? 'Hide password' : 'Show password'}
                        className="absolute right-1 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full"
                        style={{ color: 'rgba(255,210,230,0.45)' }}
                    >
                        {revealed ? <EyeOff size={15} strokeWidth={1.8} /> : <Eye size={15} strokeWidth={1.8} />}
                    </button>
                )}
            </div>
            {hint && (
                <span
                    className="mt-1.5 block pl-1 text-[10.5px]"
                    style={{ color: invalid ? 'rgba(255,170,200,0.78)' : 'rgba(255,232,242,0.42)' }}
                >
                    {hint}
                </span>
            )}
        </div>
    );
};

// ══════════════════════════════════════════════════════════════════════
// Main Auth component.
// ══════════════════════════════════════════════════════════════════════
type AuthMode = 'landing' | 'form';

export const Auth: React.FC<AuthProps> = ({ onLogin, onPrivacyPolicy, onTerms }) => {
    const [mode, setMode] = useState<AuthMode>('landing');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(true);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [rateLimitSecs, setRateLimitSecs] = useState(0);
    const [submitAttempted, setSubmitAttempted] = useState(false);
    // When a sign-up needs email confirmation (email confirmations ON in the
    // Supabase project), we hold the pending address here and swap the form
    // for a "Check your email" panel. Null = normal form.
    const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);
    // Client-side cooldown on the Resend button, on top of the server's
    // shared auth rate limit. Counts down ~30s after each resend.
    const [resendCooldownSecs, setResendCooldownSecs] = useState(0);
    // ── Password-recovery flow ────────────────────────────────────────────
    // A reset link drops the user back here with a short-lived recovery
    // session (Supabase fires onAuthStateChange 'PASSWORD_RECOVERY', and the
    // redirect carries type=recovery). Instead of silently signing them in,
    // we show a "Set a new password" form and call updateUser({ password })
    // BEFORE entering the app. recoveryMode gates the normal SIGNED_IN →
    // onLogin auto-entry so the user can't slip past the form.
    const [recoveryMode, setRecoveryMode] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const recoveryModeRef = React.useRef(false);
    const reducedMotion = useReducedMotion();
    const { isConfigured } = getSupabaseAuthConfig();


    useEffect(() => {
        if (rateLimitSecs <= 0) return;
        const id = setInterval(() => {
            setRateLimitSecs((s) => {
                if (s <= 1) { clearInterval(id); return 0; }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [rateLimitSecs]);

    useEffect(() => {
        if (resendCooldownSecs <= 0) return;
        const id = setInterval(() => {
            setResendCooldownSecs((s) => {
                if (s <= 1) { clearInterval(id); return 0; }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [resendCooldownSecs]);

    // While the "Check your email" panel is up, re-poll for a session when the
    // user returns to the tab/app — they likely just confirmed in their mail
    // client. The onAuthStateChange SIGNED_IN listener still handles the
    // normal case; this is a belt-and-braces path for environments where the
    // listener doesn't fire on a cross-tab confirmation.
    useEffect(() => {
        if (!pendingConfirmEmail) return;
        const sb = SupabaseService.client;
        if (!sb) return;
        const onFocus = () => {
            sb.auth.getSession().then(({ data }) => {
                // Hold the user on the "Set a new password" form during a
                // recovery session — same gate every other onLogin path uses.
                if (data.session && !recoveryModeRef.current) onLogin();
            }).catch(() => { /* ignore */ });
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [pendingConfirmEmail, onLogin]);

    useEffect(() => {
        SupabaseService.init();
        if (!SupabaseService.client) return;

        const sb = SupabaseService.client;

        // ── OAuth callback handling ───────────────────────────────────
        // After Google redirects back, the URL may contain either a PKCE
        // `?code=` param (success) or an `?error=` param (user cancelled,
        // provider misconfigured, etc.). Supabase auto-exchanges the code,
        // but we also want to: (a) surface any error in our banner, and
        // (b) strip the params from the URL so the address bar stays clean.
        const cleanOAuthParams = () => {
            try {
                const url = new URL(window.location.href);
                const dirty = url.searchParams.has('code')
                    || url.searchParams.has('error')
                    || url.searchParams.has('error_description')
                    || url.hash.includes('access_token=')
                    || url.hash.includes('error=');
                if (!dirty) return;
                ['code', 'error', 'error_description', 'state'].forEach((k) => url.searchParams.delete(k));
                if (url.hash.includes('access_token=') || url.hash.includes('error=')) {
                    url.hash = '';
                }
                window.history.replaceState({}, document.title, url.pathname + url.search);
            } catch { /* ignore — non-critical */ }
        };

        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const oauthError = urlParams.get('error_description') || urlParams.get('error') || hashParams.get('error_description') || hashParams.get('error');
        if (oauthError) {
            setError(decodeURIComponent(oauthError).replace(/\+/g, ' '));
            cleanOAuthParams();
        }

        // ── Recovery-flow detection ───────────────────────────────────
        // A password-reset link returns here with type=recovery on either the
        // query string or the hash. Enter recovery mode immediately so the
        // "Set a new password" form is shown and onLogin is held back even if
        // the recovery session arrives as a SIGNED_IN event.
        const enterRecoveryMode = () => {
            recoveryModeRef.current = true;
            setRecoveryMode(true);
            setMode('form');
            clearFeedback();
        };
        if (urlParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery') {
            enterRecoveryMode();
        }

        // ── Auth state change listener ────────────────────────────────
        const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
            // Recovery session: show the set-password form instead of entering.
            if (event === 'PASSWORD_RECOVERY') {
                enterRecoveryMode();
                return;
            }
            if (event === 'SIGNED_IN' && session) {
                // Hold back auto-entry while the user still needs to choose a
                // new password — updateUser fires its own SIGNED_IN we ignore.
                if (recoveryModeRef.current) return;
                cleanOAuthParams();
                onLogin();
            }
        });

        // If we already have a valid session (e.g. PKCE exchange completed
        // before this component mounted), short-circuit straight to onLogin —
        // unless this is a recovery session awaiting a new password.
        sb.auth.getSession().then(({ data }) => {
            if (data.session && !recoveryModeRef.current) {
                cleanOAuthParams();
                onLogin();
            }
        }).catch(() => { /* ignore */ });

        // ── Capacitor deep-link handler ──────────────────────────────
        // When the system browser returns to the app via the custom URL
        // scheme, we get an `appUrlOpen` event with the full callback URL.
        // We hand the URL to Supabase so it can exchange the PKCE code.
        let removeDeepLinkListener: (() => void) | null = null;
        const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
        if (isNative) {
            // Dynamic import — keeps web bundle from depending on the
            // native module at runtime. If the plugin isn't installed,
            // OAuth still works via the in-WebView redirect path.
            (async () => {
                try {
                    const mod = await import('@capacitor/app');
                    const handle = await mod.App.addListener('appUrlOpen', async (event: { url: string }) => {
                        try {
                            const incoming = new URL(event.url);
                            const code = incoming.searchParams.get('code');
                            if (code) {
                                await sb.auth.exchangeCodeForSession(code);
                            }
                        } catch { /* ignore malformed URLs */ }
                    });
                    removeDeepLinkListener = () => handle.remove();
                } catch { /* @capacitor/app not available — fall through */ }
            })();
        }

        return () => {
            subscription.unsubscribe();
            removeDeepLinkListener?.();
        };
    }, [onLogin]);

    const clearFeedback = () => { setError(null); setSuccessMsg(null); };
    const trimmedEmail = email.trim();
    const emailInvalid = submitAttempted && !trimmedEmail;
    const passwordInvalid = submitAttempted && !isForgotPassword && !password;

    const openFormAs = (signUp: boolean) => {
        feedback.tap();
        setIsSignUp(signUp);
        setIsForgotPassword(false);
        setSubmitAttempted(false);
        clearFeedback();
        setMode('form');
    };

    const closeForm = () => {
        feedback.tap();
        setMode('landing');
        setSubmitAttempted(false);
        setPendingConfirmEmail(null);
        clearFeedback();
    };

    const handleGoogle = async () => {
        feedback.tap();
        clearFeedback();
        // Never start a Google account switch from the password-recovery form:
        // it would replace the short-lived recovery session and skip the
        // "set a new password" step. No-op in every normal flow.
        if (recoveryModeRef.current) return;

        // Make sure the client is up before anything else — guards against
        // the user clicking Google before SupabaseService.init() resolved.
        SupabaseService.init();
        const sb = SupabaseService.client;
        if (!sb) {
            setError('Cloud sync is not configured yet. Add your Supabase URL and anon key first.');
            feedback.error();
            return;
        }

        setLoading(true);
        try {
            const isNative = typeof window !== 'undefined'
                && Boolean((window as any).Capacitor?.isNativePlatform?.());

            // ── NATIVE: OS-level Google account picker (no browser) ──────────
            // Credential Manager shows the system account chooser IN the app,
            // returns a signed ID token, and we exchange it for a Supabase
            // session via signInWithIdToken — no system browser, no redirect,
            // no deep link. The helper (and the Capacitor plugin it pulls) is
            // loaded lazily here so none of it lands in the startup bundle, and
            // only on native so web never fetches the chunk.
            if (isNative) {
                const nativeGoogle = await import('../services/nativeGoogleAuth');
                if (nativeGoogle.isNativeGoogleSignInAvailable()) {
                    try {
                        await nativeGoogle.signInWithNativeGoogle();
                        // Success → enter the app. onLogin is idempotent (the
                        // onAuthStateChange 'SIGNED_IN' listener would also fire
                        // it), so calling it here removes any single dependence
                        // on that event. Leave loading=true: the unmount on
                        // entry clears it, with no flash of the idle button.
                        if (!recoveryModeRef.current) onLogin();
                    } catch (err) {
                        const code = err instanceof nativeGoogle.NativeGoogleSignInError
                            ? err.code
                            : 'plugin_error';
                        // User backing out of the picker is not an error — stay put.
                        if (code !== 'cancelled') {
                            setError(nativeGoogle.friendlyNativeGoogleError(code));
                            feedback.error();
                        }
                        setLoading(false);
                    }
                    return;
                }
                // Native but no web client id configured → fall through to the
                // browser OAuth redirect below.
            }

            // ── FALLBACK: browser OAuth redirect ─────────────────────────────
            //   • Web → page origin (Supabase callback returns here and the PKCE
            //     code is auto-exchanged for a session).
            //   • Native without a configured web client id → custom URL scheme;
            //     the deep-link listener in useEffect completes the exchange.
            //     (Requires com.lior.app://auth/callback on the Supabase Redirect
            //     URLs allow-list, else Supabase bounces to the Site URL.)
            const redirectTo = isNative
                ? 'com.lior.app://auth/callback'
                : window.location.origin;

            const { data, error: oauthError } = await sb.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo,
                    // Always show Google's account picker — keeps switching
                    // between accounts predictable and prevents silent
                    // sign-in to the wrong account.
                    queryParams: { prompt: 'select_account' },
                    // Don't auto-redirect on native — we want to open the
                    // OAuth URL in the system browser, not inside the
                    // app's WebView (Google blocks embedded WebViews).
                    skipBrowserRedirect: isNative,
                },
            });

            if (oauthError) {
                // Friendlier message for the common "provider not enabled"
                // case — Supabase's raw error reads like a dev error, not
                // a user-facing one.
                const msg = oauthError.message || '';
                if (/provider is not enabled/i.test(msg) || /unsupported provider/i.test(msg)) {
                    setError('Google sign-in is not enabled yet in this Supabase project. Enable the Google provider in Supabase Dashboard → Authentication → Providers.');
                } else {
                    setError(msg || 'Could not start Google sign-in.');
                }
                feedback.error();
                setLoading(false);
                return;
            }

            if (isNative && data?.url) {
                // On native, open the OAuth URL in the system browser.
                // window.open with '_blank' is intercepted by Capacitor's
                // Android shell and routed to the external browser, which
                // is what Google requires. After the user completes auth
                // there, Supabase redirects to com.lior.app://auth/callback
                // and the deep-link listener in useEffect takes over.
                const win = window.open(data.url, '_blank');
                if (!win) {
                    // Interception didn't fire (popup blocked / shell not
                    // wired) — navigate directly so the user is never
                    // stranded on a silent idle button.
                    try {
                        window.location.assign(data.url);
                    } catch {
                        setError('Could not open the Google sign-in page. Please try again.');
                        feedback.error();
                        setLoading(false);
                    }
                    return;
                }
                // Reset loading — the user is now in the browser; when
                // they return via deep link the listener handles the rest.
                setLoading(false);
                return;
            }
            // On web, Supabase has already triggered the redirect to
            // accounts.google.com. We leave loading=true because the page
            // navigates away.
        } catch {
            setError('Could not start Google sign-in. Please check your connection.');
            feedback.error();
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        setSubmitAttempted(true);
        if (!trimmedEmail) {
            setError('Enter your email address first.');
            feedback.error();
            return;
        }
        feedback.tap();
        setLoading(true);
        clearFeedback();
        try {
            let result = await authProxy('reset', trimmedEmail);
            if (result.proxyUnavailable) { const fb = await directAuthFallback('reset', trimmedEmail); result = { ...fb, status: statusFromFallback(fb) }; }
            if (result.status === 429) setRateLimitSecs(result.retry_after_seconds ?? 600);
            else if (result.error) setError(result.error);
            else setSuccessMsg('Password reset email sent. Check your inbox.');
        } catch { setError('Network error. Please check your connection.'); }
        finally { setLoading(false); }
    };

    // Recovery flow: set a brand-new password on the active recovery session,
    // then enter the app. Validates a minimum length and a matching confirm
    // before calling updateUser so we surface the same errors Supabase would.
    const handleSetNewPassword = async () => {
        setSubmitAttempted(true);
        if (!newPassword || newPassword.length < 8) {
            setError('Choose a password with at least 8 characters.');
            feedback.error();
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            feedback.error();
            return;
        }
        const sb = SupabaseService.client;
        if (!sb) {
            setError('Cloud sync is not configured yet.');
            feedback.error();
            return;
        }
        feedback.tap();
        setLoading(true);
        clearFeedback();
        try {
            const { error: updateError } = await sb.auth.updateUser({ password: newPassword });
            if (updateError) {
                setError(updateError.message || 'Could not update your password.');
                feedback.error();
                return;
            }
            // Password changed — recovery is complete. Release the gate and
            // enter the app with the now-permanent session.
            recoveryModeRef.current = false;
            setRecoveryMode(false);
            setNewPassword('');
            setConfirmPassword('');
            onLogin();
        } catch {
            setError('Network error. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const handleAuth = async () => {
        setSubmitAttempted(true);
        if (!trimmedEmail || !password) {
            setError('Complete both fields to continue.');
            feedback.error();
            return;
        }
        feedback.tap();
        setLoading(true);
        clearFeedback();
        try {
            let result = await authProxy(isSignUp ? 'signup' : 'login', trimmedEmail, password);
            if (result.proxyUnavailable) { const fb = await directAuthFallback(isSignUp ? 'signup' : 'login', trimmedEmail, password); result = { ...fb, status: statusFromFallback(fb) }; }
            if (result.status === 429) setRateLimitSecs(result.retry_after_seconds ?? 600);
            else if (result.error) { setError(result.error); feedback.error(); }
            else if (isSignUp && !result.data?.session) {
                // Email confirmations are ON for this project: no session yet,
                // a confirmation link has been mailed. Swap to the dedicated
                // "Check your email" panel (resend / open-mail / start over).
                setPendingConfirmEmail(trimmedEmail);
                setResendCooldownSecs(30);
            } else {
                const sb = SupabaseService.client;
                if (sb && result.data?.session) await sb.auth.setSession(result.data.session);
                onLogin();
            }
        } catch { setError('Network error. Please check your connection.'); }
        finally { setLoading(false); }
    };

    // Re-send the sign-up confirmation email from the "Check your email" panel.
    // Gated by both the server's shared auth rate limit (429 → rateLimitSecs)
    // and a ~30s client cooldown so the button can't be hammered.
    const handleResendConfirm = async () => {
        if (!pendingConfirmEmail || loading || rateLimitSecs > 0 || resendCooldownSecs > 0) return;
        feedback.tap();
        setLoading(true);
        clearFeedback();
        try {
            let result = await authProxy('resend', pendingConfirmEmail);
            if (result.proxyUnavailable) { const fb = await directAuthFallback('resend', pendingConfirmEmail); result = { ...fb, status: statusFromFallback(fb) }; }
            if (result.status === 429) setRateLimitSecs(result.retry_after_seconds ?? 600);
            else if (result.error) { setError(result.error); feedback.error(); }
            else { setSuccessMsg('Confirmation email re-sent. Check your inbox and spam folder.'); setResendCooldownSecs(30); }
        } catch { setError('Network error. Please check your connection.'); }
        finally { setLoading(false); }
    };

    // Best-effort "Open mail app" — a bare mailto: nudges the OS to surface
    // the default mail client. Harmless no-op where none is registered.
    const handleOpenMail = () => {
        feedback.tap();
        try { window.location.href = 'mailto:'; } catch { /* ignore */ }
    };

    // Abandon the pending confirmation and return to a clean sign-up form so
    // the user can try a different address.
    const handleUseDifferentEmail = () => {
        feedback.tap();
        setPendingConfirmEmail(null);
        setResendCooldownSecs(0);
        setPassword('');
        setSubmitAttempted(false);
        clearFeedback();
    };

    const sheetTitle = recoveryMode
        ? 'Set a new password'
        : pendingConfirmEmail
            ? 'Check your email'
            : isForgotPassword ? 'Reset password' : isSignUp ? 'Create your space' : 'Welcome back';
    const sheetSubtitle = recoveryMode
        ? 'Choose a new password to finish.'
        : pendingConfirmEmail
            ? 'One tap from your space.'
            : isForgotPassword
                ? "We'll send you a reset link."
                : isSignUp
                    ? 'A softer place for two, just yours.'
                    : 'Enter your private space.';

    const ctaLabel = loading
        ? isForgotPassword ? 'Sending…' : isSignUp ? 'Creating…' : 'Entering…'
        : isForgotPassword ? 'Send reset link' : isSignUp ? 'Create my space' : 'Enter Lior';

    return (
        <div
            // No-scroll fit: pin the page to the dynamic viewport height so
            // every section is visible without the user having to scroll.
            className="relative min-h-[100dvh] overflow-hidden"
            style={{
                background: palette.bg0,
                fontFamily: '"Nunito Sans", sans-serif',
                height: '100dvh',
                minHeight: '100dvh',
            }}
        >
            {/* ── BACKDROP — deep night sky gradient ─────────────────── */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: `radial-gradient(120% 80% at 50% 18%, ${palette.bg2} 0%, ${palette.bg1} 38%, ${palette.bg0} 78%)`,
                }}
            />

            {/* Soft aurora pools — pink top-left, violet bottom-right.
                Restored the warmer pink-violet pairing to go with the wine
                palette: the pink halo on top complements the cream bezel,
                while the violet bottom-right keeps Lior's signature pair. */}
            <motion.div
                aria-hidden
                className="absolute pointer-events-none rounded-full"
                style={{
                    top: '-20%',
                    left: '-25%',
                    width: '90vw',
                    height: '90vw',
                    background: 'radial-gradient(circle, rgba(244,114,182,0.22), transparent 60%)',
                    filter: 'blur(70px)',
                }}
                animate={reducedMotion ? undefined : { scale: [1, 1.10, 1], x: [0, 14, 0], y: [0, -8, 0] }}
                transition={reducedMotion ? undefined : { duration: 16, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
                aria-hidden
                className="absolute pointer-events-none rounded-full"
                style={{
                    bottom: '-30%',
                    right: '-30%',
                    width: '95vw',
                    height: '95vw',
                    background: 'radial-gradient(circle, rgba(168,85,247,0.20), transparent 60%)',
                    filter: 'blur(70px)',
                }}
                animate={reducedMotion ? undefined : { scale: [1, 1.12, 1], x: [0, -10, 0], y: [0, 8, 0] }}
                transition={reducedMotion ? undefined : { duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            />

            {/* Twinkling star field — sits between aurora pools and vignettes */}
            <StarField reducedMotion={reducedMotion} />

            {/* Top vignette */}
            <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-40 pointer-events-none"
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35), transparent)' }}
            />
            {/* Bottom vignette */}
            <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.30), transparent)' }}
            />

            {/* ══════════════════════════════════════════════════════════
                 CONTENT COLUMN
               ══════════════════════════════════════════════════════════ */}
            <div
                // Full height column; the hero between header & CTAs is flex-1
                // so the phone mockup gets whatever vertical space remains
                // without needing scroll. Every section sized to fit.
                className="relative z-10 mx-auto flex h-full w-full max-w-[420px] flex-col px-6"
                style={{
                    paddingTop: 'max(env(safe-area-inset-top), 14px)',
                    paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
                }}
            >
                {/* Logo lockup — heart glyph + LIOR wordmark + two breathing
                    partner dots. Reads as the brand mark, not a system pill. */}
                <div className="flex items-center justify-center">
                    <span
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            backdropFilter: 'blur(10px)',
                            WebkitBackdropFilter: 'blur(10px)',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
                        }}
                    >
                        {/* Production brand mark — the iOS-style rounded
                            square Lior app icon. Was previously clipped to
                            a circle which broke the recognizable shape;
                            now rendered at its natural radius. */}
                        <img
                            src="/icon-128.png"
                            alt=""
                            aria-hidden="true"
                            className="block"
                            style={{
                                width: 18,
                                height: 18,
                                borderRadius: 4.5,
                                boxShadow: '0 0 8px rgba(244,114,182,0.45)',
                            }}
                        />

                        <span
                            className="text-[10.5px] font-black"
                            style={{ letterSpacing: '0.36em', color: 'rgba(255,255,255,0.92)' }}
                        >
                            LIOR
                        </span>
                        {/* Two breathing partner dots — alternating phase */}
                        <span className="flex items-center gap-1 ml-0.5">
                            <motion.span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: palette.accentPink, boxShadow: `0 0 6px ${palette.accentPink}` }}
                                animate={reducedMotion ? undefined : { opacity: [0.45, 1, 0.45] }}
                                transition={reducedMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <motion.span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: palette.accentViolet, boxShadow: `0 0 6px ${palette.accentViolet}` }}
                                animate={reducedMotion ? undefined : { opacity: [0.45, 1, 0.45] }}
                                transition={reducedMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
                            />
                        </span>
                    </span>
                </div>

                {/* ── HERO SCENE — flex-1 fills available vertical space.
                    Decorations are layered BEHIND the phone so the big hero
                    illustrations (polaroid, wine glasses, etc.) peek out from
                    around the bezel like in the reference — they read as a
                    scrapbook page the phone sits on, not stickers stuck on
                    top of it. */}
                <div className="relative flex-1 flex flex-col items-center justify-center min-h-0 py-2">
                    <DecorationLayer reducedMotion={reducedMotion} />
                    <DriftLayer reducedMotion={reducedMotion} />
                    <div className="relative z-10">
                        <PhoneMockup reducedMotion={reducedMotion} />
                    </div>
                </div>

                {/* Headline — single editorial line. The eyebrow + subtitle
                    have been removed: the LIOR logo lockup at the top already
                    establishes the brand, and the headline itself is poetic
                    enough to stand alone without supporting copy. */}
                <motion.div
                    initial={reducedMotion ? undefined : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.30, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    className="relative z-10 text-center mt-1"
                >
                    <h1
                        className="font-serif mx-auto"
                        style={{
                            color: palette.textHi,
                            fontSize: 'clamp(24px, 6.6vw, 29px)',
                            fontWeight: 600,
                            lineHeight: 1.12,
                            letterSpacing: '-0.018em',
                            maxWidth: 320,
                        }}
                    >
                        A{' '}
                        <span
                            style={{
                                fontStyle: 'italic',
                                fontWeight: 500,
                                background: 'linear-gradient(180deg, #ffd4e4 0%, #f472b6 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                            }}
                        >
                            softer
                        </span>
                        {' '}place for two,<br />kept forever.
                    </h1>
                </motion.div>

                {/* CTAs — two stacked buttons. Primary is the bright white
                    pill (signup, the most common first-time intent); secondary
                    is the glass pill for returning users. Both open the same
                    form sheet but pre-set the segmented control to the right
                    mode so the user lands exactly where they expect. */}
                <motion.div
                    initial={reducedMotion ? undefined : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45, duration: 0.5 }}
                    className="relative z-10 mt-3 flex flex-col gap-2"
                >
                    {/* Primary — Continue with email (white) */}
                    <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openFormAs(true)}
                        className="flex w-full items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-bold"
                        style={{
                            background: '#ffffff',
                            color: '#1a0410',
                            boxShadow:
                                '0 20px 36px rgba(0,0,0,0.38), 0 4px 12px rgba(0,0,0,0.22), inset 0 1.5px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(0,0,0,0.06)',
                            letterSpacing: '0.01em',
                        }}
                    >
                        <Mail size={15} strokeWidth={2.3} />
                        Continue with email
                    </motion.button>

                    {/* Secondary — Sign in (glass) */}
                    <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openFormAs(false)}
                        className="flex w-full items-center justify-center py-3.5 rounded-2xl text-[13.5px] font-bold"
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            color: palette.textHi,
                            border: '1px solid rgba(255,255,255,0.16)',
                            backdropFilter: 'blur(14px)',
                            WebkitBackdropFilter: 'blur(14px)',
                            letterSpacing: '0.01em',
                        }}
                    >
                        I already have an account
                    </motion.button>
                </motion.div>

                {/* Footer — single compact line that includes Terms & Privacy.
                    The feature strip was removed because everything must fit
                    on a single mobile screen with no scroll. */}
                <div
                    className="relative z-10 mt-2 text-center text-[10.5px] leading-tight"
                    style={{ color: palette.textXLo }}
                >
                    By continuing you agree to our{' '}
                    <button
                        onClick={() => { feedback.tap(); onTerms?.(); }}
                        className="underline underline-offset-2"
                        style={{ color: palette.textMid }}
                    >
                        Terms
                    </button>
                    {' & '}
                    <button
                        onClick={() => { feedback.tap(); onPrivacyPolicy?.(); }}
                        className="underline underline-offset-2"
                        style={{ color: palette.textMid }}
                    >
                        Privacy
                    </button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════
                 FORM SHEET — slides up over the hero
               ══════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {mode === 'form' && (
                    <motion.div
                        key="auth-form-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.22 } }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-5"
                        style={{ background: 'rgba(8,2,8,0.72)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}
                        onClick={closeForm}
                    >
                        {/* Centered floating glass card — replaces the prior
                            bottom-sheet pattern. Reads as a premium product
                            modal, not a mobile form drawer. */}
                        <motion.div
                            initial={{ opacity: 0, y: 16, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.99, transition: { duration: 0.18 } }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            className="relative w-full max-w-[380px] overflow-hidden rounded-[1.75rem]"
                            style={{
                                // Quieter wine-glass. Less contrast top→bottom,
                                // softer border, gentler shadow. The card now
                                // reads as a calm surface, not a spotlit stage.
                                background:
                                    'linear-gradient(180deg, rgba(48,16,36,0.92) 0%, rgba(28,8,22,0.95) 100%)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                boxShadow:
                                    '0 22px 60px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.06)',
                                backdropFilter: 'blur(28px) saturate(135%)',
                                WebkitBackdropFilter: 'blur(28px) saturate(135%)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Single warm hairline at the top — was a 3-stop
                                neon rainbow strip. Now reads as light catching
                                the top edge of a glass surface. */}
                            <div
                                aria-hidden
                                className="h-px w-full"
                                style={{
                                    background:
                                        'linear-gradient(90deg, transparent 0%, rgba(244,114,182,0.55) 50%, transparent 100%)',
                                }}
                            />

                            {/* Close X — smaller, more recessed. Hidden during
                                password recovery: the user must finish setting a
                                new password before they can enter or dismiss. */}
                            {!recoveryMode && (
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    aria-label="Close"
                                    className="absolute top-3.5 right-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/8"
                                    style={{ color: 'rgba(255,232,242,0.55)' }}
                                >
                                    <X size={15} strokeWidth={2} />
                                </button>
                            )}

                            <div className="relative px-6 pt-8 pb-6">
                                {/* Title — smaller, lighter weight. Reads as
                                    a quiet headline, not a poster. */}
                                <h2
                                    className="font-serif"
                                    style={{
                                        color: '#f7e3eb',
                                        fontSize: 'clamp(23px, 5.6vw, 26px)',
                                        fontWeight: 500,
                                        lineHeight: 1.10,
                                        letterSpacing: '-0.012em',
                                    }}
                                >
                                    {sheetTitle}
                                </h2>
                                <p
                                    className="mt-1.5 text-[12.5px] leading-relaxed"
                                    style={{ color: 'rgba(255,232,242,0.50)' }}
                                >
                                    {sheetSubtitle}
                                </p>

                                {/* ── "Set a new password" panel ───────────
                                    Shown when the user arrived via a reset link
                                    (recovery session). Reuses the glass field +
                                    rose CTA primitives. Submitting calls
                                    updateUser({ password }) and only then enters
                                    the app. Takes priority over every other
                                    panel below. */}
                                {recoveryMode && (
                                    <>
                                        <div className="relative mt-4 space-y-2">
                                            <AnimatePresence mode="wait">
                                                {error && <DarkBanner tone="error" message={error} />}
                                                {!error && successMsg && <DarkBanner tone="success" message={successMsg} />}
                                            </AnimatePresence>
                                        </div>

                                        <div className="relative mt-5 space-y-2.5">
                                            <DarkField
                                                label="New password"
                                                type="password"
                                                value={newPassword}
                                                invalid={submitAttempted && (!newPassword || newPassword.length < 8)}
                                                hint={submitAttempted && (!newPassword || newPassword.length < 8) ? 'At least 8 characters.' : null}
                                                onFocus={() => feedback.tap()}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                autoComplete="new-password"
                                            />
                                            <DarkField
                                                label="Confirm new password"
                                                type="password"
                                                value={confirmPassword}
                                                invalid={submitAttempted && confirmPassword !== newPassword}
                                                hint={submitAttempted && confirmPassword !== newPassword ? 'Passwords do not match.' : null}
                                                onFocus={() => feedback.tap()}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                autoComplete="new-password"
                                            />
                                        </div>

                                        <motion.button
                                            whileTap={{ scale: 0.985 }}
                                            onClick={handleSetNewPassword}
                                            disabled={loading}
                                            className="relative mt-5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-[15px] text-[14px] font-semibold disabled:cursor-not-allowed"
                                            style={{
                                                background: loading
                                                    ? 'rgba(255,255,255,0.05)'
                                                    : 'linear-gradient(180deg, #d8527f 0%, #b73a68 100%)',
                                                color: loading ? 'rgba(255,232,242,0.40)' : '#fff5f8',
                                                boxShadow: loading
                                                    ? 'none'
                                                    : '0 8px 20px rgba(183,58,104,0.28), inset 0 1px 0 rgba(255,255,255,0.16)',
                                                opacity: loading ? 0.70 : 1,
                                                letterSpacing: '0.01em',
                                            }}
                                        >
                                            <span className="relative z-10 flex items-center gap-2">
                                                {loading && <Loader2 size={14} className="animate-spin" />}
                                                {loading ? 'Saving…' : 'Save new password'}
                                            </span>
                                        </motion.button>
                                    </>
                                )}

                                {/* ── "Check your email" panel ─────────────
                                    Shown after a sign-up that needs email
                                    confirmation (project setting). Replaces the
                                    form with the pending address + recovery
                                    actions: resend, open mail, start over.
                                    The app continues automatically once the
                                    link is tapped (onAuthStateChange SIGNED_IN
                                    listener + focus re-poll above). */}
                                {!recoveryMode && pendingConfirmEmail && (
                                    <div className="relative mt-5">
                                        <div
                                            className="rounded-2xl px-3.5 py-3 text-[12.5px]"
                                            style={{
                                                color: 'rgba(255,232,242,0.78)',
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                            }}
                                        >
                                            <div className="flex items-start gap-2.5">
                                                <Mail size={15} className="mt-0.5 shrink-0" style={{ color: 'rgba(255,210,230,0.72)' }} />
                                                <div className="leading-[1.55]">
                                                    We sent a confirmation link to{' '}
                                                    <strong style={{ color: '#f7e3eb', wordBreak: 'break-word' }}>{pendingConfirmEmail}</strong>.
                                                    Tap it to finish — you'll be brought in here automatically.
                                                </div>
                                            </div>
                                        </div>

                                        <div className="relative mt-3 space-y-2">
                                            <AnimatePresence mode="wait">
                                                {rateLimitSecs > 0 && (
                                                    <DarkBanner
                                                        tone="warning"
                                                        message={
                                                            <>Try again in <strong>{Math.floor(rateLimitSecs / 60)}:{String(rateLimitSecs % 60).padStart(2, '0')}</strong>.</>
                                                        }
                                                    />
                                                )}
                                                {!rateLimitSecs && error && <DarkBanner tone="error" message={error} />}
                                                {!rateLimitSecs && successMsg && <DarkBanner tone="success" message={successMsg} />}
                                            </AnimatePresence>
                                        </div>

                                        <motion.button
                                            whileTap={{ scale: 0.985 }}
                                            onClick={handleResendConfirm}
                                            disabled={loading || rateLimitSecs > 0 || resendCooldownSecs > 0}
                                            className="relative mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-[15px] text-[14px] font-semibold disabled:cursor-not-allowed"
                                            style={{
                                                background: loading || rateLimitSecs > 0 || resendCooldownSecs > 0
                                                    ? 'rgba(255,255,255,0.05)'
                                                    : 'linear-gradient(180deg, #d8527f 0%, #b73a68 100%)',
                                                color: loading || rateLimitSecs > 0 || resendCooldownSecs > 0 ? 'rgba(255,232,242,0.40)' : '#fff5f8',
                                                boxShadow:
                                                    loading || rateLimitSecs > 0 || resendCooldownSecs > 0
                                                        ? 'none'
                                                        : '0 8px 20px rgba(183,58,104,0.28), inset 0 1px 0 rgba(255,255,255,0.16)',
                                                opacity: loading || rateLimitSecs > 0 || resendCooldownSecs > 0 ? 0.70 : 1,
                                                letterSpacing: '0.01em',
                                            }}
                                        >
                                            <span className="relative z-10 flex items-center gap-2">
                                                {loading && <Loader2 size={14} className="animate-spin" />}
                                                {loading
                                                    ? 'Sending…'
                                                    : resendCooldownSecs > 0
                                                        ? `Resend in ${resendCooldownSecs}s`
                                                        : 'Resend email'}
                                            </span>
                                        </motion.button>

                                        <button
                                            type="button"
                                            onClick={handleOpenMail}
                                            className="relative mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl py-[13px] text-[13px] font-medium transition-colors hover:bg-white/5"
                                            style={{
                                                color: 'rgba(255,232,242,0.78)',
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                            }}
                                        >
                                            <Mail size={15} strokeWidth={1.9} />
                                            Open mail app
                                        </button>

                                        <div
                                            className="relative mt-5 flex items-center justify-center text-[11.5px]"
                                            style={{ color: 'rgba(255,232,242,0.42)' }}
                                        >
                                            Wrong address?
                                            <button
                                                onClick={handleUseDifferentEmail}
                                                className="ml-1.5 font-medium hover:opacity-80"
                                                style={{ color: 'rgba(255,210,230,0.85)' }}
                                            >
                                                Use a different email
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {!recoveryMode && !pendingConfirmEmail && (<>
                                {/* Google sign-in — calm white-glass button.
                                    Sits above email so social auth is the
                                    fastest path for anyone who has a Google
                                    account, with email/password underneath
                                    as the explicit alternative. */}
                                <motion.button
                                    whileTap={{ scale: 0.985 }}
                                    onClick={handleGoogle}
                                    disabled={loading || rateLimitSecs > 0}
                                    className="relative mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl py-[13px] text-[13.5px] font-medium disabled:cursor-not-allowed"
                                    style={{
                                        background: 'rgba(255,255,255,0.92)',
                                        color: '#1c0e16',
                                        boxShadow: '0 6px 16px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.85)',
                                        opacity: loading || rateLimitSecs > 0 ? 0.55 : 1,
                                        letterSpacing: '0.005em',
                                    }}
                                >
                                    <GoogleLogo size={16} />
                                    Continue with Google
                                </motion.button>

                                {/* "or" divider — two hairlines flanking a
                                    tiny lowercase "or" pill. Calm visual
                                    separator between social and email auth. */}
                                <div className="relative mt-4 flex items-center gap-3">
                                    <span className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.10)' }} />
                                    <span
                                        className="text-[10.5px] font-medium uppercase"
                                        style={{ color: 'rgba(255,232,242,0.35)', letterSpacing: '0.18em' }}
                                    >
                                        or
                                    </span>
                                    <span className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.10)' }} />
                                </div>

                                <div className="relative mt-4 space-y-2">
                                    <AnimatePresence mode="wait">
                                        {!isConfigured && (
                                            <DarkBanner
                                                tone="warning"
                                                message="Cloud sync is not configured yet. Set your Supabase URL and anon key first."
                                            />
                                        )}
                                        {rateLimitSecs > 0 && (
                                            <DarkBanner
                                                tone="warning"
                                                message={
                                                    <>Try again in <strong>{Math.floor(rateLimitSecs / 60)}:{String(rateLimitSecs % 60).padStart(2, '0')}</strong>.</>
                                                }
                                            />
                                        )}
                                        {!rateLimitSecs && error && <DarkBanner tone="error" message={error} />}
                                        {!rateLimitSecs && successMsg && <DarkBanner tone="success" message={successMsg} />}
                                    </AnimatePresence>
                                </div>

                                <div className="relative mt-5 space-y-2.5">
                                    <DarkField
                                        label="Email"
                                        type="email"
                                        value={email}
                                        invalid={emailInvalid}
                                        hint={emailInvalid ? 'Email is required.' : null}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="email"
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                    />
                                    {!isForgotPassword && (
                                        <DarkField
                                            label="Password"
                                            type="password"
                                            value={password}
                                            invalid={passwordInvalid}
                                            hint={passwordInvalid ? 'Password is required.' : null}
                                            onChange={(e) => setPassword(e.target.value)}
                                            autoComplete={isSignUp ? 'new-password' : 'current-password'}
                                        />
                                    )}
                                </div>

                                <div className="relative mt-2.5 flex items-center justify-end">
                                    {!isForgotPassword ? (
                                        !isSignUp && (
                                            <button
                                                onClick={() => { feedback.tap(); setIsForgotPassword(true); setSubmitAttempted(false); clearFeedback(); }}
                                                className="text-[11.5px] font-medium hover:opacity-80"
                                                style={{ color: 'rgba(255,210,230,0.72)' }}
                                            >
                                                Forgot password?
                                            </button>
                                        )
                                    ) : (
                                        <button
                                            onClick={() => { feedback.tap(); setIsForgotPassword(false); setSubmitAttempted(false); clearFeedback(); }}
                                            className="text-[11.5px] font-medium hover:opacity-80"
                                            style={{ color: 'rgba(255,210,230,0.72)' }}
                                        >
                                            Back to sign in
                                        </button>
                                    )}
                                </div>

                                {/* CTA — calmer rose tone, no neon glow.
                                    Single warm wash instead of a hot pink
                                    gradient, soft shadow rather than a halo. */}
                                <motion.button
                                    whileTap={{ scale: 0.985 }}
                                    onClick={isForgotPassword ? handleForgotPassword : handleAuth}
                                    disabled={loading || rateLimitSecs > 0}
                                    className="relative mt-5 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-[15px] text-[14px] font-semibold disabled:cursor-not-allowed"
                                    style={{
                                        background: loading || rateLimitSecs > 0
                                            ? 'rgba(255,255,255,0.05)'
                                            : 'linear-gradient(180deg, #d8527f 0%, #b73a68 100%)',
                                        color: loading || rateLimitSecs > 0 ? 'rgba(255,232,242,0.40)' : '#fff5f8',
                                        boxShadow:
                                            loading || rateLimitSecs > 0
                                                ? 'none'
                                                : '0 8px 20px rgba(183,58,104,0.28), inset 0 1px 0 rgba(255,255,255,0.16)',
                                        opacity: loading || rateLimitSecs > 0 ? 0.70 : 1,
                                        letterSpacing: '0.01em',
                                    }}
                                >
                                    <span className="relative z-10 flex items-center gap-2">
                                        {loading && <Loader2 size={14} className="animate-spin" />}
                                        {ctaLabel}
                                    </span>
                                </motion.button>

                                {/* Inline mode-swap — single quiet line.
                                    The trust caption and swap link have been
                                    merged into one row at the bottom so the
                                    card ends with a single small piece of
                                    secondary text, not two stacked rows. */}
                                {!isForgotPassword && (
                                    <div
                                        className="relative mt-5 flex items-center justify-center text-[11.5px]"
                                        style={{ color: 'rgba(255,232,242,0.42)' }}
                                    >
                                        {isSignUp ? 'Already have an account?' : 'New to Lior?'}
                                        <button
                                            onClick={() => { feedback.tap(); setIsSignUp(!isSignUp); setSubmitAttempted(false); clearFeedback(); }}
                                            className="ml-1.5 font-medium hover:opacity-80"
                                            style={{ color: 'rgba(255,210,230,0.85)' }}
                                        >
                                            {isSignUp ? 'Sign in' : 'Create one'}
                                        </button>
                                    </div>
                                )}
                                </>)}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
