const ADMIN_CONFIG_KEY = 'lior_admin_dashboard_config';
const ADMIN_TOKEN_KEY = 'lior_admin_dashboard_token';

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

export type AdminTableCount = {
  table: string;
  count: number | null;
  ok: boolean;
  error: string | null;
};

export type AdminCleanupTask = {
  id: string;
  source_table: string;
  logical_item_id: string | null;
  couple_id: string | null;
  feature: string;
  storage_paths?: string[];
  status: string;
  attempts: number;
  last_error: string | null;
  run_after: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AdminR2Usage = {
  feature: string;
  object_count: number;
  total_bytes: number;
  couple_count: number;
};

export type AdminR2Object = {
  key: string;
  size: number;
  uploaded: string | null;
  etag: string | null;
  feature: string;
  couple_id: string | null;
  owner_user_id: string | null;
  asset_role: string | null;
  item_id: string | null;
  managed: boolean;
};

export type AdminMediaSection = 'journey' | 'moments' | 'secret-space';

export type AdminMediaItem = {
  id: string;
  section: AdminMediaSection;
  sectionLabel: string;
  feature: string | null;
  sourceTable: string | null;
  rowId: string | null;
  logicalId: string | null;
  title: string;
  caption: string;
  coupleId: string | null;
  ownerUserId: string | null;
  ownerFolder: string;
  assetRole: 'image' | 'video' | 'audio' | 'track' | string;
  mediaKind: 'image' | 'video' | 'audio';
  r2Key: string | null;
  legacyUrl: string | null;
  legacyPath: string | null;
  inlineOnly: boolean;
  refField: string | null;
  byteSize: number;
  mimeType: string | null;
  checksumSha256: string | null;
  status: string;
  uploadedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  origin: string;
};

export type AdminMediaGallery = {
  ok: boolean;
  generatedAt: string;
  limit: number;
  totals: {
    total: number;
    journey: number;
    moments: number;
    secretSpace: number;
    withR2Preview: number;
    inlineOnly: number;
    legacyRefs: number;
    totalBytes: number;
  };
  sources: {
    mediaAssets: number;
    r2Objects: number;
    tables: Array<{ table: string; ok: boolean; error: string | null; rowCount: number }>;
  };
  items: AdminMediaItem[];
};

export type AdminUserSummary = {
  id: string;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
  coupleIds: string[];
  roleByCouple: Record<string, string>;
  rowCount: number;
  mediaRefCount: number;
  mediaCount: number;
  mediaBytes: number;
  missingMediaCount: number;
  inlineRefCount: number;
  legacyRefCount: number;
  tableCounts: Record<string, number>;
  mediaByFeature: Array<{ feature: string; count: number; bytes: number }>;
};

export type AdminUsersSnapshot = {
  ok: boolean;
  generatedAt: string;
  limit: number;
  totals: {
    totalUsers: number;
    totalRows: number;
    totalMedia: number;
    totalMediaBytes: number;
    totalInlineRefs: number;
    totalLegacyRefs: number;
    totalMissingMedia: number;
  };
  sources: {
    authUsers: { ok: boolean; error: string | null; count: number };
    memberships: number;
    mediaAssets: number;
    tables: Array<{ table: string; ok: boolean; error: string | null; rowCount: number }>;
  };
  users: AdminUserSummary[];
};

export type AdminAppDataRow = {
  table: string;
  row_id: string | null;
  logical_id: string | null;
  user_id: string | null;
  couple_id: string | null;
  title: string;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
  media_ref_count: number;
  media_refs: Array<{ field: string; kind: string }>;
  data_keys: string[];
};

export type AdminAppDataTable = {
  table: string;
  count: number | null;
  ok: boolean;
  error: string | null;
  recent: AdminAppDataRow[];
};

export type AdminAppDataInventory = {
  totals: {
    available_tables: number;
    unavailable_tables: number;
    total_rows: number;
    recent_rows: number;
    media_refs: number;
  };
  tables: AdminAppDataTable[];
};

export type AdminDashboardSnapshot = {
  ok: boolean;
  generatedAt: string;
  worker: {
    bucketConfigured: boolean;
    supabaseConfigured: boolean;
    cleanupTokenConfigured?: boolean;
    adminTokenConfigured?: boolean;
  };
  overview: AdminOverviewSummary;
  couples: AdminCoupleUsage[];
  assets: AdminAsset[];
  alerts: AdminAlert[];
  events: AdminEvent[];
  metrics: AdminMetric[];
  cleanupTasks?: AdminCleanupTask[];
  r2?: {
    summary: {
      object_count: number;
      total_bytes: number;
      managed_count: number;
      unmanaged_count: number;
      latest_uploaded_at: string | null;
      usage: AdminR2Usage[];
    };
    objects: AdminR2Object[];
  };
  appData?: AdminAppDataInventory;
  health?: {
    configIssues: string[];
    tableCounts: AdminTableCount[];
    dataCoverage: {
      r2ObjectCount: number;
      indexedObjectCount: number;
      unindexedR2Objects: number;
      mediaIndexCoveragePct: number | null;
    };
  };
  audit?: Record<string, unknown>;
  cleanup?: Record<string, unknown>;
};

const normalizeWorkerUrl = (value: string) => value.trim().replace(/\/+$/, '');

const defaultConfig = (): AdminDashboardConfig => ({
  workerUrl: normalizeWorkerUrl(String(import.meta.env.VITE_R2_WORKER_URL || '')),
  token: '',
});

export const AdminDashboardApi = {
  // The worker URL is harmless and convenient to persist across restarts
  // (localStorage). The admin token grants full access to every admin
  // endpoint, so it is kept in sessionStorage only: it disappears when the
  // tab closes and is never written to disk. Any token that may have been
  // persisted by older builds is scrubbed from localStorage on load.
  loadConfig(): AdminDashboardConfig {
    try {
      const raw = localStorage.getItem(ADMIN_CONFIG_KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<AdminDashboardConfig>) : {};
      if (parsed.token) {
        localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify({
          workerUrl: normalizeWorkerUrl(String(parsed.workerUrl || '')),
        }));
      }
      return {
        workerUrl: normalizeWorkerUrl(String(parsed.workerUrl || import.meta.env.VITE_R2_WORKER_URL || '')),
        token: String(sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''),
      };
    } catch {
      return defaultConfig();
    }
  },

  saveConfig(config: AdminDashboardConfig) {
    localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify({
      workerUrl: normalizeWorkerUrl(config.workerUrl),
    }));
    if (config.token) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, config.token);
    } else {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  },

  clearConfig() {
    localStorage.removeItem(ADMIN_CONFIG_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  },

  async request(
    config: AdminDashboardConfig,
    path: string,
    init: RequestInit = {},
  ): Promise<any> {
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

    return payload;
  },

  fetchOverview(config: AdminDashboardConfig) {
    return this.request(config, '/__admin/overview?assets=75&alerts=50&events=75&couples=50&days=30&r2Objects=75&appRows=5', {
      method: 'GET',
    }) as Promise<AdminDashboardSnapshot>;
  },

  fetchMedia(config: AdminDashboardConfig) {
    return this.request(config, '/__admin/media?limit=500', {
      method: 'GET',
    }) as Promise<AdminMediaGallery>;
  },

  fetchUsers(config: AdminDashboardConfig) {
    return this.request(config, '/__admin/users?limit=500', {
      method: 'GET',
    }) as Promise<AdminUsersSnapshot>;
  },

  async runAudit(config: AdminDashboardConfig) {
    const action = await this.request(config, '/__admin/actions/audit', { method: 'POST', body: '{}' });
    const overview = await this.fetchOverview(config);
    return { ...overview, audit: action.audit };
  },

  async runCleanup(config: AdminDashboardConfig) {
    const action = await this.request(config, '/__admin/actions/cleanup', { method: 'POST', body: '{}' });
    const overview = await this.fetchOverview(config);
    return { ...overview, cleanup: action.cleanup };
  },

  async runRepair(config: AdminDashboardConfig) {
    const action = await this.request(config, '/__admin/actions/repair', { method: 'POST', body: '{}' });
    const overview = await this.fetchOverview(config);
    return { ...overview, repair: (action as any).repair } as AdminDashboardSnapshot & { repair?: Record<string, unknown> };
  },

  resolveAlert(config: AdminDashboardConfig, id: string) {
    return this.request(config, '/__admin/actions/resolve-alert', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }) as Promise<{ ok: boolean; generatedAt: string; result: Record<string, unknown> }>;
  },

  retryCleanupTask(config: AdminDashboardConfig, id: string) {
    return this.request(config, '/__admin/actions/retry-cleanup-task', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }) as Promise<{ ok: boolean; generatedAt: string; result: Record<string, unknown> }>;
  },

  verifyMedia(config: AdminDashboardConfig, r2Key: string) {
    return this.request(config, '/__admin/actions/verify-media', {
      method: 'POST',
      body: JSON.stringify({ r2Key }),
    }) as Promise<{ ok: boolean; generatedAt: string; result: Record<string, unknown> }>;
  },
};
