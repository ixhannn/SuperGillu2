import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, Database, ShieldAlert, HardDrive } from 'lucide-react';
import { ViewState } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { SupabaseService } from '../services/supabase';
import { StorageService } from '../services/storage';
import { formatBytes } from '../shared/mediaPolicy.js';
import { InternalAdminService } from '../services/internalAdmin';

type StorageConsoleProps = {
    setView: (view: ViewState) => void;
};

export const StorageConsoleView: React.FC<StorageConsoleProps> = ({ setView }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAllowed, setIsAllowed] = useState<boolean | null>(null);
    const [summary, setSummary] = useState<any>(null);
    const [assets, setAssets] = useState<any[]>([]);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any[]>([]);

    const localStats = StorageService.getManagedStorageStats();

    const load = async () => {
        const allowed = await InternalAdminService.isAllowed();
        setIsAllowed(allowed);
        if (!allowed) {
            setError('Internal admin access is required for this dashboard.');
            setLoading(false);
            return;
        }
        if (!SupabaseService.init()) {
            setError('Supabase is not configured on this device.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const [nextSummary, nextAssets, nextAlerts, nextEvents, nextMetrics] = await Promise.all([
                SupabaseService.fetchStorageConsoleSummary(),
                SupabaseService.fetchStorageConsoleRecentAssets(25),
                SupabaseService.fetchStorageConsoleRecentAlerts(20),
                SupabaseService.fetchStorageConsoleRecentEvents(20),
                SupabaseService.fetchStorageConsoleMetrics(14),
            ]);
            setSummary(nextSummary);
            setAssets(nextAssets);
            setAlerts(nextAlerts);
            setEvents(nextEvents);
            setMetrics(nextMetrics);
        } catch (e: any) {
            setError(e?.message || 'Storage console failed to load.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    return (
        <div className="flex flex-col h-full min-h-screen">
            <ViewHeader
                title="Storage Console"
                onBack={() => setView('profile')}
                variant="centered"
                rightSlot={
                    <button
                        onClick={load}
                        disabled={loading}
                        className="px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 text-white"
                        style={{ background: 'var(--theme-nav-center-bg-active)', opacity: loading ? 0.7 : 1 }}
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                }
            />

            <div className="view-container space-y-5 pb-16">
                <div className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-secondary)' }}>Cloud Media</p>
                            <p className="mt-2 text-3xl font-black" style={{ color: 'var(--color-text-primary)' }}>
                                {formatBytes(localStats.totalBytes)}
                            </p>
                            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                                Local tracked media vs {formatBytes(localStats.totalQuotaBytes)} quota
                            </p>
                        </div>
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.12)' }}>
                            <HardDrive size={20} style={{ color: '#2563eb' }} />
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.65)' }}>
                            <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-secondary)' }}>Open Alerts</p>
                            <p className="mt-2 text-2xl font-black" style={{ color: 'var(--color-text-primary)' }}>{summary?.open_alerts ?? alerts.filter((alert) => alert.status === 'open').length}</p>
                        </div>
                        <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.65)' }}>
                            <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-secondary)' }}>Cleanup Backlog</p>
                            <p className="mt-2 text-2xl font-black" style={{ color: 'var(--color-text-primary)' }}>{summary?.cleanup_backlog ?? 0}</p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.16)' }}>
                        <AlertTriangle size={18} style={{ color: '#ef4444', marginTop: 2 }} />
                        <p className="text-sm font-medium" style={{ color: '#991b1b' }}>{error}</p>
                    </div>
                )}

                {isAllowed === false && (
                    <div className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            Add your email to `VITE_INTERNAL_ADMIN_EMAILS`, your user id to `VITE_INTERNAL_ADMIN_USER_IDS`, or enable the local override during internal testing.
                        </p>
                    </div>
                )}

                {isAllowed === false ? null : (
                    <>

                <section className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <Database size={18} style={{ color: 'var(--color-nav-active)' }} />
                        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Usage by Feature</h2>
                    </div>
                    <div className="space-y-3">
                        {(summary?.usage || []).map((entry: any) => (
                            <div key={entry.feature} className="flex items-center justify-between rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.68)' }}>
                                <div>
                                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{entry.feature}</p>
                                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                                        {entry.object_count} object(s) · {entry.missing_count} missing
                                    </p>
                                </div>
                                <p className="text-sm font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                    {formatBytes(entry.total_bytes || 0)}
                                </p>
                            </div>
                        ))}
                        {(!summary?.usage || summary.usage.length === 0) && (
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No backend media usage found yet.</p>
                        )}
                    </div>
                </section>

                <section className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div className="flex items-center gap-2 mb-4">
                        <ShieldAlert size={18} style={{ color: '#dc2626' }} />
                        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Open Alerts</h2>
                    </div>
                    <div className="space-y-3">
                        {alerts.map((alert) => (
                            <div key={alert.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.68)' }}>
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{alert.title}</p>
                                    <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: alert.severity === 'critical' ? '#b91c1c' : alert.severity === 'error' ? '#dc2626' : '#d97706' }}>
                                        {alert.severity}
                                    </span>
                                </div>
                                <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                                    {alert.alert_type} · occurrences: {alert.occurrence_count}
                                </p>
                            </div>
                        ))}
                        {alerts.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No active storage alerts.</p>}
                    </div>
                </section>

                <section className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Recent Assets</h2>
                    <div className="space-y-3">
                        {assets.map((asset) => (
                            <div key={asset.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.68)' }}>
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold break-all" style={{ color: 'var(--color-text-primary)' }}>{asset.r2_key}</p>
                                    <span className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-secondary)' }}>{asset.status}</span>
                                </div>
                                <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                                    {asset.feature} · {asset.asset_role} · {formatBytes(asset.byte_size || 0)}
                                </p>
                            </div>
                        ))}
                        {assets.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No media_assets rows yet.</p>}
                    </div>
                </section>

                <section className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Recent Events</h2>
                    <div className="space-y-3">
                        {events.map((event) => (
                            <div key={event.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.68)' }}>
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{event.event_type}</p>
                                    <span className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-secondary)' }}>{event.severity}</span>
                                </div>
                                {event.r2_key && (
                                    <p className="text-xs mt-2 break-all" style={{ color: 'var(--color-text-secondary)' }}>{event.r2_key}</p>
                                )}
                            </div>
                        ))}
                        {events.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No recent storage events.</p>}
                    </div>
                </section>

                <section className="rounded-3xl p-5" style={{ background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Daily Metrics</h2>
                    <div className="space-y-3">
                        {metrics.map((metric, index) => (
                            <div key={`${metric.metric_date}-${metric.feature}-${index}`} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.68)' }}>
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{metric.metric_date} · {metric.feature}</p>
                                    <p className="text-xs font-mono font-bold" style={{ color: 'var(--color-text-primary)' }}>{formatBytes(metric.total_bytes || 0)}</p>
                                </div>
                                <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                                    objects {metric.object_count} · missing {metric.missing_object_count} · orphaned {metric.orphan_object_count} · legacy {metric.legacy_ref_count} · expired {metric.expired_row_count} · alerts {metric.alert_count}
                                </p>
                            </div>
                        ))}
                        {metrics.length === 0 && <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No daily storage metrics recorded yet.</p>}
                    </div>
                </section>
                    </>
                )}
            </div>
        </div>
    );
};
