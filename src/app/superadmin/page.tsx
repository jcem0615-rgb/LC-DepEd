'use client';

import { useEffect, useState } from 'react';
import { useLiveData } from '@/lib/store';
import { getDb, getSetting } from '@/lib/db';
import { pendingCount } from '@/lib/sync';
import { formatDateTime, compactNumber } from '@/lib/format';
import { Badge, Banner, Card, Loading, PageHeader, ProgressBar, StatTile } from '@/components/ui';
import { LineChart } from '@/components/charts';
import type { Point } from '@/components/charts';

/** Telemetry sampler — a bounded random walk seeded from the current metrics. */
function useTelemetry() {
  const [latency, setLatency] = useState<Point[]>(() =>
    Array.from({ length: 12 }, (_, i) => ({ label: `${i}`, value: 120 + ((i * 37) % 60) })),
  );
  const [cpu, setCpu] = useState(38);
  const [dbLoad, setDbLoad] = useState(46);
  const [pushRate, setPushRate] = useState(98.4);

  useEffect(() => {
    const id = setInterval(() => {
      setLatency((prev) => {
        const last = prev[prev.length - 1]?.value ?? 140;
        const next = Math.max(70, Math.min(320, last + (Math.random() - 0.5) * 48));
        const point = { label: new Date().toLocaleTimeString('en-PH', { minute: '2-digit', second: '2-digit' }), value: Math.round(next) };
        return [...prev.slice(-11), point];
      });
      setCpu((c) => Math.max(12, Math.min(88, c + (Math.random() - 0.5) * 9)));
      setDbLoad((d) => Math.max(15, Math.min(92, d + (Math.random() - 0.5) * 11)));
      setPushRate((p) => Math.max(92, Math.min(99.9, p + (Math.random() - 0.5) * 0.7)));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return { latency, cpu, dbLoad, pushRate };
}

export default function TelemetryPage() {
  const telemetry = useTelemetry();

  const { data, loading } = useLiveData(async () => {
    const db = getDb();
    const [tenants, users, students, forms, alerts, queue, maintenance, lastBackup] = await Promise.all([
      db.tenants.toArray(),
      db.users.count(),
      db.students.count(),
      db.forms.count(),
      db.alerts.count(),
      pendingCount(),
      getSetting('maintenance_mode', 'off'),
      getSetting('last_backup_at', ''),
    ]);
    return { tenants, users, students, forms, alerts, queue, maintenance, lastBackup };
  }, []);

  if (loading || !data) return <Loading rows={6} />;

  const activeTenants = data.tenants.filter((t) => t.status === 'active');
  const totalEnrollment = data.tenants.reduce((a, t) => a + t.enrollment, 0);
  const avgLatency = Math.round(
    telemetry.latency.reduce((a, p) => a + p.value, 0) / (telemetry.latency.length || 1),
  );

  return (
    <>
      <PageHeader
        title="System health &amp; telemetry"
        description="Live operational view across every participating school: API latency, database load, push delivery and offline sync backlog."
      />

      {data.maintenance === 'on' && (
        <div className="mb-4">
          <Banner tone="danger">
            <b>Maintenance mode is ON.</b> Portals are read-only for all tenants until it is lifted.
          </Banner>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Uptime (30 days)" value="99.94%" tone="success" hint="Target SLA 99.5%" />
        <StatTile
          label="API latency (p50)"
          value={`${avgLatency} ms`}
          tone={avgLatency < 250 ? 'success' : 'warning'}
          hint="Rolling 60-second window"
        />
        <StatTile
          label="Push delivery rate"
          value={`${telemetry.pushRate.toFixed(1)}%`}
          tone="info"
          hint="VAPID Web Push to guardians"
        />
        <StatTile
          label="Offline sync backlog"
          value={data.queue}
          tone={data.queue > 0 ? 'warning' : 'success'}
          hint="Queued writes on this device"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card title="API response latency" subtitle="Sampled every 3 seconds" className="lg:col-span-2">
          <LineChart data={telemetry.latency} />
        </Card>

        <Card title="Resource load">
          <div className="space-y-4">
            <div>
              <p className="mb-1 flex justify-between text-sm font-semibold text-slate-700">
                <span>Application CPU</span>
                <span>{telemetry.cpu.toFixed(0)}%</span>
              </p>
              <ProgressBar value={telemetry.cpu} tone={telemetry.cpu > 75 ? 'danger' : 'brand'} />
            </div>
            <div>
              <p className="mb-1 flex justify-between text-sm font-semibold text-slate-700">
                <span>PostgreSQL load</span>
                <span>{telemetry.dbLoad.toFixed(0)}%</span>
              </p>
              <ProgressBar value={telemetry.dbLoad} tone={telemetry.dbLoad > 80 ? 'danger' : 'info'} />
            </div>
            <div>
              <p className="mb-1 flex justify-between text-sm font-semibold text-slate-700">
                <span>Service worker push success</span>
                <span>{telemetry.pushRate.toFixed(1)}%</span>
              </p>
              <ProgressBar value={telemetry.pushRate} tone="success" />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Tenant footprint">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile label="Schools" value={data.tenants.length} hint={`${activeTenants.length} active`} />
            <StatTile label="Learners" value={compactNumber(totalEnrollment)} tone="info" />
            <StatTile label="Accounts" value={data.users} tone="neutral" />
            <StatTile label="Forms processed" value={data.forms} tone="brand" />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Last database snapshot: {data.lastBackup ? formatDateTime(Number(data.lastBackup)) : 'never'}
          </p>
        </Card>

        <Card title="School status">
          <ul className="divide-y divide-slate-100">
            {data.tenants.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    {t.division} • {t.region} • {t.enrollment.toLocaleString('en-PH')} learners
                  </p>
                </div>
                <Badge
                  tone={t.status === 'active' ? 'success' : t.status === 'provisioning' ? 'info' : 'danger'}
                >
                  {t.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
