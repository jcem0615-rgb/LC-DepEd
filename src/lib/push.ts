'use client';

/**
 * PWA service worker + Web Push (VAPID) integration.
 *
 * Push replaces paid SMS: gate scans fan out to guardians as free Web Push
 * notifications. With no VAPID key configured the helper falls back to
 * service-worker local notifications so the flow is still demonstrable.
 */

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch {
    return null;
  }
}

export function pushState(): PushState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as PushState;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function enablePush(): Promise<PushState> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission as PushState;

  const reg = await navigator.serviceWorker?.ready.catch(() => null);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (reg && vapid && 'pushManager' in reg) {
    try {
      const existing = await reg.pushManager.getSubscription();
      if (!existing) {
        await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid) as unknown as BufferSource,
        });
      }
    } catch {
      // Subscription failure still leaves local notifications working.
    }
  }
  return 'granted';
}

export async function showNotification(title: string, body: string, tag?: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.ready.catch(() => null);
    if (reg) {
      await reg.showNotification(title, {
        body,
        tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        data: { url: '/parent/alerts' },
      });
      return true;
    }
    new Notification(title, { body, tag, icon: '/icons/icon-192.png' });
    return true;
  } catch {
    return false;
  }
}
