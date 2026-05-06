import React from 'react';
import { Cloud, WifiOff } from 'lucide-react';
import { useNativeShell } from '../hooks/useNativeShell';

export const OfflineNotice: React.FC = () => {
  const shell = useNativeShell();

  if (shell.isOnline) return null;

  const copy = shell.pendingUploads > 0
    ? `Offline. ${shell.pendingUploads} ${shell.pendingUploads === 1 ? 'media upload is' : 'media uploads are'} saved on this device.`
    : 'Offline. Changes stay on this device until sync returns.';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-3 right-3 z-[68] mx-auto flex max-w-[23rem] items-center gap-2.5 rounded-full px-3.5 py-2 text-left"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        background: 'rgba(250, 247, 242, 0.94)',
        border: '1px solid rgba(120, 108, 96, 0.14)',
        boxShadow: '0 10px 28px rgba(76, 65, 59, 0.12), inset 0 1px 0 rgba(255,255,255,0.82)',
        color: 'var(--color-text-primary)',
      }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'rgba(120, 108, 96, 0.10)', color: 'var(--color-text-secondary)' }}
      >
        {shell.pendingUploads > 0 ? <Cloud size={15} strokeWidth={2.2} /> : <WifiOff size={15} strokeWidth={2.2} />}
      </span>
      <span className="min-w-0 text-[0.73rem] font-semibold leading-4">
        {copy}
      </span>
    </div>
  );
};
