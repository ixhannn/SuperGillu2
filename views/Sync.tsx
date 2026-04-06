import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Cloud, CheckCircle, RefreshCw, AlertTriangle,
  Bell, BellOff, ImageDown, HardDriveUpload,
  QrCode, Camera, X, RotateCcw, UserCheck,
} from 'lucide-react';
import QRCodeLib from 'qrcode';
import jsQR from 'jsqr';
import { ViewHeader } from '../components/ViewHeader';
import { ViewState } from '../types';
import { SyncService, syncEventTarget } from '../services/sync';
import { StorageService } from '../services/storage';
import { SupabaseService } from '../services/supabase';
import { MediaMigrationService } from '../services/mediaMigration';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from '../utils/toast';
import { PairingService, QR_PREFIX, PairInvite } from '../services/pairing';

interface SyncProps {
  setView: (view: ViewState) => void;
}

type ScanPhase = 'idle' | 'requesting' | 'scanning' | 'claiming' | 'success' | 'error';

export const Sync: React.FC<SyncProps> = ({ setView }) => {
  // ── Sync state ───────────────────────────────────────────────────────────────
  const [status, setStatus]                 = useState(SyncService.status);
  const [lastSync, setLastSync]             = useState(SyncService.lastSyncTime);
  const [isSyncing, setIsSyncing]           = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isRecovering, setIsRecovering]     = useState(false);
  const [isMigrating, setIsMigrating]       = useState(false);
  const [migrationStatus, setMigrationStatus] = useState('');
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied',
  );

  // ── Pairing state ────────────────────────────────────────────────────────────
  const [pairTab, setPairTab]     = useState<'show' | 'scan'>('show');
  const [invite, setInvite]       = useState<PairInvite | null>(null);
  const [qrImg, setQrImg]         = useState<string>('');
  const [qrLoading, setQrLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [scanPhase, setScanPhase] = useState<ScanPhase>('idle');
  const [scanMsg, setScanMsg]     = useState('');
  const [linkedPartner, setLinkedPartner] = useState(() => {
    const p = StorageService.getCoupleProfile();
    return p.partnerUserId ? (p.partnerName || 'your partner') : '';
  });

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const rafRef       = useRef<number>(0);
  const claimingRef  = useRef(false);
  const cdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Sync event listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const handle = () => {
      setStatus(SyncService.status);
      setLastSync(SyncService.lastSyncTime);
    };
    syncEventTarget.addEventListener('sync-update', handle);
    return () => syncEventTarget.removeEventListener('sync-update', handle);
  }, []);

  // ── On mount: auto-generate QR if not yet linked ─────────────────────────────
  useEffect(() => {
    if (!linkedPartner) generateQR();
    return () => {
      stopCamera();
      if (cdIntervalRef.current) clearInterval(cdIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── QR generation ────────────────────────────────────────────────────────────
  const generateQR = useCallback(async () => {
    setQrLoading(true);
    setInvite(null);
    setQrImg('');
    if (cdIntervalRef.current) clearInterval(cdIntervalRef.current);

    const result = await PairingService.createInvite();
    if (!result) {
      setQrLoading(false);
      toast.show('Could not generate QR. Are you signed in?', 'error');
      return;
    }

    let dataUrl = '';
    try {
      dataUrl = await QRCodeLib.toDataURL(`${QR_PREFIX}${result.code}`, {
        width: 256,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
    } catch {
      setQrLoading(false);
      toast.show('QR generation failed.', 'error');
      return;
    }

    setInvite(result);
    setQrImg(dataUrl);
    setQrLoading(false);

    // Countdown timer
    const tick = () => {
      const secs = Math.max(0, Math.round((result.expiresAt.getTime() - Date.now()) / 1000));
      setCountdown(secs);
      if (secs === 0) {
        if (cdIntervalRef.current) clearInterval(cdIntervalRef.current);
        setQrImg('');
        setInvite(null);
        toast.show('QR expired — tap refresh for a new one.', 'info');
      }
    };
    tick();
    cdIntervalRef.current = setInterval(tick, 1000);
  }, []);

  // ── Camera helpers ────────────────────────────────────────────────────────────
  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startCamera = async () => {
    setScanPhase('requesting');
    setScanMsg('');
    claimingRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
    } catch {
      setScanPhase('error');
      setScanMsg('Camera access denied. Please allow camera permissions and try again.');
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    setScanPhase('scanning');

    const scan = () => {
      if (claimingRef.current) return;
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(scan); return; }

      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code && code.data.startsWith(QR_PREFIX)) {
        claimingRef.current = true;
        handleClaim(code.data.slice(QR_PREFIX.length));
        return;
      }

      rafRef.current = requestAnimationFrame(scan);
    };

    rafRef.current = requestAnimationFrame(scan);
  };

  // ── Claim invite ──────────────────────────────────────────────────────────────
  const handleClaim = async (rawCode: string) => {
    stopCamera();
    setScanPhase('claiming');
    setScanMsg('Linking accounts…');

    const result = await PairingService.claimInvite(rawCode);

    if (result.ok === false) {
      const msgs: Record<string, string> = {
        invalid: "QR code not recognised. Ask your partner to refresh.",
        expired: "This QR has expired. Ask your partner to show a fresh one.",
        used:    "This QR was already used. Ask your partner to generate a new one.",
        self:    "That's your own QR code! Ask your partner to show theirs.",
        network: "Network error. Check your connection and try again.",
      };
      setScanPhase('error');
      setScanMsg(msgs[result.error] ?? 'Something went wrong. Please try again.');
      return;
    }

    // Persist partner
    const profile = StorageService.getCoupleProfile();
    const updated = {
      ...profile,
      partnerUserId: result.partnerUserId,
      partnerName:   result.partnerName || profile.partnerName,
    };
    StorageService.saveCoupleProfile(updated);
    setLinkedPartner(result.partnerName || updated.partnerName || 'your partner');

    setScanPhase('success');
    setScanMsg(`Linked to ${result.partnerName || 'your partner'}!`);
    toast.show(`Connected with ${result.partnerName || 'your partner'}! 🎉`, 'success');
  };

  // ── Tab switching ─────────────────────────────────────────────────────────────
  const switchTab = (tab: 'show' | 'scan') => {
    if (tab === 'show') {
      stopCamera();
      setScanPhase('idle');
      setScanMsg('');
    }
    setPairTab(tab);
  };

  // ── Sync actions ──────────────────────────────────────────────────────────────
  const forceSync = async () => {
    setIsSyncing(true);
    await SyncService.init();
    setTimeout(() => setIsSyncing(false), 1000);
  };

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      toast.show('This browser does not support notifications.', 'info');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission === 'granted') {
      new Notification('Notifications Enabled!', {
        body: "You'll now get alerts when your partner shares a moment.",
        icon: '/icon.svg',
      });
    }
  };

  const migrateToStorage = async () => {
    setIsMigrating(true);
    setMigrationStatus('Starting migration...');
    try {
      const result = await MediaMigrationService.migrateAll(msg => setMigrationStatus(msg));
      if (result.migrated > 0) {
        toast.show(`Migrated ${result.migrated} file(s) to cloud storage!`, 'success');
      } else if (result.skipped > 0) {
        toast.show('All media already in cloud storage.', 'success');
      } else {
        toast.show('No media found to migrate.', 'info');
      }
    } catch {
      toast.show('Migration failed. Try again.', 'error');
    }
    setIsMigrating(false);
    setMigrationStatus('');
  };

  const recoverImages = async () => {
    setIsRecovering(true);
    try {
      const result = await StorageService.recoverImagesFromCloud();
      if (result.recovered > 0) {
        toast.show(`Recovered ${result.recovered} image(s) from cloud!`, 'success');
      } else {
        toast.show('No recoverable images found in cloud.', 'info');
      }
    } catch {
      toast.show('Recovery failed. Try syncing first.', 'error');
    }
    setIsRecovering(false);
  };

  const handleLogout = async () => {
    if (SupabaseService.client) await SupabaseService.client.auth.signOut();
    window.location.reload();
  };

  const fmtCountdown = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Sub-renders ───────────────────────────────────────────────────────────────
  const renderShowQR = () => {
    if (qrLoading) return (
      <div className="flex flex-col items-center py-8 gap-3">
        <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--color-nav-active)' }} />
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Generating code…</p>
      </div>
    );

    if (!qrImg || !invite) return (
      <div className="flex flex-col items-center py-6 gap-4">
        <p className="text-xs text-center" style={{ color: 'var(--color-text-secondary)' }}>
          {linkedPartner ? 'Generate a new QR to re-link accounts.' : 'Generate a QR code for your partner to scan.'}
        </p>
        <button onClick={generateQR}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
          style={{ background: 'rgba(var(--theme-particle-1-rgb),0.18)', color: 'var(--color-nav-active)' }}>
          <QrCode size={16} /> Generate QR
        </button>
      </div>
    );

    return (
      <div className="flex flex-col items-center gap-3">
        {/* QR image */}
        <div className="rounded-2xl overflow-hidden shadow-lg border-[3px] border-white/80">
          <img src={qrImg} alt="Pairing QR" width={200} height={200} style={{ display: 'block' }} />
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-1.5">
          <span className={`font-mono text-sm font-bold ${countdown < 60 ? 'text-orange-400' : ''}`}
            style={countdown >= 60 ? { color: 'var(--color-nav-active)' } : {}}>
            {fmtCountdown(countdown)}
          </span>
          <span className="text-[10px] uppercase tracking-widest font-bold"
            style={{ color: 'var(--color-text-secondary)' }}>remaining</span>
          <button onClick={generateQR}
            className="ml-1 p-1.5 rounded-lg transition-all active:scale-90"
            style={{ background: 'rgba(var(--theme-particle-3-rgb),0.15)' }}
            title="Refresh QR">
            <RotateCcw size={13} style={{ color: 'var(--color-text-secondary)' }} />
          </button>
        </div>

        <p className="text-[11px] text-center leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}>
          Ask your partner to tap <strong style={{ color: 'var(--color-text-primary)' }}>"Scan Partner's QR"</strong> and point their camera at this code.
        </p>
      </div>
    );
  };

  const renderScanQR = () => {
    if (scanPhase === 'success') return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.12)' }}>
          <UserCheck size={28} className="text-green-400" />
        </div>
        <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>{scanMsg}</p>
        <p className="text-[11px] text-center leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Your accounts are now linked. Moments and memories will sync between you.
        </p>
        <button onClick={() => { setScanPhase('idle'); setScanMsg(''); claimingRef.current = false; }}
          className="text-xs mt-1 underline underline-offset-2"
          style={{ color: 'var(--color-text-secondary)' }}>
          Scan again
        </button>
      </div>
    );

    if (scanPhase === 'error') return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500/12">
          <AlertTriangle size={28} className="text-red-400" />
        </div>
        <p className="text-sm font-bold text-red-400">Pairing Failed</p>
        <p className="text-[11px] text-center leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {scanMsg}
        </p>
        <button
          onClick={() => { setScanPhase('idle'); setScanMsg(''); claimingRef.current = false; }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 mt-1"
          style={{ background: 'rgba(var(--theme-particle-1-rgb),0.18)', color: 'var(--color-nav-active)' }}>
          <RotateCcw size={14} /> Try Again
        </button>
      </div>
    );

    if (scanPhase === 'claiming') return (
      <div className="flex flex-col items-center gap-3 py-8">
        <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--color-nav-active)' }} />
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{scanMsg}</p>
      </div>
    );

    if (scanPhase === 'requesting') return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Camera size={28} style={{ color: 'var(--color-nav-active)' }} />
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Requesting camera access…</p>
      </div>
    );

    if (scanPhase === 'scanning') return (
      <div className="flex flex-col items-center gap-3">
        {/* Camera viewport */}
        <div className="relative w-full rounded-xl overflow-hidden" style={{ aspectRatio: '4/3', background: '#000' }}>
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          {/* Dimmed overlay with cut-out */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 rounded-2xl"
              style={{ border: '2px solid rgba(255,255,255,0.75)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.38)' }} />
          </div>
          {/* Corner accents */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-48 h-48">
              <span className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-white/80 rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-white/80 rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-white/80 rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-white/80 rounded-br-lg" />
            </div>
          </div>
          {/* Close */}
          <button onClick={() => { stopCamera(); setScanPhase('idle'); }}
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)' }}>
            <X size={14} className="text-white" />
          </button>
        </div>
        {/* Hidden canvas for frame extraction */}
        <canvas ref={canvasRef} className="hidden" />
        <p className="text-[11px] text-center" style={{ color: 'var(--color-text-secondary)' }}>
          Align your partner's QR code within the frame
        </p>
      </div>
    );

    // idle
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <p className="text-xs text-center" style={{ color: 'var(--color-text-secondary)' }}>
          Ask your partner to open their QR, then scan it here.
        </p>
        <button onClick={startCamera}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95"
          style={{ background: 'rgba(var(--theme-particle-1-rgb),0.18)', color: 'var(--color-nav-active)' }}>
          <Camera size={16} /> Open Camera
        </button>
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-screen pb-32">
      <ViewHeader title="Cloud Sync ★" onBack={() => setView('home')} variant="simple" />

      <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">

        <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-6 transition-all ${
          status.includes('Error') ? 'bg-red-500/15 text-red-400' : 'bg-tulika-500/15 text-tulika-400'
        }`}>
          {isSyncing ? (
            <RefreshCw size={48} className="animate-spin" />
          ) : status.includes('Error') ? (
            <AlertTriangle size={48} />
          ) : (
            <Cloud size={48} />
          )}
        </div>

        <h2 className="text-2xl font-serif font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
          {status}
        </h2>

        {lastSync && (
          <div className="flex items-center gap-2 text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>
            <CheckCircle size={14} />
            <span>Last updated: {lastSync}</span>
          </div>
        )}

        <div className="w-full max-w-xs space-y-4">
          <button
            onClick={forceSync}
            className="w-full bg-tulika-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-tulika-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
            Sync Now
          </button>

          <button
            onClick={migrateToStorage}
            disabled={isMigrating}
            className="w-full bg-emerald-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <HardDriveUpload size={20} className={isMigrating ? 'animate-pulse' : ''} />
              {isMigrating ? 'Migrating...' : 'Upload Images to Cloud'}
            </div>
            {migrationStatus && <span className="text-[10px] opacity-80">{migrationStatus}</span>}
          </button>

          <button
            onClick={recoverImages}
            disabled={isRecovering}
            className="w-full bg-indigo-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ImageDown size={20} className={isRecovering ? 'animate-bounce' : ''} />
            {isRecovering ? 'Recovering...' : 'Recover Images from Cloud'}
          </button>

          {/* Push Notifications */}
          <div className="p-4 rounded-2xl flex items-center justify-between text-left"
            style={{ background: 'rgba(var(--theme-particle-2-rgb),0.07)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>
            <div className="flex-1 pr-4">
              <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Push Notifications</p>
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--color-text-secondary)' }}>
                {notifPermission === 'granted' ? 'Enabled' : notifPermission === 'denied' ? 'Disabled' : 'Not setup'}
              </p>
            </div>
            {notifPermission === 'granted' ? (
              <div className="p-2 bg-green-500/15 text-green-400 rounded-full">
                <Bell size={20} />
              </div>
            ) : (
              <button onClick={requestPermission}
                className="p-2 bg-tulika-500/15 text-tulika-400 rounded-full transition-colors">
                <BellOff size={20} />
              </button>
            )}
          </div>

          <p className="text-xs leading-relaxed px-4" style={{ color: 'var(--color-text-secondary)' }}>
            Your memories are automatically backed up to the secure cloud. Notifications appear when your partner adds content.
          </p>

          {/* ── QR Pairing Card ── */}
          <div className="w-full rounded-2xl overflow-hidden text-left"
            style={{ background: 'rgba(var(--theme-particle-2-rgb),0.07)', border: '1px solid rgba(var(--theme-particle-2-rgb),0.12)' }}>

            {/* Card header */}
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <QrCode size={14} style={{ color: 'var(--color-nav-active)' }} />
              <p className="text-sm font-bold flex-1" style={{ color: 'var(--color-text-primary)' }}>
                Pair with Partner
              </p>
              {linkedPartner && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-green-400">
                  <UserCheck size={11} /> Linked
                </span>
              )}
            </div>

            {/* Linked-partner status */}
            {linkedPartner && (
              <div className="mx-4 mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <UserCheck size={13} className="text-green-400 shrink-0" />
                <span className="text-xs flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Connected to{' '}
                  <strong style={{ color: 'var(--color-text-primary)' }}>{linkedPartner}</strong>
                </span>
              </div>
            )}

            {/* Tabs */}
            <div className="flex mx-4 mb-3 rounded-xl overflow-hidden"
              style={{ background: 'rgba(var(--theme-particle-3-rgb),0.10)' }}>
              {(['show', 'scan'] as const).map(tab => (
                <button key={tab}
                  onClick={() => switchTab(tab)}
                  className="flex-1 py-2 text-xs font-bold transition-all"
                  style={{
                    background: pairTab === tab ? 'rgba(var(--theme-particle-1-rgb),0.22)' : 'transparent',
                    color: pairTab === tab ? 'var(--color-nav-active)' : 'var(--color-text-secondary)',
                  }}>
                  {tab === 'show' ? 'My QR' : "Scan Partner's QR"}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="px-4 pb-4">
              {pairTab === 'show' ? renderShowQR() : renderScanQR()}
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="mt-auto text-red-400 text-sm font-medium py-8"
        >
          Log Out
        </button>

        <ConfirmModal
          isOpen={showLogoutConfirm}
          title="Log Out"
          message="Are you sure you want to log out of cloud sync?"
          confirmLabel="Log Out"
          variant="danger"
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      </div>
    </div>
  );
};
