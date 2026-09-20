'use client';

/**
 * Offline write queue. Mutations are written to IndexedDB immediately and an
 * entry is pushed here; the drain runs whenever the device is online (and on
 * the `online` event), mirroring a Background Sync registration.
 */
import { getDb } from './db';
import { randomId } from './crypto';
import { notifyChange } from './store';
import type { SyncQueueItem } from './types';

export async function enqueue(
  entity: string,
  op: SyncQueueItem['op'],
  recordId: string,
  payload: unknown,
): Promise<void> {
  const item: SyncQueueItem = {
    id: randomId('syn-'),
    entity,
    op,
    recordId,
    payload: JSON.stringify(payload ?? null),
    createdAt: Date.now(),
    attempts: 0,
    status: 'queued',
  };
  await getDb().syncQueue.put(item);
  notifyChange();
  void scheduleDrain();
}

export async function pendingCount(): Promise<number> {
  return getDb().syncQueue.where('status').anyOf('queued', 'syncing').count();
}

let draining = false;

/**
 * Drains the queue. With no backend configured the drain simulates a
 * successful upload round-trip and flips affected records to `synced`;
 * `NEXT_PUBLIC_API_BASE` switches it to a real endpoint.
 */
export async function drainQueue(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  if (draining) return 0;
  draining = true;
  const db = getDb();
  let drained = 0;
  try {
    const items = await db.syncQueue.where('status').anyOf('queued', 'failed').toArray();
    for (const item of items) {
      await db.syncQueue.update(item.id, { status: 'syncing', attempts: item.attempts + 1 });
      const ok = await pushUpstream(item);
      if (ok) {
        await db.syncQueue.delete(item.id);
        await markSynced(item.entity, item.recordId);
        drained += 1;
      } else {
        await db.syncQueue.update(item.id, { status: 'failed' });
      }
    }
  } finally {
    draining = false;
  }
  if (drained) notifyChange();
  return drained;
}

async function pushUpstream(item: SyncQueueItem): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_API_BASE;
  if (!base) {
    // Demo mode: pretend the round-trip succeeded after a short delay.
    await new Promise((r) => setTimeout(r, 120));
    return true;
  }
  try {
    const res = await fetch(`${base}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function markSynced(entity: string, recordId: string): Promise<void> {
  const db = getDb();
  try {
    switch (entity) {
      case 'attendance':
        await db.attendance.update(recordId, { syncState: 'synced' });
        break;
      case 'grades':
        await db.grades.update(recordId, { syncState: 'synced' });
        break;
      case 'lessonLogs':
        await db.lessonLogs.update(recordId, { syncState: 'synced' });
        break;
      case 'forms':
        await db.forms.update(recordId, { syncState: 'synced' });
        break;
      default:
        break;
    }
  } catch {
    /* record may have been removed while queued */
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

export function scheduleDrain(delay = 900): void {
  if (typeof window === 'undefined') return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void drainQueue();
  }, delay);
}

export function startSyncWatcher(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onOnline = () => scheduleDrain(300);
  window.addEventListener('online', onOnline);
  const interval = setInterval(() => void drainQueue(), 30_000);
  scheduleDrain(1500);
  return () => {
    window.removeEventListener('online', onOnline);
    clearInterval(interval);
  };
}
