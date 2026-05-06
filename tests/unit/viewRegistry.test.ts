import { describe, expect, it } from 'vitest';
import { filterPreloadableViews } from '../../views/viewRegistry';

describe('viewRegistry prefetch filtering', () => {
  it('skips heavy views when heavy gating is enabled', () => {
    expect(filterPreloadableViews(['home', 'our-room', 'partner-intelligence', 'daily-moments'], true)).toEqual([
      'home',
      'daily-moments',
    ]);
  });

  it('keeps heavy views when heavy gating is disabled', () => {
    expect(filterPreloadableViews(['home', 'our-room', 'partner-intelligence'], false)).toEqual([
      'home',
      'our-room',
      'partner-intelligence',
    ]);
  });
});
