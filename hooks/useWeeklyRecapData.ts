import { useCallback, useEffect, useRef, useState } from 'react';
import { WeeklyRecap } from '../types';
import { WeeklyRecapService } from '../services/weeklyRecap';
import { StorageService } from '../services/storage';

export interface UseWeeklyRecapDataOptions {
  /** YYYY-MM-DD Sunday. Defaults to this week. */
  weekStart?: string;
  auto?: boolean; // build on mount. Default true.
}

export interface UseWeeklyRecapDataReturn {
  recap: WeeklyRecap | null;
  loading: boolean;
  error: string | null;
  build: (force?: boolean) => Promise<void>;
  refetchArchive: () => Promise<void>;
  archive: WeeklyRecap[];
}

function resolveCoupleNames(): [string, string] {
  try {
    const profile = StorageService.getCoupleProfile?.();
    const me = profile?.myName || 'You';
    const them = profile?.partnerName || 'Them';
    return [me, them];
  } catch {
    return ['You', 'Them'];
  }
}

export function useWeeklyRecapData(
  options: UseWeeklyRecapDataOptions = {},
): UseWeeklyRecapDataReturn {
  const { auto = true } = options;
  const weekStart = options.weekStart ?? WeeklyRecapService.getWeekStart();

  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [archive, setArchive] = useState<WeeklyRecap[]>([]);
  const [loading, setLoading] = useState(auto);
  const [error, setError] = useState<string | null>(null);

  // Tracks the most recently requested week so stale, out-of-order async
  // builds can be discarded instead of clobbering the current selection.
  const latestWeekRef = useRef(weekStart);
  useEffect(() => {
    latestWeekRef.current = weekStart;
  }, [weekStart]);

  const build = useCallback(async (force = false) => {
    const requestedWeek = weekStart;
    setLoading(true);
    setError(null);
    try {
      const coupleNames = resolveCoupleNames();
      const next = await WeeklyRecapService.build({
        weekStart: requestedWeek,
        coupleNames,
        meUserId: StorageService.getDeviceId?.(),
        force,
      });
      if (latestWeekRef.current !== requestedWeek) return; // stale result, discard
      setRecap(next);
    } catch (e) {
      if (latestWeekRef.current !== requestedWeek) return;
      setError(e instanceof Error ? e.message : 'Failed to build recap');
    } finally {
      if (latestWeekRef.current === requestedWeek) setLoading(false);
    }
  }, [weekStart]);

  const refetchArchive = useCallback(async () => {
    const list = await WeeklyRecapService.listArchived();
    setArchive(list);
  }, []);

  useEffect(() => {
    if (!auto) return;
    void build();
    void refetchArchive();
  }, [auto, build, refetchArchive]);

  return { recap, loading, error, build, refetchArchive, archive };
}
