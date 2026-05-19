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
import { StorageService, storageEventTarget } from '../services/storage';
import { SupabaseService } from '../services/supabase';
import { MediaMigrationService } from '../services/mediaMigration';
import { NotificationsService } from '../services/notifications';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from '../utils/toast';
import { PairingService, QR_PREFIX, PairInvite } from '../services/pairing';

interface SyncProps {
  setView: (view: ViewState) => void;
}

type ScanPhase = 'idle' | 'requesting' | 'scanning' | 'claiming' | 'success' | 'error';
type PairingPhase = 'checking' | 'unlinked' | 'linked' | 'generating' | 'claiming' | 'error';

type PairingUiState = {
  phase: PairingPhase;
  message: string;
};

export const Sync: React.FC<SyncProps> = ({ setView }) => {
  const getLinkedPartnerLabel = useCallback(() => {
    const profile = StorageService.getCoupleProfile();
    return profile.partnerUserId ? (profile.partnerName || 'your partner') : '';
  }, []);

  // ── Sync state ───────────────────────────────────────────────────────────────
  const [status, setStatus]                 = useState(SyncService.status);
  const [lastSync, setLastSync]             = useState(SyncService.lastSyncTime);
  const [isSyncing, setIsSyncing]           = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showRelinkConfirm, setShowRelinkConfirm] = useState(false);
  const [isRecovering, setIsRecovering]     = useState(false);
  const [isMigrating, setIsMigrating]       = useState(false);
  const [migrationStatus, setMigrationStatus] = useState('');
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

  // ── Pairing state ────────────────────────────────────────────────────────────
  const [pairTab, setPairTab]     = useState<'show' | 'scan'>('show');
  const [invite, setInvite]       = useState<PairInvite | null>(null);
  const [qrImg, setQrImg]         = useState<string>('');
  const [qrLoading, setQrLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [scanPhase, setScanPhase] = useState<ScanPhase>('idle');
  const [scanMsg, setScanMsg]     = useState('');
  const [manualCode, setManualCode] = useState('');
  const [manualClaiming, setManualClaiming] = useState(false);
  const [linkedPartner, setLinkedPartner] = useState(() => getLinkedPartnerLabel());
  const [pairingUi, setPairingUi] = useState<PairingUiState>({
    phase: 'checking',
    message: 'Checking your connection...',
  });

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const rafRef       = useRef<number>(0);
  const claimingRef  = useRef(false);
  const lastScanAttemptRef = useRef(0);
  const cdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastExpiredInviteRef = useRef<string>('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const normalizeCode = (value: string) =>
    value.replace(/^LIOR:/i, '').replace(/[^A-Za-z0-9]/g, '').trim().toUpperCase().slice(0, 8);

  const stopPartnerPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // ── Sync event listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const handle = () => {
      setStatus(SyncService.status);
      setLastSync(SyncService.lastSyncTime);
    };
    syncEventTarget.addEventListener('sync-update', handle);
    return () => syncEventTarget.removeEventListener('sync-update', handle);
  }, []);

  useEffect(() => {
    const refreshLinkedPartner = () => {
      setLinkedPartner(getLinkedPartnerLabel());
    };
    storageEventTarget.addEventListener('storage-update', refreshLinkedPartner);
    syncEventTarget.addEventListener('sync-update', refreshLinkedPartner);
    refreshLinkedPartner();
    return () => {
      storageEventTarget.removeEventListener('storage-update', refreshLinkedPartner);
      syncEventTarget.removeEventListener('sync-update', refreshLinkedPartner);
    };
  }, [getLinkedPartnerLabel]);

  useEffect(() => {
    let cancelled = false;
    void NotificationsService.getPermissionStatus()
      .then((permission) => {
        if (!cancelled) setNotifPermission(permission);
      })
      .catch(() => {
        if (!cancelled) setNotifPermission('denied');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── QR generation ────────────────────────────────────────────────────────────
  const generateQR = useCallback(async (forceRotate: boolean = false) => {
    setPairingUi({ phase: 'generating', message: 'Creating a private one-time code...' });
    setQrLoading(true);
    if (cdIntervalRef.current) {
      clearInterval(cdIntervalRef.current);
      cdIntervalRef.current = null;
    }

    const result = await PairingService.createInvite({ forceRotate });
    if (!result) {
      setQrLoading(false);
      setPairingUi({ phase: 'error', message: 'Could not generate a code. Check sign-in and connection.' });
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
      setPairingUi({ phase: 'error', message: 'QR generation failed. Try refreshing the code.' });
      toast.show('QR generation failed.', 'error');
      return;
    }

    setInvite(result);
    setQrImg(dataUrl);
    setQrLoading(false);
    setPairingUi({ phase: 'unlinked', message: 'Share this QR or code once. After linking, it stays tied to your accounts.' });

    // Countdown timer
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const secs = Math.max(0, Math.round((result.expiresAt.getTime() - Date.now()) / 1000));
      setCountdown(secs);
      if (secs === 0) {
        if (intervalId) clearInterval(intervalId);
        if (cdIntervalRef.current === intervalId) cdIntervalRef.current = null;
        setQrImg('');
        setInvite(null);
        setPairingUi({ phase: 'unlinked', message: 'The code expired. Refresh it to create a new one.' });
        if (lastExpiredInviteRef.current !== result.code) {
          lastExpiredInviteRef.current = result.code;
          toast.show('QR expired — tap refresh for a new one.', 'info');
        }
      }
    };
    tick();
    intervalId = setInterval(tick, 1000);
    cdIntervalRef.current = intervalId;
  }, []);

  const applyLinkedStatus = useCallback(async (nextStatus: Awaited<ReturnType<typeof PairingService.getStatus>>) => {
    if (nextStatus?.isLinked && nextStatus.coupleId && nextStatus.partnerUserId) {
      StorageService.forceNewPairing(
        nextStatus.coupleId,
        nextStatus.partnerUserId,
        nextStatus.partnerName || undefined,
      );
      SupabaseService.setCachedCoupleId(nextStatus.coupleId);
      const label = nextStatus.partnerName || 'your partner';
      setLinkedPartner(label);
      setPairingUi({ phase: 'linked', message: 'Permanent link saved.' });
      await SyncService.init();
      return true;
    }

    setLinkedPartner('');
    setPairingUi({ phase: 'unlinked', message: 'Create a one-time code to link your accounts.' });
    return false;
  }, []);

  const refreshPairingStatus = useCallback(async () => {
    setPairingUi({ phase: 'checking', message: 'Checking your connection...' });
    const nextStatus = await PairingService.getStatus();
    const linked = await applyLinkedStatus(nextStatus);
    if (!linked) await generateQR(false);
  }, [applyLinkedStatus, generateQR]);

  // ── On mount: restore permanent link or create a one-time code ───────────────
  useEffect(() => {
    void refreshPairingStatus();
    return () => {
      stopCamera();
      stopPartnerPoll();
      if (cdIntervalRef.current) clearInterval(cdIntervalRef.current);
    };
  }, [refreshPairingStatus, stopPartnerPoll]);

  // ── Poll for partner while QR is showing (inviter side) ─────────────────────
  useEffect(() => {
    if (linkedPartner || pairTab !== 'show') {
      stopPartnerPoll();
      return;
    }

    const checkForPartner = async () => {
      try {
        const nextStatus = await PairingService.getStatus();
        const linked = await applyLinkedStatus(nextStatus);
        if (linked) {
          stopPartnerPoll();
          toast.show(`${nextStatus?.partnerName || 'Your partner'} just joined your space!`, 'success');
        }
      } catch { /* retry on next poll */ }
    };

    pollRef.current = setInterval(checkForPartner, 8000);
    return stopPartnerPoll;
  }, [applyLinkedStatus, linkedPartner, pairTab, stopPartnerPoll]);

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
    stopCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanPhase('error');
      setScanMsg('Camera API is not available in this environment. Open Lior in a regular browser and try again.');
      return;
    }

    let stream: MediaStream;
    try {
      // Try rear camera first, then fallback to any available camera.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
    } catch (err: any) {
      setScanPhase('error');
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setScanMsg('Camera permission was blocked. Allow camera access (and if using IDE preview, try opening localhost in your browser).');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setScanMsg('No compatible camera found. Try another device/browser.');
      } else {
        setScanMsg('Could not start camera preview. Try opening localhost in a regular browser.');
      }
      return;
    }

    streamRef.current = stream;
    setScanPhase('scanning');
    lastScanAttemptRef.current = 0;

    const scan = () => {
      if (claimingRef.current) return;
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      const now = Date.now();
      if (now - lastScanAttemptRef.current < 140) {
        rafRef.current = requestAnimationFrame(scan);
        return;
      }
      lastScanAttemptRef.current = now;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(scan); return; }

      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (code && code.data.startsWith(QR_PREFIX)) {
        claimingRef.current = true;
        handleClaim(code.data.slice(QR_PREFIX.length));
        return;
      }

      rafRef.current = requestAnimationFrame(scan);
    };

    rafRef.current = requestAnimationFrame(scan);
  };

  // Attach stream after scanning UI mounts the <video> element.
  useEffect(() => {
    if (scanPhase !== 'scanning' || !streamRef.current || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.muted = true;
    video.autoplay = true;
    video.setAttribute('playsinline', 'true');
    video.play().catch(() => {});
  }, [scanPhase]);

  // ── Claim invite ──────────────────────────────────────────────────────────────
  const handleClaim = async (rawCode: string) => {
    stopCamera();
    setScanPhase('claiming');
    setScanMsg('Linking accounts…');
    setPairingUi({ phase: 'claiming', message: 'Confirming the shared space...' });

    let result;
    try {
      result = await PairingService.claimInvite(normalizeCode(rawCode));
    } catch {
      setScanPhase('error');
      setScanMsg('Could not complete linking. Please check your internet and try again.');
      setPairingUi({ phase: 'error', message: 'Could not complete linking. Check your internet and try again.' });
      claimingRef.current = false;
      return;
    }

    if (result.ok === false) {
      if (result.error === 'already_linked') {
        setScanMsg('Your account is already linked in the cloud. Restoring connection...');
        const restoredStatus = result.coupleId && result.partnerUserId
          ? {
              isLinked: true,
              coupleId: result.coupleId,
              partnerUserId: result.partnerUserId,
              partnerName: result.partnerName ?? null,
              memberCount: 2,
            }
          : await PairingService.getStatus();
        const restored = await applyLinkedStatus(restoredStatus);
        if (restored) {
          const partnerLabel = restoredStatus?.partnerName || 'your partner';
          setManualCode('');
          setScanPhase('success');
          setScanMsg(`Reconnected to ${partnerLabel}!`);
          toast.show(`Reconnected to ${partnerLabel}!`, 'success');
          claimingRef.current = false;
          return;
        }
      }

      const msgs: Record<string, string> = {
        invalid: "QR code not recognised. Ask your partner to refresh.",
        expired: "This QR has expired. Ask your partner to show a fresh one.",
        used:    "This QR was already used. Ask your partner to generate a new one.",
        self:    "That's your own QR code! Ask your partner to show theirs.",
        already_linked: 'Your account is already linked. Go back and tap "Refresh shared data" to restore your connection.',
        network: "Network error. Check your connection and try again.",
      };
      setScanPhase('error');
      setScanMsg(msgs[result.error] ?? 'Something went wrong. Please try again.');
      setPairingUi({ phase: 'error', message: msgs[result.error] ?? 'Something went wrong. Please try again.' });
      return;
    }

    await applyLinkedStatus({
      isLinked: true,
      coupleId: result.coupleId,
      partnerUserId: result.partnerUserId,
      partnerName: result.partnerName || StorageService.getCoupleProfile().partnerName || null,
      memberCount: 2,
    });
    setManualCode('');
    const partnerLabel = result.partnerName || StorageService.getCoupleProfile().partnerName || 'your partner';
    setLinkedPartner(partnerLabel);

    setScanPhase('success');
    setScanMsg(`Linked to ${partnerLabel}!`);
    toast.show(`Connected with ${partnerLabel}! 🎉`, 'success');
  };

  const handleManualClaim = async () => {
    const code = normalizeCode(manualCode);
    if (code.length !== 8) {
      toast.show('Enter the full 8-character partner code.', 'error');
      return;
    }
    if (manualClaiming) return;
    setManualClaiming(true);
    claimingRef.current = true;
    try {
      await handleClaim(code);
    } finally {
      setManualClaiming(false);
      claimingRef.current = false;
    }
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
    const permission = await NotificationsService.requestPermission();
    setNotifPermission(permission);
    if (permission === 'granted') {
      toast.show("Notifications are enabled on this device.", 'success');
      void NotificationsService.fireImmediate(
        'Notifications Enabled!',
        "You'll now get alerts when your partner shares a moment.",
        'film-ready',
      ).catch(() => {});
      return;
    }
    if (permission === 'denied') {
      toast.show('Notifications are blocked for this device. Enable them in system settings if needed.', 'info');
      return;
    }
    toast.show('Notification permission is still waiting for confirmation.', 'info');
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
    StorageService.prepareForSignOut();
    if (SupabaseService.client) await SupabaseService.client.auth.signOut();
    SupabaseService.setCachedUserId(null);
    StorageService.activateAccount(null);
    window.location.reload();
  };

  const fmtCountdown = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const copyInviteCode = async () => {
    if (!invite?.code) return;
    try {
      await navigator.clipboard.writeText(invite.code);
      toast.show('Code copied.', 'success');
    } catch {
      toast.show('Could not copy code.', 'error');
    }
  };

  // ── Sub-renders ───────────────────────────────────────────────────────────────
  const renderPermanentLink = () => (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl px-4 py-4 flex items-start gap-3"
        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.16)' }}>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(34,197,94,0.14)' }}>
          <UserCheck size={18} className="text-green-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-extrabold" style={{ color: 'var(--color-text-primary)' }}>Permanent link saved</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-primary)', opacity: 0.76 }}>
            This connection is tied to your accounts. Sign back in on any device and Lior will restore the shared space with <strong style={{ color: 'var(--color-text-primary)' }}>{linkedPartner}</strong>.
          </p>
        </div>
      </div>
      <button
        onClick={forceSync}
        className="liquid-glass-btn w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
        style={{ color: 'var(--color-nav-active)', background: 'rgba(var(--theme-particle-1-rgb),0.12)' }}
      >
        <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
        Refresh shared data
      </button>
      <button
        onClick={() => setShowRelinkConfirm(true)}
        className="text-[11px] text-center py-1 w-full underline underline-offset-2 active:opacity-60 transition-opacity"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Link a different partner
      </button>
    </div>
  );

  const renderShowQR = () => {
    if (qrLoading) return (
      <div className="flex flex-col items-center py-8 gap-3">
        <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--color-nav-active)' }} />
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Generating code…</p>
      </div>
    );

    if (!qrImg || !invite) return (
      <div className="flex flex-col items-center py-6 gap-4">
        <p className="text-xs text-center" style={{ color: 'var(--color-text-primary)', opacity: 0.8 }}>
          Generate a QR code for your partner to scan.
        </p>
        <button onClick={() => generateQR(true)}
          className="liquid-glass-btn liquid-glass-btn--rose flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
          style={{ color: '#fff' }}>
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
        <button onClick={() => generateQR(true)}
            className="ml-1 p-1.5 rounded-lg transition-all active:scale-90"
            style={{ background: 'rgba(var(--theme-particle-3-rgb),0.15)' }}
          title="Refresh QR"
          aria-label="Refresh QR code">
            <RotateCcw size={13} style={{ color: 'var(--color-text-secondary)' }} />
          </button>
        </div>

        <div className="w-full rounded-xl px-3 py-2 flex items-center justify-between"
          style={{ background: 'rgba(var(--theme-particle-3-rgb),0.12)' }}>
          <span className="text-sm font-mono tracking-[0.2em]" style={{ color: 'var(--color-text-primary)' }}>
            {invite.code.slice(0, 4)}-{invite.code.slice(4)}
          </span>
          <button onClick={copyInviteCode}
            className="liquid-glass-btn text-[11px] font-bold px-2.5 py-1.5 rounded-lg"
            style={{ background: 'rgba(var(--theme-particle-1-rgb),0.16)', color: 'var(--color-nav-active)' }}>
            Copy
          </button>
        </div>

        <p className="text-[11px] text-center leading-relaxed"
          style={{ color: 'var(--color-text-primary)', opacity: 0.78 }}>
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
        <p className="text-[11px] text-center leading-relaxed" style={{ color: 'var(--color-text-primary)', opacity: 0.78 }}>
          Your accounts are now linked. Moments and memories will sync between you.
        </p>
        <button onClick={() => { setScanPhase('idle'); setScanMsg(''); claimingRef.current = false; setManualCode(''); }}
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
        <p className="text-[11px] text-center leading-relaxed" style={{ color: 'var(--color-text-primary)', opacity: 0.78 }}>
          {scanMsg}
        </p>
        <button
          onClick={() => { setScanPhase('idle'); setScanMsg(''); claimingRef.current = false; setManualCode(''); }}
          className="liquid-glass-btn liquid-glass-btn--rose flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all mt-1"
          style={{ color: '#fff' }}>
          <RotateCcw size={14} /> Try Again
        </button>
        <div className="w-full mt-2">
          <p className="text-[10px] uppercase tracking-widest text-center mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            or enter code manually
          </p>
          <div className="flex gap-2">
            <input
              id="partner-code-error"
              aria-label="Enter partner code"
              value={manualCode}
              onChange={(e) => setManualCode(normalizeCode(e.target.value))}
              placeholder="Enter partner code"
              className="flex-1 px-3 py-2 rounded-lg text-xs font-mono tracking-wider uppercase"
              style={{ background: 'rgba(var(--theme-particle-3-rgb),0.10)', color: 'var(--color-text-primary)' }}
              maxLength={12}
            />
            <button
              onClick={handleManualClaim}
              disabled={manualClaiming}
              className="liquid-glass-btn liquid-glass-btn--rose px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-60"
              style={{ color: '#fff' }}
            >
              {manualClaiming ? 'Linking…' : 'Link Accounts'}
            </button>
          </div>
        </div>
      </div>
    );

    if (scanPhase === 'claiming') return (
      <div className="flex flex-col items-center gap-3 py-8">
        <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--color-nav-active)' }} />
        <p className="text-xs" style={{ color: 'var(--color-text-primary)', opacity: 0.78 }}>{scanMsg}</p>
      </div>
    );

    if (scanPhase === 'requesting') return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Camera size={28} style={{ color: 'var(--color-nav-active)' }} />
        <p className="text-xs" style={{ color: 'var(--color-text-primary)', opacity: 0.78 }}>Requesting camera access…</p>
      </div>
    );

    if (scanPhase === 'scanning') return (
      <div className="flex flex-col items-center gap-3">
        {/* Camera viewport */}
        <div className="relative w-full rounded-xl overflow-hidden" style={{ aspectRatio: '4/3', background: '#000' }}>
          <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
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
            style={{ background: 'rgba(0,0,0,0.5)' }}
            aria-label="Close camera">
            <X size={14} className="text-white" />
          </button>
        </div>
        {/* Hidden canvas for frame extraction */}
        <canvas ref={canvasRef} className="hidden" />
        <p className="text-[11px] text-center" style={{ color: 'var(--color-text-primary)', opacity: 0.78 }}>
          Align your partner's QR code within the frame
        </p>
      </div>
    );

    // idle
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <p className="text-xs text-center" style={{ color: 'var(--color-text-primary)', opacity: 0.8 }}>
          Ask your partner to open their QR, then scan it here.
        </p>
        <button onClick={startCamera}
          className="liquid-glass-btn liquid-glass-btn--rose flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
          style={{ color: '#fff' }}>
          <Camera size={16} /> Open Camera
        </button>
        <div className="w-full">
          <p className="text-[10px] uppercase tracking-widest text-center mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            or enter code manually
          </p>
          <div className="flex gap-2">
            <input
              id="partner-code-idle"
              aria-label="Enter partner code"
              value={manualCode}
              onChange={(e) => setManualCode(normalizeCode(e.target.value))}
              placeholder="Enter partner code"
              className="flex-1 px-3 py-2 rounded-lg text-xs font-mono tracking-wider uppercase"
              style={{ background: 'rgba(var(--theme-particle-3-rgb),0.10)', color: 'var(--color-text-primary)' }}
              maxLength={12}
            />
            <button
              onClick={handleManualClaim}
              disabled={manualClaiming}
              className="liquid-glass-btn liquid-glass-btn--rose px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-60"
              style={{ color: '#fff' }}
            >
              {manualClaiming ? 'Linking…' : 'Link Accounts'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[100dvh] pb-24">
      <ViewHeader title="Cloud Sync ★" onBack={() => setView('home')} variant="simple" />

      <div data-lenis-prevent className="lenis-inner flex-1 px-4 pt-4 pb-10 overflow-y-auto">
        <div className="w-full max-w-md mx-auto space-y-4">
          <section className="sync-surface-solid rounded-2xl p-4 text-left">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                status.includes('Error') ? 'bg-red-500/15 text-red-400' : 'bg-lior-500/15 text-lior-400'
              }`}>
                {isSyncing ? <RefreshCw size={20} className="animate-spin" /> : status.includes('Error') ? <AlertTriangle size={20} /> : <Cloud size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--color-text-primary)', opacity: 0.72 }}>Status</p>
                <p className="text-base font-bold truncate" style={{ color: 'var(--color-text-primary)' }}>{status}</p>
                {lastSync && (
                  <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)', opacity: 0.78 }}>
                    <CheckCircle size={12} /> Last updated: {lastSync}
                  </p>
                )}
              </div>
              <button
                onClick={forceSync}
                className="liquid-glass-btn liquid-glass-btn--rose px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                style={{ color: '#fff' }}
              >
                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                Sync
              </button>
            </div>
          </section>

          <section data-coachmark="partner-pair" className="sync-surface-solid rounded-2xl overflow-hidden text-left">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <QrCode size={14} style={{ color: 'var(--color-nav-active)' }} />
              <p className="text-sm font-bold flex-1" style={{ color: 'var(--color-text-primary)' }}>Pairing Hub</p>
              {linkedPartner && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-green-400">
                  <UserCheck size={11} /> Linked
                </span>
              )}
            </div>

            <div className="mx-4 mb-3 rounded-2xl px-4 py-3"
              style={{
                background: linkedPartner
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(var(--theme-particle-2-rgb),0.10))'
                  : 'linear-gradient(135deg, rgba(var(--theme-particle-1-rgb),0.14), rgba(var(--theme-particle-3-rgb),0.10))',
                border: linkedPartner ? '1px solid rgba(34,197,94,0.18)' : '1px solid rgba(var(--theme-particle-1-rgb),0.18)',
              }}>
              <p className="text-[11px] uppercase tracking-[0.18em] font-extrabold"
                style={{ color: linkedPartner ? '#22c55e' : 'var(--color-nav-active)' }}>
                {linkedPartner ? 'Permanent connection' : 'One-time private link'}
              </p>
              <p className="text-sm mt-1 leading-snug font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {linkedPartner
                  ? `You and ${linkedPartner} are sharing one private space.`
                  : 'Show a QR or send the code. After it works once, you do not need to pair again.'}
              </p>
              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {pairingUi.message}
              </p>
            </div>

            {linkedPartner && (
              <div className="mx-4 mb-3 px-3 py-2 rounded-xl flex items-center gap-2"
                style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <UserCheck size={13} className="text-green-400 shrink-0" />
                <span className="text-xs flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Connected to <strong style={{ color: 'var(--color-text-primary)' }}>{linkedPartner}</strong>
                </span>
              </div>
            )}

            {linkedPartner ? (
              <div className="px-4 pb-4">{renderPermanentLink()}</div>
            ) : (
              <>
                <div className="sync-surface-glass-accent flex mx-4 mb-3 rounded-xl overflow-hidden">
                  {(['show', 'scan'] as const).map(tab => (
                    <button key={tab}
                      onClick={() => switchTab(tab)}
                      className="flex-1 py-2 text-xs font-bold transition-all"
                      style={{
                        background: pairTab === tab ? 'rgba(var(--theme-particle-1-rgb),0.22)' : 'transparent',
                        color: pairTab === tab ? 'var(--color-nav-active)' : 'var(--color-text-primary)',
                        opacity: pairTab === tab ? 1 : 0.72,
                      }}>
                      {tab === 'show' ? 'My QR' : "Scan Partner's QR"}
                    </button>
                  ))}
                </div>

                <div className="px-4 pb-4">{pairTab === 'show' ? renderShowQR() : renderScanQR()}</div>
              </>
            )}
          </section>

          <section className="sync-surface-solid rounded-2xl p-4 text-left space-y-3">
          <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Cloud Tools</p>
          <p className="text-[11px] -mt-1" style={{ color: 'var(--color-text-primary)', opacity: 0.72 }}>
            Keep media safe and restore across devices.
          </p>
            <button
              onClick={migrateToStorage}
              disabled={isMigrating}
              className="liquid-glass-btn sync-cloud-btn sync-cloud-btn--upload w-full py-3.5 px-4 rounded-xl font-bold transition-all flex items-center justify-between gap-3 disabled:opacity-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="liquid-btn-icon-orb shrink-0">
                  <HardDriveUpload size={17} className={isMigrating ? 'animate-pulse' : ''} />
                </span>
                <div className="min-w-0 text-left">
                  <p className="sync-cloud-title text-sm font-extrabold leading-tight tracking-wide">
                    {isMigrating ? 'Migrating images…' : 'Upload Images'}
                  </p>
                  <p className="sync-cloud-subtitle text-[10px] uppercase tracking-widest">
                    Push local media to cloud storage
                  </p>
                </div>
              </div>
              <span className="sync-cloud-chip text-[10px] uppercase tracking-widest shrink-0">
                {isMigrating ? 'Working' : 'Cloud'}
              </span>
            </button>
            {migrationStatus && (
              <p className="text-[10px] px-2 mt-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {migrationStatus}
              </p>
            )}
            <button
              onClick={recoverImages}
              disabled={isRecovering}
              className="liquid-glass-btn sync-cloud-btn sync-cloud-btn--recover w-full py-3.5 px-4 rounded-xl font-bold transition-all flex items-center justify-between gap-3 disabled:opacity-50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="liquid-btn-icon-orb shrink-0">
                  <ImageDown size={17} className={isRecovering ? 'animate-bounce' : ''} />
                </span>
                <div className="min-w-0 text-left">
                  <p className="sync-cloud-title text-sm font-extrabold leading-tight tracking-wide">
                    {isRecovering ? 'Recovering images…' : 'Recover Images'}
                  </p>
                  <p className="sync-cloud-subtitle text-[10px] uppercase tracking-widest">
                    Pull available media from cloud
                  </p>
                </div>
              </div>
              <span className="sync-cloud-chip text-[10px] uppercase tracking-widest shrink-0">
                {isRecovering ? 'Working' : 'Restore'}
              </span>
            </button>
          </section>

          <section className="sync-surface-solid rounded-2xl p-4 text-left">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-4">
                <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Notifications</p>
                <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--color-text-primary)', opacity: 0.72 }}>
                  {notifPermission === 'granted' ? 'Enabled' : notifPermission === 'denied' ? 'Disabled' : 'Not setup'}
                </p>
              </div>
              {notifPermission === 'granted' ? (
                <div className="p-2 bg-green-500/15 text-green-400 rounded-full">
                  <Bell size={18} />
                </div>
              ) : (
                <button onClick={requestPermission}
                  aria-label="Enable notifications"
                  className="p-2 bg-lior-500/15 text-lior-400 rounded-full transition-colors">
                  <BellOff size={18} />
                </button>
              )}
            </div>
          </section>

          <section className="rounded-2xl p-4 text-center"
            style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.18)' }}>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="text-red-400 text-sm font-bold"
            >
              Log Out
            </button>
          </section>
        </div>

        <ConfirmModal
          isOpen={showLogoutConfirm}
          title="Log Out"
          message="Are you sure you want to log out of cloud sync?"
          confirmLabel="Log Out"
          variant="danger"
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
        <ConfirmModal
          isOpen={showRelinkConfirm}
          title="Link a Different Partner"
          message={`This will unlink your connection to ${linkedPartner} on this device. Your shared memories and data are safe and won't be deleted — you'll just need to scan a new QR code to reconnect.`}
          confirmLabel="Unlink & Re-link"
          variant="danger"
          onConfirm={() => {
            StorageService.clearPairLock();
            SupabaseService.setCachedCoupleId(null);
            setLinkedPartner('');
            setPairingUi({ phase: 'unlinked', message: 'Create a fresh one-time code for the new partner.' });
            setShowRelinkConfirm(false);
            setPairTab('show');
            generateQR(true);
          }}
          onCancel={() => setShowRelinkConfirm(false)}
        />
      </div>
    </div>
  );
};
