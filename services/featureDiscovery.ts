import { WHATS_NEW_RELEASE_ID } from '../appVersion';
import { StorageService } from './storage';

/**
 * FeatureDiscovery — tracks what users have seen so we show each
 * intro exactly once and never nag them.
 */

export const FeatureDiscovery = {
    // What's New
    hasSeenCurrentVersion(): boolean {
        return StorageService.getSeenReleaseVersion() === WHATS_NEW_RELEASE_ID;
    },

    markCurrentVersionSeen(): void {
        StorageService.setSeenReleaseVersion(WHATS_NEW_RELEASE_ID);
    },

    // Coachmarks
    isCoachmarkSeen(key: string): boolean {
        const seen = this._getSeenCoachmarks();
        return seen.includes(key);
    },

    markCoachmarkSeen(key: string): void {
        const seen = this._getSeenCoachmarks();
        if (!seen.includes(key)) {
            StorageService.setSeenCoachmarks([...seen, key]);
        }
    },

    markAllCoachmarksSeen(): void {
        StorageService.setSeenCoachmarks(['__all__']);
    },

    areAllCoachmarksSeen(): boolean {
        return this._getSeenCoachmarks().includes('__all__');
    },

    _getSeenCoachmarks(): string[] {
        return StorageService.getSeenCoachmarks();
    },

    // Dev helpers
    resetAll(): void {
        StorageService.clearSeenReleaseVersion();
        StorageService.clearSeenCoachmarks();
    },
};
