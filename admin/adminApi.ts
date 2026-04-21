const ADMIN_CONFIG_KEY = 'lior_admin_dashboard_config';

export type AdminDashboardConfig = {
  workerUrl: string;
  token: string;
};

export type AdminOverviewUsage = {
  feature: string;
  object_count: number;
  total_bytes: number;
  missing_count: number;
  couple_count: number;
};

export type AdminOverviewSummary = {
  total_couples: number;
  total_assets: number;
  ready_assets: number;
  pending_assets: number;
  missing_assets: number;
  orphaned_assets: number;
  total_bytes: number;
  open_alerts: number;
  cleanup_backlog: number;
  usage: AdminOverviewUsage[];
};

export type AdminCoupleUsage = {
  couple_id: string;
  object_count: number;
  total_bytes: number;
  missing_count: number;
  open_alerts: number;
  cleanup_backlog: number;
  last_asset_update_at: string | null;
};

export type AdminAsset = {
  id: string;
  couple_id: string | null;
  owner_user_id: string | null;
  feature: string;
  asset_role: string;
  status: string;
  item_id: string;
  source_table: string;
  logical_row_id: string;
  r2_key: string;
  byte_size: number;
  mime_type: string;
  checksum_sha256: string;
  updated_at: string;
};

export type AdminAlert = {
  id: string;
  couple_id: string | null;
  feature: string | null;
  alert_type: string;
  severity: string;
  title: string;
  details: Record<string, unknown>;
  status: string;
  occurrence_count: number;
  last_seen_at: string;
};

export type AdminEvent = {
  id: number;
  couple_id: string | null;
  feature: string | null;
  severity: string;
  event_type: string;
  r2_key: string | null;
  source_table: string | null;
  logical_row_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AdminMetric = {
  metric_date: string;
  feature: string;
  object_count: number;
  total_bytes: number;
  missing_object_count: number;
  orphan_object_count: number;
  legacy_ref_count: number;
  expired_row_count: number;
  alert_count: number;
};

export type AdminDashboardSnapshot = {
  ok: boolean;
  generatedAt: string;
  worker: {
    bucketConfigured: boolean;
    supabaseConfigured: boolean;
  };
  overview: AdminOverviewSummary;
  couples: AdminCoupleUsage[];
  assets: AdminAsset[];
  alerts: AdminAlert[];
  events: AdminEvent[];
  metrics: AdminMetric[];
  audit?: Record<string, unknown>;
  cleanup?: Record<string, unknown>;
};

const normalizeWorkerUrl = (value: string) => value.trim().replace(/\/+$/, '');

const defaultConfig = (): AdminDashboardConfig => ({
  workerUrl: normalizeWorkerUrl(String(import.meta.env.VITE_R2_WORKER_URL || '')),
  token: '',
});

export const AdminDashboardApi = {
  loadConfig(): AdminDashboardConfig {
    try {
      const raw = localStorage.getItem(ADMIN_CONFIG_KEY);
      if (!raw) return defaultConfig();
      const parsed = JSON.parse(raw) as Partial<AdminDashboardConfig>;
      return {
        workerUrl: normalizeWorkerUrl(String(parsed.workerUrl || import.meta.env.VITE_R2_WORKER_URL || '')),
        token: String(parsed.token || ''),
      };
    } catch {
      return defaultConfig();
    }
  },

  saveConfig(config: AdminDashboardConfig) {
    localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify({
      workerUrl: normalizeWorkerUrl(config.workerUrl),
      token: config.token,
    }));
  },

  clearConfig() {
    localStorage.removeItem(ADMIN_CONFIG_KEY);
  },

  async request(
    config: AdminDashboardConfig,
    path: string,
    init: RequestInit = {},
  ): Promise<AdminDashboardSnapshot> {
    const workerUrl = normalizeWorkerUrl(config.workerUrl);
    if (!workerUrl) throw new Error('Worker URL is required.');
    if (!config.token.trim()) throw new Error('Admin token is required.');

    const response = await fetch(`${workerUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': config.token.trim(),
        ...(init.headers || {}),
      },
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `Request failed (${response.status})`);
    }

    return payload as AdminDashboardSnapshot;
  },

  fetchOverview(config: AdminDashboardConfig) {
    return this.request(config, '/__admin/overview?assets=25&alerts=20&events=20&couples=25&days=14', {
      method: 'GET',
    });
  },

  runAudit(config: AdminDashboardConfig) {
    return this.request(config, '/__admin/actions/audit', { method: 'POST', body: '{}' });
  },

  runCleanup(config: AdminDashboardConfig) {
    return this.request(config, '/__admin/actions/cleanup', { method: 'POST', body: '{}' });
  },

  runRepair(config: AdminDashboardConfig) {
    return this.request(config, '/__admin/actions/repair', { method: 'POST', body: '{}' });
  },
};
