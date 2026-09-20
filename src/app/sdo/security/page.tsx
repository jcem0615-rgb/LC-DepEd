'use client';

import { useState } from 'react';
import { useLiveData } from '@/lib/store';
import { auditFeed } from '@/lib/queries';
import { getDb } from '@/lib/db';
import { workbook } from '@/lib/export';
import { XlsxButton } from '@/components/export-buttons';
import { formatDateTime } from '@/lib/format';
import { Badge, Banner, Card, Loading, PageHeader, StatTile } from '@/components/ui';

const FILTERS = ['all', 'pii', 'denied', 'failure'] as const;
type Filter = (typeof FILTERS)[number];

export default function SecurityConsolePage() {
  const [filter, setFilter] = useState<Filter>('all');

  const { data, loading } = useLiveData(async () => {
    const [logs, users] = await Promise.all([auditFeed(120), getDb().users.toArray()]);
    return { logs, names: new Map(users.map((u) => [u.id, u.name])) };
  }, []);

  const logs = (data?.logs ?? []).filter((l) => {
    if (filter === 'pii') return l.piiAccessed;
    if (filter === 'denied') return l.outcome === 'denied';
    if (filter === 'failure') return l.outcome === 'failure';
    return true;
  });

  const piiCount = (data?.logs ?? []).filter((l) => l.piiAccessed).length;
  const denied = (data?.logs ?? []).filter((l) => l.outcome === 'denied').length;
  const failed = (data?.logs ?? []).filter((l) => l.outcome === 'failure').length;

  return (
    <>
      <PageHeader
        title="Security console"
        description="Immutable division-wide audit log of PII access, exports and authentication failures."
        actions={
          <XlsxButton
            disabled={!logs.length}
            label="Export security log"
            build={() =>
              workbook(
                'division-audit',
                'Division security console log',
                ['Timestamp', 'Actor', 'Role', 'Action', 'Target', 'PII', 'Outcome'],
                logs.map((l) => [
                  formatDateTime(l.timestamp),
                  data?.names.get(l.actorId) ?? l.actorId,
                  l.actorRole, l.action, l.target, l.piiAccessed ? 'Yes' : 'No', l.outcome,
                ]),
                {
                  sheetName: 'Security',
                  subtitle: 'Immutable audit log — RA 10173',
                  meta: [{ label: 'Filter', value: filter }, { label: 'Entries', value: String(logs.length) }],
                },
              )
            }
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="PII access events" value={piiCount} tone="warning" hint="Each requires a lawful purpose" />
        <StatTile label="Denied requests" value={denied} tone="info" hint="RBAC blocked these" />
        <StatTile label="Authentication failures" value={failed} tone={failed > 3 ? 'danger' : 'neutral'} />
      </div>

      <div className="mb-4">
        <Banner tone="brand">
          Audit records are append-only. In the server deployment they are written to a
          write-once table with a hash chain, so tampering is detectable during a National Privacy
          Commission review.
        </Banner>
      </div>

      <Card
        title="Event log"
        action={
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`btn btn-sm ${filter === f ? 'bg-deped-700 text-white' : 'btn-secondary'}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'pii' ? 'PII only' : f === 'denied' ? 'Denied' : 'Failures'}
              </button>
            ))}
          </div>
        }
      >
        {loading ? (
          <Loading rows={6} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(l.timestamp)}</td>
                    <td className="font-semibold">{data?.names.get(l.actorId) ?? l.actorId}</td>
                    <td className="text-xs">{l.actorRole}</td>
                    <td className="font-mono text-xs">
                      {l.action}
                      {l.piiAccessed && <Badge tone="warning">PII</Badge>}
                    </td>
                    <td className="max-w-[14rem] truncate text-xs">{l.target}</td>
                    <td>
                      <Badge
                        tone={l.outcome === 'success' ? 'success' : l.outcome === 'denied' ? 'warning' : 'danger'}
                      >
                        {l.outcome}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
