const STORAGE_KEY = 'lior_coachmark_metrics_v1';
const MAX_METRIC_ENTRIES = 80;

/**
 * @typedef {{
 *   type: string;
 *   key?: string;
 *   at?: number;
 *   durationMs?: number;
 *   reason?: string;
 *   renderMode?: string;
 *   route?: string;
 *   targetRoute?: string;
 *   metadata?: Record<string, unknown>;
 * }} CoachmarkMetric
 */

/**
 * @param {CoachmarkMetric[]} metrics
 * @param {CoachmarkMetric} metric
 * @param {number} [maxEntries]
 */
export function appendCoachmarkMetric(metrics, metric, maxEntries = MAX_METRIC_ENTRIES) {
  const next = [...metrics, { ...metric, at: metric.at ?? Date.now() }];
  return next.slice(Math.max(0, next.length - maxEntries));
}

/**
 * @param {{ route?: string, actionView?: string } | null | undefined} def
 * @returns {string | null}
 */
function getCoachmarkDestination(def) {
  if (!def) return null;
  return def.actionView ?? def.route ?? null;
}

/**
 * @param {{ route?: string, actionView?: string } | null | undefined} currentDef
 * @param {Array<{ route?: string, actionView?: string } | null | undefined>} nextDefs
 * @param {string | null | undefined} currentView
 */
export function buildCoachmarkPreloadViews(currentDef, nextDefs = [], currentView) {
  const ordered = [getCoachmarkDestination(currentDef), ...nextDefs.map(getCoachmarkDestination)];
  const unique = [];

  for (const view of ordered) {
    if (!view || view === currentView || unique.includes(view)) continue;
    unique.push(view);
    if (unique.length >= 3) break;
  }

  return unique;
}

/**
 * @param {CoachmarkMetric[]} metrics
 * @param {number} [slowRouteThresholdMs]
 */
export function summarizeCoachmarkMetrics(metrics, slowRouteThresholdMs = 320) {
  const advances = metrics.filter((metric) => metric.type === 'advance_complete' && typeof metric.durationMs === 'number');
  const averageAdvanceMs = advances.length > 0
    ? Math.round(advances.reduce((sum, metric) => sum + (metric.durationMs ?? 0), 0) / advances.length)
    : 0;

  return {
    shown: metrics.filter((metric) => metric.type === 'step_shown').length,
    skipped: metrics.filter((metric) => metric.type === 'step_skipped').length,
    actions: metrics.filter((metric) => metric.type === 'step_action_clicked').length,
    fallbacks: metrics.filter((metric) => metric.type === 'fallback_card').length,
    occlusionFailures: metrics.filter((metric) => metric.type === 'occlusion_failure').length,
    slowRouteWaits: metrics.filter((metric) => metric.type === 'route_wait' && (metric.durationMs ?? 0) >= slowRouteThresholdMs).length,
    averageAdvanceMs,
  };
}

function readMetricsFromStorage() {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {CoachmarkMetric} metric
 */
function record(metric) {
  if (typeof window === 'undefined') return;

  const next = appendCoachmarkMetric(readMetricsFromStorage(), metric);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }

  window.dispatchEvent(new CustomEvent('lior:coachmark-metric', {
    detail: {
      metric: next[next.length - 1],
      summary: summarizeCoachmarkMetrics(next),
    },
  }));
}

function read() {
  return readMetricsFromStorage();
}

function clear() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export const CoachmarkInsights = {
  record,
  read,
  clear,
  summarize: (slowRouteThresholdMs = 320) => summarizeCoachmarkMetrics(readMetricsFromStorage(), slowRouteThresholdMs),
};
