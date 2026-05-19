import { DiagnosticsService } from './diagnostics';

type PerfEntryWithDuration = PerformanceEntry & { duration: number };

class FrameHealthServiceClass {
  private started = false;
  private observer: PerformanceObserver | null = null;

  start() {
    if (this.started || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
    this.started = true;

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerfEntryWithDuration[]) {
          if (entry.duration < 120) continue;
          DiagnosticsService.recordInfo('frame.longtask', 'Long main-thread task', {
            name: entry.name,
            durationMs: Math.round(entry.duration),
            startTimeMs: Math.round(entry.startTime),
          });
        }
      });
      this.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      this.observer = null;
    }
  }

  stop() {
    this.observer?.disconnect();
    this.observer = null;
    this.started = false;
  }
}

export const FrameHealthService = new FrameHealthServiceClass();
