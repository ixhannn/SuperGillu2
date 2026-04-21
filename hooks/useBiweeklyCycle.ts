import { useEffect, useMemo, useState } from 'react';

const CYCLE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in the device local timezone. */
export function getLocalDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromLocalDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const date = fromLocalDateString(iso);
  date.setDate(date.getDate() + days);
  return getLocalDateString(date);
}

/** Nearest prior Sunday (inclusive) as YYYY-MM-DD. */
export function getSundayOnOrBefore(iso: string): string {
  const d = fromLocalDateString(iso);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - dow);
  return getLocalDateString(d);
}

export interface BiweeklyCycle {
  cycleStart: string; // Sunday (YYYY-MM-DD)
  cycleEnd: string;   // Saturday, cycleStart + 13
  dayIndex: number;   // 0..13 for current date within cycle
  daysRemaining: number; // 14 - (dayIndex + 1) until next cycle starts
  totalDays: number; // 14
  isFinalDay: boolean;
  /** ms until cycleEnd 23:59:59.999 local time */
  msUntilCycleEnd: number;
  /** All 14 dates of the cycle (oldest -> newest). */
  allDates: string[];
}

/**
 * Compute the bi-weekly cycle for a given date, anchored to an epoch Sunday.
 * If `epochSunday` is not provided, we anchor to the Sunday on or before
 * the reference date — safe fallback.
 */
export function getCycleFor(referenceIso: string, epochSunday?: string): BiweeklyCycle {
  const refDate = fromLocalDateString(referenceIso);
  const anchor = epochSunday ?? getSundayOnOrBefore(referenceIso);
  const anchorDate = fromLocalDateString(anchor);
  const diffDays = Math.max(0, Math.floor((refDate.getTime() - anchorDate.getTime()) / DAY_MS));
  const cycleIndex = Math.floor(diffDays / CYCLE_DAYS);
  const cycleStartIso = addDays(anchor, cycleIndex * CYCLE_DAYS);
  const cycleEndIso = addDays(cycleStartIso, CYCLE_DAYS - 1);

  const startDate = fromLocalDateString(cycleStartIso);
  const dayIndex = Math.floor((refDate.getTime() - startDate.getTime()) / DAY_MS);

  const endDate = fromLocalDateString(cycleEndIso);
  endDate.setHours(23, 59, 59, 999);
  const msUntilCycleEnd = endDate.getTime() - Date.now();

  const allDates: string[] = [];
  for (let i = 0; i < CYCLE_DAYS; i += 1) {
    allDates.push(addDays(cycleStartIso, i));
  }

  return {
    cycleStart: cycleStartIso,
    cycleEnd: cycleEndIso,
    dayIndex,
    daysRemaining: Math.max(0, CYCLE_DAYS - (dayIndex + 1)),
    totalDays: CYCLE_DAYS,
    isFinalDay: dayIndex === CYCLE_DAYS - 1,
    msUntilCycleEnd,
    allDates,
  };
}

const EPOCH_KEY = 'lior_cycle_epoch';

function readStoredEpoch(): string | null {
  try {
    return localStorage.getItem(EPOCH_KEY);
  } catch {
    return null;
  }
}

function writeStoredEpoch(sunday: string) {
  try {
    localStorage.setItem(EPOCH_KEY, sunday);
  } catch {
    // ignore
  }
}

/**
 * Ensures a cycle epoch exists. First call on a device seeds the epoch to
 * the Sunday on or before today so both partners share cycle boundaries
 * (as long as they sync the stored epoch via Supabase on pairing).
 */
export function ensureCycleEpoch(): string {
  const stored = readStoredEpoch();
  if (stored) return stored;
  const seed = getSundayOnOrBefore(getLocalDateString());
  writeStoredEpoch(seed);
  return seed;
}

export interface UseBiweeklyCycleReturn extends BiweeklyCycle {
  epoch: string;
  refresh: () => void;
}

/**
 * React hook — returns the live cycle info for "today" and refreshes at
 * midnight local time so the UI flips to a new day without reload.
 */
export function useBiweeklyCycle(): UseBiweeklyCycleReturn {
  const [today, setToday] = useState<string>(() => getLocalDateString());
  const epoch = useMemo(() => ensureCycleEpoch(), []);

  useEffect(() => {
    const schedule = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 1, 0);
      return tomorrow.getTime() - now.getTime();
    };
    const id = setTimeout(function tick() {
      setToday(getLocalDateString());
    }, schedule());
    return () => clearTimeout(id);
  }, [today]);

  const cycle = useMemo(() => getCycleFor(today, epoch), [today, epoch]);

  return {
    ...cycle,
    epoch,
    refresh: () => setToday(getLocalDateString()),
  };
}
