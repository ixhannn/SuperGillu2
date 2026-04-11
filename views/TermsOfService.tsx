import React from 'react';
import { FileText, ChevronLeft } from 'lucide-react';
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

export const TermsOfService: React.FC<Props> = ({ setView, fromAuth, onBack }) => {
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
                        <FileText size={17} style={{ color: 'var(--color-nav-active)' }} />
                        <span className="font-bold text-[15px]">Terms of Service</span>
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
                        By using this app, you agree to these Terms. Please read them — they're written simply and in good faith.
                    </p>
                    <p className="text-[11px] mt-3 font-medium" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                        Last updated: {lastUpdated}
                    </p>
                </div>

                <Section title="1. Acceptance of terms">
                    <p>By downloading, installing, or using this app ("the App"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the App.</p>
                </Section>

                <Section title="2. Description of service">
                    <p>The App is a private, couples-only digital memory and communication space. It allows two people in a relationship to share photos, notes, moods, countdowns, and other personal content between their devices.</p>
                    <p className="mt-2">The App is provided as-is for personal, non-commercial use. It is not intended for use by organisations, businesses, or groups of more than two people.</p>
                </Section>

                <Section title="3. Account registration">
                    <p>To use cloud sync features, you must create an account with a valid email address and password. You are responsible for:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li>Keeping your login credentials secure and confidential</li>
                        <li>All activity that occurs under your account</li>
                        <li>Notifying us immediately if you believe your account has been compromised</li>
                    </ul>
                    <p className="mt-2">One couple should share one paired account space. Do not share your credentials with anyone other than your partner.</p>
                </Section>

                <Section title="4. User content">
                    <p>You retain full ownership of all content you upload or create within the App, including photos, videos, notes, and messages ("User Content").</p>
                    <p className="mt-2">By using the App, you grant us a limited, non-exclusive licence to store and transmit your User Content solely for the purpose of providing the sync service between your devices.</p>
                    <p className="mt-2">You are responsible for ensuring that your User Content:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li>Does not violate any applicable laws or regulations</li>
                        <li>Does not infringe the intellectual property rights of any third party</li>
                        <li>Does not contain content that is illegal, harmful, or abusive</li>
                    </ul>
                </Section>

                <Section title="5. Acceptable use">
                    <p>You agree not to use the App to:</p>
                    <ul className="list-disc pl-4 space-y-1.5 mt-1">
                        <li>Upload, store, or transmit any illegal content</li>
                        <li>Harass, stalk, or harm another person</li>
                        <li>Attempt to access, reverse-engineer, or tamper with the App's infrastructure</li>
                        <li>Use the App for any commercial purpose</li>
                        <li>Create multiple accounts to circumvent restrictions</li>
                    </ul>
                </Section>

                <Section title="6. Data and privacy">
                    <p>Our collection and use of your personal data is governed by our <strong>Privacy Policy</strong>, which is incorporated into these Terms by reference. By using the App, you also agree to the Privacy Policy.</p>
                </Section>

                <Section title="7. Service availability">
                    <p>We aim to keep the App available at all times, but we cannot guarantee uninterrupted service. We may suspend or modify the App at any time without notice for maintenance, updates, or other operational reasons.</p>
                    <p className="mt-2">The App's cloud features depend on Supabase infrastructure. We are not responsible for any downtime or data loss caused by third-party service providers.</p>
                </Section>

                <Section title="8. Disclaimer of warranties">
                    <p>The App is provided "as is" and "as available" without any warranties of any kind, whether express or implied. We do not warrant that the App will be error-free, uninterrupted, or free of viruses or other harmful components.</p>
                    <p className="mt-2">To the fullest extent permitted by law, we disclaim all warranties, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.</p>
                </Section>

                <Section title="9. Limitation of liability">
                    <p>To the fullest extent permitted by applicable law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of data, loss of profits, or loss of goodwill, arising from your use of the App.</p>
                    <p className="mt-2">Our total liability to you for any claim arising out of or relating to these Terms or the App shall not exceed the amount you paid for the App (if any) in the twelve months preceding the claim.</p>
                </Section>

                <Section title="10. Termination">
                    <p>You may stop using the App and delete your account at any time. We may suspend or terminate your account if you violate these Terms or if we decide to discontinue the App.</p>
                    <p className="mt-2">Upon termination, your right to use the App ceases immediately. Provisions of these Terms that should survive termination (including ownership, disclaimers, and limitations of liability) will continue to apply.</p>
                </Section>

                <Section title="11. Changes to terms">
                    <p>We may update these Terms at any time. We will notify you of significant changes by updating the date at the top of this page. Continued use of the App after changes constitutes acceptance of the new Terms.</p>
                </Section>

                <Section title="12. Governing law">
                    <p>These Terms shall be governed by and construed in accordance with applicable law. Any disputes arising from these Terms or your use of the App shall be resolved through good-faith negotiation before any formal proceedings.</p>
                </Section>

                <Section title="13. Contact">
                    <p>For any questions about these Terms, please contact us at:</p>
                    <p className="mt-2 font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        support@lior.app
                    </p>
                </Section>

                <div className="mt-4 mb-8 py-4 text-center text-[11px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                    Thank you for being here. ❤
                </div>
            </motion.div>
        </div>
    );
};
