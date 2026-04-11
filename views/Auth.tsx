
import React, { useState, useEffect } from 'react';
import { Heart, ArrowRight, Loader2, AlertCircle, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SupabaseService } from '../services/supabase';
import { feedback } from '../utils/feedback';

// ── Auth Proxy ──────────────────────────────────────────────────────────────
// All auth calls go through the Edge Function, which enforces rate limits
// server-side (by IP + email) before touching Supabase Auth.
// A 429 response includes retry_after_seconds so the UI can show a countdown.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ||
    localStorage.getItem('lior_sb_url') ||
    'https://zogdcuapmnbltdvqsrga.supabase.co';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_KEY?.trim() ||
    localStorage.getItem('lior_sb_key') ||
    'sb_publishable_KRRnxuRIWdlgHbn_g65dfQ_Mzzg5Vjl';

async function authProxy(
    type: 'login' | 'signup' | 'reset',
    email: string,
    password?: string,
): Promise<{ data?: any; error?: string; retry_after_seconds?: number; status: number; proxyUnavailable?: boolean }> {
    try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ type, email, password }),
        });

        let body: any = {};
        try {
            body = await res.json();
        } catch {
            return {
                error: 'Auth gateway unavailable.',
                status: res.status,
                proxyUnavailable: true,
            };
        }

        return { ...body, status: res.status };
    } catch {
        return {
            error: 'Auth gateway unavailable.',
            status: 0,
            proxyUnavailable: true,
        };
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

    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
    });
    return error ? { error: error.message } : { data: {} };
}

interface AuthProps {
    onLogin: () => void;
    onPrivacyPolicy?: () => void;
    onTerms?: () => void;
}

const AuthBackground = () => (
    <>
        <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'var(--theme-bg-main)' }} />
        <div
            className="absolute -top-[10%] -right-[5%] w-[400px] h-[400px] rounded-full pointer-events-none animate-morph-blob opacity-60"
            style={{ background: 'var(--theme-orb-1)', filter: 'blur(80px)' }}
        />
        <div
            className="absolute -bottom-[5%] -left-[5%] w-[350px] h-[350px] rounded-full pointer-events-none animate-morph-blob opacity-40"
            style={{ background: 'var(--theme-orb-2)', filter: 'blur(80px)', animationDelay: '6s' }}
        />
    </>
);

const glassInput: React.CSSProperties = {
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1.5px solid rgba(255,255,255,0.95)',
    color: 'var(--color-text-primary)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 1px 6px rgba(var(--theme-particle-1-rgb),0.04)',
};

const primaryBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg, var(--color-pink-primary) 0%, var(--color-pink-deep) 100%)',
    boxShadow: '0 12px 32px rgba(var(--color-pink-primary-rgb), 0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
    borderRadius: 'var(--radius-lg)',
};


export const Auth: React.FC<AuthProps> = ({ onLogin, onPrivacyPolicy, onTerms }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [rateLimitSecs, setRateLimitSecs] = useState(0);

    // Countdown ticker — driven by server 429 retry_after_seconds
    useEffect(() => {
        if (rateLimitSecs <= 0) return;
        const id = setInterval(() => {
            setRateLimitSecs(s => {
                if (s <= 1) { clearInterval(id); return 0; }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [rateLimitSecs]);

    useEffect(() => {
        SupabaseService.init();
        if (SupabaseService.client) {
            const { data: { subscription } } = SupabaseService.client.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN' && session) {
                    onLogin();
                }
            });
            return () => subscription.unsubscribe();
        }
    }, [onLogin]);

    const handleForgotPassword = async () => {
        if (!email) { setError('Enter your email address first.'); return; }
        feedback.tap();
        setLoading(true);
        setError(null);
        setSuccessMsg(null);
        try {
            let result = await authProxy('reset', email);
            if (result.proxyUnavailable) {
                result = { ...(await directAuthFallback('reset', email)), status: 200 };
            }
            if (result.status === 429) {
                setRateLimitSecs(result.retry_after_seconds ?? 600);
            } else if (result.error) {
                setError(result.error);
            } else {
                setSuccessMsg('Password reset email sent! Check your inbox.');
            }
        } catch {
            setError('Network error. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const handleAuth = async () => {
        if (!email || !password) return;
        feedback.tap();
        setLoading(true);
        setError(null);
        try {
            let result = await authProxy(isSignUp ? 'signup' : 'login', email, password);
            if (result.proxyUnavailable) {
                result = { ...(await directAuthFallback(isSignUp ? 'signup' : 'login', email, password)), status: 200 };
            }
            if (result.status === 429) {
                setRateLimitSecs(result.retry_after_seconds ?? 600);
            } else if (result.error) {
                setError(result.error);
                feedback.error();
            } else if (isSignUp && !result.data?.session) {
                setError('Confirmation email sent! Check your inbox (and spam).');
            } else {
                const sb = SupabaseService.client;
                if (sb && result.data?.session) {
                    await sb.auth.setSession(result.data.session);
                }
                onLogin();
            }
        } catch {
            setError('Network error. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const InfoBanner = ({ msg }: { msg: string }) => (
        <motion.div
            key="success"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden mb-5"
        >
            <div className="bg-green-50/90 text-green-700 p-4 rounded-2xl text-[13px] font-medium leading-relaxed flex items-start gap-3 border border-green-100 items-center">
                <div className="flex-1">{msg}</div>
            </div>
        </motion.div>
    );

    const ErrorBanner = ({ msg }: { msg: string }) => (
        <motion.div
            key="error"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden mb-5"
        >
            <div className="bg-red-50/95 text-red-600 p-4 rounded-2xl text-[13px] font-medium leading-relaxed flex items-start gap-3 border border-red-100">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                    {msg}
                </div>
            </div>
        </motion.div>
    );

    return (
        <div className="min-h-screen flex flex-col items-center pt-[10vh] pb-10 px-6 relative overflow-y-auto no-scrollbar"
            style={{ color: 'var(--color-text-primary)' }}>
            <AuthBackground />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                className="relative z-10 w-full max-w-sm"
            >
                <div className="glass-card shadow-float overflow-hidden relative" style={{ borderRadius: 'var(--radius-xl)' }}>
                    {/* Soft gradient wash */}
                    <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-lior-500/10 to-transparent pointer-events-none" />

                    <div className="p-8 pb-6 relative">
                        {/* Brand mark */}
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0, y: 12 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            transition={{ delay: 0.1, type: 'spring', stiffness: 450, damping: 22 }}
                            className="flex flex-col items-center mb-10"
                        >
                            <div
                                className="flex items-center justify-center mb-5 animate-breathe shadow-lg"
                                style={{
                                    width: '4.5rem',
                                    height: '4.5rem',
                                    borderRadius: '1.25rem',
                                    background: 'linear-gradient(135deg, var(--color-pink-primary) 0%, var(--color-pink-deep) 100%)',
                                    boxShadow: '0 12px 32px rgba(var(--color-pink-primary-rgb),0.3), inset 0 1px 0 rgba(255,255,255,0.4)',
                                }}
                            >
                                <Heart size={32} fill="white" className="text-white" />
                            </div>

                            <h1 className="text-3xl font-serif font-bold tracking-tight leading-none mb-2"
                                style={{ color: 'var(--color-text-primary)' }}>
                                Super Gillu
                            </h1>
                            <p className="text-[14px] font-medium tracking-wide uppercase opacity-60" style={{ color: 'var(--color-text-secondary)' }}>
                                Moments that matter
                            </p>
                        </motion.div>

                        {/* Navigation Tabs */}
                        {!isForgotPassword && (
                            <div
                                className="flex items-center p-1.5 bg-white/40 backdrop-blur-md rounded-2xl mb-6 border border-white/60 shadow-sm"
                            >
                                {(['login', 'signup'] as const).map(tab => {
                                    const active = tab === (isSignUp ? 'signup' : 'login');
                                    return (
                                        <button
                                            key={tab}
                                            onClick={() => { feedback.tap(); setIsSignUp(tab === 'signup'); setError(null); setSuccessMsg(null); }}
                                            className="flex-1 py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all spring-press relative"
                                            style={{
                                                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                            }}
                                        >
                                            {active && (
                                                <motion.div 
                                                    layoutId="auth-tab" 
                                                    className="absolute inset-0 bg-white rounded-xl shadow-md border border-white/80"
                                                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                                                />
                                            )}
                                            <span className="relative z-10">{tab === 'login' ? 'Log In' : 'Sign Up'}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {isForgotPassword && (
                            <div className="mb-6">
                                <p className="text-[15px] text-center font-medium leading-relaxed px-4" style={{ color: 'var(--color-text-secondary)' }}>
                                    We'll send a magic link to your email to get you back in.
                                </p>
                            </div>
                        )}

                        <AnimatePresence mode="wait">
                            {rateLimitSecs > 0 && (
                                <motion.div
                                    key="ratelimit"
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mb-5 p-4 bg-orange-50 border border-orange-100 rounded-2xl text-[13px] text-orange-700 flex flex-col items-center gap-2"
                                >
                                    <Lock size={18} className="text-orange-400" />
                                    <p className="font-bold uppercase tracking-widest text-[10px]">Security Lock</p>
                                    <p>Try again in <strong>{Math.floor(rateLimitSecs / 60)}:{String(rateLimitSecs % 60).padStart(2, '0')}</strong></p>
                                </motion.div>
                            )}
                            {!rateLimitSecs && error && <ErrorBanner msg={error} />}
                            {!rateLimitSecs && successMsg && <InfoBanner msg={successMsg} />}
                        </AnimatePresence>

                        <div className="space-y-4">
                            <input
                                type="email"
                                value={email}
                                onFocus={() => feedback.tap()}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="Email address"
                                autoComplete="email"
                                className="w-full py-4.5 px-6 outline-none transition-all placeholder:opacity-40"
                                style={glassInput}
                            />
                            {!isForgotPassword && (
                                <input
                                    type="password"
                                    value={password}
                                    onFocus={() => feedback.tap()}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Password"
                                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                                    className="w-full py-4.5 px-6 outline-none transition-all placeholder:opacity-40"
                                    style={glassInput}
                                />
                            )}
                        </div>

                        {!isForgotPassword && !isSignUp && (
                            <div className="flex justify-end mt-3">
                                <button
                                    onClick={() => { feedback.tap(); setIsForgotPassword(true); setError(null); setSuccessMsg(null); }}
                                    className="text-[12px] font-bold uppercase tracking-wider text-lior-500 opacity-80"
                                >
                                    Forgot password?
                                </button>
                            </div>
                        )}

                        <div className="mt-8">
                            <motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={isForgotPassword ? handleForgotPassword : handleAuth}
                                disabled={loading || rateLimitSecs > 0}
                                className="w-full py-5 font-bold text-white uppercase tracking-[0.15em] text-[13px] flex items-center justify-center gap-3 disabled:opacity-40 shadow-xl"
                                style={primaryBtn}
                            >
                                {loading ? <Loader2 size={20} className="animate-spin" /> : (
                                    <>
                                        {isForgotPassword ? 'Reset Password' : (isSignUp ? 'Create Account' : 'Sign in')}
                                        <ArrowRight size={18} />
                                    </>
                                )}
                            </motion.button>
                        </div>
                    </div>

                    {/* Footer Links */}
                    <div className="p-8 pt-0 flex flex-col items-center gap-5">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest opacity-40" style={{ color: 'var(--color-text-secondary)' }}>
                            <Lock size={12} strokeWidth={2.5} />
                            Private & Encrypted
                        </div>
                        <div className="flex items-center gap-4 text-[11px] font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                            <button onClick={() => { feedback.tap(); onPrivacyPolicy?.(); }} className="hover:opacity-60 transition-opacity">Privacy</button>
                            <span className="opacity-20">·</span>
                            <button onClick={() => { feedback.tap(); onTerms?.(); }} className="hover:opacity-60 transition-opacity">Terms</button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
