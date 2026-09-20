'use client';

import { useState } from 'react';
import { useLiveData } from '@/lib/store';
import { auditFeed } from '@/lib/queries';
import { getDb } from '@/lib/db';
import { downloadCsv } from '@/lib/export';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, EmptyState, Loading, PageHeader, Toggle } from '@/components/ui';
import { Icon } from '@/components/icons';

export default function SchoolAuditPage() {
  const [onlyPii, setOnlyPii] = useState(false);

  const { data, loading } = useLiveData(async () => {
    const [logs, users] = await Promise.all([auditFeed(80, onlyPii), getDb().users.toArray()]);
    return { logs, names: new Map(users.map((u) => [u.id, u.name])) };
  }, [onlyPii]);

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every record access, export, signature and failed login, as required by the Data Privacy Act of 2012 (RA 10173)."
        actions={
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={!data?.logs.length}
            onClick={() =>
              data &&
              downloadCsv(
                'audit-trail',
                ['Timestamp', 'Actor', 'Role', 'Action', 'Target', 'PII', 'Outcome'],
                data.logs.map((l) => [
                  formatDateTime(l.timestamp),
                  data.names.get(l.actorId) ?? l.actorId,
                  l.actorRole,
                  l.action,
                  l.target,
                  l.piiAccessed ? 'Yes' : 'No',
                  l.outcome,
                ]),
              )
            }
          >
            <Icon name="download" className="h-4 w-4" />
            Export
          </button>
        }
      />

      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <Toggle checked={onlyPii} label="Show only PII access events" onChange={setOnlyPii} />
          <span className="text-sm font-semibold text-slate-700">Show only PII access events</span>
        </div>
      </Card>

      {loading || !data ? (
        <Loading rows={6} />
      ) : data.logs.length === 0 ? (
        <EmptyState title="No audit entries yet." />
      ) : (
        <Card title={`${data.logs.length} entries`}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>PII</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(l.timestamp)}</td>
                    <td className="font-semibold">{data.names.get(l.actorId) ?? l.actorId}</td>
                    <td className="text-xs">{l.actorRole}</td>
                    <td className="font-mono text-xs">{l.action}</td>
                    <td className="max-w-[16rem] truncate text-xs">{l.target}</td>
                    <td>{l.piiAccessed ? <Badge tone="warning">PII</Badge> : '—'}</td>
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
        </Card>
      )}
    </>
  );
}
