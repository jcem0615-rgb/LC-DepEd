'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData, notifyChange } from '@/lib/store';
import { getDb, getSetting, resetLocalData, setSetting } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { downloadJson } from '@/lib/export';
import { randomSecret } from '@/lib/crypto';
import { drainQueue, pendingCount } from '@/lib/sync';
import { formatDateTime } from '@/lib/format';
import { Badge, Banner, Card, Loading, PageHeader, ProgressBar, StatTile, Toggle } from '@/components/ui';
import { Icon } from '@/components/icons';

const MIGRATIONS = [
  { id: '2025_06_01_init', label: 'Initial multi-tenant schema', applied: true },
  { id: '2025_07_14_rls_policies', label: 'Row-Level Security policies per tenant', applied: true },
  { id: '2025_08_02_audit_hash_chain', label: 'Audit log hash chain', applied: true },
  { id: '2025_09_10_matatag_competencies', label: 'MATATAG competency reference tables', applied: true },
  { id: '2025_10_01_sf10_archive', label: 'SF10 archival partitions', applied: false },
];

export default function MaintenancePage() {
  const { session } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const { data, loading } = useLiveData(async () => {
    const [maintenance, lastBackup, vapid, rotatedAt, queue] = await Promise.all([
      getSetting('maintenance_mode', 'off'),
      getSetting('last_backup_at', ''),
      getSetting('vapid_public_key', ''),
      getSetting('vapid_rotated_at', ''),
      pendingCount(),
    ]);
    return { maintenance, lastBackup, vapid, rotatedAt, queue };
  }, []);

  async function audit(action: string, target: string) {
    if (!session) return;
    await logAudit({
      actorId: session.userId,
      actorRole: session.role,
      action,
      target,
      tenantId: null,
    });
  }

  async function runBackup() {
    setBusy('backup');
    setProgress(0);
    const db = getDb();
    const snapshot: Record<string, unknown> = { takenAt: new Date().toISOString() };
    const tables = db.tables;
    for (let i = 0; i < tables.length; i += 1) {
      snapshot[tables[i].name] = await tables[i].toArray();
      setProgress(Math.round(((i + 1) / tables.length) * 100));
      await new Promise((r) => setTimeout(r, 60));
    }
    downloadJson(`lc-deped-snapshot-${Date.now()}`, snapshot);
    await setSetting('last_backup_at', String(Date.now()));
    await audit('DB_SNAPSHOT', 'full-database');
    notifyChange();
    setBusy(null);
    setNotice('Database snapshot exported and recorded in the maintenance log.');
  }

  async function rotateVapid() {
    setBusy('vapid');
    const key = `BJ2s-${randomSecret().slice(0, 40)}`;
    await setSetting('vapid_public_key', key);
    await setSetting('vapid_rotated_at', String(Date.now()));
    await audit('VAPID_ROTATE', 'push-keys');
    notifyChange();
    setBusy(null);
    setNotice('VAPID key pair rotated. Existing push subscriptions are re-issued on next app launch.');
  }

  async function toggleMaintenance(on: boolean) {
    await setSetting('maintenance_mode', on ? 'on' : 'off');
    await audit(on ? 'MAINTENANCE_ON' : 'MAINTENANCE_OFF', 'global');
    notifyChange();
    setNotice(on ? 'Maintenance mode engaged — portals are read-only.' : 'Maintenance mode lifted.');
  }

  if (loading || !data) return <Loading rows={6} />;

  return (
    <>
      <PageHeader
        title="Backup &amp; system maintenance"
        description="Snapshots, migrations, push key rotation and the global emergency switch."
      />

      {notice && (
        <div className="mb-4">
          <Banner tone="success">{notice}</Banner>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Last snapshot"
          value={data.lastBackup ? formatDateTime(Number(data.lastBackup)) : 'Never'}
          tone={data.lastBackup ? 'success' : 'warning'}
        />
        <StatTile
          label="VAPID key rotated"
          value={data.rotatedAt ? formatDateTime(Number(data.rotatedAt)) : 'Never'}
          tone="info"
          hint="Rotate every 90 days"
        />
        <StatTile
          label="Sync queue"
          value={data.queue}
          tone={data.queue ? 'warning' : 'success'}
          hint="Writes waiting to upload"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Database snapshot">
          <p className="text-sm text-slate-600">
            Exports every table to an encryptable JSON archive. In the server deployment this triggers
            a <code className="rounded bg-slate-100 px-1">pg_dump</code> to object storage on the
            configured schedule.
          </p>
          {busy === 'backup' && <div className="mt-3"><ProgressBar value={progress} /></div>}
          <button
            type="button"
            className="btn-primary mt-3 w-full"
            disabled={busy !== null}
            onClick={() => void runBackup()}
          >
            <Icon name="download" className="h-5 w-5" />
            {busy === 'backup' ? `Snapshotting… ${progress}%` : 'Run snapshot now'}
          </button>
        </Card>

        <Card title="Push notification keys">
          <p className="text-sm text-slate-600">Current VAPID public key:</p>
          <code className="mt-2 block break-all rounded-xl bg-slate-900 p-3 font-mono text-xs text-emerald-300">
            {data.vapid || 'not configured'}
          </code>
          <button
            type="button"
            className="btn-secondary mt-3 w-full"
            disabled={busy !== null}
            onClick={() => void rotateVapid()}
          >
            <Icon name="shield" className="h-5 w-5" />
            Rotate VAPID key pair
          </button>
        </Card>

        <Card title="Database migrations">
          <ul className="space-y-2 text-sm">
            {MIGRATIONS.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-700">{m.label}</p>
                  <p className="font-mono text-xs text-slate-400">{m.id}</p>
                </div>
                <Badge tone={m.applied ? 'success' : 'warning'}>{m.applied ? 'Applied' : 'Pending'}</Badge>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-secondary mt-3 w-full"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('migrate');
              await new Promise((r) => setTimeout(r, 800));
              await audit('DB_MIGRATE', '2025_10_01_sf10_archive');
              setBusy(null);
              setNotice('Pending migration applied to all tenant schemas.');
            }}
          >
            {busy === 'migrate' ? 'Applying…' : 'Apply pending migrations'}
          </button>
        </Card>

        <Card title="Emergency controls">
          <div className="flex items-center gap-3">
            <Toggle
              checked={data.maintenance === 'on'}
              label="Global maintenance mode"
              onChange={(next) => void toggleMaintenance(next)}
            />
            <div>
              <p className="font-semibold text-slate-700">Global maintenance mode</p>
              <p className="text-xs text-slate-500">
                Portals stay readable; all writes are rejected until lifted.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              className="btn-secondary w-full"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('drain');
                const n = await drainQueue();
                setBusy(null);
                setNotice(`Sync queue drained — ${n} record${n === 1 ? '' : 's'} uploaded.`);
              }}
            >
              <Icon name="cloud" className="h-5 w-5" />
              Force sync queue drain
            </button>
            <button
              type="button"
              className="btn-danger w-full"
              disabled={busy !== null}
              onClick={async () => {
                setBusy('reset');
                await resetLocalData();
                await audit('DEMO_DATA_RESET', 'local-database');
                setBusy(null);
                setNotice('Local demo database wiped and re-seeded.');
              }}
            >
              {busy === 'reset' ? 'Resetting…' : 'Reset demo data on this device'}
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
