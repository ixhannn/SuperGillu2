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
    textPrimary: '#2d1a22',
    textSecondary: '#6d545e',
    textMuted: '#8b717b',
    footer: '#775d67',
    accent: '#b7607d',
    accentDeep: '#7c334d',
    surfaceBorder: 'rgba(255,255,255,0.46)',
    surfaceEdge: 'rgba(104,72,86,0.12)',
    fieldBorder: 'rgba(97,68,82,0.14)',
    fieldBorderStrong: 'rgba(183,97,126,0.28)',
} as const;

const surfaceStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,252,250,0.84) 0%, rgba(247,239,243,0.94) 100%)',
    border: `1px solid ${authPalette.surfaceBorder}`,
    boxShadow: '0 24px 64px rgba(28,11,20,0.24), 0 12px 28px rgba(28,11,20,0.12), inset 0 1px 0 rgba(255,255,255,0.76)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
};

const surfaceInnerGlowStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.46) 0%, rgba(255,255,255,0.08) 36%, rgba(255,238,243,0.14) 100%)',
    border: `1px solid ${authPalette.surfaceEdge}`,
};

const fieldStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(252,245,248,0.96) 100%)',
    border: `1px solid ${authPalette.fieldBorder}`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.92), 0 10px 20px rgba(56,24,40,0.06)',
};

const invalidFieldStyle: React.CSSProperties = {
    border: `1px solid ${authPalette.fieldBorderStrong}`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.88), 0 0 0 3px rgba(183,97,126,0.09), 0 10px 20px rgba(56,24,40,0.06)',
};

const toggleTrackStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(148,106,124,0.10) 0%, rgba(255,255,255,0.44) 100%)',
    border: '1px solid rgba(105,74,89,0.10)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.56), inset 0 -1px 0 rgba(255,255,255,0.22)',
};

const activeToggleStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,246,249,0.88) 100%)',
    border: '1px solid rgba(133,95,111,0.16)',
    boxShadow: '0 10px 18px rgba(69,28,46,0.10), inset 0 1px 0 rgba(255,255,255,0.96)',
};

const buttonStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #c26886 0%, #a24869 56%, #7c334d 100%)',
    border: '1px solid rgba(112,41,67,0.24)',
    boxShadow: '0 18px 32px rgba(124,51,77,0.24), 0 8px 18px rgba(39,15,25,0.14), inset 0 1px 0 rgba(255,255,255,0.24)',
};

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
        <span className="mb-2 block text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: authPalette.textSecondary }}>
            {label}
        </span>
        <div
            className="rounded-[1rem] transition-all duration-300 focus-within:-translate-y-px focus-within:ring-1 focus-within:ring-[rgba(198,120,148,0.32)] focus-within:shadow-[0_0_0_4px_rgba(190,110,136,0.10),0_12px_24px_rgba(66,24,43,0.08)]"
            style={invalid ? { ...fieldStyle, ...invalidFieldStyle } : fieldStyle}
        >
            <input
                {...props}
                aria-invalid={invalid || undefined}
                className="w-full bg-transparent px-[1.05rem] py-[0.98rem] text-[16px] font-medium tracking-[0.01em] outline-none placeholder:text-[#92737d] placeholder:opacity-100"
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
        <div className="relative min-h-screen overflow-x-hidden overflow-y-auto" style={{ ...pageTextStyle, color: authPalette.textPrimary }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #1d1319 0%, #4a333f 43%, #9d7f8a 78%, #f4ebe6 100%)' }} />
            <motion.div
                className="absolute left-1/2 top-[-7rem] h-[24rem] w-[24rem] -translate-x-1/2 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(255,243,236,0.24) 0%, rgba(246,201,216,0.10) 34%, transparent 66%)', filter: 'blur(68px)' }}
                animate={reducedMotion ? undefined : { scale: [1, 1.025, 1], opacity: [0.54, 0.72, 0.54] }}
                transition={reducedMotion ? undefined : { duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 108%, rgba(126,84,105,0.12) 0%, transparent 28%)' }} />

            <div
                className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[390px] flex-col px-5 md:max-w-[408px] md:py-5"
                style={{
                    paddingTop: 'max(env(safe-area-inset-top), clamp(1.35rem, 3.2vh, 1.8rem))',
                    paddingBottom: 'max(env(safe-area-inset-bottom), clamp(1rem, 2.6vh, 1.3rem))',
                }}
            >
                <div className="flex-shrink-0 pt-1 text-center">
                    <span className="text-[11px] font-semibold tracking-[0.38em] text-white/84">LIOR</span>
                </div>

                <div
                    className="pointer-events-none relative flex flex-1 items-start justify-center"
                    style={{ minHeight: 'clamp(6.4rem, 15vh, 9rem)', maxHeight: 'clamp(8rem, 18vh, 10rem)' }}
                >
                    <div
                        className="absolute top-[8%] h-[11.75rem] w-[11.75rem] rounded-full"
                        style={{ background: 'radial-gradient(circle, rgba(255,243,236,0.24) 0%, rgba(247,208,220,0.07) 40%, transparent 72%)', filter: 'blur(18px)' }}
                    />
                </div>

                <motion.div
                    initial={reducedMotion ? undefined : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                    className="relative flex-shrink-0 overflow-hidden rounded-[1.72rem]"
                    style={{
                        ...surfaceStyle,
                        paddingTop: 'clamp(1.2rem, 2.2vh, 1.38rem)',
                        paddingBottom: 'clamp(1.2rem, 2.2vh, 1.38rem)',
                        paddingLeft: 'clamp(1.16rem, 4vw, 1.34rem)',
                        paddingRight: 'clamp(1.16rem, 4vw, 1.34rem)',
                    }}
                >
                        <div className="pointer-events-none absolute inset-[1px] rounded-[1.6rem]" style={surfaceInnerGlowStyle} />

                        <div className="relative z-10 mb-[1.15rem]">
                            {isForgotPassword && (
                                <p className="text-[10.5px] font-bold uppercase tracking-[0.18em]" style={{ color: authPalette.textSecondary }}>
                                    Recovery
                                </p>
                            )}
                            <h1
                                className={`${isForgotPassword ? 'mt-2.5' : ''} text-[2.02rem] font-semibold leading-[0.98] tracking-[-0.038em]`}
                                style={{ color: authPalette.textPrimary, fontFamily: '"Lora", serif' }}
                            >
                                {headline}
                            </h1>
                            <p className="mt-3 max-w-[15.25rem] text-[13.25px] leading-[1.58]" style={{ color: authPalette.textSecondary }}>
                                {subtitle}
                            </p>
                        </div>

                        {!isForgotPassword && (
                            <div className="relative z-10 mb-4 rounded-[1rem] p-[0.24rem]" style={toggleTrackStyle}>
                                <div className="grid grid-cols-2 gap-[0.22rem]">
                                    {(['login', 'signup'] as const).map((tab) => {
                                        const active = tab === (isSignUp ? 'signup' : 'login');
                                        return (
                                            <button
                                                key={tab}
                                                onClick={() => switchMode(tab)}
                                                className="relative rounded-[0.9rem] px-3 py-2.5 text-[11.5px] font-semibold tracking-[0.01em] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(183,97,126,0.18)]"
                                                style={{ color: active ? authPalette.textPrimary : authPalette.textMuted }}
                                            >
                                                {active && (
                                                    <motion.div
                                                        layoutId="auth-tab"
                                                        className="absolute inset-0 rounded-[0.9rem]"
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

                        <div className="relative z-10 mb-4 space-y-2.5">
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

                        <div className="relative z-10 space-y-3.5">
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

                        <div className="relative z-10 mt-4 flex items-center justify-end">
                            {!isForgotPassword ? (
                                !isSignUp && (
                                    <button
                                        onClick={() => {
                                            feedback.tap();
                                            setIsForgotPassword(true);
                                            setSubmitAttempted(false);
                                            clearFeedback();
                                        }}
                                        className="text-[11.5px] font-semibold tracking-[0.01em] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(183,97,126,0.16)]"
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
                                    className="text-[11.5px] font-semibold tracking-[0.01em] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(183,97,126,0.16)]"
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
                            className="relative z-10 mt-5 flex w-full items-center justify-center overflow-hidden rounded-[1.06rem] py-[0.98rem] text-[14px] font-semibold tracking-[0.01em] text-white disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(191,106,135,0.20)]"
                            style={buttonStyle}
                        >
                            <div className="absolute inset-0 opacity-40" style={{ background: 'linear-gradient(120deg, rgba(255,255,255,0.18) 0%, transparent 44%, transparent 80%, rgba(255,224,205,0.10) 100%)' }} />
                            <span className="relative z-10 flex items-center gap-2">
                                {loading && <Loader2 size={16} className="animate-spin" />}
                                <span>{buttonLabel}</span>
                            </span>
                        </motion.button>

                        <div className="relative z-10 mt-4 border-t pt-4" style={{ borderColor: 'rgba(111,78,94,0.14)' }}>
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
