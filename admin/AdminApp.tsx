import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronsUpDown,
  Clock3,
  Database,
  ExternalLink,
  Eye,
  Filter,
  Folder,
  HardDrive,
  ImageIcon,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Music2,
  Users,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Video,
  Waves,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { formatBytes } from '../shared/mediaPolicy.js';
import {
  AdminDashboardApi,
  AdminDashboardConfig,
  AdminDashboardSnapshot,
  AdminMediaGallery,
  AdminMediaItem,
  AdminMediaSection,
  AdminUsersSnapshot,
  AdminUserSummary,
  AnalyticsSummary,
} from './adminApi';
import './admin.css';

type AdminView = 'pulse' | 'library' | 'analytics' | 'issues' | 'system';
type LibraryTab = 'media' | 'users' | 'couples';
type UserSort = 'activity' | 'storage' | 'media' | 'rows' | 'issues' | 'email';

type FilterState = {
  search: string;
  couple: string;
  owner: string;
  status: string;
  mediaKind: string;
};

type ViewCard = {
  id: string;
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
};

const PLACEHOLDER_TOKEN = 'ADMIN_DASHBOARD_TOKEN';
const emptyOverview = {
  total_couples: 0,
  total_assets: 0,
  ready_assets: 0,
  pending_assets: 0,
  missing_assets: 0,
  orphaned_assets: 0,
  total_bytes: 0,
  open_alerts: 0,
  cleanup_backlog: 0,
  usage: [],
};

const MEDIA_TABS: Array<{ id: AdminMediaSection | 'all'; label: string; shortLabel: string }> = [
  { id: 'all', label: 'All Media', shortLabel: 'All' },
  { id: 'journey', label: 'Our Journey', shortLabel: 'Journey' },
  { id: 'moments', label: 'Moments', shortLabel: 'Moments' },
  { id: 'secret-space', label: 'Secret Space', shortLabel: 'Secret' },
];

const NAV_ITEMS: Array<{
  id: AdminView;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  kicker: string;
}> = [
  { id: 'pulse', label: 'Pulse', icon: LayoutDashboard, kicker: 'Health & capacity' },
  { id: 'library', label: 'Library', icon: Eye, kicker: 'Media · Users · Couples' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, kicker: 'Usage · Funnel · Errors' },
  { id: 'issues', label: 'Issues', icon: AlertTriangle, kicker: 'Alerts · Jobs · Integrity' },
  { id: 'system', label: 'System', icon: Server, kicker: 'Activity & access' },
];

// Internal tabs for Library view — gives the dashboard an object-centric
// browser instead of three sibling sidebar items that fragmented the
// natural drill-down (user → couple → their media).
const LIBRARY_TABS: Array<{
  id: LibraryTab;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'couples', label: 'Couples', icon: Folder },
];

// Filter bar only makes sense in object browsers (Library/Media + Users).
// Hiding it on Pulse / Issues / System removes irrelevant chrome.
const VIEWS_WITH_FILTERS = new Set<AdminView>(['library']);

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const fmtNum = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}m`;
  if (n >= 1_000) return `${(n / 1e3).toFixed(n % 1e3 ? 1 : 0)}k`;
  return String(n);
};

const fmtSecs = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, '0')}s`;
};

const fmtAgo = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const shortId = (value?: string | null) => {
  if (!value) return '-';
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
};

const jsonPreview = (value: unknown) => {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  } catch {
    return '{}';
  }
};

const encodeR2Key = (key: string) => key.split('/').map(encodeURIComponent).join('/');
const normalizeWorkerUrl = (value: string) => value.trim().replace(/\/+$/, '');
const hasValidWorkerUrl = (value: string) => /^https?:\/\/[^/\s]+/i.test(value.trim());
const isPlaceholderToken = (value: string) => value.trim().toUpperCase() === PLACEHOLDER_TOKEN;

const folderLabel = (value?: string | null) => {
  if (!value || value === 'legacy-or-unknown') return 'Legacy / unknown';
  return shortId(value);
};

const mediaStatusLabel = (item: AdminMediaItem) => {
  if (item.status === 'inline-base64') return 'Inline blob';
  if (item.status === 'missing-object') return 'Missing object';
  if (item.status === 'r2-key') return 'Row points to R2';
  return item.status;
};

const mediaIconForKind = (kind: AdminMediaItem['mediaKind']) => {
  if (kind === 'video') return <Video size={20} />;
  if (kind === 'audio') return <Music2 size={20} />;
  return <ImageIcon size={20} />;
};

const getMediaPreviewUrl = (workerUrl: string, item: AdminMediaItem) => {
  if (item.r2Key) return `${normalizeWorkerUrl(workerUrl)}/${encodeR2Key(item.r2Key)}`;
  return item.legacyUrl || null;
};

const getRiskLevel = (overview: typeof emptyOverview, configIssueCount: number) => {
  if (configIssueCount > 0 || overview.open_alerts > 0 || overview.missing_assets > 0 || overview.orphaned_assets > 0) return 'attention';
  if (overview.cleanup_backlog > 0 || overview.pending_assets > 0) return 'watch';
  return 'healthy';
};

const riskLabel = {
  disconnected: 'Disconnected',
  healthy: 'Healthy',
  watch: 'Watch',
  attention: 'Needs attention',
} as const;

const riskCopy = {
  disconnected: 'Connect the worker and token to load backend data.',
  healthy: 'No blocking storage incidents are visible.',
  watch: 'Background work is pending, but data looks stable.',
  attention: 'There are storage issues or config risks that need review.',
} as const;

const filterMediaItems = (
  items: AdminMediaItem[],
  filters: FilterState,
  section: AdminMediaSection | 'all',
) => {
  const search = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (section !== 'all' && item.section !== section) return false;
    if (filters.couple !== 'all' && (item.coupleId || 'unknown') !== filters.couple) return false;
    if (filters.owner !== 'all' && (item.ownerFolder || item.ownerUserId || 'legacy-or-unknown') !== filters.owner) return false;
    if (filters.status !== 'all' && item.status !== filters.status) return false;
    if (filters.mediaKind !== 'all' && item.mediaKind !== filters.mediaKind) return false;
    if (!search) return true;

    const haystack = [
      item.title,
      item.caption,
      item.feature,
      item.sourceTable,
      item.ownerUserId,
      item.ownerFolder,
      item.coupleId,
      item.logicalId,
      item.r2Key,
      item.legacyPath,
      item.status,
    ].join(' ').toLowerCase();

    return haystack.includes(search);
  });
};

const statTone = (value: number, warnAt = 1, badAt = 5): ViewCard['tone'] => {
  if (value >= badAt) return 'bad';
  if (value >= warnAt) return 'warn';
  return 'good';
};

const EmptyState: React.FC<{ title: string; copy: string; icon?: React.ReactNode }> = ({ title, copy, icon }) => (
  <div className="empty-state-panel">
    <div className="empty-state-icon">{icon || <Database size={28} />}</div>
    <strong>{title}</strong>
    <span>{copy}</span>
  </div>
);

export const AdminApp: React.FC = () => {
  const [config, setConfig] = useState<AdminDashboardConfig>(() => AdminDashboardApi.loadConfig());
  const [draftConfig, setDraftConfig] = useState<AdminDashboardConfig>(() => AdminDashboardApi.loadConfig());
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [mediaGallery, setMediaGallery] = useState<AdminMediaGallery | null>(null);
  const [usersSnapshot, setUsersSnapshot] = useState<AdminUsersSnapshot | null>(null);
  const [activeView, setActiveView] = useState<AdminView>('pulse');
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('media');
  const [activeMediaSection, setActiveMediaSection] = useState<AdminMediaSection | 'all'>('all');
  const [selectedMediaItem, setSelectedMediaItem] = useState<AdminMediaItem | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [userSort, setUserSort] = useState<UserSort>('activity');
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    couple: 'all',
    owner: 'all',
    status: 'all',
    mediaKind: 'all',
  });
  const [loading, setLoading] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [runningAction, setRunningAction] = useState<'refresh' | 'audit' | 'cleanup' | 'repair' | null>(null);
  const [adminActionBusy, setAdminActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastAdminResult, setLastAdminResult] = useState<Record<string, unknown> | null>(null);

  const hasSnapshot = Boolean(snapshot);
  const overview = snapshot?.overview || emptyOverview;
  const r2Summary = snapshot?.r2?.summary;
  const health = snapshot?.health;
  const actionPayload = snapshot?.audit || snapshot?.cleanup || (snapshot as any)?.repair || null;
  const visibleActionPayload = lastAdminResult || actionPayload;
  const configIssueCount = health?.configIssues?.length || 0;
  const riskLevel = hasSnapshot ? getRiskLevel(overview, configIssueCount) : 'disconnected';
  const lastUpdated = snapshot?.generatedAt ? formatDateTime(snapshot.generatedAt) : 'No snapshot yet';
  const coveragePct = health?.dataCoverage.mediaIndexCoveragePct;
  const connectionReady = useMemo(
    () => Boolean(hasValidWorkerUrl(config.workerUrl) && config.token.trim() && !isPlaceholderToken(config.token)),
    [config.workerUrl, config.token],
  );

  const mediaItems = mediaGallery?.items || [];
  const users = usersSnapshot?.users || [];
  const filteredMedia = useMemo(
    () => filterMediaItems(mediaItems, filters, activeMediaSection),
    [mediaItems, filters, activeMediaSection],
  );

  const filterOptions = useMemo(() => {
    const allItems = mediaItems;
    const couples = Array.from(new Set(allItems.map((item) => item.coupleId || 'unknown'))).sort();
    const owners = Array.from(new Set(allItems.map((item) => item.ownerFolder || item.ownerUserId || 'legacy-or-unknown'))).sort();
    const statuses = Array.from(new Set(allItems.map((item) => item.status))).sort();
    const kinds = Array.from(new Set(allItems.map((item) => item.mediaKind))).sort();
    return { couples, owners, statuses, kinds };
  }, [mediaItems]);

  const ownerFolders = useMemo(() => {
    const map = new Map<string, { owner: string; count: number; bytes: number }>();
    for (const item of filteredMedia) {
      const owner = item.ownerFolder || item.ownerUserId || 'legacy-or-unknown';
      const current = map.get(owner) || { owner, count: 0, bytes: 0 };
      current.count += 1;
      current.bytes += Number(item.byteSize || 0);
      map.set(owner, current);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
  }, [filteredMedia]);

  const integrityItems = useMemo(
    () => mediaItems.filter((item) => item.status === 'missing-object' || item.inlineOnly || !!item.legacyPath || !!item.legacyUrl),
    [mediaItems],
  );

  const largestItems = useMemo(
    () => [...mediaItems].sort((a, b) => Number(b.byteSize || 0) - Number(a.byteSize || 0)).slice(0, 12),
    [mediaItems],
  );

  const sectionCounts = useMemo(() => ({
    all: mediaItems.length,
    journey: mediaItems.filter((item) => item.section === 'journey').length,
    moments: mediaItems.filter((item) => item.section === 'moments').length,
    'secret-space': mediaItems.filter((item) => item.section === 'secret-space').length,
  }), [mediaItems]);

  const coupleCards = useMemo(() => {
    const map = new Map<string, {
      coupleId: string;
      userCount: number;
      users: AdminUserSummary[];
      mediaCount: number;
      mediaBytes: number;
      rowCount: number;
      issueCount: number;
      openAlerts: number;
      cleanupBacklog: number;
      indexedObjects: number;
      missingCount: number;
      lastUpdate: string | null;
    }>();

    const touch = (coupleId: string) => {
      if (!map.has(coupleId)) {
        map.set(coupleId, {
          coupleId,
          userCount: 0,
          users: [],
          mediaCount: 0,
          mediaBytes: 0,
          rowCount: 0,
          issueCount: 0,
          openAlerts: 0,
          cleanupBacklog: 0,
          indexedObjects: 0,
          missingCount: 0,
          lastUpdate: null,
        });
      }
      return map.get(coupleId)!;
    };

    for (const user of users) {
      for (const coupleId of user.coupleIds) {
        const entry = touch(coupleId);
        entry.users.push(user);
        entry.userCount = entry.users.length;
        entry.rowCount += user.rowCount || 0;
        entry.issueCount += (user.missingMediaCount || 0) + (user.inlineRefCount || 0) + (user.legacyRefCount || 0);
        const activity = user.lastActivityAt || user.lastSignInAt || user.createdAt;
        if (activity && (!entry.lastUpdate || activity > entry.lastUpdate)) entry.lastUpdate = activity;
      }
    }

    for (const item of mediaItems) {
      const coupleId = item.coupleId || 'unknown';
      const entry = touch(coupleId);
      entry.mediaCount += 1;
      entry.mediaBytes += Number(item.byteSize || 0);
      if (item.status === 'missing-object' || item.inlineOnly || item.legacyPath || item.legacyUrl) entry.issueCount += 1;
      const activity = item.updatedAt || item.uploadedAt || item.createdAt;
      if (activity && (!entry.lastUpdate || activity > entry.lastUpdate)) entry.lastUpdate = activity;
    }

    for (const couple of snapshot?.couples || []) {
      const entry = touch(couple.couple_id);
      entry.indexedObjects = couple.object_count || 0;
      entry.mediaBytes = Math.max(entry.mediaBytes, Number(couple.total_bytes || 0));
      entry.missingCount = couple.missing_count || 0;
      entry.openAlerts = couple.open_alerts || 0;
      entry.cleanupBacklog = couple.cleanup_backlog || 0;
      if (couple.last_asset_update_at && (!entry.lastUpdate || couple.last_asset_update_at > entry.lastUpdate)) entry.lastUpdate = couple.last_asset_update_at;
    }

    return Array.from(map.values()).sort((a, b) => b.mediaBytes - a.mediaBytes || b.issueCount - a.issueCount || a.coupleId.localeCompare(b.coupleId));
  }, [mediaItems, snapshot?.couples, users]);

  const sortedUsers = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const filtered = users.filter((user) => {
      if (filters.couple !== 'all' && !user.coupleIds.includes(filters.couple)) return false;
      if (filters.owner !== 'all' && user.id !== filters.owner) return false;
      if (!search) return true;
      return [
        user.id,
        user.email,
        user.phone,
        user.coupleIds.join(' '),
        Object.keys(user.tableCounts).join(' '),
      ].join(' ').toLowerCase().includes(search);
    });

    return filtered.sort((a, b) => {
      if (userSort === 'storage') return Number(b.mediaBytes || 0) - Number(a.mediaBytes || 0);
      if (userSort === 'media') return Number(b.mediaCount || 0) - Number(a.mediaCount || 0);
      if (userSort === 'rows') return Number(b.rowCount || 0) - Number(a.rowCount || 0);
      if (userSort === 'issues') {
        const aIssues = Number(a.missingMediaCount || 0) + Number(a.inlineRefCount || 0) + Number(a.legacyRefCount || 0);
        const bIssues = Number(b.missingMediaCount || 0) + Number(b.inlineRefCount || 0) + Number(b.legacyRefCount || 0);
        return bIssues - aIssues;
      }
      if (userSort === 'email') return String(a.email || a.id).localeCompare(String(b.email || b.id));
      return String(b.lastActivityAt || b.lastSignInAt || b.createdAt || '').localeCompare(String(a.lastActivityAt || a.lastSignInAt || a.createdAt || ''));
    });
  }, [filters.couple, filters.owner, filters.search, userSort, users]);

  const overviewCards: ViewCard[] = [
    {
      id: 'coverage',
      label: 'Index coverage',
      value: coveragePct == null ? 'N/A' : `${coveragePct}%`,
      tone: coveragePct != null && coveragePct < 95 ? 'warn' : 'good',
    },
    {
      id: 'alerts',
      label: 'Open alerts',
      value: String(overview.open_alerts || 0),
      tone: statTone(overview.open_alerts || 0, 1, 3),
    },
    {
      id: 'cleanup',
      label: 'Cleanup backlog',
      value: String(overview.cleanup_backlog || 0),
      tone: statTone(overview.cleanup_backlog || 0, 1, 5),
    },
    {
      id: 'missing',
      label: 'Broken refs',
      value: String(integrityItems.length),
      tone: statTone(integrityItems.length, 1, 4),
    },
  ];

  const loadMediaGallery = async (dashboardConfig = config) => {
    if (!connectionReady && dashboardConfig === config) return;
    setMediaLoading(true);
    setMediaError(null);
    try {
      const nextMediaGallery = await AdminDashboardApi.fetchMedia(dashboardConfig);
      setMediaGallery(nextMediaGallery);
    } catch (nextError: any) {
      setMediaError(nextError?.message || 'Admin media browser request failed.');
    } finally {
      setMediaLoading(false);
    }
  };

  const loadUsers = async (dashboardConfig = config) => {
    if (!connectionReady && dashboardConfig === config) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const nextUsersSnapshot = await AdminDashboardApi.fetchUsers(dashboardConfig);
      setUsersSnapshot(nextUsersSnapshot);
    } catch (nextError: any) {
      setUsersError(nextError?.message || 'Admin users request failed.');
    } finally {
      setUsersLoading(false);
    }
  };

  const loadAnalytics = async (dashboardConfig = config, days = analyticsDays) => {
    if (!connectionReady && dashboardConfig === config) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      setAnalytics(await AdminDashboardApi.fetchAnalytics(dashboardConfig, days));
    } catch (nextError: any) {
      setAnalyticsError(nextError?.message || 'Admin analytics request failed.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const changeAnalyticsRange = (days: number) => {
    setAnalyticsDays(days);
    void loadAnalytics(config, days);
  };

  const loadOverview = async (
    source: 'refresh' | 'audit' | 'cleanup' | 'repair' = 'refresh',
    dashboardConfig = config,
  ) => {
    setError(null);
    setNotice(null);
    const ready = Boolean(hasValidWorkerUrl(dashboardConfig.workerUrl) && dashboardConfig.token.trim() && !isPlaceholderToken(dashboardConfig.token));
    if (!ready) return;

    if (source === 'refresh') setLoading(true);
    else setRunningAction(source);

    try {
      const nextSnapshot = source === 'audit'
        ? await AdminDashboardApi.runAudit(dashboardConfig)
        : source === 'repair'
          ? await AdminDashboardApi.runRepair(dashboardConfig)
          : source === 'cleanup'
            ? await AdminDashboardApi.runCleanup(dashboardConfig)
            : await AdminDashboardApi.fetchOverview(dashboardConfig);

      setSnapshot(nextSnapshot);
      await Promise.all([
        loadMediaGallery(dashboardConfig),
        loadUsers(dashboardConfig),
        loadAnalytics(dashboardConfig, analyticsDays),
      ]);
      if (source === 'audit') setNotice('Audit completed and the dashboard data was refreshed.');
      if (source === 'cleanup') setNotice('Cleanup finished and the dashboard data was refreshed.');
      if (source === 'repair') setNotice('Repair finished and the dashboard data was refreshed.');
    } catch (nextError: any) {
      setError(nextError?.message || 'Admin dashboard request failed.');
    } finally {
      setLoading(false);
      setRunningAction(null);
    }
  };

  useEffect(() => {
    if (connectionReady) {
      loadOverview('refresh', config);
    }
  }, [config.workerUrl, config.token]);

  const saveConnection = (event: React.FormEvent) => {
    event.preventDefault();
    const nextConfig = {
      workerUrl: normalizeWorkerUrl(draftConfig.workerUrl),
      token: draftConfig.token.trim(),
    };

    if (!hasValidWorkerUrl(nextConfig.workerUrl)) {
      setError('Enter the base Worker URL, for example https://lior-media.joinlior.workers.dev.');
      setNotice(null);
      return;
    }

    if (!nextConfig.token || isPlaceholderToken(nextConfig.token)) {
      setError('Paste the real ADMIN_DASHBOARD_TOKEN value. The label is not the secret.');
      setNotice(null);
      return;
    }

    AdminDashboardApi.saveConfig(nextConfig);
    setConfig(nextConfig);
    setSnapshot(null);
    setMediaGallery(null);
    setUsersSnapshot(null);
    setSelectedMediaItem(null);
    setSelectedUser(null);
    setNotice('Admin connection saved. Loading backend data now.');
    setError(null);
  };

  const clearConnection = () => {
    AdminDashboardApi.clearConfig();
    const next = { workerUrl: '', token: '' };
    setDraftConfig(next);
    setConfig(next);
    setSnapshot(null);
    setMediaGallery(null);
    setUsersSnapshot(null);
    setSelectedMediaItem(null);
    setSelectedUser(null);
    setNotice('Saved admin connection removed from this device.');
    setError(null);
  };

  const renderMediaPreview = (item: AdminMediaItem) => {
    const previewUrl = getMediaPreviewUrl(config.workerUrl, item);
    if (previewUrl && item.mediaKind === 'image') {
      return <img src={previewUrl} alt={item.title || item.assetRole} loading="lazy" />;
    }
    if (previewUrl && item.mediaKind === 'video') {
      return <video src={previewUrl} controls preload="metadata" />;
    }
    if (previewUrl && item.mediaKind === 'audio') {
      return (
        <div className="media-audio-preview">
          <Music2 size={28} />
          <audio src={previewUrl} controls preload="metadata" />
        </div>
      );
    }
    return (
      <div className="media-empty-preview">
        {mediaIconForKind(item.mediaKind)}
        <strong>{item.inlineOnly ? 'Inline Supabase blob' : 'Preview unavailable'}</strong>
        <span>{item.inlineOnly ? 'This row still carries inline media data instead of a clean R2 object.' : mediaStatusLabel(item)}</span>
      </div>
    );
  };

  const selectView = (view: AdminView) => {
    setActiveView(view);
    if (view !== 'library') setSelectedMediaItem(null);
  };

  // Helper used by inline cross-links throughout the dashboard so a click
  // on "view media" / "view users" / "view couples" jumps to the right
  // tab inside the Library view in one go (rather than a stale activeView
  // value pointing at the old sidebar IDs).
  const jumpToLibrary = (tab: LibraryTab) => {
    setActiveView('library');
    setLibraryTab(tab);
  };

  const refreshDashboardData = async () => {
    await loadOverview('refresh');
  };

  const runResolveAlert = async (id: string) => {
    setAdminActionBusy(`alert:${id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await AdminDashboardApi.resolveAlert(config, id);
      setLastAdminResult(response.result);
      setNotice('Alert resolved. Refreshing the admin snapshot.');
      await refreshDashboardData();
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to resolve alert.');
    } finally {
      setAdminActionBusy(null);
    }
  };

  const runRetryCleanupTask = async (id: string) => {
    setAdminActionBusy(`cleanup-task:${id}`);
    setError(null);
    setNotice(null);
    try {
      const response = await AdminDashboardApi.retryCleanupTask(config, id);
      setLastAdminResult(response.result);
      setNotice('Cleanup task queued for retry. Refreshing the admin snapshot.');
      await refreshDashboardData();
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to retry cleanup task.');
    } finally {
      setAdminActionBusy(null);
    }
  };

  const runVerifyMedia = async (item: AdminMediaItem) => {
    if (!item.r2Key) {
      setError('This media row has no R2 key to verify.');
      return;
    }

    setAdminActionBusy(`verify:${item.r2Key}`);
    setError(null);
    setNotice(null);
    try {
      const response = await AdminDashboardApi.verifyMedia(config, item.r2Key);
      setLastAdminResult(response.result);
      setNotice(response.result.exists ? 'R2 object exists and was verified.' : 'R2 object is missing. Review this item in Integrity.');
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to verify media.');
    } finally {
      setAdminActionBusy(null);
    }
  };

  const exportAdminReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      overview,
      health,
      snapshot,
      users: usersSnapshot,
      media: mediaGallery,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lior-admin-report-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderOverview = () => (
    <div className="view-grid">
      <section className="hero-banner">
        <div>
          <div className="hero-tag-row">
            <span className="hero-kicker">Lior Ops</span>
            <span className={`risk-pill risk-${riskLevel}`}>{riskLabel[riskLevel]}</span>
          </div>
          <h1>Storage command center</h1>
          <p>{riskCopy[riskLevel]}</p>
        </div>
        <div className="hero-meta-grid">
          <div className="hero-meta-card">
            <ShieldCheck size={16} />
            <span>{snapshot?.worker.bucketConfigured ? 'Bucket connected' : 'Bucket unknown'}</span>
          </div>
          <div className="hero-meta-card">
            <Database size={16} />
            <span>{snapshot?.worker.supabaseConfigured ? 'Supabase admin ready' : 'Supabase admin missing'}</span>
          </div>
          <div className="hero-meta-card">
            <Clock3 size={16} />
            <span>{lastUpdated}</span>
          </div>
        </div>
      </section>

      <section className="kpi-grid">
        {overviewCards.map((card) => (
          <article key={card.id} className={`kpi-card tone-${card.tone || 'neutral'}`}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <section className="split-grid">
        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Immediate issues</p>
              <h2>Incident inbox</h2>
            </div>
            <AlertTriangle size={18} />
          </div>
          <div className="stack-list">
            <div className="incident-card">
              <span className={`incident-dot incident-${riskLevel}`} />
              <div>
                <strong>Missing or orphaned media</strong>
                <p>{overview.missing_assets || 0} missing assets and {overview.orphaned_assets || 0} orphaned assets are currently tracked.</p>
              </div>
            </div>
            <div className="incident-card">
              <span className={`incident-dot incident-${integrityItems.length > 0 ? 'watch' : 'healthy'}`} />
              <div>
                <strong>Legacy or inline media debt</strong>
                <p>{mediaGallery?.totals.inlineOnly || 0} inline blobs and {mediaGallery?.totals.legacyRefs || 0} legacy references still need cleanup.</p>
              </div>
            </div>
            <div className="incident-card">
              <span className={`incident-dot incident-${overview.cleanup_backlog > 0 ? 'watch' : 'healthy'}`} />
              <div>
                <strong>Cleanup pipeline</strong>
                <p>{overview.cleanup_backlog || 0} cleanup tasks and {overview.pending_assets || 0} pending assets are waiting for completion.</p>
              </div>
            </div>
          </div>
        </article>

        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Quick actions</p>
              <h2>Ops controls</h2>
            </div>
            <Zap size={18} />
          </div>
          <div className="action-grid">
            <button className="action-tile" onClick={() => loadOverview('refresh')} disabled={!connectionReady || loading || !!runningAction}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              <div><strong>Refresh snapshot</strong><span>Pull the latest overview and media index.</span></div>
            </button>
            <button className="action-tile" onClick={() => loadOverview('audit')} disabled={!connectionReady || loading || !!runningAction}>
              <Search size={16} className={runningAction === 'audit' ? 'spin' : ''} />
              <div><strong>Run audit</strong><span>Check missing objects, orphaned files, and stale legacy refs.</span></div>
            </button>
            <button className="action-tile" onClick={() => loadOverview('repair')} disabled={!connectionReady || loading || !!runningAction}>
              <Wrench size={16} className={runningAction === 'repair' ? 'spin' : ''} />
              <div><strong>Run repair</strong><span>Attempt reindexing and storage-path repair flows.</span></div>
            </button>
            <button className="action-tile danger" onClick={() => loadOverview('cleanup')} disabled={!connectionReady || loading || !!runningAction}>
              <Trash2 size={16} className={runningAction === 'cleanup' ? 'spin' : ''} />
              <div><strong>Run cleanup</strong><span>Execute cleanup tasks and expired media deletion.</span></div>
            </button>
            <button className="action-tile" onClick={exportAdminReport} disabled={!hasSnapshot}>
              <Database size={16} />
              <div><strong>Export report</strong><span>Download the current admin snapshot for offline review.</span></div>
            </button>
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Storage map</p>
              <h2>Media by section</h2>
            </div>
            <Folder size={18} />
          </div>
          <div className="mini-stats-grid">
            {MEDIA_TABS.slice(1).map((tab) => (
              <button
                type="button"
                key={tab.id}
                className="mini-stat-card"
                onClick={() => {
                  jumpToLibrary('media');
                  setActiveMediaSection(tab.id as AdminMediaSection);
                }}
              >
                <span>{tab.label}</span>
                <strong>{sectionCounts[tab.id as AdminMediaSection]}</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">System health</p>
              <h2>Config and truth sources</h2>
            </div>
            <Server size={18} />
          </div>
          <div className="health-strip">
            <div className={`health-pill ${snapshot?.worker.bucketConfigured ? 'ok' : 'bad'}`}>
              <HardDrive size={15} />
              <span>R2 bucket</span>
              <strong>{snapshot?.worker.bucketConfigured ? 'Ready' : 'Missing'}</strong>
            </div>
            <div className={`health-pill ${snapshot?.worker.supabaseConfigured ? 'ok' : 'bad'}`}>
              <KeyRound size={15} />
              <span>Service role</span>
              <strong>{snapshot?.worker.supabaseConfigured ? 'Ready' : 'Missing'}</strong>
            </div>
            <div className={`health-pill ${snapshot?.worker.cleanupTokenConfigured ? 'ok' : 'bad'}`}>
              <ShieldCheck size={15} />
              <span>Cleanup token</span>
              <strong>{snapshot?.worker.cleanupTokenConfigured ? 'Ready' : 'Missing'}</strong>
            </div>
            <div className={`health-pill ${coveragePct == null || coveragePct >= 95 ? 'ok' : 'warn'}`}>
              <CheckCircle2 size={15} />
              <span>Coverage</span>
              <strong>{coveragePct == null ? 'N/A' : `${coveragePct}%`}</strong>
            </div>
          </div>
        </article>
      </section>
    </div>
  );

  const renderMediaExplorer = () => (
    <div className="view-grid">
      <section className="content-hero">
        <div>
          <p className="section-kicker">Media explorer</p>
          <h2>Browse all user media cleanly</h2>
          <p>Use the tabs for feature separation, then filters for couple, owner, status, and media type.</p>
        </div>
        <button className="toolbar-button compact" onClick={() => loadMediaGallery()} disabled={!connectionReady || mediaLoading}>
          <RefreshCw size={15} className={mediaLoading ? 'spin' : ''} />
          Refresh media
        </button>
      </section>

      <section className="media-tabs-wrap">
        <div className="media-tabs">
          {MEDIA_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeMediaSection === tab.id ? 'active' : ''}
              onClick={() => setActiveMediaSection(tab.id)}
            >
              <span>{tab.label}</span>
              <strong>{sectionCounts[tab.id as keyof typeof sectionCounts] ?? 0}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="split-grid split-grid-wide">
        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Owner folders</p>
              <h2>Media grouped by uploader</h2>
            </div>
            <ChevronsUpDown size={18} />
          </div>
          <div className="folder-list">
            {ownerFolders.map((folder) => (
              <div className="folder-card" key={folder.owner}>
                <div className="stack-row">
                  <strong>{folderLabel(folder.owner)}</strong>
                  <span className="badge neutral">{folder.count}</span>
                </div>
                <p>{formatBytes(folder.bytes)} across filtered media.</p>
              </div>
            ))}
            {ownerFolders.length === 0 && (
              <EmptyState title="No owner folders found" copy="Adjust the filters or load media first." icon={<Folder size={26} />} />
            )}
          </div>
        </article>

        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Preview grid</p>
              <h2>{filteredMedia.length} visible media items</h2>
            </div>
            <span className="panel-note">{formatBytes(filteredMedia.reduce((sum, item) => sum + Number(item.byteSize || 0), 0))}</span>
          </div>
          {mediaError && <div className="banner error">{mediaError}</div>}
          {mediaLoading && !mediaGallery && (
            <EmptyState title="Loading media" copy="Pulling media index, rows, and R2 previews." icon={<RefreshCw size={28} className="spin" />} />
          )}
          {!mediaLoading && filteredMedia.length === 0 && (
            <EmptyState title="No matching media" copy="Try widening the filters or switching to another tab." icon={<ImageIcon size={28} />} />
          )}
          {filteredMedia.length > 0 && (
            <div className="media-gallery">
              {filteredMedia.map((item) => {
                const previewUrl = getMediaPreviewUrl(config.workerUrl, item);
                return (
                  <button
                    type="button"
                    className={`media-thumb media-thumb-${item.mediaKind}`}
                    key={item.id}
                    onClick={() => setSelectedMediaItem(item)}
                    title={`${item.title || item.logicalId || 'Untitled'} · ${formatBytes(item.byteSize || 0)} · ${folderLabel(item.ownerFolder)}`}
                  >
                    <div className="media-thumb-image">
                      {renderMediaPreview(item)}
                      <span className="media-thumb-kind" aria-hidden="true">
                        {mediaIconForKind(item.mediaKind)}
                      </span>
                      <span className="media-thumb-size">{formatBytes(item.byteSize || 0)}</span>
                      {item.status !== 'r2-key' && (
                        <span className={`media-thumb-flag status-${item.status}`} title={mediaStatusLabel(item)}>
                          {item.status === 'missing-object' ? 'Missing'
                            : item.status === 'inline-base64' ? 'Inline'
                            : mediaStatusLabel(item)}
                        </span>
                      )}
                      {!previewUrl && (
                        <span className="media-thumb-no-preview">No preview</span>
                      )}
                    </div>
                    <div className="media-thumb-caption">
                      <strong title={item.title}>{item.title || item.logicalId || 'Untitled'}</strong>
                      <span>{folderLabel(item.ownerFolder)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </article>
      </section>
    </div>
  );

  const renderUsers = () => (
    <div className="view-grid">
      <section className="content-hero">
        <div>
          <p className="section-kicker">Users</p>
          <h2>Sort users by data, media, storage, and issues</h2>
          <p>This view merges Supabase Auth users, couple memberships, app rows, and media ownership into one user-first inventory.</p>
        </div>
        <div className="content-hero-actions">
          <label className="filter-field compact-select">
            <span>Sort by</span>
            <select value={userSort} onChange={(event) => setUserSort(event.target.value as UserSort)}>
              <option value="activity">Last activity</option>
              <option value="storage">Storage used</option>
              <option value="media">Media count</option>
              <option value="rows">Row count</option>
              <option value="issues">Issues</option>
              <option value="email">Email / ID</option>
            </select>
          </label>
          <button className="toolbar-button compact" onClick={() => loadUsers()} disabled={!connectionReady || usersLoading}>
            <RefreshCw size={15} className={usersLoading ? 'spin' : ''} />
            Refresh users
          </button>
        </div>
      </section>

      <section className="kpi-grid">
        <article className="kpi-card tone-neutral">
          <span>Total users</span>
          <strong>{usersSnapshot?.totals.totalUsers || 0}</strong>
        </article>
        <article className="kpi-card tone-neutral">
          <span>User rows</span>
          <strong>{usersSnapshot?.totals.totalRows || 0}</strong>
        </article>
        <article className="kpi-card tone-neutral">
          <span>User media</span>
          <strong>{usersSnapshot?.totals.totalMedia || 0}</strong>
        </article>
        <article className="kpi-card tone-warn">
          <span>User storage</span>
          <strong>{formatBytes(usersSnapshot?.totals.totalMediaBytes || 0)}</strong>
        </article>
      </section>

      <section className="split-grid split-grid-wide">
        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">User list</p>
              <h2>{sortedUsers.length} visible users</h2>
            </div>
            <Users size={18} />
          </div>
          {usersError && <div className="banner error">{usersError}</div>}
          <div className="user-list">
            {sortedUsers.map((user) => {
              const issueCount = Number(user.missingMediaCount || 0) + Number(user.inlineRefCount || 0) + Number(user.legacyRefCount || 0);
              return (
                <button
                  type="button"
                  key={user.id}
                  className={`user-card ${selectedUser?.id === user.id ? 'active' : ''}`}
                  onClick={() => setSelectedUser(user)}
                >
                  <div className="user-avatar">{(user.email || user.id).slice(0, 2).toUpperCase()}</div>
                  <div className="user-card-main">
                    <div className="stack-row">
                      <strong>{user.email || shortId(user.id)}</strong>
                      <span className={`badge ${issueCount > 0 ? 'severity-warning' : 'status-ready'}`}>{issueCount} issues</span>
                    </div>
                    <p>{shortId(user.id)} · {user.coupleIds.length} couples · last {formatDateTime(user.lastActivityAt || user.lastSignInAt)}</p>
                    <div className="compact-meta user-meta">
                      <span>{formatBytes(user.mediaBytes || 0)}</span>
                      <span>{user.mediaCount} media</span>
                      <span>{user.rowCount} rows</span>
                    </div>
                  </div>
                </button>
              );
            })}
            {!usersLoading && sortedUsers.length === 0 && (
              <EmptyState title="No users found" copy="Load users or adjust the global filters." icon={<Users size={28} />} />
            )}
            {usersLoading && !usersSnapshot && (
              <EmptyState title="Loading users" copy="Aggregating Auth users, app rows, memberships, and media ownership." icon={<RefreshCw size={28} className="spin" />} />
            )}
          </div>
        </article>

        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">User detail</p>
              <h2>{selectedUser ? (selectedUser.email || shortId(selectedUser.id)) : 'Select a user'}</h2>
            </div>
          </div>
          {!selectedUser && (
            <EmptyState title="Pick a user" copy="Select a user on the left to see their rows, media, couples, and issue profile." icon={<Users size={28} />} />
          )}
          {selectedUser && (
            <div className="user-detail-grid">
              <div className="drawer-metadata">
                <div className="drawer-metadata-card">
                  <span>Storage</span>
                  <strong>{formatBytes(selectedUser.mediaBytes || 0)}</strong>
                </div>
                <div className="drawer-metadata-card">
                  <span>Media</span>
                  <strong>{selectedUser.mediaCount}</strong>
                </div>
                <div className="drawer-metadata-card">
                  <span>Rows</span>
                  <strong>{selectedUser.rowCount}</strong>
                </div>
                <div className="drawer-metadata-card">
                  <span>Refs</span>
                  <strong>{selectedUser.mediaRefCount}</strong>
                </div>
              </div>

              <div className="drawer-list">
                <div className="drawer-row"><span>User ID</span><strong title={selectedUser.id}>{shortId(selectedUser.id)}</strong></div>
                <div className="drawer-row"><span>Email</span><strong>{selectedUser.email || '-'}</strong></div>
                <div className="drawer-row"><span>Created</span><strong>{formatDateTime(selectedUser.createdAt)}</strong></div>
                <div className="drawer-row"><span>Last sign in</span><strong>{formatDateTime(selectedUser.lastSignInAt)}</strong></div>
                <div className="drawer-row"><span>Last activity</span><strong>{formatDateTime(selectedUser.lastActivityAt)}</strong></div>
                <div className="drawer-row"><span>Couples</span><strong>{selectedUser.coupleIds.map(shortId).join(', ') || '-'}</strong></div>
              </div>

              <div className="split-grid">
                <div className="detail-subpanel">
                  <p className="section-kicker">Data tables</p>
                  <div className="mini-table-list">
                    {Object.entries(selectedUser.tableCounts).map(([table, count]) => (
                      <div key={table}><span>{table}</span><strong>{count}</strong></div>
                    ))}
                    {Object.keys(selectedUser.tableCounts).length === 0 && <p className="empty-copy">No app rows attributed to this user.</p>}
                  </div>
                </div>
                <div className="detail-subpanel">
                  <p className="section-kicker">Media features</p>
                  <div className="mini-table-list">
                    {selectedUser.mediaByFeature.map((feature) => (
                      <div key={feature.feature}><span>{feature.feature}</span><strong>{feature.count} · {formatBytes(feature.bytes)}</strong></div>
                    ))}
                    {selectedUser.mediaByFeature.length === 0 && <p className="empty-copy">No indexed media attributed to this user.</p>}
                  </div>
                </div>
              </div>

              <div className="action-grid">
                <button
                  type="button"
                  className="action-tile"
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, owner: selectedUser.id }));
                    jumpToLibrary('media');
                  }}
                >
                  <Eye size={16} />
                  <div><strong>View this user’s media</strong><span>Open Media Explorer filtered to this user.</span></div>
                </button>
                <button
                  type="button"
                  className="action-tile"
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, owner: selectedUser.id }));
                    setActiveView('issues');
                  }}
                >
                  <ShieldAlert size={16} />
                  <div><strong>Review user issues</strong><span>Check missing, inline, or legacy media for this user.</span></div>
                </button>
              </div>
            </div>
          )}
        </article>
      </section>
    </div>
  );

  const renderCouples = () => (
    <div className="view-grid">
      <section className="content-hero">
        <div>
          <p className="section-kicker">Couples</p>
          <h2>One clean control room per couple</h2>
          <p>Each card combines users, media, storage, alerts, cleanup backlog, and recent activity.</p>
        </div>
        <div className="content-hero-actions">
          <button className="toolbar-button compact" onClick={() => loadOverview('refresh')} disabled={!connectionReady || loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <button className="toolbar-button compact" onClick={exportAdminReport} disabled={!hasSnapshot}>
            <Database size={15} />
            Export
          </button>
        </div>
      </section>

      <section className="kpi-grid">
        <article className="kpi-card tone-neutral">
          <span>Total couples</span>
          <strong>{coupleCards.length}</strong>
        </article>
        <article className="kpi-card tone-neutral">
          <span>Visible users</span>
          <strong>{coupleCards.reduce((sum, item) => sum + item.userCount, 0)}</strong>
        </article>
        <article className="kpi-card tone-warn">
          <span>Storage</span>
          <strong>{formatBytes(coupleCards.reduce((sum, item) => sum + item.mediaBytes, 0))}</strong>
        </article>
        <article className="kpi-card tone-bad">
          <span>Open issues</span>
          <strong>{coupleCards.reduce((sum, item) => sum + item.issueCount + item.openAlerts + item.cleanupBacklog, 0)}</strong>
        </article>
      </section>

      <section className="admin-panel section-card">
        <div className="section-head">
          <div>
            <p className="section-kicker">Couple inventory</p>
            <h2>{coupleCards.length} couples tracked</h2>
          </div>
          <Folder size={18} />
        </div>
        <div className="couple-grid">
          {coupleCards.map((couple) => {
            const hasIssues = couple.issueCount + couple.openAlerts + couple.cleanupBacklog + couple.missingCount > 0;
            return (
              <article key={couple.coupleId} className={`couple-card ${hasIssues ? 'attention' : ''}`}>
                <div className="stack-row">
                  <strong title={couple.coupleId}>{shortId(couple.coupleId)}</strong>
                  <span className={`badge ${hasIssues ? 'severity-warning' : 'status-ready'}`}>{hasIssues ? 'needs review' : 'healthy'}</span>
                </div>
                <div className="compact-meta">
                  <span>{couple.userCount} users</span>
                  <span>{couple.mediaCount || couple.indexedObjects} media</span>
                  <span>{formatBytes(couple.mediaBytes)}</span>
                </div>
                <div className="mini-table-list">
                  <div><span>App rows</span><strong>{couple.rowCount}</strong></div>
                  <div><span>Integrity issues</span><strong>{couple.issueCount + couple.missingCount}</strong></div>
                  <div><span>Open alerts</span><strong>{couple.openAlerts}</strong></div>
                  <div><span>Cleanup backlog</span><strong>{couple.cleanupBacklog}</strong></div>
                  <div><span>Last activity</span><strong>{formatDateTime(couple.lastUpdate)}</strong></div>
                </div>
                <div className="avatar-row">
                  {couple.users.slice(0, 4).map((user) => (
                    <span key={user.id} title={user.email || user.id}>{(user.email || user.id).slice(0, 2).toUpperCase()}</span>
                  ))}
                  {couple.users.length > 4 && <span>+{couple.users.length - 4}</span>}
                </div>
                <div className="drawer-actions">
                  <button
                    type="button"
                    className="ghost-button drawer-link"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, couple: couple.coupleId }));
                      jumpToLibrary('media');
                    }}
                  >
                    Media <ArrowUpRight size={14} />
                  </button>
                  <button
                    type="button"
                    className="ghost-button drawer-link"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, couple: couple.coupleId }));
                      jumpToLibrary('users');
                    }}
                  >
                    Users <ArrowUpRight size={14} />
                  </button>
                </div>
              </article>
            );
          })}
          {coupleCards.length === 0 && (
            <EmptyState title="No couples found" copy="Load backend data or check the Supabase admin configuration." icon={<Folder size={28} />} />
          )}
        </div>
      </section>
    </div>
  );

  const renderAlerts = () => {
    const alerts = snapshot?.alerts || [];
    const criticalCount = alerts.filter((alert) => alert.severity === 'critical' || alert.severity === 'error').length;
    const warningCount = alerts.filter((alert) => alert.severity === 'warning').length;

    return (
      <div className="view-grid">
        <section className="content-hero">
          <div>
            <p className="section-kicker">Alerts</p>
            <h2>Resolve storage incidents from one inbox</h2>
            <p>Open alerts stay visible until you resolve them after verifying the underlying media state.</p>
          </div>
          <div className="content-hero-actions">
            <button className="toolbar-button compact" onClick={() => loadOverview('audit')} disabled={!connectionReady || loading || !!runningAction}>
              <Search size={15} className={runningAction === 'audit' ? 'spin' : ''} />
              Run audit
            </button>
            <button className="toolbar-button compact" onClick={() => loadOverview('refresh')} disabled={!connectionReady || loading}>
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </section>

        <section className="kpi-grid">
          <article className="kpi-card tone-bad">
            <span>Critical</span>
            <strong>{criticalCount}</strong>
          </article>
          <article className="kpi-card tone-warn">
            <span>Warnings</span>
            <strong>{warningCount}</strong>
          </article>
          <article className="kpi-card tone-neutral">
            <span>Total open</span>
            <strong>{alerts.length}</strong>
          </article>
          <article className="kpi-card tone-neutral">
            <span>Broken refs</span>
            <strong>{integrityItems.length}</strong>
          </article>
        </section>

        <section className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Alert inbox</p>
              <h2>{alerts.length} active alerts</h2>
            </div>
            <AlertTriangle size={18} />
          </div>
          <div className="stack-list tall-list">
            {alerts.map((alert) => (
              <div className="stack-card" key={alert.id}>
                <div className="stack-row">
                  <strong>{alert.title}</strong>
                  <span className={`badge severity-${alert.severity}`}>{alert.severity}</span>
                </div>
                <p className="muted-line">
                  {alert.alert_type} · couple {shortId(alert.couple_id)} · occurrences {alert.occurrence_count} · {formatDateTime(alert.last_seen_at)}
                </p>
                <code>{jsonPreview(alert.details)}</code>
                <div className="drawer-actions">
                  {alert.couple_id && (
                    <button
                      type="button"
                      className="ghost-button drawer-link"
                      onClick={() => {
                        setFilters((prev) => ({ ...prev, couple: alert.couple_id || 'all' }));
                        jumpToLibrary('media');
                      }}
                    >
                      Inspect media <ArrowUpRight size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="primary-button drawer-link"
                    onClick={() => runResolveAlert(alert.id)}
                    disabled={adminActionBusy === `alert:${alert.id}`}
                  >
                    {adminActionBusy === `alert:${alert.id}` ? 'Resolving...' : 'Resolve alert'}
                  </button>
                </div>
              </div>
            ))}
            {alerts.length === 0 && (
              <EmptyState title="No open alerts" copy="Run an audit anytime you want a fresh integrity pass." icon={<ShieldCheck size={28} />} />
            )}
          </div>
        </section>
      </div>
    );
  };

  const renderJobs = () => {
    const cleanupTasks = snapshot?.cleanupTasks || [];
    const pendingCount = cleanupTasks.filter((task) => task.status === 'pending' || task.status === 'processing').length;
    const failedCount = cleanupTasks.filter((task) => task.status === 'failed').length;
    const retryableCount = cleanupTasks.filter((task) => task.status !== 'completed').length;

    return (
      <div className="view-grid">
        <section className="content-hero">
          <div>
            <p className="section-kicker">Jobs</p>
            <h2>Cleanup queue and retry controls</h2>
            <p>Daily Moments hard-delete work is backend-owned. This screen lets you run cleanup and retry stuck tasks safely.</p>
          </div>
          <div className="content-hero-actions">
            <button className="toolbar-button danger compact" onClick={() => loadOverview('cleanup')} disabled={!connectionReady || loading || !!runningAction}>
              <Trash2 size={15} className={runningAction === 'cleanup' ? 'spin' : ''} />
              Run cleanup
            </button>
            <button className="toolbar-button compact" onClick={() => loadOverview('refresh')} disabled={!connectionReady || loading}>
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
        </section>

        <section className="kpi-grid">
          <article className="kpi-card tone-neutral">
            <span>Recent tasks</span>
            <strong>{cleanupTasks.length}</strong>
          </article>
          <article className="kpi-card tone-warn">
            <span>Pending</span>
            <strong>{pendingCount}</strong>
          </article>
          <article className="kpi-card tone-bad">
            <span>Failed</span>
            <strong>{failedCount}</strong>
          </article>
          <article className="kpi-card tone-neutral">
            <span>Retryable</span>
            <strong>{retryableCount}</strong>
          </article>
        </section>

        <section className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Cleanup tasks</p>
              <h2>{cleanupTasks.length} recent jobs</h2>
            </div>
            <Clock3 size={18} />
          </div>
          <div className="stack-list tall-list">
            {cleanupTasks.map((task) => (
              <div className="stack-card" key={task.id}>
                <div className="stack-row">
                  <strong>{task.feature} · {task.source_table}</strong>
                  <span className={`badge status-${task.status}`}>{task.status}</span>
                </div>
                <p className="muted-line">
                  item {shortId(task.logical_item_id)} · couple {shortId(task.couple_id)} · attempts {task.attempts || 0} · run {formatDateTime(task.run_after)}
                </p>
                <code>{task.storage_paths?.join(' · ') || task.last_error || task.id}</code>
                <div className="drawer-actions">
                  <button
                    type="button"
                    className="ghost-button drawer-link"
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, couple: task.couple_id || 'all' }));
                      jumpToLibrary('media');
                    }}
                  >
                    Related media <ArrowUpRight size={14} />
                  </button>
                  {task.status !== 'completed' && (
                    <button
                      type="button"
                      className="primary-button drawer-link"
                      onClick={() => runRetryCleanupTask(task.id)}
                      disabled={adminActionBusy === `cleanup-task:${task.id}`}
                    >
                      {adminActionBusy === `cleanup-task:${task.id}` ? 'Retrying...' : 'Retry now'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {cleanupTasks.length === 0 && (
              <EmptyState title="No cleanup tasks" copy="There is no visible cleanup backlog in the current snapshot." icon={<CheckCircle2 size={28} />} />
            )}
          </div>
        </section>
      </div>
    );
  };

  const renderIntegrity = () => (
    <div className="view-grid">
      <section className="content-hero">
        <div>
          <p className="section-kicker">Integrity</p>
          <h2>Find what is broken before users do</h2>
          <p>This view isolates missing objects, inline blobs, legacy paths, cleanup backlog, and current open alerts.</p>
        </div>
      </section>

      <section className="kpi-grid">
        <article className="kpi-card tone-bad">
          <span>Missing objects</span>
          <strong>{mediaItems.filter((item) => item.status === 'missing-object').length}</strong>
        </article>
        <article className="kpi-card tone-warn">
          <span>Inline blobs</span>
          <strong>{mediaGallery?.totals.inlineOnly || 0}</strong>
        </article>
        <article className="kpi-card tone-warn">
          <span>Legacy refs</span>
          <strong>{mediaGallery?.totals.legacyRefs || 0}</strong>
        </article>
        <article className="kpi-card tone-neutral">
          <span>Cleanup tasks</span>
          <strong>{snapshot?.cleanupTasks?.length || 0}</strong>
        </article>
      </section>

      <section className="split-grid">
        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Broken items</p>
              <h2>Media that needs attention</h2>
            </div>
          </div>
          <div className="stack-list tall-list">
            {integrityItems.map((item) => (
              <button key={item.id} type="button" className="stack-card actionable-card" onClick={() => {
                setSelectedMediaItem(item);
                jumpToLibrary('media');
              }}>
                <div className="stack-row">
                  <strong>{item.title || item.logicalId || item.id}</strong>
                  <span className={`badge status-${item.status}`}>{mediaStatusLabel(item)}</span>
                </div>
                <p className="muted-line">
                  {item.sectionLabel} · owner {folderLabel(item.ownerFolder)} · couple {shortId(item.coupleId)}
                </p>
                <code>{item.r2Key || item.legacyPath || item.legacyUrl || item.id}</code>
              </button>
            ))}
            {integrityItems.length === 0 && (
              <EmptyState title="No broken media detected" copy="There are no inline blobs, legacy refs, or missing-object rows in the current media dataset." icon={<CheckCircle2 size={28} />} />
            )}
          </div>
        </article>

        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Open alerts</p>
              <h2>Storage alert feed</h2>
            </div>
          </div>
          <div className="stack-list tall-list">
            {snapshot?.alerts?.map((alert) => (
              <div className="stack-card" key={alert.id}>
                <div className="stack-row">
                  <strong>{alert.title}</strong>
                  <span className={`badge severity-${alert.severity}`}>{alert.severity}</span>
                </div>
                <p className="muted-line">
                  {alert.alert_type} · couple {shortId(alert.couple_id)} · occurrences {alert.occurrence_count}
                </p>
                <code>{jsonPreview(alert.details)}</code>
                <div className="drawer-actions">
                  <button
                    type="button"
                    className="primary-button drawer-link"
                    onClick={() => runResolveAlert(alert.id)}
                    disabled={adminActionBusy === `alert:${alert.id}`}
                  >
                    {adminActionBusy === `alert:${alert.id}` ? 'Resolving...' : 'Resolve alert'}
                  </button>
                </div>
              </div>
            ))}
            {(!snapshot?.alerts || snapshot.alerts.length === 0) && (
              <EmptyState title="No open alerts" copy="The worker did not return any active storage alerts." icon={<ShieldCheck size={28} />} />
            )}
          </div>
        </article>
      </section>
    </div>
  );

  const renderCapacity = () => (
    <div className="view-grid">
      <section className="content-hero">
        <div>
          <p className="section-kicker">Capacity</p>
          <h2>Know where storage is going</h2>
          <p>Track bytes by feature, biggest files, top couples, and direct R2 usage so storage costs stay predictable.</p>
        </div>
      </section>

      <section className="split-grid">
        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">By feature</p>
              <h2>Indexed storage usage</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Bytes</th>
                  <th>Objects</th>
                  <th>Missing</th>
                  <th>Couples</th>
                </tr>
              </thead>
              <tbody>
                {overview.usage?.map((item) => (
                  <tr key={item.feature}>
                    <td>{item.feature}</td>
                    <td>{formatBytes(item.total_bytes || 0)}</td>
                    <td>{item.object_count || 0}</td>
                    <td>{item.missing_count || 0}</td>
                    <td>{item.couple_count || 0}</td>
                  </tr>
                ))}
                {(!overview.usage || overview.usage.length === 0) && (
                  <tr><td colSpan={5} className="empty-cell">No indexed usage found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Largest media</p>
              <h2>Biggest files in the gallery</h2>
            </div>
          </div>
          <div className="stack-list tall-list">
            {largestItems.map((item) => (
              <button type="button" className="stack-card actionable-card" key={item.id} onClick={() => {
                jumpToLibrary('media');
                setSelectedMediaItem(item);
              }}>
                <div className="stack-row">
                  <strong>{item.title || item.logicalId || item.id}</strong>
                  <span className="badge neutral">{formatBytes(item.byteSize || 0)}</span>
                </div>
                <p className="muted-line">
                  {item.sectionLabel} · {item.mediaKind} · owner {folderLabel(item.ownerFolder)}
                </p>
                <code>{item.r2Key || item.legacyPath || item.id}</code>
              </button>
            ))}
            {largestItems.length === 0 && <EmptyState title="No media indexed yet" copy="The gallery did not return any media rows." icon={<HardDrive size={28} />} />}
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">By couple</p>
              <h2>Top storage consumers</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Couple</th>
                  <th>Bytes</th>
                  <th>Objects</th>
                  <th>Alerts</th>
                  <th>Backlog</th>
                </tr>
              </thead>
              <tbody>
                {snapshot?.couples?.map((item) => (
                  <tr key={item.couple_id}>
                    <td title={item.couple_id}>{shortId(item.couple_id)}</td>
                    <td>{formatBytes(item.total_bytes || 0)}</td>
                    <td>{item.object_count || 0}</td>
                    <td>{item.open_alerts || 0}</td>
                    <td>{item.cleanup_backlog || 0}</td>
                  </tr>
                ))}
                {(!snapshot?.couples || snapshot.couples.length === 0) && (
                  <tr><td colSpan={5} className="empty-cell">No couple usage returned.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">R2 truth</p>
              <h2>Usage directly from bucket</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Bytes</th>
                  <th>Objects</th>
                  <th>Couples</th>
                </tr>
              </thead>
              <tbody>
                {r2Summary?.usage?.map((item) => (
                  <tr key={item.feature}>
                    <td>{item.feature}</td>
                    <td>{formatBytes(item.total_bytes || 0)}</td>
                    <td>{item.object_count || 0}</td>
                    <td>{item.couple_count || 0}</td>
                  </tr>
                ))}
                {(!r2Summary?.usage || r2Summary.usage.length === 0) && (
                  <tr><td colSpan={4} className="empty-cell">No R2 usage data found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );

  const renderActivity = () => (
    <div className="view-grid">
      <section className="content-hero">
        <div>
          <p className="section-kicker">Activity</p>
          <h2>Track what the backend has been doing</h2>
          <p>See recent storage events, cleanup jobs, metrics, and the raw output of the last manual action.</p>
        </div>
      </section>

      <section className="split-grid">
        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Cleanup queue</p>
              <h2>Recent cleanup tasks</h2>
            </div>
          </div>
          <div className="stack-list tall-list">
            {snapshot?.cleanupTasks?.map((task) => (
              <div className="stack-card" key={task.id}>
                <div className="stack-row">
                  <strong>{task.feature} · {task.source_table}</strong>
                  <span className={`badge status-${task.status}`}>{task.status}</span>
                </div>
                <p className="muted-line">
                  item {shortId(task.logical_item_id)} · attempts {task.attempts || 0} · run {formatDateTime(task.run_after)}
                </p>
                {task.last_error && <code>{task.last_error}</code>}
              </div>
            ))}
            {(!snapshot?.cleanupTasks || snapshot.cleanupTasks.length === 0) && (
              <EmptyState title="No cleanup tasks" copy="The worker did not return any cleanup jobs." icon={<Clock3 size={28} />} />
            )}
          </div>
        </article>

        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Recent events</p>
              <h2>Storage event feed</h2>
            </div>
          </div>
          <div className="stack-list tall-list">
            {snapshot?.events?.map((event) => (
              <div className="stack-card" key={event.id}>
                <div className="stack-row">
                  <strong>{event.event_type}</strong>
                  <span className={`badge severity-${event.severity}`}>{event.severity}</span>
                </div>
                <p className="muted-line">
                  {formatDateTime(event.created_at)} · couple {shortId(event.couple_id)} · {event.feature || 'n/a'}
                </p>
                <code>{event.r2_key || jsonPreview(event.metadata)}</code>
              </div>
            ))}
            {(!snapshot?.events || snapshot.events.length === 0) && (
              <EmptyState title="No recent events" copy="There are no recent storage events in the current snapshot." icon={<Activity size={28} />} />
            )}
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Daily metrics</p>
              <h2>Feature trends</h2>
            </div>
          </div>
          <div className="stack-list tall-list">
            {snapshot?.metrics?.map((metric, index) => (
              <div className="stack-card" key={`${metric.metric_date}-${metric.feature}-${index}`}>
                <div className="stack-row">
                  <strong>{metric.metric_date} · {metric.feature}</strong>
                  <span className="badge neutral">{formatBytes(metric.total_bytes || 0)}</span>
                </div>
                <p className="muted-line">
                  objects {metric.object_count} · missing {metric.missing_object_count} · orphaned {metric.orphan_object_count}
                </p>
                <p className="muted-line">
                  legacy {metric.legacy_ref_count} · expired {metric.expired_row_count} · alerts {metric.alert_count}
                </p>
              </div>
            ))}
            {(!snapshot?.metrics || snapshot.metrics.length === 0) && (
              <EmptyState title="No metrics recorded" copy="The worker has not returned any daily storage metrics yet." icon={<BarChart3 size={28} />} />
            )}
          </div>
        </article>

        <article className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Last action</p>
              <h2>Raw backend payload</h2>
            </div>
          </div>
          {visibleActionPayload ? (
            <pre className="json-block">{JSON.stringify(visibleActionPayload, null, 2)}</pre>
          ) : (
            <EmptyState title="No action output yet" copy="Run audit, repair, cleanup, verify, retry, or resolve to inspect the raw backend response here." icon={<Zap size={28} />} />
          )}
        </article>
      </section>
    </div>
  );

  const renderAccess = () => (
    <div className="view-grid">
      <section className="content-hero">
        <div>
          <p className="section-kicker">Access</p>
          <h2>Secure worker connection</h2>
          <p>Only the base worker URL and the real `ADMIN_DASHBOARD_TOKEN` belong here. Never paste a Supabase service-role key into the dashboard.</p>
        </div>
      </section>

      <section className="admin-panel section-card command-panel-inline">
        <div className="section-head">
          <div>
            <p className="section-kicker">Connection</p>
            <h2>Worker and token</h2>
          </div>
          <span className="panel-note">Private dashboard only</span>
        </div>

        <form className="connection-grid" onSubmit={saveConnection}>
          <label className="field">
            <span>Worker URL</span>
            <input
              type="url"
              value={draftConfig.workerUrl}
              onChange={(event) => setDraftConfig((prev) => ({ ...prev, workerUrl: event.target.value }))}
              placeholder="https://lior-media.joinlior.workers.dev"
            />
          </label>

          <label className="field">
            <span>Admin token</span>
            <input
              type="password"
              value={draftConfig.token}
              onChange={(event) => setDraftConfig((prev) => ({ ...prev, token: event.target.value }))}
              placeholder="ADMIN_DASHBOARD_TOKEN"
              autoComplete="off"
            />
          </label>

          <div className="connection-actions">
            <button type="submit" className="primary-button">Save connection</button>
            <button type="button" className="ghost-button" onClick={clearConnection}>Clear saved access</button>
          </div>
        </form>

        <div className="toolbar" aria-label="Admin actions">
          <button className="toolbar-button" onClick={() => loadOverview('refresh')} disabled={!connectionReady || loading || !!runningAction}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <button className="toolbar-button" onClick={() => loadOverview('audit')} disabled={!connectionReady || loading || !!runningAction}>
            <Search size={16} className={runningAction === 'audit' ? 'spin' : ''} />
            Run audit
          </button>
          <button className="toolbar-button" onClick={() => loadOverview('repair')} disabled={!connectionReady || loading || !!runningAction}>
            <Wrench size={16} className={runningAction === 'repair' ? 'spin' : ''} />
            Run repair
          </button>
          <button className="toolbar-button danger" onClick={() => loadOverview('cleanup')} disabled={!connectionReady || loading || !!runningAction}>
            <Trash2 size={16} className={runningAction === 'cleanup' ? 'spin' : ''} />
            Run cleanup
          </button>
        </div>

        {notice && <div className="banner notice">{notice}</div>}
        {error && <div className="banner error">{error}</div>}
        {health?.configIssues?.map((issue) => (
          <div className="banner error" key={issue}>{issue}</div>
        ))}
        {!connectionReady && !error && (
          <div className="banner soft">Paste the real token value, not the literal text `ADMIN_DASHBOARD_TOKEN`.</div>
        )}
      </section>
    </div>
  );

  const renderCurrentView = () => {
    // Always allow the System view to render — that's where the worker
    // connection setup lives, so the user can fix the missing snapshot.
    if (!hasSnapshot && activeView !== 'system') {
      return (
        <section className="admin-panel section-card">
          <div className="section-head">
            <div>
              <p className="section-kicker">Setup required</p>
              <h2>No backend snapshot loaded yet</h2>
            </div>
          </div>
          <div className="setup-grid">
            <div className={`setup-step ${hasValidWorkerUrl(draftConfig.workerUrl) ? 'done' : ''}`}>
              <strong>1. Worker URL</strong>
              <span>Use only the base worker URL. Do not add `/__admin/overview`.</span>
              <code>https://lior-media.joinlior.workers.dev</code>
            </div>
            <div className={`setup-step ${draftConfig.token.trim() && !isPlaceholderToken(draftConfig.token) ? 'done' : ''}`}>
              <strong>2. Admin token</strong>
              <span>Paste the actual secret value from `ADMIN_DASHBOARD_TOKEN`.</span>
              <code>Never use Supabase service-role keys here.</code>
            </div>
            <div className={`setup-step ${connectionReady ? 'done' : ''}`}>
              <strong>3. Load data</strong>
              <span>Save the connection, then refresh to load overview, media, alerts, and metrics.</span>
              <code>{connectionReady ? 'Ready to fetch' : 'Waiting for valid connection'}</code>
            </div>
          </div>
        </section>
      );
    }

    if (activeView === 'library') return renderLibrary();
    if (activeView === 'analytics') return renderAnalytics();
    if (activeView === 'issues') return renderIssues();
    if (activeView === 'system') return renderSystem();
    return renderPulse();
  };

  // ── Composed views — wrap the original section renderers so the old
  // logic keeps working unchanged, but the dashboard is presented as a
  // small set of object-centric workspaces instead of 10 sibling tabs.

  const renderAnalytics = () => {
    const a = analytics;

    // Activity area path (daily events)
    const daily = a?.daily ?? [];
    const series = daily.map((d) => d.events);
    const n = series.length;
    const maxEvt = Math.max(1, ...series);
    const W = 720; const H = 200; const padX = 8; const padTop = 16; const padB = 24;
    const plotW = W - padX * 2; const plotH = H - padTop - padB;
    const px = (i: number) => padX + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
    const py = (v: number) => padTop + (1 - v / maxEvt) * plotH;
    const linePath = series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
    const areaPath = n > 0 ? `${linePath} L ${px(n - 1).toFixed(1)} ${padTop + plotH} L ${px(0).toFixed(1)} ${padTop + plotH} Z` : '';
    const hasActivity = series.some((v) => v > 0);
    const shortDay = (iso?: string) => (iso ? iso.slice(5).replace('-', '/') : '');

    const barRows = (rows: Array<{ label: string; value: number; display: string }>) => {
      const max = Math.max(1, ...rows.map((r) => r.value));
      return rows.map((r, i) => (
        <div className="an-bar-row" key={r.label}>
          <span className="an-bar-label" title={r.label}>{r.label}</span>
          <div className="an-bar-track" role="img" aria-label={`${r.label}: ${r.display}`}>
            <div
              className="an-bar-fill"
              style={{ '--w': `${Math.round((r.value / max) * 100)}%`, '--i': i } as React.CSSProperties}
            />
          </div>
          <span className="an-bar-val">{r.display}</span>
        </div>
      ));
    };

    const f = a?.funnel;
    const funnelSteps = f
      ? [
          { key: 'app_open', label: 'App opened', value: f.app_open, c: 'var(--an-c1)' },
          { key: 'onboarding_complete', label: 'Finished onboarding', value: f.onboarding_complete, c: 'var(--an-c2)' },
          { key: 'pair_joined', label: 'Paired with partner', value: f.pair_joined, c: 'var(--an-c3)' },
          { key: 'ritual_completed', label: 'Completed a ritual', value: f.ritual_completed, c: 'var(--an-c4)' },
        ]
      : [];
    const funnelTop = Math.max(1, funnelSteps[0]?.value ?? 1);

    return (
      <div className="view-grid analytics-view">
        <section className="content-hero">
          <div>
            <p className="section-kicker">Analytics</p>
            <h2>How the app is actually used</h2>
            <p>First-party product analytics from your own data — pages, features, active users, the core funnel, and recent errors. No third-party tools needed.</p>
          </div>
          <div className="content-hero-actions">
            <div className="an-range" role="tablist" aria-label="Date range">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={analyticsDays === d ? 'active' : ''}
                  onClick={() => changeAnalyticsRange(d)}
                  disabled={analyticsLoading}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button className="toolbar-button compact" onClick={() => loadAnalytics()} disabled={!connectionReady || analyticsLoading}>
              <RefreshCw size={15} className={analyticsLoading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </section>

        {analyticsError && <div className="banner error">{analyticsError}</div>}
        {analyticsLoading && !a && (
          <EmptyState title="Loading analytics" copy="Aggregating events and errors from your database." icon={<RefreshCw size={28} className="spin" />} />
        )}

        {a && (
          <>
            <section className="an-kpi-grid">
              <article className="an-stat tone-good">
                <div className="an-stat-top"><span>Daily active</span><Users size={16} /></div>
                <strong>{fmtNum(a.dau)}</strong>
                <small>people used the app today</small>
              </article>
              <article className="an-stat">
                <div className="an-stat-top"><span>Weekly active</span><Users size={16} /></div>
                <strong>{fmtNum(a.wau)}</strong>
                <small>in the last 7 days</small>
              </article>
              <article className="an-stat">
                <div className="an-stat-top"><span>Events</span><Zap size={16} /></div>
                <strong>{fmtNum(a.totals.events)}</strong>
                <small>last {a.range_days} days</small>
              </article>
              <article className="an-stat">
                <div className="an-stat-top"><span>Active couples</span><Activity size={16} /></div>
                <strong>{fmtNum(a.totals.couples)}</strong>
                <small>with any activity</small>
              </article>
              <article className={`an-stat tone-${statTone(a.error_count_24h, 1, 10)}`}>
                <div className="an-stat-top"><span>Errors (24h)</span><ShieldAlert size={16} /></div>
                <strong>{fmtNum(a.error_count_24h)}</strong>
                <small>{fmtNum(a.error_count_window)} in {a.range_days}d</small>
              </article>
            </section>

            <section className="an-split wide">
              <article className="admin-panel section-card">
                <div className="section-head"><div><p className="section-kicker">Engagement</p><h2>Activity over time</h2></div><Activity size={18} /></div>
                {hasActivity ? (
                  <svg className="an-area" viewBox="0 0 720 200" preserveAspectRatio="none" role="img" aria-label="Daily events over time">
                    <defs>
                      <linearGradient id="anFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {[0, 0.5, 1].map((g) => (
                      <line key={g} x1={padX} x2={W - padX} y1={padTop + plotH * g} y2={padTop + plotH * g} stroke="var(--an-grid)" strokeWidth="1" />
                    ))}
                    <path d={areaPath} fill="url(#anFill)" />
                    <path
                      className="an-line"
                      d={linePath}
                      fill="none"
                      stroke="var(--an-accent)"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      style={{ strokeDasharray: 2000, strokeDashoffset: 2000 }}
                    />
                    <circle cx={px(n - 1)} cy={py(series[n - 1] ?? 0)} r="8" fill="var(--an-accent)" opacity="0.18" />
                    <circle cx={px(n - 1)} cy={py(series[n - 1] ?? 0)} r="4" fill="var(--an-accent)" />
                    <text x={padX} y={H - 6} fontSize="11" fill="var(--admin-muted)" textAnchor="start">{shortDay(daily[0]?.day)}</text>
                    <text x={W / 2} y={H - 6} fontSize="11" fill="var(--admin-muted)" textAnchor="middle">{shortDay(daily[Math.floor(n / 2)]?.day)}</text>
                    <text x={W - padX} y={H - 6} fontSize="11" fill="var(--admin-muted)" textAnchor="end">{shortDay(daily[n - 1]?.day)}</text>
                  </svg>
                ) : (
                  <EmptyState title="No activity yet" copy="A line appears here once people start opening the app." icon={<Activity size={26} />} />
                )}
                <p className="an-note">Events per day · peak {fmtNum(maxEvt)}</p>
              </article>

              <article className="admin-panel section-card">
                <div className="section-head"><div><p className="section-kicker">Core funnel</p><h2>Open → Pair → Ritual</h2></div><Filter size={18} /></div>
                {funnelSteps.some((s) => s.value > 0) ? (
                  <div className="an-funnel">
                    {funnelSteps.map((s, i) => {
                      const pct = Math.round((s.value / funnelTop) * 100);
                      const prev = i > 0 ? funnelSteps[i - 1].value : s.value;
                      const conv = prev > 0 ? Math.round((s.value / prev) * 100) : 0;
                      return (
                        <div key={s.key}>
                          <div className="an-funnel-head"><span>{s.label}</span><b>{fmtNum(s.value)}</b></div>
                          <div className="an-funnel-bar">
                            <div className="an-funnel-fill" style={{ '--w': `${pct}%`, '--c': s.c, '--i': i } as React.CSSProperties} />
                          </div>
                          <div className="an-funnel-rate">
                            {i === 0 ? `${pct}% of app opens` : `↓ ${conv}% kept · ${fmtNum(Math.max(0, prev - s.value))} dropped`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState title="Funnel is empty" copy="This builds as people open, onboard, pair, and complete their first ritual." icon={<Filter size={26} />} />
                )}
              </article>
            </section>

            <section className="an-split">
              <article className="admin-panel section-card">
                <div className="section-head"><div><p className="section-kicker">Pages</p><h2>Most-visited screens</h2></div><LayoutDashboard size={18} /></div>
                {a.top_pages.length ? (
                  <div className="an-bars">{barRows(a.top_pages.map((p) => ({ label: p.screen, value: p.count, display: fmtNum(p.count) })))}</div>
                ) : (
                  <EmptyState title="No page data yet" copy="Fills in once people move through the app." icon={<LayoutDashboard size={26} />} />
                )}
              </article>
              <article className="admin-panel section-card">
                <div className="section-head"><div><p className="section-kicker">Features</p><h2>Most-used features</h2></div><Zap size={18} /></div>
                {a.top_features.length ? (
                  <div className="an-bars">{barRows(a.top_features.map((p) => ({ label: p.feature, value: p.count, display: fmtNum(p.count) })))}</div>
                ) : (
                  <EmptyState title="No feature data yet" copy="Fills in as people use features like watering the bonsai or sending a note." icon={<Zap size={26} />} />
                )}
              </article>
            </section>

            <section className="an-split">
              <article className="admin-panel section-card">
                <div className="section-head"><div><p className="section-kicker">Attention</p><h2>Time spent per screen</h2></div><Clock3 size={18} /></div>
                <p className="an-note">Average time before leaving a screen</p>
                {a.dwell_by_screen.length ? (
                  <div className="an-bars">{barRows(a.dwell_by_screen.map((d) => ({ label: d.screen, value: d.avg_ms, display: fmtSecs(d.avg_ms) })))}</div>
                ) : (
                  <EmptyState title="No timing data yet" copy="Needs a few screen visits before averages appear." icon={<Clock3 size={26} />} />
                )}
              </article>
              <article className="admin-panel section-card">
                <div className="section-head"><div><p className="section-kicker">Stability</p><h2>Recent errors</h2></div><ShieldAlert size={18} /></div>
                {a.recent_errors.length ? (
                  <div className="an-errors">
                    {a.recent_errors.map((e, i) => (
                      <div className="an-error-row" key={i}>
                        <span className="an-error-dot" />
                        <div className="an-error-body">
                          <div className="an-error-top">
                            <strong title={e.message}>{e.message || 'Unknown error'}</strong>
                            <time>{fmtAgo(e.created_at)}</time>
                          </div>
                          <div className="an-error-meta">
                            {e.source ? <span className="an-tag">{e.source}</span> : null}
                            <span className="an-error-ver">{e.app_version || 'n/a'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="All quiet" copy="No errors reported recently — that's a good sign." icon={<ShieldCheck size={28} />} />
                )}
              </article>
            </section>
          </>
        )}
      </div>
    );
  };

  const renderPulse = () => (
    <>
      {renderOverview()}
      {renderCapacity()}
    </>
  );

  const renderLibrary = () => (
    <div className="library-view">
      <div className="library-tabs" role="tablist" aria-label="Library section">
        {LIBRARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = libraryTab === tab.id;
          const count = tab.id === 'media'
            ? mediaItems.length
            : tab.id === 'users'
              ? users.length
              : coupleCards.length;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`library-tab ${active ? 'active' : ''}`}
              onClick={() => setLibraryTab(tab.id)}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              <strong className="library-tab-count">{count}</strong>
            </button>
          );
        })}
      </div>
      <div className="library-tab-panel">
        {libraryTab === 'media' && renderMediaExplorer()}
        {libraryTab === 'users' && renderUsers()}
        {libraryTab === 'couples' && renderCouples()}
      </div>
    </div>
  );

  const renderIssues = () => (
    <>
      {renderAlerts()}
      {renderJobs()}
      {renderIntegrity()}
    </>
  );

  const renderSystem = () => (
    <>
      {renderActivity()}
      {renderAccess()}
    </>
  );


  return (
    <div className="admin-shell">
      <div className="admin-glow admin-glow-one" />
      <div className="admin-glow admin-glow-two" />

      <div className="admin-workspace">
        <aside className="admin-sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-logo">LO</div>
            <div>
              <strong>Lior Ops</strong>
              <span>Storage admin</span>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Admin views">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`sidebar-link ${activeView === item.id ? 'active' : ''}`}
                  onClick={() => selectView(item.id)}
                >
                  <Icon size={18} />
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.kicker}</span>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="sidebar-summary">
            <div className="sidebar-summary-card">
              <span>State</span>
              <strong>{riskLabel[riskLevel]}</strong>
            </div>
            <div className="sidebar-summary-card">
              <span>Managed bytes</span>
              <strong>{formatBytes(overview.total_bytes || 0)}</strong>
            </div>
            <div className="sidebar-summary-card">
              <span>Users</span>
              <strong>{users.length}</strong>
            </div>
            <div className="sidebar-summary-card">
              <span>Visible media</span>
              <strong>{mediaItems.length}</strong>
            </div>
          </div>
        </aside>

        <main className="admin-main">
          <header className="admin-topbar">
            <div>
              <p className="section-kicker">
                {activeView === 'library' ? `Library · ${LIBRARY_TABS.find((tab) => tab.id === libraryTab)?.label || ''}` : 'Workspace'}
              </p>
              <h2>{NAV_ITEMS.find((item) => item.id === activeView)?.label || 'Pulse'}</h2>
            </div>
            <div className="topbar-meta">
              <div className="topbar-chip">
                <Activity size={15} />
                <span>{lastUpdated}</span>
              </div>
              <div className={`topbar-chip state-${riskLevel}`}>
                <ShieldCheck size={15} />
                <span>{riskLabel[riskLevel]}</span>
              </div>
            </div>
          </header>

          {VIEWS_WITH_FILTERS.has(activeView) && (
          <section className="filter-bar">
            <div className="filter-lead">
              <Filter size={16} />
              <span>Global filters</span>
            </div>
            <label className="filter-field filter-search">
              <Search size={15} />
              <input
                type="search"
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
                placeholder="Search title, owner, couple, path, status"
              />
            </label>
            <label className="filter-field">
              <span>Couple</span>
              <select value={filters.couple} onChange={(event) => setFilters((prev) => ({ ...prev, couple: event.target.value }))}>
                <option value="all">All couples</option>
                {filterOptions.couples.map((value) => <option key={value} value={value}>{shortId(value)}</option>)}
              </select>
            </label>
            <label className="filter-field">
              <span>Owner</span>
              <select value={filters.owner} onChange={(event) => setFilters((prev) => ({ ...prev, owner: event.target.value }))}>
                <option value="all">All owners</option>
                {filterOptions.owners.map((value) => <option key={value} value={value}>{folderLabel(value)}</option>)}
              </select>
            </label>
            <label className="filter-field">
              <span>Status</span>
              <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
                <option value="all">All statuses</option>
                {filterOptions.statuses.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="filter-field">
              <span>Type</span>
              <select value={filters.mediaKind} onChange={(event) => setFilters((prev) => ({ ...prev, mediaKind: event.target.value }))}>
                <option value="all">All types</option>
                {filterOptions.kinds.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="ghost-button reset-button"
              onClick={() => setFilters({ search: '', couple: 'all', owner: 'all', status: 'all', mediaKind: 'all' })}
            >
              Reset
            </button>
          </section>
          )}

          {renderCurrentView()}

          <footer className="admin-footer">
            <span>Last snapshot: {snapshot?.generatedAt ? formatDateTime(snapshot.generatedAt) : '-'}</span>
            <span>Media browser: {mediaGallery?.generatedAt ? formatDateTime(mediaGallery.generatedAt) : '-'}</span>
          </footer>
        </main>
      </div>

      {selectedMediaItem && (
        <div className="drawer-backdrop" onClick={() => setSelectedMediaItem(null)}>
          <aside className="detail-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <p className="section-kicker">Media detail</p>
                <h2>{selectedMediaItem.title || selectedMediaItem.logicalId || selectedMediaItem.id}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedMediaItem(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="drawer-preview">
              {renderMediaPreview(selectedMediaItem)}
            </div>

            <div className="drawer-metadata">
              <div className="drawer-metadata-card">
                <span>Status</span>
                <strong>{mediaStatusLabel(selectedMediaItem)}</strong>
              </div>
              <div className="drawer-metadata-card">
                <span>Section</span>
                <strong>{selectedMediaItem.sectionLabel}</strong>
              </div>
              <div className="drawer-metadata-card">
                <span>Owner</span>
                <strong>{folderLabel(selectedMediaItem.ownerFolder)}</strong>
              </div>
              <div className="drawer-metadata-card">
                <span>Size</span>
                <strong>{formatBytes(selectedMediaItem.byteSize || 0)}</strong>
              </div>
            </div>

            <div className="drawer-list">
              <div className="drawer-row"><span>Couple</span><strong title={selectedMediaItem.coupleId || ''}>{shortId(selectedMediaItem.coupleId)}</strong></div>
              <div className="drawer-row"><span>Item</span><strong title={selectedMediaItem.logicalId || ''}>{shortId(selectedMediaItem.logicalId)}</strong></div>
              <div className="drawer-row"><span>Source</span><strong>{selectedMediaItem.sourceTable || selectedMediaItem.feature || '-'}</strong></div>
              <div className="drawer-row"><span>Created</span><strong>{formatDateTime(selectedMediaItem.createdAt)}</strong></div>
              <div className="drawer-row"><span>Updated</span><strong>{formatDateTime(selectedMediaItem.updatedAt || selectedMediaItem.uploadedAt)}</strong></div>
              <div className="drawer-row"><span>Expires</span><strong>{formatDateTime(selectedMediaItem.expiresAt)}</strong></div>
              <div className="drawer-row"><span>Checksum</span><strong title={selectedMediaItem.checksumSha256 || ''}>{shortId(selectedMediaItem.checksumSha256)}</strong></div>
            </div>

            {selectedMediaItem.r2Key && <code className="drawer-code">{selectedMediaItem.r2Key}</code>}
            {!selectedMediaItem.r2Key && (selectedMediaItem.legacyPath || selectedMediaItem.legacyUrl) && (
              <code className="drawer-code">{selectedMediaItem.legacyPath || selectedMediaItem.legacyUrl}</code>
            )}

            <div className="drawer-actions">
              {getMediaPreviewUrl(config.workerUrl, selectedMediaItem) && (
                <a
                  className="primary-button drawer-link"
                  href={getMediaPreviewUrl(config.workerUrl, selectedMediaItem) || '#'}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original <ExternalLink size={14} />
                </a>
              )}
              <button
                type="button"
                className="ghost-button drawer-link"
                onClick={() => {
                  setActiveView('issues');
                  setSelectedMediaItem(null);
                }}
              >
                Review in integrity <ArrowUpRight size={14} />
              </button>
              {selectedMediaItem.r2Key && (
                <button
                  type="button"
                  className="ghost-button drawer-link"
                  onClick={() => runVerifyMedia(selectedMediaItem)}
                  disabled={adminActionBusy === `verify:${selectedMediaItem.r2Key}`}
                >
                  {adminActionBusy === `verify:${selectedMediaItem.r2Key}` ? 'Verifying...' : 'Verify R2 object'}
                  <CheckCircle2 size={14} />
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
