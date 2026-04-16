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

const surfaceStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,250,248,0.54) 0%, rgba(247,241,243,0.82) 100%)',
    border: '1px solid rgba(255,255,255,0.24)',
    boxShadow: '0 14px 30px rgba(39,16,31,0.10), inset 0 1px 0 rgba(255,255,255,0.7)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
};

const fieldStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.58) 0%, rgba(255,248,250,0.44) 100%)',
    border: '1px solid rgba(111,76,95,0.08)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 14px rgba(58,24,44,0.04)',
};

const invalidFieldStyle: React.CSSProperties = {
    border: '1px solid rgba(191,104,127,0.20)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.68), 0 0 0 2px rgba(191,104,127,0.06)',
};

const toggleTrackStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.16)',
    border: '1px solid rgba(255,255,255,0.18)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
};

const buttonStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #bf5f79 0%, #a45169 58%, #823e4f 100%)',
    boxShadow: '0 10px 20px rgba(130,62,79,0.14), inset 0 1px 0 rgba(255,255,255,0.16)',
};

const StatusBanner = ({ tone, message }: { tone: 'error' | 'success' | 'warning'; message: React.ReactNode }) => {
    const tones = {
        error: { cls: 'border-red-100/60 bg-white/62 text-red-700', icon: <AlertCircle size={15} className="mt-0.5 shrink-0" /> },
        success: { cls: 'border-emerald-100/60 bg-white/62 text-emerald-700', icon: <Sparkles size={15} className="mt-0.5 shrink-0" /> },
        warning: { cls: 'border-orange-100/60 bg-white/62 text-orange-700', icon: <Lock size={15} className="mt-0.5 shrink-0" /> },
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
            <div className={`rounded-[0.95rem] border px-3.5 py-2.5 text-[11.5px] ${current.cls}`}>
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
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-secondary)' }}>
            {label}
        </span>
        <div
            className="rounded-[0.96rem] transition-all duration-300 focus-within:-translate-y-0.5 focus-within:ring-1 focus-within:ring-lior-500/12"
            style={invalid ? { ...fieldStyle, ...invalidFieldStyle } : fieldStyle}
        >
            <input
                {...props}
                aria-invalid={invalid || undefined}
                className="w-full bg-transparent px-4 py-[0.92rem] text-[15px] outline-none placeholder:opacity-34"
            />
        </div>
        {supportText && (
            <span className="mt-1.5 block text-[10.5px] leading-5" style={{ color: invalid ? '#b7657e' : 'var(--color-text-secondary)' }}>
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
        <div className="relative min-h-screen overflow-x-hidden overflow-y-auto" style={{ ...pageTextStyle, color: 'var(--color-text-primary)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #1c1219 0%, #3e333e 46%, #86707a 79%, #efe5dc 100%)' }} />
            <motion.div
                className="absolute left-1/2 top-[-7rem] h-[24rem] w-[24rem] -translate-x-1/2 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(255,242,234,0.22) 0%, rgba(246,201,216,0.08) 34%, transparent 66%)', filter: 'blur(74px)' }}
                animate={reducedMotion ? undefined : { scale: [1, 1.025, 1], opacity: [0.54, 0.72, 0.54] }}
                transition={reducedMotion ? undefined : { duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 108%, rgba(126,84,105,0.09) 0%, transparent 28%)' }} />

            <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[390px] flex-col px-5 md:max-w-[408px] md:py-5">
                <div
                    className="flex min-h-[100dvh] flex-col md:min-h-0"
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
                            style={{ background: 'radial-gradient(circle, rgba(255,243,236,0.22) 0%, rgba(247,208,220,0.05) 40%, transparent 72%)', filter: 'blur(20px)' }}
                        />
                    </div>

                    <motion.div
                        initial={reducedMotion ? undefined : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                        className="relative mt-auto flex-shrink-0 rounded-[1.72rem]"
                        style={{
                            ...surfaceStyle,
                            paddingTop: 'clamp(1.05rem, 2vh, 1.2rem)',
                            paddingBottom: 'clamp(1.05rem, 2vh, 1.2rem)',
                            paddingLeft: 'clamp(1.05rem, 3.8vw, 1.2rem)',
                            paddingRight: 'clamp(1.05rem, 3.8vw, 1.2rem)',
                        }}
                    >
                        <div className="mb-5">
                            {isForgotPassword && (
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-secondary)' }}>
                                    Recovery
                                </p>
                            )}
                            <h1
                                className={`${isForgotPassword ? 'mt-2' : ''} text-[1.82rem] font-bold leading-[1.04] tracking-[-0.03em]`}
                                style={{ color: 'var(--color-text-primary)' }}
                            >
                                {headline}
                            </h1>
                            <p className="mt-2 max-w-[14rem] text-[12.5px] leading-[1.62]" style={{ color: 'var(--color-text-secondary)' }}>
                                {subtitle}
                            </p>
                        </div>

                        {!isForgotPassword && (
                            <div className="mb-4 rounded-[0.98rem] p-1" style={toggleTrackStyle}>
                                <div className="grid grid-cols-2 gap-1">
                                    {(['login', 'signup'] as const).map((tab) => {
                                        const active = tab === (isSignUp ? 'signup' : 'login');
                                        return (
                                            <button
                                                key={tab}
                                                onClick={() => switchMode(tab)}
                                                className="relative rounded-[0.86rem] py-2.5 text-[11px] font-semibold"
                                                style={{ color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
                                            >
                                                {active && (
                                                    <motion.div
                                                        layoutId="auth-tab"
                                                        className="absolute inset-0 rounded-[0.86rem]"
                                                        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(255,246,248,0.68) 100%)', border: '1px solid rgba(255,255,255,0.52)', boxShadow: '0 6px 14px rgba(74,31,54,0.05)' }}
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

                        <div className="mb-4 space-y-2.5">
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

                        <div className="space-y-3.5">
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

                        <div className="mt-4 flex items-center justify-end">
                            {!isForgotPassword ? (
                                !isSignUp && (
                                    <button
                                        onClick={() => {
                                            feedback.tap();
                                            setIsForgotPassword(true);
                                            setSubmitAttempted(false);
                                            clearFeedback();
                                        }}
                                        className="text-[11px] font-medium transition-opacity hover:opacity-80"
                                        style={{ color: 'var(--color-nav-active)' }}
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
                                    className="text-[11px] font-medium transition-opacity hover:opacity-80"
                                    style={{ color: 'var(--color-nav-active)' }}
                                >
                                    Back to sign in
                                </button>
                            )}
                        </div>

                        <motion.button
                            whileTap={{ scale: 0.988 }}
                            onClick={isForgotPassword ? handleForgotPassword : handleAuth}
                            disabled={loading || rateLimitSecs > 0}
                            className="relative mt-5 flex w-full items-center justify-center overflow-hidden rounded-[1.02rem] py-3.5 text-[13.5px] font-semibold text-white disabled:opacity-40"
                            style={buttonStyle}
                        >
                            <div className="absolute inset-0 opacity-30" style={{ background: 'linear-gradient(120deg, rgba(255,255,255,0.12) 0%, transparent 44%, transparent 80%, rgba(255,224,205,0.08) 100%)' }} />
                            <span className="relative z-10 flex items-center gap-2">
                                {loading && <Loader2 size={16} className="animate-spin" />}
                                <span>{buttonLabel}</span>
                            </span>
                        </motion.button>

                        <div className="mt-4 flex items-center justify-center gap-2 text-[10.5px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                            <ShieldCheck size={13} />
                            Encrypted and private
                        </div>

                        <div className="mt-4 flex items-center justify-center gap-4 text-[10.5px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                            <button onClick={() => { feedback.tap(); onPrivacyPolicy?.(); }} className="transition-opacity hover:opacity-80">Privacy</button>
                            <span className="h-1 w-1 rounded-full bg-current opacity-20" />
                            <button onClick={() => { feedback.tap(); onTerms?.(); }} className="transition-opacity hover:opacity-80">Terms</button>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};
