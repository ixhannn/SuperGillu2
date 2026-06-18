import React from 'react';
import type { NavigationOptions, ViewState } from '../types';
import { shouldGateHeavyView } from '../utils/runtimeProfile';
import { yieldToMain } from '../utils/scheduler';

type SetView = (view: ViewState, options?: NavigationOptions) => void;

type ViewComponent = React.ComponentType<any>;
type ViewModule = { default: ViewComponent };
type ViewLoader = () => Promise<ViewModule>;
type PreloadableViewComponent = React.LazyExoticComponent<ViewComponent> & {
  preload: ViewLoader;
  isLoaded: () => boolean;
};

const lazyNamedView = (
  loadModule: () => Promise<Record<string, ViewComponent>>,
  exportName: string,
): PreloadableViewComponent => {
  let loadedModule: ViewModule | null = null;
  let loadPromise: Promise<ViewModule> | null = null;
  const load: ViewLoader = () => {
    if (!loadPromise) {
      loadPromise = loadModule().then(
        (module) => {
          loadedModule = { default: module[exportName] };
          return loadedModule;
        },
        (error: unknown) => {
          // Never cache a rejection: a 404 after a redeploy or a network blip
          // must be retryable on the next tap, not poison the registry (and
          // React.lazy's payload) for the rest of the session.
          loadPromise = null;
          throw error;
        },
      );
    }
    return loadPromise;
  };
  // React.lazy's ctor ONLY. Once loaded, this returns a synchronous thenable:
  // lazy calls then() during initialization, and a synchronous resolve marks
  // the payload Resolved BEFORE React checks it — so a preloaded view mounts
  // in the same render pass with NO Suspense round-trip. (A plain
  // Promise.resolve() still suspends for one microtask, which flashed the
  // null fallback — a blank frame — on every first mount of a preloaded
  // view.) Not exposed as `preload`, since this bare thenable has no
  // .catch/.finally and must never leak to general promise consumers.
  const lazyLoader: ViewLoader = () => {
    if (loadedModule) {
      const resolved = loadedModule;
      return {
        then: (onFulfilled?: (value: ViewModule) => unknown) => {
          onFulfilled?.(resolved);
          return resolved as unknown as Promise<ViewModule>;
        },
      } as Promise<ViewModule>;
    }
    return load();
  };
  const Component = React.lazy(lazyLoader) as PreloadableViewComponent;
  Component.preload = load;
  Component.isLoaded = () => loadedModule !== null;
  return Component;
};

const HEAVY_PREFETCH_VIEWS = new Set<ViewState>(['our-room', 'partner-intelligence']);

const viewRegistry: Record<ViewState, PreloadableViewComponent> = {
  home: lazyNamedView(() => import('./Home'), 'Home'),
  'add-memory': lazyNamedView(() => import('./AddMemory'), 'AddMemory'),
  timeline: lazyNamedView(() => import('./MemoryTimeline'), 'MemoryTimeline'),
  'special-dates': lazyNamedView(() => import('./SpecialDates'), 'SpecialDates'),
  notes: lazyNamedView(() => import('./Notes'), 'Notes'),
  'open-when': lazyNamedView(() => import('./OpenWhen'), 'OpenWhen'),
  sync: lazyNamedView(() => import('./Sync'), 'Sync'),
  'daily-moments': lazyNamedView(() => import('./DailyMoments'), 'DailyMoments'),
  'dinner-decider': lazyNamedView(() => import('./DinnerDecider'), 'DinnerDecider'),
  profile: lazyNamedView(() => import('./Profile'), 'Profile'),
  'quiet-mode': lazyNamedView(() => import('./QuietMode'), 'QuietMode'),
  countdowns: lazyNamedView(() => import('./Countdowns'), 'Countdowns'),
  'mood-calendar': lazyNamedView(() => import('./MoodCalendar'), 'MoodCalendar'),
  'aura-rewind': lazyNamedView(() => import('./AuraRewind'), 'AuraRewind'),
  'aura-signal': lazyNamedView(() => import('./AuraSignal'), 'AuraSignal'),
  'bonsai-bloom': lazyNamedView(() => import('./BonsaiBloom'), 'BonsaiBloom'),
  'coco-pet': lazyNamedView(() => import('./CocoPetPage'), 'CocoPetPage'),
  us: lazyNamedView(() => import('./Us'), 'Us'),
  'our-room': lazyNamedView(() => import('./OurRoom'), 'OurRoom'),
  canvas: lazyNamedView(() => import('./Canvas'), 'Canvas'),
  'privacy-policy': lazyNamedView(() => import('./PrivacyPolicy'), 'PrivacyPolicy'),
  'terms-of-service': lazyNamedView(() => import('./TermsOfService'), 'TermsOfService'),
  'time-capsule': lazyNamedView(() => import('./TimeCapsule'), 'TimeCapsuleView'),
  surprises: lazyNamedView(() => import('./Surprises'), 'SurprisesView'),
  'voice-notes': lazyNamedView(() => import('./VoiceNotes'), 'VoiceNotesView'),
  'private-space': lazyNamedView(() => import('./PrivateSpace'), 'PrivateSpace'),
  'partner-intelligence': lazyNamedView(() => import('./PartnerIntelligenceView'), 'PartnerIntelligenceView'),
  'daily-video': lazyNamedView(() => import('./DailyVideoView'), 'DailyVideoView'),
  'weekly-recap': lazyNamedView(() => import('./WeeklyRecapView'), 'WeeklyRecapView'),
  'storage-console': lazyNamedView(() => import('./StorageConsole'), 'StorageConsoleView'),
  premium: lazyNamedView(() => import('./Premium'), 'PremiumView'),
  'our-story': lazyNamedView(() => import('./OurStory'), 'OurStoryView'),
  'date-studio': lazyNamedView(() => import('./DateStudio'), 'DateStudioView'),
  'duet-journal': lazyNamedView(() => import('./DuetJournal'), 'DuetJournalView'),
  depths: lazyNamedView(() => import('./Depths'), 'DepthsView'),
  'love-missions': lazyNamedView(() => import('./LoveMissions'), 'LoveMissionsView'),
  heirlooms: lazyNamedView(() => import('./Heirlooms'), 'HeirloomsView'),
};

export const getViewComponent = (view: ViewState): PreloadableViewComponent =>
  viewRegistry[view] ?? viewRegistry.home;

export const preloadViewModule = (view: ViewState): Promise<ViewModule> =>
  getViewComponent(view).preload();

export const isViewModuleLoaded = (view: ViewState): boolean =>
  getViewComponent(view).isLoaded();

export const filterPreloadableViews = (
  views: ViewState[],
  gateHeavyViews = shouldGateHeavyView(),
): ViewState[] => {
  const uniqueViews = [...new Set(views)];
  if (!gateHeavyViews) return uniqueViews;
  return uniqueViews.filter((view) => !HEAVY_PREFETCH_VIEWS.has(view));
};

export const preloadViewModules = async (views: ViewState[]): Promise<void> => {
  const uniqueViews = filterPreloadableViews(views);
  await Promise.allSettled(uniqueViews.map((view) => preloadViewModule(view)));
};

export const preloadViewModulesSequential = async (views: ViewState[]): Promise<void> => {
  const uniqueViews = filterPreloadableViews(views);
  for (const view of uniqueViews) {
    await preloadViewModule(view).catch(() => undefined);
    await yieldToMain();
  }
};
