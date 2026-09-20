'use client';

import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/lib/store';
import { pendingCount } from '@/lib/sync';
import { Icon } from './icons';

/** Connectivity + offline-queue indicator shown in every portal header. */
export function SyncStatus() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let active = true;
    const read = async () => {
      try {
        const n = await pendingCount();
        if (active) setPending(n);
      } catch {
        /* database not ready yet */
      }
    };
    void read();
    const id = setInterval(read, 4000);
    const onChange = () => void read();
    window.addEventListener('lc-deped:data-changed', onChange);
    return () => {
      active = false;
      clearInterval(id);
      window.removeEventListener('lc-deped:data-changed', onChange);
    };
  }, []);

  if (!online) {
    return (
      <span className="chip bg-amber-100 text-amber-900" title="Working offline">
        <Icon name="wifi" className="h-4 w-4" />
        Offline{pending > 0 ? ` • ${pending}` : ''}
      </span>
    );
  }
  if (pending > 0) {
    return (
      <span className="chip bg-sky-100 text-sky-800">
        <Icon name="cloud" className="h-4 w-4" />
        Syncing {pending}
      </span>
    );
  }
  return (
    <span className="chip bg-emerald-100 text-emerald-800">
      <Icon name="check" className="h-4 w-4" />
      Synced
    </span>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** "Install app" button — only appears when the browser offers installation. */
export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;
  return (
    <button
      type="button"
      className="btn btn-sm bg-deped-700 text-white"
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice.catch(() => undefined);
        setDeferred(null);
      }}
    >
      <Icon name="download" className="h-4 w-4" />
      Install
    </button>
  );
}
