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

const lastUpdated = 'April 2025';

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
                        This app is a private space built with love — just for the two of you. We take your privacy seriously and will never sell, share, or misuse your personal data.
                    </p>
                    <p className="text-[11px] mt-3 font-medium" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                        Last updated: {lastUpdated}
                    </p>
                </div>

                <Section title="What data we collect">
                    <p>We collect only the data you choose to add to the app:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li>Photos and videos you upload as memories or daily moments</li>
                        <li>Text notes, open-when letters, and captions you write</li>
                        <li>Special dates and countdowns you create</li>
                        <li>Mood entries and couple pet interactions</li>
                        <li>Your first name (used only to personalise your experience)</li>
                        <li>Email address (used for account sign-in only)</li>
                    </ul>
                    <p className="mt-2">We do <strong>not</strong> collect your location, contacts, browsing history, or any data beyond what you explicitly add.</p>
                </Section>

                <Section title="How your data is stored">
                    <p>Your data is stored in two places:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li><strong>On your device</strong> — in the app's private local storage (IndexedDB). Only the app can access this.</li>
                        <li><strong>In the cloud</strong> — via Supabase, a secure cloud database. Your data is tied to your account and protected by row-level security policies.</li>
                    </ul>
                    <p className="mt-2">Cloud sync is end-to-end isolated by your user account. Only you and your partner (who shares the same account space) can access your data.</p>
                </Section>

                <Section title="How we use your data">
                    <p>Your data is used only to:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li>Display your memories, notes, and moments within the app</li>
                        <li>Sync your content between your and your partner's devices</li>
                        <li>Send in-app notifications when your partner shares something new</li>
                    </ul>
                    <p className="mt-2">We do <strong>not</strong> use your data for advertising, analytics profiling, or machine learning training.</p>
                </Section>

                <Section title="Data sharing">
                    <p>We do <strong>not</strong> sell, rent, or share your personal data with any third parties, advertisers, or data brokers.</p>
                    <p className="mt-2">The only third-party service we use is <strong>Supabase</strong> (supabase.com) for database and file storage. Supabase processes your data in compliance with GDPR and SOC 2 standards.</p>
                </Section>

                <Section title="Media and files">
                    <p>Photos and videos you upload are stored securely in Supabase Storage under your unique user account. They are not publicly accessible — a signed URL is required to view them, and only authenticated users of your couple account can generate one.</p>
                </Section>

                <Section title="Data retention">
                    <p>Your data is retained for as long as your account exists. You can delete individual items at any time from within the app. To permanently delete all your data and account, contact us at the email below and we will process your request within 30 days.</p>
                </Section>

                <Section title="Children's privacy">
                    <p>This app is intended for use by adults (18+) or couples. We do not knowingly collect data from children under 13. If you believe a child has used this app, please contact us so we can delete their data.</p>
                </Section>

                <Section title="Your rights (GDPR / CCPA)">
                    <p>You have the right to:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li><strong>Access</strong> — request a copy of all data we hold about you</li>
                        <li><strong>Correction</strong> — update any inaccurate data</li>
                        <li><strong>Deletion</strong> — request full account and data deletion</li>
                        <li><strong>Portability</strong> — export your data in a machine-readable format</li>
                        <li><strong>Objection</strong> — object to any processing you did not consent to</li>
                    </ul>
                    <p className="mt-2">To exercise any of these rights, please contact us at the email below.</p>
                </Section>

                <Section title="Security">
                    <p>We take reasonable technical measures to protect your data, including:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li>HTTPS encryption for all data in transit</li>
                        <li>Row-level security (RLS) on all database tables</li>
                        <li>Authentication required before any data access</li>
                        <li>No plaintext passwords stored (handled by Supabase Auth)</li>
                    </ul>
                </Section>

                <Section title="Changes to this policy">
                    <p>We may update this Privacy Policy from time to time. When we do, we will update the date at the top of this page. Continued use of the app after changes means you accept the updated policy.</p>
                </Section>

                <Section title="Contact us">
                    <p>If you have any questions about this Privacy Policy or want to exercise your data rights, you can contact us at:</p>
                    <p className="mt-2 font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        privacy@lior.app
                    </p>
                </Section>

                <div className="mt-4 mb-8 py-4 text-center text-[11px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                    Made with love. Your memories are yours.
                </div>
            </motion.div>
        </div>
    );
};
