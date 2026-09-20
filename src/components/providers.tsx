'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, readSession } from '@/lib/auth';
import { ensureSeeded, getDb } from '@/lib/db';
import { makeTranslator, type TranslationKey } from '@/lib/i18n';
import { logAudit } from '@/lib/audit';
import { registerServiceWorker } from '@/lib/push';
import { drainQueue, startSyncWatcher } from '@/lib/sync';
import type { Lang, Session, User } from '@/lib/types';

interface SessionContextValue {
  session: Session | null;
  user: User | null;
  ready: boolean;
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
  refreshSession: () => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const LANG_KEY = 'lc-deped:lang';

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<Lang>('en');
  const [version, setVersion] = useState(0);

  // Boot: seed the local DB, restore the session, register the worker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSeeded();
      } catch {
        /* IndexedDB may be unavailable (private mode) — the UI still renders. */
      }
      if (cancelled) return;
      const current = readSession();
      setSession(current);
      if (current) {
        try {
          const found = await getDb().users.get(current.userId);
          if (!cancelled && found) {
            setUser(found);
            setLangState(readLang() ?? found.lang);
          }
        } catch {
          /* ignore */
        }
      } else {
        setLangState(readLang() ?? 'en');
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    void registerServiceWorker();
    const stop = startSyncWatcher();
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DRAIN_SYNC_QUEUE') void drainQueue();
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => {
      stop();
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshSession = useCallback(() => setVersion((v) => v + 1), []);

  const logout = useCallback(() => {
    const current = readSession();
    if (current) {
      void logAudit({
        actorId: current.userId,
        actorRole: current.role,
        action: 'LOGOUT',
        target: current.email,
        tenantId: current.tenantId,
      });
    }
    clearSession();
    setSession(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user,
      ready,
      lang,
      setLang,
      t: makeTranslator(lang),
      refreshSession,
      logout,
    }),
    [session, user, ready, lang, setLang, refreshSession, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function readLang(): Lang | null {
  try {
    const raw = window.localStorage.getItem(LANG_KEY);
    return raw === 'en' || raw === 'tl' || raw === 'ilo' || raw === 'ceb' ? raw : null;
  } catch {
    return null;
  }
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <Providers>.');
  return ctx;
}
