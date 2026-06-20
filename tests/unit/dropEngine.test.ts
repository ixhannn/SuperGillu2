import { describe, it, expect } from 'vitest';
import {
  buildDailyDrop,
  pickDropType,
  deriveDropState,
  getDropCountdown,
  nextLocalMidnightIso,
  isDropComplete,
} from '../../utils/dropEngine';
import { fromLocalDateString } from '../../hooks/useBiweeklyCycle';
import type { DailyDrop, DropResponse } from '../../types';

const mkResponse = (userKey: string, value = 'x'): DropResponse => ({
  userKey, name: userKey, value, createdAt: new Date('2026-06-18T10:00:00').toISOString(),
});

const baseDrop = (overrides: Partial<DailyDrop> = {}): DailyDrop => ({
  id: 'c1_2026-06-18',
  coupleId: 'c1',
  date: '2026-06-18',
  type: 'this_or_that',
  prompt: { type: 'this_or_that', title: 't', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
  responses: {},
  createdAt: new Date('2026-06-18T00:00:00').toISOString(),
  expiresAt: nextLocalMidnightIso('2026-06-18'),
  ...overrides,
});

describe('dropEngine selection', () => {
  it('is deterministic for the same couple + date', () => {
    const a = buildDailyDrop('couple-xyz', '2026-06-18', { hasThrowback: false });
    const b = buildDailyDrop('couple-xyz', '2026-06-18', { hasThrowback: false });
    expect(a.type).toBe(b.type);
    expect(a.prompt).toEqual(b.prompt);
    expect(a.id).toBe('couple-xyz_2026-06-18');
  });

  it('never selects on_this_day when there is no throwback memory', () => {
    for (let day = 1; day <= 28; day += 1) {
      const date = `2026-06-${String(day).padStart(2, '0')}`;
      const type = pickDropType('couple-xyz', date, { hasThrowback: false });
      expect(type).not.toBe('on_this_day');
    }
  });

  it('can select on_this_day when a throwback exists', () => {
    const found = Array.from({ length: 40 }, (_, i) =>
      pickDropType('c', `2026-07-${String((i % 28) + 1).padStart(2, '0')}`, { hasThrowback: true }),
    );
    expect(found).toContain('on_this_day');
  });

  it('avoids repeating yesterday on the vast majority of days', () => {
    let repeats = 0;
    let total = 0;
    for (let day = 2; day <= 28; day += 1) {
      const today = `2026-06-${String(day).padStart(2, '0')}`;
      const yday = `2026-06-${String(day - 1).padStart(2, '0')}`;
      const t = pickDropType('couple-stable', today, { hasThrowback: true });
      const y = pickDropType('couple-stable', yday, { hasThrowback: true });
      total += 1;
      if (t === y) repeats += 1;
    }
    // Reroll can collide occasionally; assert it's rare, not impossible.
    expect(repeats / total).toBeLessThan(0.2);
  });
});

describe('dropEngine expiry + countdown', () => {
  it('expires at the next local midnight', () => {
    const drop = buildDailyDrop('c', '2026-06-18');
    expect(drop.expiresAt).toBe(fromLocalDateString('2026-06-19').toISOString());
  });

  it('flags urgent under 3h remaining', () => {
    const expiresAt = new Date(Date.now() + 2 * 3_600_000).toISOString();
    expect(getDropCountdown(expiresAt).urgent).toBe(true);
    const far = new Date(Date.now() + 6 * 3_600_000).toISOString();
    expect(getDropCountdown(far).urgent).toBe(false);
  });

  it('reports expired past the deadline', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(getDropCountdown(past).expired).toBe(true);
  });
});

describe('dropEngine state derivation', () => {
  const future = new Date(Date.now() + 6 * 3_600_000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();

  it('your_turn when I have not answered', () => {
    const drop = baseDrop({ expiresAt: future, responses: {} });
    expect(deriveDropState(drop, 'me')).toBe('your_turn');
  });

  it('waiting when only I answered', () => {
    const drop = baseDrop({ expiresAt: future, responses: { me: mkResponse('me') } });
    expect(deriveDropState(drop, 'me')).toBe('waiting');
  });

  it('both_in when both answered (regardless of expiry)', () => {
    const drop = baseDrop({ expiresAt: past, responses: { me: mkResponse('me'), you: mkResponse('you') }, revealedAt: new Date().toISOString() });
    expect(isDropComplete(drop)).toBe(true);
    expect(deriveDropState(drop, 'me')).toBe('both_in');
  });

  it('expired_partial when I answered but partner did not, and time is up', () => {
    const drop = baseDrop({ expiresAt: past, responses: { me: mkResponse('me') } });
    expect(deriveDropState(drop, 'me')).toBe('expired_partial');
  });

  it('expired_missed when partner answered but I did not, and time is up', () => {
    const drop = baseDrop({ expiresAt: past, responses: { you: mkResponse('you') } });
    expect(deriveDropState(drop, 'me')).toBe('expired_missed');
  });

  it('expired_both_missed when nobody answered and time is up', () => {
    const drop = baseDrop({ expiresAt: past, responses: {} });
    expect(deriveDropState(drop, 'me')).toBe('expired_both_missed');
  });
});
