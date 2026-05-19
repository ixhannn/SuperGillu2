import type { ViewState } from '../types';

const AMBIENT_MOTION_PAUSED_VIEWS = new Set<ViewState>([
  'aura-signal',
  'canvas',
  'daily-video',
  'our-room',
  'private-space',
  'storage-console',
]);

export const shouldPauseAmbientMotionForView = (view: ViewState): boolean => (
  AMBIENT_MOTION_PAUSED_VIEWS.has(view)
);
