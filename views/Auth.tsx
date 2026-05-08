import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { AlertCircle, Loader2, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { SupabaseService } from '../services/supabase';
import { feedback } from '../utils/feedback';

const getSupabaseAuthConfig = () => {
    const url = import.meta.env.VITE_SUPABASE_URL?.trim() || localStorage.getItem('lior_sb_url')?.trim() || '';
    const key = import.meta.env.VITE_SUPABASE_KEY?.trim() || localStorage.getItem('lior_sb_key')?.trim() || '';
    return {
        url,
        key,
        isConfigured: Boolean(url && key),
    };
};

async function authProxy(type: 'login' | 'signup' | 'reset', email: string, password?: string) {
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
            body: JSON.stringify({ type, email, password }),
        });

        let body: any = {};
        try {
            body = await res.json();
        } catch {
            return { error: 'Auth gateway unavailable.', status: res.status, proxyUnavailable: true };
        }

        return { ...body, status: res.status };
    } catch {
        return { error: 'Auth gateway unavailable.', status: 0, proxyUnavailable: true };
    }
}

async function directAuthFallback(type: 'login' | 'signup' | 'reset', email: string, password?: string) {
    const sb = SupabaseService.client;
    if (!sb) return { error: 'Supabase client is not configured.' };

    if (type === 'login') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: password ?? '' });
        return error ? { error: error.message } : { data };
    }

    if (type === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password: password ?? '' });
        return error ? { error: error.message } : { data };
    }

    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    return error ? { error: error.message } : { data: {} };
}

interface AuthProps {
    onLogin: () => void;
    onPrivacyPolicy?: () => void;
    onTerms?: () => void;
}

const pageTextStyle: React.CSSProperties = {
    fontFamily: '"Nunito Sans", sans-serif',
};

const authPalette = {
    textPrimary: '#2b1b22',
    textSecondary: '#6e5a62',
    textMuted: '#8c7780',
    footer: '#725c65',
    accent: '#a95470',
    accentDeep: '#7d3650',
    surfaceBorder: 'rgba(255,255,255,0.50)',
    surfaceEdge: 'rgba(255,255,255,0.42)',
    fieldBorder: 'rgba(96,68,80,0.13)',
    fieldBorderStrong: 'rgba(171,84,113,0.30)',
} as const;

const cardGlassFilter = 'url(#lior-auth-card-refraction) blur(18px) saturate(165%) brightness(1.05)';
const controlGlassFilter = 'url(#lior-auth-control-refraction) blur(12px) saturate(150%) brightness(1.04)';
const glassFallbackFilter = 'blur(18px) saturate(165%) brightness(1.05)';

const pageBackgroundStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background:
        'radial-gradient(circle at 50% -8%, rgba(255,244,232,0.62) 0%, rgba(255,210,224,0.23) 27%, transparent 54%), linear-gradient(180deg, #f7ecef 0%, #eadce3 39%, #d8c1cc 72%, #b998a7 100%)',
};

const opticalFieldStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    opacity: 0.72,
    background:
        'linear-gradient(118deg, transparent 0 22%, rgba(255,255,255,0.20) 22.4% 22.8%, transparent 23.3% 100%), linear-gradient(138deg, transparent 0 58%, rgba(255,255,255,0.14) 58.3% 58.7%, transparent 59.2% 100%), radial-gradient(ellipse at 50% 42%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.06) 32%, transparent 58%)',
};

const lowerVignetteStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    background:
        'linear-gradient(180deg, transparent 0%, transparent 54%, rgba(54,31,43,0.12) 100%), radial-gradient(circle at 50% 106%, rgba(80,46,64,0.16) 0%, transparent 31%)',
};

const surfaceStyle: React.CSSProperties = {
    background:
        'linear-gradient(145deg, rgba(255,255,255,0.32) 0%, rgba(255,247,249,0.20) 44%, rgba(255,255,255,0.14) 100%)',
    border: `1px solid ${authPalette.surfaceBorder}`,
    boxShadow:
        'inset 0 1.4px 0 rgba(255,255,255,0.78), inset 0 -1px 0 rgba(54,32,44,0.09), inset 1px 0 0 rgba(255,255,255,0.28), 0 24px 52px rgba(60,30,45,0.18), 0 7px 18px rgba(68,35,48,0.08)',
    backdropFilter: cardGlassFilter,
    WebkitBackdropFilter: glassFallbackFilter,
    isolation: 'isolate',
};

const surfaceInnerGlowStyle: React.CSSProperties = {
    background:
        'radial-gradient(ellipse at 18% 0%, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.18) 37%, transparent 61%), radial-gradient(ellipse at 86% 100%, rgba(242,199,213,0.18) 0%, transparent 48%), linear-gradient(135deg, rgba(255,255,255,0.18), transparent 38%, rgba(255,255,255,0.08))',
    border: `1px solid ${authPalette.surfaceEdge}`,
};

const surfaceRimStyle: React.CSSProperties = {
    background:
        'linear-gradient(135deg, rgba(255,255,255,0.88), rgba(255,255,255,0.12) 31%, transparent 56%), linear-gradient(315deg, rgba(82,48,64,0.12), transparent 28%)',
    maskImage: 'linear-gradient(#000, #000)',
    pointerEvents: 'none',
};

const surfaceHighlightStyle: React.CSSProperties = {
    background:
        'linear-gradient(96deg, transparent 0%, rgba(255,255,255,0.80) 18%, rgba(255,250,244,0.30) 31%, transparent 48%)',
    filter: 'blur(0.2px)',
};

const fieldStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.60) 0%, rgba(255,248,250,0.42) 100%)',
    border: `1px solid ${authPalette.fieldBorder}`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72), inset 0 -1px 0 rgba(72,43,56,0.04), 0 8px 16px rgba(56,24,40,0.045)',
    backdropFilter: controlGlassFilter,
    WebkitBackdropFilter: 'blur(12px) saturate(150%) brightness(1.04)',
};

const invalidFieldStyle: React.CSSProperties = {
    border: `1px solid ${authPalette.fieldBorderStrong}`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.88), 0 0 0 3px rgba(183,97,126,0.09), 0 10px 20px rgba(56,24,40,0.06)',
};

const toggleTrackStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.18)',
    border: '1px solid rgba(255,255,255,0.24)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.40), inset 0 -1px 0 rgba(76,43,57,0.06)',
    backdropFilter: controlGlassFilter,
    WebkitBackdropFilter: 'blur(12px) saturate(150%) brightness(1.04)',
};

const activeToggleStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.58) 0%, rgba(255,244,248,0.34) 100%)',
    border: '1px solid rgba(255,255,255,0.46)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72), 0 8px 16px rgba(61,31,46,0.07)',
    backdropFilter: controlGlassFilter,
    WebkitBackdropFilter: 'blur(12px) saturate(150%) brightness(1.04)',
};

const buttonStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(178,82,111,0.92) 0%, rgba(139,61,88,0.94) 52%, rgba(105,45,68,0.96) 100%)',
    border: '1px solid rgba(255,255,255,0.26)',
    boxShadow: 'inset 0 1.2px 0 rgba(255,255,255,0.34), inset 0 -1px 0 rgba(55,19,34,0.24), 0 16px 28px rgba(106,45,68,0.24), 0 5px 12px rgba(44,18,31,0.12)',
    backdropFilter: 'url(#lior-auth-control-refraction) blur(10px) saturate(145%)',
    WebkitBackdropFilter: 'blur(10px) saturate(145%)',
};

const LiquidGlassDefs = () => (
    <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true" focusable="false">
        <defs>
            <filter id="lior-auth-card-refraction" colorInterpolationFilters="sRGB" x="-18%" y="-18%" width="136%" height="136%">
                <feTurbulence type="fractalNoise" baseFrequency="0.010 0.018" numOctaves="1" seed="19" result="noise" />
                <feGaussianBlur in="noise" stdDeviation="1.35" result="softNoise" />
                <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="15" xChannelSelector="R" yChannelSelector="G" result="refracted" />
                <feColorMatrix in="refracted" type="saturate" values="1.08" result="saturated" />
                <feSpecularLighting in="softNoise" surfaceScale="7" specularConstant="0.34" specularExponent="22" lightingColor="#fff6ef" result="specular">
                    <fePointLight x="-90" y="-120" z="180" />
                </feSpecularLighting>
                <feComposite in="specular" in2="saturated" operator="in" result="rimLight" />
                <feBlend in="saturated" in2="rimLight" mode="screen" />
            </filter>
            <filter id="lior-auth-control-refraction" colorInterpolationFilters="sRGB" x="-14%" y="-14%" width="128%" height="128%">
                <feTurbulence type="fractalNoise" baseFrequency="0.018 0.030" numOctaves="1" seed="7" result="noise" />
                <feGaussianBlur in="noise" stdDeviation="0.9" result="softNoise" />
                <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="6" xChannelSelector="R" yChannelSelector="G" result="refracted" />
                <feColorMatrix in="refracted" type="saturate" values="1.04" />
            </filter>
        </defs>
    </svg>
);

const StatusBanner = ({ tone, message }: { tone: 'error' | 'success' | 'warning'; message: React.ReactNode }) => {
    const tones = {
        error: {
            style: {
                borderColor: 'rgba(191,95,122,0.18)',
                background: 'rgba(255,250,251,0.92)',
                color: '#8d3952',
                boxShadow: '0 8px 18px rgba(77,28,46,0.05)',
            },
            icon: <AlertCircle size={15} className="mt-0.5 shrink-0" />,
        },
        success: {
            style: {
                borderColor: 'rgba(80,141,116,0.18)',
                background: 'rgba(250,255,252,0.92)',
                color: '#2f6c56',
                boxShadow: '0 8px 18px rgba(34,76,59,0.05)',
            },
            icon: <Sparkles size={15} className="mt-0.5 shrink-0" />,
        },
        warning: {
            style: {
                borderColor: 'rgba(194,139,87,0.18)',
                background: 'rgba(255,251,246,0.92)',
                color: '#8b5a2d',
                boxShadow: '0 8px 18px rgba(87,56,27,0.05)',
            },
            icon: <Lock size={15} className="mt-0.5 shrink-0" />,
        },
    } as const;
    const current = tones[tone];

    return (
        <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }}
            className="overflow-hidden"
            style={pageTextStyle}
        >
            <div className="rounded-[1rem] border px-3.5 py-3 text-[12px] font-medium" style={current.style}>
                <div className="flex items-start gap-2.5">
                    {current.icon}
                    <div className="leading-[1.55]">{message}</div>
                </div>
            </div>
        </motion.div>
    );
};

type AuthFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    invalid?: boolean;
    supportText?: string | null;
};

const AuthField = ({ label, invalid, supportText, ...props }: AuthFieldProps) => (
    <label className="block" style={pageTextStyle}>
        <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: authPalette.textSecondary }}>
            {label}
        </span>
        <div
            className="relative overflow-hidden rounded-[0.94rem] transition-all duration-300 focus-within:-translate-y-px focus-within:ring-1 focus-within:ring-[rgba(160,84,112,0.32)] focus-within:shadow-[0_0_0_3px_rgba(160,84,112,0.075),0_10px_20px_rgba(66,24,43,0.07)]"
            style={invalid ? { ...fieldStyle, ...invalidFieldStyle } : fieldStyle}
        >
            <div
                className="pointer-events-none absolute inset-x-3 top-0 h-px opacity-80"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.78), transparent)' }}
            />
            <input
                {...props}
                aria-invalid={invalid || undefined}
                className="relative z-10 w-full bg-transparent px-[1rem] py-[0.94rem] text-[16px] font-medium tracking-[0.005em] outline-none placeholder:text-[#92737d] placeholder:opacity-80"
                style={{ color: authPalette.textPrimary, caretColor: authPalette.accent }}
            />
        </div>
        {supportText && (
            <span className="mt-1.5 block text-[10.5px] leading-5" style={{ color: invalid ? '#a95270' : authPalette.textMuted }}>
                {supportText}
            </span>
        )}
    </label>
);

export const Auth: React.FC<AuthProps> = ({ onLogin, onPrivacyPolicy, onTerms }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [rateLimitSecs, setRateLimitSecs] = useState(0);
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const reducedMotion = useReducedMotion();
    const { isConfigured } = getSupabaseAuthConfig();

    useEffect(() => {
        if (rateLimitSecs <= 0) return;
        const id = setInterval(() => {
            setRateLimitSecs((s) => {
                if (s <= 1) {
                    clearInterval(id);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [rateLimitSecs]);

    useEffect(() => {
        SupabaseService.init();
        if (SupabaseService.client) {
            const { data: { subscription } } = SupabaseService.client.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN' && session) onLogin();
            });
            return () => subscription.unsubscribe();
        }
    }, [onLogin]);

    const clearFeedback = () => {
        setError(null);
        setSuccessMsg(null);
    };

    const switchMode = (mode: 'login' | 'signup') => {
        feedback.tap();
        setIsForgotPassword(false);
        setIsSignUp(mode === 'signup');
        setSubmitAttempted(false);
        clearFeedback();
    };

    const trimmedEmail = email.trim();
    const emailInvalid = submitAttempted && !trimmedEmail;
    const passwordInvalid = submitAttempted && !isForgotPassword && !password;

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
            if (result.proxyUnavailable) result = { ...(await directAuthFallback('reset', trimmedEmail)), status: 200 };
            if (result.status === 429) setRateLimitSecs(result.retry_after_seconds ?? 600);
            else if (result.error) setError(result.error);
            else setSuccessMsg('Password reset email sent. Check your inbox.');
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
            if (result.proxyUnavailable) result = { ...(await directAuthFallback(isSignUp ? 'signup' : 'login', trimmedEmail, password)), status: 200 };
            if (result.status === 429) setRateLimitSecs(result.retry_after_seconds ?? 600);
            else if (result.error) {
                setError(result.error);
                feedback.error();
            } else if (isSignUp && !result.data?.session) {
                setSuccessMsg('Confirmation email sent. Check your inbox and spam folder.');
            } else {
                const sb = SupabaseService.client;
                if (sb && result.data?.session) await sb.auth.setSession(result.data.session);
                onLogin();
            }
        } catch {
            setError('Network error. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const headline = isForgotPassword ? 'Reset password' : isSignUp ? 'Create your space' : 'Welcome back';
    const subtitle = isForgotPassword
        ? 'We will send a reset link.'
        : isSignUp
            ? 'Begin a softer place for two.'
            : 'Enter your private space.';

    const buttonLabel = loading
        ? isForgotPassword
            ? 'Sending...'
            : isSignUp
                ? 'Creating...'
                : 'Entering...'
        : isForgotPassword
            ? 'Send reset link'
            : isSignUp
                ? 'Create my space'
                : 'Enter Lior';

    return (
        <div className="relative min-h-[100dvh] overflow-x-hidden overflow-y-auto" style={{ ...pageTextStyle, color: authPalette.textPrimary, background: '#eadce3' }}>
            <LiquidGlassDefs />
            <div style={pageBackgroundStyle} />
            <div style={opticalFieldStyle} />
            <motion.div
                className="absolute left-1/2 top-[-8.5rem] h-[25rem] w-[25rem] -translate-x-1/2 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(255,250,240,0.70) 0%, rgba(255,214,226,0.20) 38%, transparent 67%)', filter: 'blur(42px)' }}
                animate={reducedMotion ? undefined : { scale: [1, 1.018, 1], opacity: [0.72, 0.88, 0.72] }}
                transition={reducedMotion ? undefined : { duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div style={lowerVignetteStyle} />

            <div
                className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[380px] flex-col justify-center px-5 md:max-w-[392px] md:py-5"
                style={{
                    paddingTop: 'max(env(safe-area-inset-top), clamp(1.15rem, 2.7vh, 1.55rem))',
                    paddingBottom: 'max(env(safe-area-inset-bottom), clamp(1rem, 2.6vh, 1.3rem))',
                }}
            >
                <div className="flex-shrink-0 pt-1 pb-4 text-center">
                    <span className="text-[10.5px] font-bold tracking-[0.42em]" style={{ color: 'rgba(71,45,57,0.78)' }}>
                        LIOR
                    </span>
                </div>

                <div
                    className="pointer-events-none relative flex items-start justify-center"
                    style={{ height: 'clamp(2rem, 5vh, 3.5rem)' }}
                >
                    <div
                        className="absolute top-[8%] h-[8rem] w-[14rem] rounded-full"
                        style={{ background: 'radial-gradient(ellipse, rgba(255,255,255,0.28) 0%, rgba(255,236,240,0.10) 46%, transparent 74%)', filter: 'blur(22px)' }}
                    />
                </div>

                <motion.div
                    initial={reducedMotion ? undefined : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                    className="relative flex-shrink-0 overflow-hidden rounded-[1.48rem]"
                    style={{
                        ...surfaceStyle,
                        paddingTop: 'clamp(1.08rem, 2vh, 1.26rem)',
                        paddingBottom: 'clamp(1.1rem, 2vh, 1.28rem)',
                        paddingLeft: 'clamp(1.06rem, 3.8vw, 1.24rem)',
                        paddingRight: 'clamp(1.06rem, 3.8vw, 1.24rem)',
                    }}
                >
                        <div className="pointer-events-none absolute inset-[1px] rounded-[1.39rem]" style={surfaceInnerGlowStyle} />
                        <div className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-80" style={surfaceRimStyle} />
                        <div className="pointer-events-none absolute left-[12%] right-[12%] top-px h-px opacity-90" style={surfaceHighlightStyle} />

                        <div className="relative z-10 mb-[1.04rem]">
                            {isForgotPassword && (
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: authPalette.textSecondary }}>
                                    Recovery
                                </p>
                            )}
                            <h1
                                className={`${isForgotPassword ? 'mt-2.5' : ''} text-[1.82rem] font-bold leading-[1.02] tracking-[-0.045em]`}
                                style={{ color: authPalette.textPrimary }}
                            >
                                {headline}
                            </h1>
                            <p className="mt-2.5 max-w-[15.25rem] text-[13px] leading-[1.54]" style={{ color: authPalette.textSecondary }}>
                                {subtitle}
                            </p>
                        </div>

                        {!isForgotPassword && (
                            <div className="relative z-10 mb-3.5 rounded-[0.94rem] p-[0.22rem]" style={toggleTrackStyle}>
                                <div className="grid grid-cols-2 gap-[0.22rem]">
                                    {(['login', 'signup'] as const).map((tab) => {
                                        const active = tab === (isSignUp ? 'signup' : 'login');
                                        return (
                                            <button
                                                key={tab}
                                                onClick={() => switchMode(tab)}
                                                className="relative rounded-[0.78rem] px-3 py-2.5 text-[11.5px] font-bold tracking-[0.005em] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(160,84,112,0.16)]"
                                                style={{ color: active ? authPalette.textPrimary : authPalette.textMuted }}
                                            >
                                                {active && (
                                                    <motion.div
                                                        layoutId="auth-tab"
                                                        className="absolute inset-0 rounded-[0.78rem]"
                                                        style={activeToggleStyle}
                                                        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                                                    />
                                                )}
                                                <span className="relative z-10">{tab === 'login' ? 'Sign in' : 'Sign up'}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="relative z-10 mb-3.5 space-y-2.5">
                            <AnimatePresence mode="wait">
                                {!isConfigured && (
                                    <StatusBanner
                                        tone="warning"
                                        message="Cloud sync is not configured yet. Add your Supabase URL and anon key through the setup flow or environment variables before signing in."
                                    />
                                )}
                                {rateLimitSecs > 0 && <StatusBanner tone="warning" message={<>Try again in <strong>{Math.floor(rateLimitSecs / 60)}:{String(rateLimitSecs % 60).padStart(2, '0')}</strong>.</>} />}
                                {!rateLimitSecs && error && <StatusBanner tone="error" message={error} />}
                                {!rateLimitSecs && successMsg && <StatusBanner tone="success" message={successMsg} />}
                            </AnimatePresence>
                        </div>

                        <div className="relative z-10 space-y-[0.8125rem]">
                            <AuthField
                                label="Email"
                                type="email"
                                value={email}
                                invalid={emailInvalid}
                                supportText={emailInvalid ? 'Email is required.' : null}
                                onFocus={() => feedback.tap()}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                autoComplete="email"
                                autoCapitalize="none"
                                autoCorrect="off"
                            />
                            {!isForgotPassword && (
                                <AuthField
                                    label="Password"
                                    type="password"
                                    value={password}
                                    invalid={passwordInvalid}
                                    supportText={passwordInvalid ? 'Password is required.' : null}
                                    onFocus={() => feedback.tap()}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={isSignUp ? 'Create a secure password' : 'Enter your password'}
                                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                                />
                            )}
                        </div>

                        <div className="relative z-10 mt-3.5 flex items-center justify-end">
                            {!isForgotPassword ? (
                                !isSignUp && (
                                    <button
                                        onClick={() => {
                                            feedback.tap();
                                            setIsForgotPassword(true);
                                            setSubmitAttempted(false);
                                            clearFeedback();
                                        }}
                                        className="text-[11.5px] font-bold tracking-[0.005em] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(160,84,112,0.14)]"
                                        style={{ color: authPalette.accentDeep }}
                                    >
                                        Forgot password?
                                    </button>
                                )
                            ) : (
                                <button
                                    onClick={() => {
                                        feedback.tap();
                                        setIsForgotPassword(false);
                                        setSubmitAttempted(false);
                                        clearFeedback();
                                    }}
                                    className="text-[11.5px] font-bold tracking-[0.005em] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(160,84,112,0.14)]"
                                    style={{ color: authPalette.accentDeep }}
                                >
                                    Back to sign in
                                </button>
                            )}
                        </div>

                        <motion.button
                            whileTap={{ scale: 0.988 }}
                            onClick={isForgotPassword ? handleForgotPassword : handleAuth}
                            disabled={loading || rateLimitSecs > 0}
                            className="relative z-10 mt-[1.125rem] flex w-full items-center justify-center overflow-hidden rounded-[0.98rem] py-[0.96rem] text-[14px] font-bold tracking-[0.005em] text-white disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(160,84,112,0.18)]"
                            style={buttonStyle}
                        >
                            <div className="absolute inset-0 opacity-55" style={{ background: 'radial-gradient(ellipse at 24% 0%, rgba(255,255,255,0.44) 0%, transparent 44%), linear-gradient(120deg, rgba(255,255,255,0.18) 0%, transparent 42%, rgba(255,226,236,0.10) 100%)' }} />
                            <div className="absolute left-[11%] right-[11%] top-0 h-px opacity-80" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.86), transparent)' }} />
                            <span className="relative z-10 flex items-center gap-2">
                                {loading && <Loader2 size={16} className="animate-spin" />}
                                <span>{buttonLabel}</span>
                            </span>
                        </motion.button>

                        <div className="relative z-10 mt-4 border-t pt-3.5" style={{ borderColor: 'rgba(255,255,255,0.24)' }}>
                            <div className="flex items-center justify-center gap-2 text-[11px] font-semibold tracking-[0.01em]" style={{ color: authPalette.footer }}>
                                <ShieldCheck size={13} />
                                Encrypted and private
                            </div>

                            <div className="mt-3 flex items-center justify-center gap-4 text-[11px] font-medium" style={{ color: authPalette.textSecondary }}>
                                <button
                                    onClick={() => { feedback.tap(); onPrivacyPolicy?.(); }}
                                    className="transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(183,97,126,0.14)]"
                                >
                                    Privacy
                                </button>
                                <span className="h-1 w-1 rounded-full bg-current opacity-30" />
                                <button
                                    onClick={() => { feedback.tap(); onTerms?.(); }}
                                    className="transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(183,97,126,0.14)]"
                                >
                                    Terms
                                </button>
                            </div>
                        </div>
                </motion.div>
            </div>
        </div>
    );
};
