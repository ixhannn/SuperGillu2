import { describe, it, expect } from 'vitest';
import { buildRelationshipMilestones, buildCountdownEvents } from '../../shared/countdowns.js';

const at = (iso: string) => new Date(`${iso}T12:00:00`);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('buildRelationshipMilestones', () => {
  it('returns nothing without a valid anniversary', () => {
    expect(buildRelationshipMilestones('', at('2026-06-11'))).toEqual([]);
    expect(buildRelationshipMilestones('not-a-date', at('2026-06-11'))).toEqual([]);
  });

  it('gives a brand-new couple near-term milestones to look forward to', () => {
    // Paired today — should surface upcoming day marks + the next monthsary.
    const ms = buildRelationshipMilestones('2026-06-01', at('2026-06-11'));
    expect(ms.length).toBeGreaterThan(0);
    // The 100-day mark is 100 days after the anniversary.
    const hundred = ms.find((m: any) => m.milestoneValue === 100 && m.type === 'milestone');
    expect(hundred).toBeTruthy();
    expect(hundred.title).toBe('100 Days Together');
    expect(ymd(hundred.nextDate)).toBe('2026-09-09'); // Jun 1 + 100d
    expect(hundred.isGenerated).toBe(true);
  });

  it('surfaces the next monthsary and skips year multiples', () => {
    const ms = buildRelationshipMilestones('2026-01-15', at('2026-06-20'));
    const monthsary = ms.find((m: any) => m.type === 'monthsary');
    expect(monthsary).toBeTruthy();
    // Jun 20 is past the 5-month mark (Jun 15), so the next is 6 months (Jul 15).
    expect(monthsary.milestoneValue).toBe(6);
    expect(monthsary.title).toBe('6 Months Together');
  });

  it('only returns future milestones, sorted soonest-first', () => {
    const now = at('2027-06-11');
    const ms = buildRelationshipMilestones('2026-06-01', now);
    for (const m of ms) {
      expect(m.nextDate.getTime()).toBeGreaterThanOrEqual(now.getTime());
    }
    const times = ms.map((m: any) => m.nextDate.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('stops surfacing monthsaries once a couple is well established', () => {
    // ~3 years in: no monthsary clutter, but day milestones still appear.
    const ms = buildRelationshipMilestones('2023-06-01', at('2026-06-11'));
    expect(ms.find((m: any) => m.type === 'monthsary')).toBeFalsy();
    expect(ms.find((m: any) => m.type === 'milestone')).toBeTruthy();
  });
});

describe('buildCountdownEvents', () => {
  it('blends saved dates, the anniversary, and generated milestones', () => {
    const events = buildCountdownEvents({
      dates: [],
      anniversaryDate: '2026-06-01',
      now: at('2026-06-11'),
    });
    expect(events.some((e: any) => e.type === 'anniversary')).toBe(true);
    expect(events.some((e: any) => e.isGenerated && e.type === 'milestone')).toBe(true);
  });

  it('can be asked to omit milestones', () => {
    const events = buildCountdownEvents({
      dates: [],
      anniversaryDate: '2026-06-01',
      now: at('2026-06-11'),
      includeMilestones: false,
    });
    expect(events.some((e: any) => e.type === 'milestone')).toBe(false);
  });
});
