import type { ViewState } from '../types';
import type { PairingE2EMock } from './pairing';

const E2E_ENABLED = import.meta.env.VITE_E2E === '1';

const E2E_VIEWS: ViewState[] = [
  'home',
  'daily-drop',
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
  'countdowns',
  'mood-calendar',
  'aura-rewind',
  'aura-signal',
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
  'our-story',
  'date-studio',
  'duet-journal',
  'depths',
  'love-missions',
  'heirlooms',
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

const readE2EJson = (key: string): Record<string, unknown> => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const setE2EDefaultJson = (key: string, defaults: Record<string, unknown>) => {
  localStorage.setItem(key, JSON.stringify({
    ...defaults,
    ...readE2EJson(key),
  }));
};

const setE2EDefaultValue = (key: string, value: string) => {
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, value);
  }
};

export const bootstrapE2ELocalState = () => {
  if (!isE2EAppMode() || typeof window === 'undefined') return;

  setE2EDefaultJson('lior_identity', {
    myName: 'Alex',
    partnerName: 'Sam',
  });
  setE2EDefaultJson('lior_shared_profile', {
    anniversaryDate: '2024-02-14',
    theme: 'rose',
  });
  setE2EDefaultValue('lior_onboarded', 'true');
  setE2EDefaultValue('lior_seen_version', 'e2e');
  setE2EDefaultValue('lior_coachmarks_seen', JSON.stringify(['__all__']));
};

declare global {
  interface Window {
    __liorPairingMock?: PairingE2EMock;
  }
}
