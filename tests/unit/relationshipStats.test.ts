import { describe, it, expect } from 'vitest';
import { buildRelationshipStats, buildLiveTogether } from '../../shared/relationshipStats.js';

const at = (iso: string) => new Date(`${iso}T12:00:00`);

describe('buildRelationshipStats', () => {
  it('returns null without a valid anniversary', () => {
    expect(buildRelationshipStats('', at('2026-06-11'))).toBeNull();
    expect(buildRelationshipStats('nope', at('2026-06-11'))).toBeNull();
  });

  it('gives a brand-new couple substantial-feeling numbers on day three', () => {
    const stats = buildRelationshipStats('2026-06-08', at('2026-06-11'))!;
    expect(stats.days).toBe(3);
    expect(stats.weeks).toBe(0);
    expect(stats.hours).toBe(72); // hours climb fast — feels like more than "3 days"
    expect(stats.months).toBe(0);
    expect(stats.years).toBe(0);
    // The next milestone exists and is in the future.
    expect(stats.nextMilestone).toBeTruthy();
    expect(stats.nextMilestone!.daysUntil).toBeGreaterThan(0);
  });

  it('computes weeks, months, years for an established couple', () => {
    const stats = buildRelationshipStats('2023-06-11', at('2026-06-11'))!;
    expect(stats.days).toBe(calendarDaysBetween('2023-06-11', '2026-06-11'));
    expect(stats.years).toBe(3);
    expect(stats.months).toBe(36);
    expect(stats.weeks).toBe(Math.floor(stats.days / 7));
    expect(stats.hours).toBe(stats.days * 24);
  });

  it('reports the weekday the relationship began (locale-consistent)', () => {
    const anniversary = '2024-02-14';
    const stats = buildRelationshipStats(anniversary, at('2026-06-11'))!;
    const expectedWeekday = at(anniversary).toLocaleDateString(undefined, { weekday: 'long' });
    expect(stats.weekday).toBe(expectedWeekday);
  });

  it('does not go negative before the day-of-month anniversary rolls over', () => {
    // now is the 5th, started on the 20th → the current month does not count yet.
    const stats = buildRelationshipStats('2026-01-20', at('2026-06-05'))!;
    expect(stats.months).toBe(4); // Jan20->Feb20->Mar20->Apr20->May20 = 4 full months
    expect(stats.months).toBeGreaterThanOrEqual(0);
  });
});

describe('buildLiveTogether', () => {
  it('returns null without a valid anniversary', () => {
    expect(buildLiveTogether('', new Date())).toBeNull();
  });

  it('breaks elapsed time into an exact y/mo/d/h/m/s cascade', () => {
    // Local Date so the assertion is timezone-independent.
    const now = new Date(2026, 5, 11, 14, 23, 41); // 2026-06-11 14:23:41 local
    const live = buildLiveTogether('2024-02-14', now)!;
    // 2024-02-14 -> +2y = 2026-02-14, +3mo = 2026-05-14, +28d = 2026-06-11.
    expect(live).toMatchObject({ years: 2, months: 3, days: 28, hours: 14, minutes: 23, seconds: 41 });
    expect(live.isFuture).toBe(false);
  });

  it('ticks the seconds forward second-by-second', () => {
    const t1 = buildLiveTogether('2024-02-14', new Date(2026, 5, 11, 14, 23, 41))!;
    const t2 = buildLiveTogether('2024-02-14', new Date(2026, 5, 11, 14, 23, 42))!;
    expect(t2.seconds).toBe(t1.seconds + 1);
  });

  it('is alive on the very first day (counts time since midnight)', () => {
    const live = buildLiveTogether('2026-06-11', new Date(2026, 5, 11, 9, 5, 30))!;
    expect(live).toMatchObject({ years: 0, months: 0, days: 0, hours: 9, minutes: 5, seconds: 30 });
    expect(live.totalSeconds).toBeGreaterThan(0);
  });

  it('clamps a future anniversary to zero instead of going negative', () => {
    const live = buildLiveTogether('2030-01-01', new Date(2026, 5, 11, 12, 0, 0))!;
    expect(live).toMatchObject({ years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, isFuture: true });
  });
});

// Local helper mirroring the engine's day math for the assertion above.
function calendarDaysBetween(startIso: string, endIso: string): number {
  const DAY = 86_400_000;
  const d = (iso: string) => {
    const [y, m, day] = iso.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, day) / DAY);
  };
  return d(endIso) - d(startIso);
}
