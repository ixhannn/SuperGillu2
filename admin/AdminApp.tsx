import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Database, HardDrive, RefreshCw, ShieldCheck, Trash2, Wrench, Zap } from 'lucide-react';
import { formatBytes } from '../shared/mediaPolicy.js';
import {
  AdminDashboardApi,
  AdminDashboardConfig,
  AdminDashboardSnapshot,
} from './adminApi';
import './admin.css';

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const shortId = (value?: string | null) => {
  if (!value) return '-';
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
};

const jsonPreview = (value: unknown) => {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  } catch {
    return '{}';
  }
};

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

export const AdminApp: React.FC = () => {
  const [config, setConfig] = useState<AdminDashboardConfig>(() => AdminDashboardApi.loadConfig());
  const [draftConfig, setDraftConfig] = useState<AdminDashboardConfig>(() => AdminDashboardApi.loadConfig());
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningAction, setRunningAction] = useState<'refresh' | 'audit' | 'cleanup' | 'repair' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const overview = snapshot?.overview || emptyOverview;
  const connectionReady = useMemo(
    () => Boolean(config.workerUrl.trim() && config.token.trim()),
    [config.workerUrl, config.token],
  );

  const loadOverview = async (source: 'refresh' | 'audit' | 'cleanup' | 'repair' = 'refresh') => {
    setError(null);
    setNotice(null);
    if (!connectionReady) return;

    if (source === 'refresh') setLoading(true);
    else setRunningAction(source);

    try {
      const nextSnapshot = source === 'audit'
        ? await AdminDashboardApi.runAudit(config)
        : source === 'repair'
          ? await AdminDashboardApi.runRepair(config)
        : source === 'cleanup'
          ? await AdminDashboardApi.runCleanup(config)
          : await AdminDashboardApi.fetchOverview(config);

      setSnapshot(nextSnapshot);
      if (source === 'audit') setNotice('Audit completed and dashboard data was refreshed.');
      if (source === 'cleanup') setNotice('Cleanup finished and dashboard data was refreshed.');
      if (source === 'repair') setNotice('Repair finished and dashboard data was refreshed.');
    } catch (nextError: any) {
      setError(nextError?.message || 'Admin dashboard request failed.');
    } finally {
      setLoading(false);
      setRunningAction(null);
    }
  };

  useEffect(() => {
    if (connectionReady) {
      loadOverview('refresh');
    }
  }, [config.workerUrl, config.token]);

  const saveConnection = (event: React.FormEvent) => {
    event.preventDefault();
    const nextConfig = {
      workerUrl: draftConfig.workerUrl.trim().replace(/\/+$/, ''),
      token: draftConfig.token.trim(),
    };
    AdminDashboardApi.saveConfig(nextConfig);
    setConfig(nextConfig);
    setNotice('Admin connection saved on this device.');
    setError(null);
  };

  const clearConnection = () => {
    AdminDashboardApi.clearConfig();
    const next = { workerUrl: '', token: '' };
    setDraftConfig(next);
    setConfig(next);
    setSnapshot(null);
    setNotice('Saved admin connection removed from this device.');
    setError(null);
  };

  return (
    <div className="admin-shell">
      <div className="admin-glow admin-glow-one" />
      <div className="admin-glow admin-glow-two" />

      <main className="admin-page">
        <section className="admin-hero">
          <div>
            <p className="admin-eyebrow">Lior Ops</p>
            <h1>Storage and media control room</h1>
            <p className="admin-copy">
              Separate admin web app for media reliability, storage costs, cleanup health, and incident visibility.
            </p>
          </div>

          <div className="admin-hero-meta">
            <div className="metric-chip">
              <ShieldCheck size={16} />
              <span>{snapshot?.worker.bucketConfigured ? 'Bucket ready' : 'Bucket unknown'}</span>
            </div>
            <div className="metric-chip">
              <Database size={16} />
              <span>{snapshot?.worker.supabaseConfigured ? 'Supabase admin ready' : 'Supabase unknown'}</span>
            </div>
            <div className="metric-chip">
              <Activity size={16} />
              <span>{snapshot?.generatedAt ? `Updated ${formatDateTime(snapshot.generatedAt)}` : 'No snapshot yet'}</span>
            </div>
          </div>
        </section>

        <section className="admin-panel">
          <div className="section-head">
            <div>
              <p className="section-kicker">Connection</p>
              <h2>Worker access</h2>
            </div>
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

          <div className="toolbar">
            <button
              className="toolbar-button"
              onClick={() => loadOverview('refresh')}
              disabled={!connectionReady || loading || !!runningAction}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              Refresh
            </button>
            <button
              className="toolbar-button"
              onClick={() => loadOverview('audit')}
              disabled={!connectionReady || loading || !!runningAction}
            >
              <Zap size={16} className={runningAction === 'audit' ? 'spin' : ''} />
              Run audit
            </button>
            <button
              className="toolbar-button"
              onClick={() => loadOverview('repair')}
              disabled={!connectionReady || loading || !!runningAction}
            >
              <Wrench size={16} className={runningAction === 'repair' ? 'spin' : ''} />
              Run repair
            </button>
            <button
              className="toolbar-button danger"
              onClick={() => loadOverview('cleanup')}
              disabled={!connectionReady || loading || !!runningAction}
            >
              <Trash2 size={16} className={runningAction === 'cleanup' ? 'spin' : ''} />
              Run cleanup
            </button>
          </div>

          {notice && <div className="banner notice">{notice}</div>}
          {error && <div className="banner error">{error}</div>}
          {!connectionReady && !error && (
            <div className="banner soft">
              Save your worker URL and `ADMIN_DASHBOARD_TOKEN` to load the admin dashboard.
            </div>
          )}
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-icon rose"><HardDrive size={18} /></div>
            <p className="stat-label">Managed storage</p>
            <h3>{formatBytes(overview.total_bytes || 0)}</h3>
            <p className="stat-subtle">{overview.total_assets || 0} indexed objects</p>
          </article>

          <article className="stat-card">
            <div className="stat-icon amber"><Database size={18} /></div>
            <p className="stat-label">Couples tracked</p>
            <h3>{overview.total_couples || 0}</h3>
            <p className="stat-subtle">{overview.ready_assets || 0} ready assets</p>
          </article>

          <article className="stat-card">
            <div className="stat-icon crimson"><AlertTriangle size={18} /></div>
            <p className="stat-label">Open alerts</p>
            <h3>{overview.open_alerts || 0}</h3>
            <p className="stat-subtle">{overview.missing_assets || 0} missing, {overview.orphaned_assets || 0} orphaned</p>
          </article>

          <article className="stat-card">
            <div className="stat-icon blue"><Activity size={18} /></div>
            <p className="stat-label">Cleanup backlog</p>
            <h3>{overview.cleanup_backlog || 0}</h3>
            <p className="stat-subtle">{overview.pending_assets || 0} pending uploads</p>
          </article>
        </section>

        <section className="content-grid">
          <article className="admin-panel">
            <div className="section-head">
              <div>
                <p className="section-kicker">Capacity</p>
                <h2>Usage by feature</h2>
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
                    <tr>
                      <td colSpan={5} className="empty-cell">No global media usage recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="admin-panel">
            <div className="section-head">
              <div>
                <p className="section-kicker">Couples</p>
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
                  {snapshot?.couples.map((item) => (
                    <tr key={item.couple_id}>
                      <td title={item.couple_id}>{shortId(item.couple_id)}</td>
                      <td>{formatBytes(item.total_bytes || 0)}</td>
                      <td>{item.object_count || 0}</td>
                      <td>{item.open_alerts || 0}</td>
                      <td>{item.cleanup_backlog || 0}</td>
                    </tr>
                  ))}
                  {(!snapshot?.couples || snapshot.couples.length === 0) && (
                    <tr>
                      <td colSpan={5} className="empty-cell">No indexed couple storage data yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="content-grid">
          <article className="admin-panel">
            <div className="section-head">
              <div>
                <p className="section-kicker">Incidents</p>
                <h2>Open alerts</h2>
              </div>
            </div>
            <div className="stack-list">
              {snapshot?.alerts.map((alert) => (
                <div className="stack-card" key={alert.id}>
                  <div className="stack-row">
                    <strong>{alert.title}</strong>
                    <span className={`badge severity-${alert.severity}`}>{alert.severity}</span>
                  </div>
                  <p className="muted-line">
                    {alert.alert_type} · couple {shortId(alert.couple_id)} · occurrences {alert.occurrence_count}
                  </p>
                  <code>{jsonPreview(alert.details)}</code>
                </div>
              ))}
              {(!snapshot?.alerts || snapshot.alerts.length === 0) && <p className="empty-copy">No open alerts.</p>}
            </div>
          </article>

          <article className="admin-panel">
            <div className="section-head">
              <div>
                <p className="section-kicker">History</p>
                <h2>Recent events</h2>
              </div>
            </div>
            <div className="stack-list">
              {snapshot?.events.map((event) => (
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
              {(!snapshot?.events || snapshot.events.length === 0) && <p className="empty-copy">No recent storage events.</p>}
            </div>
          </article>
        </section>

        <section className="content-grid">
          <article className="admin-panel">
            <div className="section-head">
              <div>
                <p className="section-kicker">Assets</p>
                <h2>Recent indexed media</h2>
              </div>
            </div>
            <div className="stack-list tall">
              {snapshot?.assets.map((asset) => (
                <div className="stack-card" key={asset.id}>
                  <div className="stack-row">
                    <strong>{asset.feature} / {asset.asset_role}</strong>
                    <span className={`badge status-${asset.status}`}>{asset.status}</span>
                  </div>
                  <p className="muted-line">
                    couple {shortId(asset.couple_id)} · owner {shortId(asset.owner_user_id)} · {formatBytes(asset.byte_size || 0)}
                  </p>
                  <code>{asset.r2_key}</code>
                </div>
              ))}
              {(!snapshot?.assets || snapshot.assets.length === 0) && <p className="empty-copy">No media assets found.</p>}
            </div>
          </article>

          <article className="admin-panel">
            <div className="section-head">
              <div>
                <p className="section-kicker">Daily metrics</p>
                <h2>Fleet-wide trend lines</h2>
              </div>
            </div>
            <div className="stack-list tall">
              {snapshot?.metrics.map((metric, index) => (
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
              {(!snapshot?.metrics || snapshot.metrics.length === 0) && <p className="empty-copy">No metrics recorded yet.</p>}
            </div>
          </article>
        </section>

        <footer className="admin-footer">
          <span>Last snapshot: {snapshot?.generatedAt ? formatDateTime(snapshot.generatedAt) : '-'}</span>
          <span>Last couple update: {snapshot?.couples?.[0]?.last_asset_update_at ? formatDateTime(snapshot.couples[0].last_asset_update_at) : '-'}</span>
        </footer>
      </main>
    </div>
  );
};
