import type { ViewState } from '../types';

const E2E_ENABLED = import.meta.env.VITE_E2E === '1';

const E2E_VIEWS: ViewState[] = [
  'home',
  'add-memory',
  'timeline',
  'special-dates',
  'notes',
  'open-when',
  'sync',
  'daily-moments',
  'dinner-decider',
  'profile',
  'quiet-mode',
  'keepsakes',
  'countdowns',
  'mood-calendar',
  'aura-rewind',
  'aura-signal',
  'presence-room',
  'bonsai-bloom',
  'us',
  'our-room',
  'canvas',
  'privacy-policy',
  'terms-of-service',
  'time-capsule',
  'surprises',
  'voice-notes',
  'private-space',
  'partner-intelligence',
  'daily-video',
  'weekly-recap',
  'storage-console',
  'premium',
];

const E2E_VIEW_SET = new Set<ViewState>(E2E_VIEWS);

const readSearchParams = (): URLSearchParams => (
  typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
);

export const isE2EAppMode = (): boolean => (
  E2E_ENABLED && readSearchParams().get('e2e') === '1'
);

export const getE2EInitialView = (): ViewState | null => {
  if (!isE2EAppMode()) return null;
  const requested = readSearchParams().get('view');
  if (!requested) return null;
  return E2E_VIEW_SET.has(requested as ViewState) ? requested as ViewState : null;
};

export const bootstrapE2ELocalState = () => {
  if (!isE2EAppMode() || typeof window === 'undefined') return;

  localStorage.setItem('lior_identity', JSON.stringify({
    myName: 'Alex',
    partnerName: 'Sam',
  }));
  localStorage.setItem('lior_shared_profile', JSON.stringify({
    anniversaryDate: '2024-02-14',
    theme: 'rose',
  }));
  localStorage.setItem('lior_onboarded', 'true');
  localStorage.setItem('lior_seen_version', 'e2e');
  localStorage.setItem('lior_coachmarks_seen', JSON.stringify(['__all__']));
};
