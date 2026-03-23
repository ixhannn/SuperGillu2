import React, { useState, useEffect } from 'react';
import { ArrowLeft, Cloud, CheckCircle, RefreshCw, AlertTriangle, Bell, BellOff, ImageDown, HardDriveUpload } from 'lucide-react';
import { ViewState } from '../types';
import { SyncService, syncEventTarget } from '../services/sync';
import { StorageService } from '../services/storage';
import { SupabaseService } from '../services/supabase';
import { MediaMigrationService } from '../services/mediaMigration';
import { ConfirmModal } from '../components/ConfirmModal';
import { toast } from '../utils/toast';

interface SyncProps {
  setView: (view: ViewState) => void;
}

export const Sync: React.FC<SyncProps> = ({ setView }) => {
  const [status, setStatus] = useState(SyncService.status);
  const [lastSync, setLastSync] = useState(SyncService.lastSyncTime);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState('');
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    "Notification" in window ? Notification.permission : "denied"
  );

  useEffect(() => {
    const handleUpdate = () => {
      setStatus(SyncService.status);
      setLastSync(SyncService.lastSyncTime);
    };
    syncEventTarget.addEventListener('sync-update', handleUpdate);
    return () => syncEventTarget.removeEventListener('sync-update', handleUpdate);
  }, []);

  const forceSync = async () => {
      setIsSyncing(true);
      await SyncService.init(); // Re-trigger full sync
      setTimeout(() => setIsSyncing(false), 1000);
  };

  const requestPermission = async () => {
      if (!("Notification" in window)) {
          toast.show("This browser does not support notifications.", 'info');
          return;
      }
      
      const permission = await Notification.requestPermission();
      setNotifPermission(permission);
      
      if (permission === "granted") {
          new Notification("Notifications Enabled!", { 
              body: "You'll now get alerts when your partner shares a moment.",
              icon: "/icon.svg"
          });
      }
  };

  const migrateToStorage = async () => {
      setIsMigrating(true);
      setMigrationStatus('Starting migration...');
      try {
          const result = await MediaMigrationService.migrateAll((msg) => setMigrationStatus(msg));
          if (result.migrated > 0) {
              toast.show(`Migrated ${result.migrated} file(s) to cloud storage!`, 'success');
          } else if (result.skipped > 0) {
              toast.show('All media already in cloud storage.', 'success');
          } else {
              toast.show('No media found to migrate.', 'info');
          }
      } catch (e) {
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
      } catch (e) {
          toast.show('Recovery failed. Try syncing first.', 'error');
      }
      setIsRecovering(false);
  };

  const handleLogout = async () => {
      if (SupabaseService.client) await SupabaseService.client.auth.signOut();
      window.location.reload();
  };

  return (
    <div className="flex flex-col h-full min-h-screen pb-32">
      <div className="p-4 flex items-center gap-4 border-b border-gray-100">
        <button onClick={() => setView('home')} aria-label="Go back" className="p-2 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 rounded-full hover:bg-gray-50 cursor-pointer focus-visible:ring-2 focus-visible:ring-tulika-500 focus-visible:ring-offset-2">
          <ArrowLeft size={24} />
        </button>
        <span className="font-semibold text-lg text-gray-800">Cloud Sync</span>
      </div>

      <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">
        
        <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-6 shadow-2xl transition-all ${
            status.includes('Error') ? 'bg-red-50 text-red-500' : 'bg-tulika-50 text-tulika-500'
        }`}>
            {isSyncing ? (
                <RefreshCw size={48} className="animate-spin" />
            ) : status.includes('Error') ? (
                <AlertTriangle size={48} />
            ) : (
                <Cloud size={48} />
            )}
        </div>

        <h2 className="text-2xl font-serif font-bold text-gray-800 mb-2">
            {status}
        </h2>
        
        {lastSync && (
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-8">
                <CheckCircle size={14} />
                <span>Last updated: {lastSync}</span>
            </div>
        )}

        <div className="w-full max-w-xs space-y-4">
            <button 
                onClick={forceSync}
                className="w-full bg-tulika-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-tulika-200 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
                <RefreshCw size={20} className={isSyncing ? "animate-spin" : ""} />
                Sync Now
            </button>

            <button
                onClick={migrateToStorage}
                disabled={isMigrating}
                className="w-full bg-emerald-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-emerald-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 disabled:opacity-50"
            >
                <div className="flex items-center gap-2">
                    <HardDriveUpload size={20} className={isMigrating ? "animate-pulse" : ""} />
                    {isMigrating ? 'Migrating...' : 'Upload Images to Cloud'}
                </div>
                {migrationStatus && <span className="text-[10px] opacity-80">{migrationStatus}</span>}
            </button>

            <button
                onClick={recoverImages}
                disabled={isRecovering}
                className="w-full bg-indigo-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
                <ImageDown size={20} className={isRecovering ? "animate-bounce" : ""} />
                {isRecovering ? 'Recovering...' : 'Recover Images from Cloud'}
            </button>

            {/* Notification Permission Card */}
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between text-left">
                <div className="flex-1 pr-4">
                    <p className="text-sm font-bold text-gray-800">Push Notifications</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                        {notifPermission === 'granted' ? 'Enabled' : notifPermission === 'denied' ? 'Disabled' : 'Not setup'}
                    </p>
                </div>
                {notifPermission === 'granted' ? (
                    <div className="p-2 bg-green-100 text-green-600 rounded-full">
                        <Bell size={20} />
                    </div>
                ) : (
                    <button 
                        onClick={requestPermission}
                        className="p-2 bg-tulika-100 text-tulika-600 rounded-full transition-colors"
                    >
                        <BellOff size={20} />
                    </button>
                )}
            </div>

            <p className="text-xs text-gray-400 leading-relaxed px-4">
                Your memories are automatically backed up to the secure cloud. Notifications appear when your partner adds content.
            </p>
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