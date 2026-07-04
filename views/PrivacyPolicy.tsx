import React from 'react';
import { Shield, ChevronLeft } from 'lucide-react';
import { ViewState } from '../types';
import { motion } from 'framer-motion';

interface Props {
    setView: (view: ViewState) => void;
    fromAuth?: boolean;
    onBack?: () => void;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-7">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] mb-2.5"
            style={{ color: 'var(--color-text-primary)' }}>
            {title}
        </h3>
        <div className="text-[13.5px] leading-relaxed space-y-2"
            style={{ color: 'var(--color-text-secondary)' }}>
            {children}
        </div>
    </div>
);

const lastUpdated = 'July 2026';

export const PrivacyPolicy: React.FC<Props> = ({ setView, fromAuth, onBack }) => {
    const handleBack = () => {
        if (onBack) { onBack(); return; }
        setView('profile');
    };

    return (
        <div className="min-h-screen pb-10" style={{ background: 'var(--theme-bg-main)', color: 'var(--color-text-primary)' }}>
            {/* Header */}
            <div className="sticky top-0 z-10 px-4 pt-safe"
                style={{ background: 'var(--theme-bg-main)', borderBottom: '1px solid rgba(var(--theme-particle-2-rgb),0.1)' }}>
                <div className="flex items-center gap-3 py-4">
                    <button
                        onClick={handleBack}
                        className="w-9 h-9 rounded-full flex items-center justify-center spring-press"
                        style={{ background: 'rgba(var(--theme-particle-2-rgb),0.1)' }}
                    >
                        <ChevronLeft size={20} style={{ color: 'var(--color-text-primary)' }} />
                    </button>
                    <div className="flex items-center gap-2.5">
                        <Shield size={17} style={{ color: 'var(--color-nav-active)' }} />
                        <span className="font-bold text-[15px]">Privacy Policy</span>
                    </div>
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="px-5 pt-6 max-w-2xl mx-auto"
            >
                {/* Intro card */}
                <div className="rounded-[1.25rem] p-5 mb-7"
                    style={{
                        background: 'rgba(var(--theme-particle-3-rgb),0.15)',
                        border: '1px solid rgba(var(--theme-particle-3-rgb),0.25)',
                    }}>
                    <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        Lior is a private space built for two. This policy explains exactly what we collect, where it's stored, who processes it, and the controls you have. We don't sell your data, show you ads, or track you across the web.
                    </p>
                    <p className="text-[11px] mt-3 font-medium" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                        Last updated: {lastUpdated}
                    </p>
                </div>

                <Section title="What we collect">
                    <p>We collect only what you give us or what the app needs to run:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li><strong>Account</strong> — your email address for sign-in. With Google Sign-In, we receive a Google ID token (your email and name) only to create your account.</li>
                        <li><strong>Profile</strong> — your first name, your partner's name, your anniversary and important dates, and preferences like theme.</li>
                        <li><strong>Your content</strong> — photos, videos and voice notes; text notes, letters and captions; dates and countdowns; mood entries; daily-question answers and drops; couple-pet interactions; and anything else you create.</li>
                        <li><strong>Notifications</strong> — a device push token, to alert you when your partner shares something.</li>
                        <li><strong>Diagnostics</strong> — if the app errors, we log the error message, app version, and your browser user-agent string, linked to your account, to fix bugs. Never your screen contents, photos, or the text of your memories/notes.</li>
                        <li><strong>Security</strong> — our sign-in service briefly records the IP address and email used for login attempts, to prevent abuse.</li>
                    </ul>
                    <p className="mt-2">We do <strong>not</strong> collect your location (the app requests no location permission), contacts, browsing history, or any advertising identifier.</p>
                </Section>

                <Section title="Where your data is stored">
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li><strong>On your device</strong> — your content (including cached photos/videos) and sign-in session, in the app's private local storage.</li>
                        <li><strong>Supabase</strong> — cloud database &amp; authentication; your account and content, protected by row-level security so only you and your partner can read them.</li>
                        <li><strong>Cloudflare R2</strong> — your photos, videos and voice notes, stored as private objects reachable only through short-lived signed links.</li>
                    </ul>
                </Section>

                <Section title="How we use your data">
                    <p>Your data is used only to:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li>Display your memories, notes, and moments</li>
                        <li>Sync your content between you and your partner's devices</li>
                        <li>Send notifications when your partner shares something</li>
                        <li>Generate your couple pet's dialogue (see AI features)</li>
                        <li>Keep the service working and secure (diagnostics, abuse prevention)</li>
                    </ul>
                    <p className="mt-2">We do <strong>not</strong> use your data for advertising, profiling, or machine-learning training, and we never sell or rent it.</p>
                </Section>

                <Section title="Who processes your data">
                    <p>We share data only with the providers needed to run Lior:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li><strong>Supabase</strong> — database, authentication, legacy file storage (your account + content).</li>
                        <li><strong>Cloudflare</strong> — media storage &amp; delivery (your photos, videos, voice notes).</li>
                        <li><strong>Google Firebase Cloud Messaging</strong> — delivers push notifications (your push token + a notification that includes your partner's first name).</li>
                        <li><strong>Google (Gemini AI)</strong> — limited couple-pet context; see AI features below.</li>
                        <li><strong>Google Sign-In</strong> — only if you choose it, to sign you in.</li>
                        <li><strong>Your browser's push service</strong> (e.g. Google, Mozilla, Apple) — on web, delivers an encrypted notification payload.</li>
                    </ul>
                    <p className="mt-2">We use <strong>no</strong> advertising networks, <strong>no</strong> analytics or tracking SDKs, and <strong>no</strong> third-party crash-reporting services.</p>
                </Section>

                <Section title="AI features (your couple pet)">
                    <p>Your couple pet's dialogue is generated by <strong>Google's Gemini API</strong>. When the pet speaks, we send Google a small amount of context to make its reply feel personal:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li>your and your partner's first names</li>
                        <li>how long you've been together and your pet's happiness level</li>
                        <li>the text of your single most recent memory and most recent note (each shortened)</li>
                    </ul>
                    <p className="mt-2">We do <strong>not</strong> send your photos, videos, voice notes, message history, email, or account identifiers. It's used only to produce the pet's reply, under Google's API terms. Prefer to send nothing to Google? Simply don't use the pet.</p>
                </Section>

                <Section title="Notifications">
                    <p>When your partner sends a heartbeat, answers the daily question, or sends a drop, we send a push notification through Google Firebase (or your browser's push service on web). It contains your partner's <strong>first name</strong> and a short template message — never the content of your memories, notes, or answers.</p>
                </Section>

                <Section title="Photos, videos & metadata">
                    <p>When you upload a <strong>photo</strong>, we re-encode it, which removes embedded metadata such as GPS location and camera details. <strong>Videos</strong> are currently uploaded unmodified and may still contain metadata (including location) added by your device — remove it first if that concerns you. All media is stored privately and viewable only through short-lived signed links by you and your partner.</p>
                </Section>

                <Section title="Data retention">
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li><strong>Daily Moments</strong> automatically delete after 24 hours.</li>
                        <li>Everything else you create is kept until you delete it, or until you delete your account.</li>
                        <li>Security rate-limit records are short-lived and auto-purged.</li>
                    </ul>
                    <p className="mt-2">You can delete any item at any time from within the app.</p>
                </Section>

                <Section title="Deleting your account">
                    <p>You can permanently delete your account and data yourself, in the app (Profile → Delete Account). If you're the last active member of your couple, shared content and all media are deleted too; if your partner is still active, their copy of shared memories is kept while your account and personal data are removed. Deletion is immediate; backup copies are purged within 30 days.</p>
                </Section>

                <Section title="Security">
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li>HTTPS encryption for all data in transit</li>
                        <li>Row-level security (RLS) on every database table</li>
                        <li>Media served only through short-lived signed URLs</li>
                        <li>Authentication required before any data access; passwords handled by Supabase Auth, never stored in plaintext</li>
                        <li>Rate limiting on sign-in; app device-backup disabled so your session can't be copied to another device</li>
                    </ul>
                </Section>

                <Section title="Children's privacy">
                    <p>Lior is intended for adults (18+) or couples. We do not knowingly collect data from children under 13. If you believe a child has used this app, contact us so we can delete their data.</p>
                </Section>

                <Section title="Your rights (GDPR / CCPA)">
                    <p>You have the right to access, correct, delete, export, or object to processing of your data. You can delete your account and content yourself in the app; for anything else, contact us below.</p>
                </Section>

                <Section title="International processing">
                    <p>Our providers (Supabase, Cloudflare, and Google) operate globally, so your data may be processed on servers outside your country, under those providers' standard data-protection commitments.</p>
                </Section>

                <Section title="Changes to this policy">
                    <p>We may update this policy from time to time. When we do, we'll change the date at the top of this page. Continued use of the app after an update means you accept it.</p>
                </Section>

                <Section title="Contact us">
                    <p>Questions about this policy, or want to exercise your data rights? Contact us at:</p>
                    <p className="mt-2 font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        support.lior@gmail.com
                    </p>
                </Section>

                <div className="mt-4 mb-8 py-4 text-center text-[11px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                    Made with love. Your memories are yours.
                </div>
            </motion.div>
        </div>
    );
};
