import { useCallback, useEffect, useState } from 'react';
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

  const build = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const coupleNames = resolveCoupleNames();
      const next = await WeeklyRecapService.build({
        weekStart,
        coupleNames,
        meUserId: StorageService.getDeviceId?.(),
        force,
      });
      setRecap(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to build recap');
    } finally {
      setLoading(false);
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
