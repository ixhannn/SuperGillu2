import { describe, it, expect } from 'vitest';
import { buildRelationshipStats } from '../../shared/relationshipStats.js';

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

// Local helper mirroring the engine's day math for the assertion above.
function calendarDaysBetween(startIso: string, endIso: string): number {
  const DAY = 86_400_000;
  const d = (iso: string) => {
    const [y, m, day] = iso.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, day) / DAY);
  };
  return d(endIso) - d(startIso);
}
