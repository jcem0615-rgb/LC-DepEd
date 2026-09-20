'use client';

import { useLiveData } from '@/lib/store';
import { auditFeed } from '@/lib/queries';
import { getDb, getSetting } from '@/lib/db';
import { downloadCsv } from '@/lib/export';
import { formatDateTime } from '@/lib/format';
import { Badge, Banner, Card, Loading, PageHeader, ProgressBar, StatTile } from '@/components/ui';
import { Icon } from '@/components/icons';
import { ROLE_PERMISSIONS } from '@/lib/auth';
import type { Role } from '@/lib/types';

const COMPLIANCE = [
  { item: 'Registered Data Protection Officer on record', done: true },
  { item: 'Privacy notice served at account creation', done: true },
  { item: 'Encryption at rest (AES-256) and in transit (TLS 1.3)', done: true },
  { item: 'Role-based access control with least privilege', done: true },
  { item: 'Audit trail of PII access and exports', done: true },
  { item: 'Breach notification runbook rehearsed this quarter', done: false },
  { item: 'Annual Privacy Impact Assessment filed with the NPC', done: false },
];

export default function PrivacyPage() {
  const { data, loading } = useLiveData(async () => {
    const [logs, users, retention] = await Promise.all([
      auditFeed(150),
      getDb().users.toArray(),
      getSetting('retention_days', '1825'),
    ]);
    return { logs, names: new Map(users.map((u) => [u.id, u.name])), retention };
  }, []);

  if (loading || !data) return <Loading rows={6} />;

  const pii = data.logs.filter((l) => l.piiAccessed);
  const failures = data.logs.filter((l) => l.outcome === 'failure');
  const denied = data.logs.filter((l) => l.outcome === 'denied');
  const exports = data.logs.filter((l) => /EXPORT|SF10|SF9/.test(l.action));

  const byRole = new Map<string, number>();
  for (const log of pii) byRole.set(log.actorRole, (byRole.get(log.actorRole) ?? 0) + 1);
  const maxRole = Math.max(1, ...byRole.values());

  const complianceScore = Math.round(
    (COMPLIANCE.filter((c) => c.done).length / COMPLIANCE.length) * 100,
  );

  return (
    <>
      <PageHeader
        title="Data privacy control room"
        description="Centralised RA 10173 oversight: who touched personal data, what left the system, and which controls still need attention."
        actions={
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() =>
              downloadCsv(
                'pii-access-log',
                ['Timestamp', 'Actor', 'Role', 'Action', 'Target', 'Outcome'],
                pii.map((l) => [
                  formatDateTime(l.timestamp),
                  data.names.get(l.actorId) ?? l.actorId,
                  l.actorRole, l.action, l.target, l.outcome,
                ]),
              )
            }
          >
            <Icon name="download" className="h-4 w-4" />
            Export PII log
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="PII access events" value={pii.length} tone="warning" />
        <StatTile label="Data exports" value={exports.length} tone="info" />
        <StatTile label="Failed logins" value={failures.length} tone={failures.length > 3 ? 'danger' : 'neutral'} />
        <StatTile label="Blocked by RBAC" value={denied.length} tone="success" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="PII access by role">
          {byRole.size === 0 ? (
            <p className="text-sm text-slate-500">No PII access recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {[...byRole.entries()].map(([role, count]) => (
                <li key={role}>
                  <p className="mb-1 flex justify-between text-sm font-semibold text-slate-700">
                    <span className="capitalize">{role}</span>
                    <span>{count}</span>
                  </p>
                  <ProgressBar value={(count / maxRole) * 100} tone="warning" />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Retention policy: personal data is kept for {Number(data.retention) / 365} years after a
            learner leaves, then irreversibly anonymised.
          </p>
        </Card>

        <Card title="Compliance checklist" subtitle={`${complianceScore}% complete`}>
          <ProgressBar value={complianceScore} tone={complianceScore === 100 ? 'success' : 'warning'} />
          <ul className="mt-3 space-y-2 text-sm">
            {COMPLIANCE.map((c) => (
              <li key={c.item} className="flex items-start justify-between gap-2">
                <span className="text-slate-700">{c.item}</span>
                <Badge tone={c.done ? 'success' : 'warning'}>{c.done ? 'Done' : 'Open'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4" title="Permission matrix" subtitle="Least-privilege grants per role">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Granted permissions</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(ROLE_PERMISSIONS) as Role[]).map((role) => (
                <tr key={role}>
                  <td className="font-semibold capitalize">{role}</td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {ROLE_PERMISSIONS[role].map((p) => (
                        <Badge key={p} tone="neutral">{p}</Badge>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4">
        <Banner tone="brand">
          Division and regional reports are served through anonymising views: learner identifiers are
          masked and direct identifiers are stripped before aggregation.
        </Banner>
      </div>
    </>
  );
}
