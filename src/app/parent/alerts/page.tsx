'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { alertsFor, childrenForUser, markAlertsRead, recordGateEvent } from '@/lib/queries';
import { enablePush, pushState, showNotification, type PushState } from '@/lib/push';
import { formatDateTime, timeAgo } from '@/lib/format';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icons';

export default function ParentAlertsPage() {
  const { session, t } = useSession();
  const userId = session?.userId ?? '';
  const [permission, setPermission] = useState<PushState>('default');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setPermission(pushState()), []);

  const { data, loading } = useLiveData(async () => {
    if (!userId) return null;
    const [alerts, children] = await Promise.all([alertsFor(userId), childrenForUser(userId)]);
    return { alerts, children };
  }, [userId]);

  useEffect(() => {
    if (userId) void markAlertsRead(userId);
  }, [userId, data?.alerts.length]);

  return (
    <>
      <PageHeader
        title={t('alerts')}
        description="Free Web Push notifications replace paid SMS blasts. Turn them on once and your phone alerts you even when the app is closed."
      />

      <div className="mb-4 space-y-3">
        {permission === 'granted' ? (
          <Banner tone="success">
            <span className="font-semibold">{t('notifications_on')}.</span> Gate scans will reach this
            device.
          </Banner>
        ) : permission === 'unsupported' ? (
          <Banner tone="warning">
            This browser does not support Web Push. Alerts still appear in this list whenever you open
            the app.
          </Banner>
        ) : (
          <Banner tone="info">
            <div className="flex flex-wrap items-center gap-3">
              <span>Turn on notifications to be alerted the moment your child scans in or out.</span>
              <button
                type="button"
                className="btn btn-sm bg-deped-700 text-white"
                onClick={async () => {
                  const next = await enablePush();
                  setPermission(next);
                  if (next === 'granted') {
                    await showNotification(
                      'LC-DepEd notifications enabled',
                      'You will be alerted when your child scans at the school gate.',
                      'welcome',
                    );
                  } else if (next === 'denied') {
                    setNotice('Notifications were blocked in the browser settings.');
                  }
                }}
              >
                <Icon name="bell" className="h-4 w-4" />
                {t('enable_notifications')}
              </button>
            </div>
          </Banner>
        )}

        {notice && <Banner tone="warning">{notice}</Banner>}
      </div>

      {loading || !data ? (
        <Loading rows={5} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Alert history" className="lg:col-span-2">
            {data.alerts.length === 0 ? (
              <EmptyState title={t('no_data')} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.alerts.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-3">
                    <Badge tone={a.kind === 'gate' ? 'success' : a.kind === 'grade' ? 'brand' : 'info'}>
                      {a.kind}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{a.title}</p>
                      <p className="text-sm text-slate-600">{a.body}</p>
                      <p className="text-xs text-slate-400">
                        {formatDateTime(a.timestamp)} • {timeAgo(a.timestamp)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Try it" subtitle="Simulate a gate scan for this demo">
            <p className="text-sm text-slate-600">
              In production this is triggered by the gate kiosk scanning the learner&apos;s e-ID. Use
              this to see the whole notification path end to end.
            </p>
            <div className="mt-3 space-y-2">
              {data.children.map((child) => (
                <div key={child.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-semibold text-ink">{child.firstName} {child.lastName}</p>
                  <div className="mt-2 flex gap-2">
                    {(['in', 'out'] as const).map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={async () => {
                          await recordGateEvent({ student: child, direction, method: 'dynamic' });
                          await showNotification(
                            `${child.firstName} ${direction === 'in' ? 'entered' : 'left'} the school`,
                            `Main Gate • verified dynamic e-ID`,
                            `gate-${child.id}`,
                          );
                          setNotice(null);
                        }}
                      >
                        Scan {direction === 'in' ? 'entry' : 'exit'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
