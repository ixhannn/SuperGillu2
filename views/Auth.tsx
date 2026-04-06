
import React, { useState, useEffect } from 'react';
import { Heart, ArrowRight, Loader2, AlertCircle, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SupabaseService } from '../services/supabase';

// ── Auth Proxy ──────────────────────────────────────────────────────────────
// All auth calls go through the Edge Function, which enforces rate limits
// server-side (by IP + email) before touching Supabase Auth.
// A 429 response includes retry_after_seconds so the UI can show a countdown.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ||
    localStorage.getItem('tulika_sb_url') ||
    'https://zogdcuapmnbltdvqsrga.supabase.co';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_KEY?.trim() ||
    localStorage.getItem('tulika_sb_key') ||
    'sb_publishable_KRRnxuRIWdlgHbn_g65dfQ_Mzzg5Vjl';

async function authProxy(type: 'login' | 'signup' | 'reset', email: string, password?: string): Promise<{ data?: any; error?: string; retry_after_seconds?: number; status: number }> {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/auth-proxy`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ type, email, password }),
    });
    const body = await res.json();
    return { ...body, status: res.status };
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
            className="absolute -top-[15%] -right-[10%] w-80 h-80 rounded-full pointer-events-none animate-morph-blob"
            style={{ background: 'var(--theme-orb-1)', filter: 'blur(64px)' }}
        />
        <div
            className="absolute -bottom-[10%] -left-[10%] w-72 h-72 rounded-full pointer-events-none animate-morph-blob"
            style={{ background: 'var(--theme-orb-2)', filter: 'blur(64px)', animationDelay: '5s' }}
        />
    </>
);

const glassInput: React.CSSProperties = {
    background: 'rgba(255,255,255,0.68)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.88)',
    color: 'var(--color-text-primary)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 4px rgba(var(--theme-particle-1-rgb),0.07)',
};

const primaryBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg, var(--color-pink-primary) 0%, var(--color-pink-deep) 100%)',
    boxShadow: '0 8px 28px rgba(var(--theme-particle-1-rgb),0.38), inset 0 1px 0 rgba(255,255,255,0.28)',
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
    }, [rateLimitSecs > 0]);

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
    }, []);

    const handleForgotPassword = async () => {
        if (!email) { setError('Enter your email address first.'); return; }
        setLoading(true);
        setError(null);
        setSuccessMsg(null);
        try {
            const result = await authProxy('reset', email);
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
        setLoading(true);
        setError(null);
        try {
            const result = await authProxy(isSignUp ? 'signup' : 'login', email, password);
            if (result.status === 429) {
                setRateLimitSecs(result.retry_after_seconds ?? 600);
            } else if (result.error) {
                setError(result.error);
            } else if (isSignUp && !result.data?.session) {
                setError('Confirmation email sent! Check your inbox (and spam).');
            } else {
                // Trigger the Supabase client session from the returned token
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
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden mb-4"
        >
            <div className="bg-green-50/90 text-green-700 p-3 rounded-2xl text-xs flex items-start gap-2 border border-green-100/70">
                <div className="flex-1 leading-relaxed">{msg}</div>
            </div>
        </motion.div>
    );

    const ErrorBanner = ({ msg }: { msg: string }) => (
        <motion.div
            key="error"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden mb-4"
        >
            <div className="bg-red-50/90 text-red-600 p-3 rounded-2xl text-xs flex items-start gap-2 border border-red-100/70">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                    {msg}
                    {msg.toLowerCase().includes('email') && (
                        <p className="mt-1.5 text-[10px] text-red-400 font-medium">
                            Tip: Disable "Confirm email" in Supabase → Auth → Providers for instant login.
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-5 relative overflow-hidden"
            style={{ color: 'var(--color-text-primary)' }}>
            <AuthBackground />

            <motion.div
                initial={{ opacity: 0, y: 44, scale: 0.93 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                className="relative z-10 w-full max-w-sm"
            >
                <div className="glass-card-hero overflow-hidden relative">
                    {/* Soft blush wash at top of card */}
                    <div
                        className="absolute top-0 left-0 right-0 h-28 pointer-events-none"
                        style={{
                            background: 'linear-gradient(to bottom, rgba(var(--theme-particle-3-rgb),0.28), transparent)',
                        }}
                    />

                    <div className="p-8 pb-5 relative">
                        {/* Brand mark */}
                        <motion.div
                            initial={{ scale: 0.65, opacity: 0, y: 12 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            transition={{ delay: 0.08, type: 'spring', stiffness: 420, damping: 22 }}
                            className="flex flex-col items-center mb-8"
                        >
                            <div
                                className="flex items-center justify-center mb-4 animate-breathe"
                                style={{
                                    width: '4.25rem',
                                    height: '4.25rem',
                                    borderRadius: '1.25rem',
                                    background: 'linear-gradient(140deg, rgba(var(--theme-particle-3-rgb),1) 0%, rgba(var(--theme-particle-1-rgb),0.9) 100%)',
                                    boxShadow: '0 14px 36px rgba(var(--theme-particle-1-rgb),0.32), inset 0 1px 0 rgba(255,255,255,0.55)',
                                }}
                            >
                                <Heart size={28} fill="currentColor" className="text-white drop-shadow" />
                            </div>

                            <h1 className="text-headline font-serif font-bold tracking-tight leading-none"
                                style={{ color: 'var(--color-text-primary)' }}>
                                Super Gillu
                            </h1>
                            <p className="text-sm font-medium mt-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                                App for my cutie
                            </p>
                        </motion.div>

                        {/* Tabs: Login / Sign Up / Forgot */}
                        {!isForgotPassword && (
                            <div
                                className="flex items-center p-1 rounded-2xl mb-5"
                                style={{
                                    background: 'rgba(var(--theme-particle-3-rgb),0.28)',
                                    border: '1px solid rgba(255,255,255,0.55)',
                                }}
                            >
                                {(['login', 'signup'] as const).map(tab => {
                                    const active = tab === (isSignUp ? 'signup' : 'login');
                                    return (
                                        <button
                                            key={tab}
                                            onClick={() => { setIsSignUp(tab === 'signup'); setError(null); setSuccessMsg(null); }}
                                            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all spring-press"
                                            style={{
                                                background: active ? 'rgba(255,255,255,0.92)' : 'transparent',
                                                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                                boxShadow: active ? '0 2px 8px rgba(var(--theme-particle-1-rgb),0.14), inset 0 1px 0 rgba(255,255,255,1)' : 'none',
                                            }}
                                        >
                                            {tab === 'login' ? 'Log In' : 'Sign Up'}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {isForgotPassword && (
                            <div className="mb-5">
                                <p className="text-sm text-center font-medium mb-4"
                                    style={{ color: 'var(--color-text-secondary)' }}>
                                    Enter your email to receive a reset link
                                </p>
                            </div>
                        )}

                        <AnimatePresence mode="wait">
                            {rateLimitSecs > 0 && (
                                <motion.div
                                    key="ratelimit"
                                    initial={{ opacity: 0, y: -8, height: 0 }}
                                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                                    exit={{ opacity: 0, y: -4, height: 0 }}
                                    transition={{ duration: 0.22, ease: 'easeOut' }}
                                    className="overflow-hidden mb-4"
                                >
                                    <div className="bg-orange-50/90 text-orange-700 p-3 rounded-2xl text-xs flex items-start gap-2 border border-orange-100/70">
                                        <Lock size={14} className="shrink-0 mt-0.5" />
                                        <div className="flex-1 leading-relaxed">
                                            Too many attempts. Try again in{' '}
                                            <strong>{Math.floor(rateLimitSecs / 60)}:{String(rateLimitSecs % 60).padStart(2, '0')}</strong>.
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                            {!rateLimitSecs && error && <ErrorBanner msg={error} />}
                            {!rateLimitSecs && successMsg && <InfoBanner msg={successMsg} />}
                        </AnimatePresence>

                        <div className="space-y-3">
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !rateLimitSecs) {
                                        isForgotPassword ? handleForgotPassword() : handleAuth();
                                    }
                                }}
                                placeholder="Email address"
                                autoComplete="email"
                                className="w-full py-3.5 px-4 rounded-2xl text-sm outline-none transition-shadow"
                                style={glassInput}
                            />
                            {!isForgotPassword && (
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !rateLimitSecs && handleAuth()}
                                    placeholder="Password"
                                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                                    className="w-full py-3.5 px-4 rounded-2xl text-sm outline-none transition-shadow"
                                    style={glassInput}
                                />
                            )}
                        </div>

                        {!isForgotPassword && !isSignUp && (
                            <div className="flex justify-end mt-2">
                                <button
                                    onClick={() => { setIsForgotPassword(true); setError(null); setSuccessMsg(null); }}
                                    className="text-[11px] font-semibold"
                                    style={{ color: 'var(--color-nav-active)' }}
                                >
                                    Forgot password?
                                </button>
                            </div>
                        )}

                        {isForgotPassword ? (
                            <div className="flex flex-col gap-2.5 mt-5">
                                <button
                                    onClick={handleForgotPassword}
                                    disabled={loading || rateLimitSecs > 0}
                                    className="w-full py-[1.05rem] rounded-2xl font-bold text-white spring-press flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:pointer-events-none"
                                    style={primaryBtn}
                                >
                                    {loading ? <Loader2 size={19} className="animate-spin" /> : <>Send Reset Link <ArrowRight size={17} /></>}
                                </button>
                                <button
                                    onClick={() => { setIsForgotPassword(false); setError(null); setSuccessMsg(null); }}
                                    className="w-full py-3 rounded-2xl font-bold text-sm spring-press"
                                    style={{ color: 'var(--color-text-secondary)', background: 'rgba(var(--theme-particle-2-rgb),0.1)' }}
                                >
                                    Back to Log In
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleAuth}
                                disabled={loading || rateLimitSecs > 0}
                                className="w-full py-[1.05rem] rounded-2xl font-bold text-white mt-5 spring-press flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:pointer-events-none"
                                style={primaryBtn}
                            >
                                {loading ? (
                                    <Loader2 size={19} className="animate-spin" />
                                ) : (
                                    <>
                                        {isSignUp ? 'Create Account' : 'Log In'}
                                        <ArrowRight size={17} />
                                    </>
                                )}
                            </button>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-8 pb-7 flex flex-col items-center gap-3">
                        <div
                            className="flex items-center gap-1.5 text-[10px] font-semibold px-3.5 py-1.5 rounded-full"
                            style={{
                                background: 'rgba(var(--theme-particle-3-rgb),0.32)',
                                color: 'var(--color-text-secondary)',
                                border: '1px solid rgba(255,255,255,0.55)',
                            }}
                        >
                            <Lock size={10} />
                            Encrypted &amp; Private
                        </div>
                        <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                            <button
                                onClick={() => onPrivacyPolicy?.()}
                                className="underline font-medium active:opacity-60"
                            >
                                Privacy Policy
                            </button>
                            <span className="opacity-40">·</span>
                            <button
                                onClick={() => onTerms?.()}
                                className="underline font-medium active:opacity-60"
                            >
                                Terms of Service
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
