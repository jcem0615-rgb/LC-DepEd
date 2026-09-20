'use client';

/**
 * Tiny reactive layer over Dexie: a change bus plus a hook that re-runs a query
 * whenever data changes. Queries only run in the browser after mount, so
 * server rendering never touches IndexedDB.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureSeeded } from './db';

const CHANGE_EVENT = 'lc-deped:data-changed';

export function notifyChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export interface LiveResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useLiveData<T>(
  query: () => Promise<T>,
  deps: readonly unknown[] = [],
): LiveResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const queryRef = useRef(query);
  queryRef.current = query;

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ensureSeeded()
      .then(() => queryRef.current())
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return { data, loading, error, refresh };
}

/** True once the component has mounted in the browser. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
