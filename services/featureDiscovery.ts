import { APP_VERSION } from '../appVersion';

/**
 * FeatureDiscovery — tracks what users have seen so we show each
 * intro exactly once and never nag them.
 */

export const FeatureDiscovery = {
    // What's New
    hasSeenCurrentVersion(): boolean {
        return localStorage.getItem('lior_seen_version') === APP_VERSION;
    },

    markCurrentVersionSeen(): void {
        localStorage.setItem('lior_seen_version', APP_VERSION);
    },

    // Coachmarks
    isCoachmarkSeen(key: string): boolean {
        const seen = this._getSeenCoachmarks();
        return seen.includes(key);
    },

    markCoachmarkSeen(key: string): void {
        const seen = this._getSeenCoachmarks();
        if (!seen.includes(key)) {
            localStorage.setItem('lior_coachmarks_seen', JSON.stringify([...seen, key]));
        }
    },

    markAllCoachmarksSeen(): void {
        localStorage.setItem('lior_coachmarks_seen', JSON.stringify(['__all__']));
    },

    areAllCoachmarksSeen(): boolean {
        return this._getSeenCoachmarks().includes('__all__');
    },

    _getSeenCoachmarks(): string[] {
        try {
            return JSON.parse(localStorage.getItem('lior_coachmarks_seen') || '[]');
        } catch {
            return [];
        }
    },

    // Dev helpers
    resetAll(): void {
        localStorage.removeItem('lior_seen_version');
        localStorage.removeItem('lior_coachmarks_seen');
    },
};
