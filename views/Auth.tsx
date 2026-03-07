
import React, { useState, useEffect } from 'react';
import { Heart, Cloud, Key, ArrowRight, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { SupabaseService } from '../services/supabase';

interface AuthProps {
    onLogin: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    // Initialize step based on whether we already have keys
    const [step, setStep] = useState<'setup' | 'auth'>(() => 
        SupabaseService.isConfigured() ? 'auth' : 'setup'
    );
    
    // Setup State
    const [sbUrl, setSbUrl] = useState('');
    const [sbKey, setSbKey] = useState('');
    
    // Auth State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Try to init immediately if configured
        if (SupabaseService.isConfigured()) {
            if (SupabaseService.init()) {
                // Listen for auto-login (e.g. if email link redirects back here)
                const { data: { subscription } } = SupabaseService.client!.auth.onAuthStateChange((event, session) => {
                    if (event === 'SIGNED_IN' && session) {
                        onLogin();
                    }
                });
                return () => subscription.unsubscribe();
            }
        }
    }, []);

    const handleSetup = () => {
        if (!sbUrl || !sbKey) {
            setError("Please enter both the URL and Key.");
            return;
        }
        try {
            const success = SupabaseService.configure(sbUrl.trim(), sbKey.trim());
            if (success) {
                setStep('auth');
                setError(null);
            } else {
                setError("Invalid configuration.");
            }
        } catch (e) {
            setError("Could not configure Supabase.");
        }
    };

    const handleAuth = async () => {
        if (!email || !password) return;
        setLoading(true);
        setError(null);
        
        try {
            const sb = SupabaseService.client;
            if (!sb) throw new Error("Cloud service not initialized");

            let result;
            if (isSignUp) {
                result = await sb.auth.signUp({ 
                    email, 
                    password,
                    options: {
                        emailRedirectTo: window.location.origin // Ensure redirect comes back to app
                    }
                });
            } else {
                result = await sb.auth.signInWithPassword({ email, password });
            }

            if (result.error) {
                throw result.error;
            }

            // If signing up and email confirmation is ON (session is null), show message
            if (isSignUp && !result.data.session) {
                setError("Confirmation email sent! Please check your inbox (and spam).");
            } else {
                onLogin();
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Authentication failed");
        } finally {
            setLoading(false);
        }
    };

    if (step === 'setup') {
        return (
            <div className="min-h-screen bg-tulika-50 flex flex-col items-center justify-center p-6">
                 <div className="w-full max-w-sm bg-white rounded-[2rem] p-8 shadow-xl animate-pop-in">
                     <div className="flex justify-center mb-6">
                         <div className="bg-tulika-100 p-4 rounded-full text-tulika-500">
                             <Cloud size={32} />
                         </div>
                     </div>
                     
                     <h2 className="text-2xl font-serif font-bold text-center text-gray-800 mb-2">Connect Cloud</h2>
                     <p className="text-center text-gray-500 text-sm mb-6">
                         To enable secure login and backups, please connect your free Supabase project.
                     </p>

                     {error && (
                         <div className="bg-red-50 text-red-500 p-3 rounded-xl text-xs flex items-center gap-2 mb-4">
                             <AlertCircle size={16} /> {error}
                         </div>
                     )}

                     <div className="space-y-4">
                         <div>
                             <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Project URL</label>
                             <input 
                                value={sbUrl}
                                onChange={e => setSbUrl(e.target.value)}
                                placeholder="https://xyz.supabase.co"
                                className="w-full bg-gray-50 p-3 rounded-xl border border-gray-100 mt-1 outline-none focus:ring-2 focus:ring-tulika-200 text-gray-800 placeholder-gray-400"
                             />
                         </div>
                         <div>
                             <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">API Key (Anon/Public)</label>
                             <div className="relative">
                                <input 
                                    value={sbKey}
                                    onChange={e => setSbKey(e.target.value)}
                                    type="password"
                                    placeholder="eyJhbG..."
                                    className="w-full bg-gray-50 p-3 rounded-xl border border-gray-100 mt-1 outline-none focus:ring-2 focus:ring-tulika-200 text-gray-800 placeholder-gray-400"
                                />
                                <Key size={16} className="absolute right-3 top-4 text-gray-400" />
                             </div>
                         </div>
                     </div>

                     <button 
                        onClick={handleSetup}
                        className="w-full bg-tulika-500 text-white py-4 rounded-xl font-bold mt-8 shadow-lg shadow-tulika-200 hover:scale-[1.02] transition-transform"
                     >
                         Connect
                     </button>
                     
                     <p className="text-[10px] text-center text-gray-400 mt-4 border-t border-gray-50 pt-4">
                         Don't have keys? Create a free project at <a href="https://supabase.com" target="_blank" className="underline text-tulika-500">supabase.com</a>
                     </p>
                 </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-tulika-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
             {/* Decor */}
            <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-tulika-200 rounded-full blur-3xl opacity-50 animate-pulse"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-purple-200 rounded-full blur-3xl opacity-50 animate-pulse" style={{ animationDelay: '1s'}}></div>

            <div className="w-full max-w-sm bg-white/90 backdrop-blur-md rounded-[2rem] p-8 shadow-2xl relative z-10 animate-slide-up">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-full shadow-md mb-4 text-tulika-500">
                        <Heart fill="currentColor" size={32} />
                    </div>
                    <h1 className="text-3xl font-serif font-bold text-gray-800">Super Gillu</h1>
                    <p className="text-gray-500 text-sm font-medium">App for my cutie</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs flex items-start gap-2 mb-4 animate-fade-in border border-red-100">
                        <AlertCircle size={16} className="shrink-0 mt-0.5" /> 
                        <div className="flex-1">
                            {error}
                            {error.includes("email") && (
                                <p className="mt-2 text-[10px] text-red-400 font-medium">
                                    Tip: In Supabase Dashboard &gt; Auth &gt; Providers &gt; Email, disable "Confirm email" for instant login.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <input 
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Email address"
                        className="w-full bg-gray-50 p-4 rounded-xl outline-none focus:ring-2 focus:ring-tulika-200 transition-all text-gray-800 placeholder-gray-400"
                    />
                    <input 
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Password"
                        className="w-full bg-gray-50 p-4 rounded-xl outline-none focus:ring-2 focus:ring-tulika-200 transition-all text-gray-800 placeholder-gray-400"
                    />
                </div>

                <button 
                    onClick={handleAuth}
                    disabled={loading}
                    className="w-full bg-tulika-500 text-white py-4 rounded-xl font-bold mt-6 shadow-xl shadow-tulika-200 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" /> : (
                        <>
                            {isSignUp ? 'Sign Up' : 'Log In'} <ArrowRight size={20} />
                        </>
                    )}
                </button>

                <div className="mt-6 flex justify-center">
                    <button 
                        onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
                        className="text-sm text-gray-400 font-medium hover:text-tulika-500 transition-colors"
                    >
                        {isSignUp ? 'Already have an account? Log In' : 'New here? Create Account'}
                    </button>
                </div>
                
                <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col items-center gap-2">
                     <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium bg-gray-50 px-3 py-1 rounded-full">
                         <ShieldCheck size={12} /> Encrypted & Private
                     </div>
                </div>
            </div>
        </div>
    );
};
