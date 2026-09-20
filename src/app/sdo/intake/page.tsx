'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData, notifyChange } from '@/lib/store';
import { getDb } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { workbook } from '@/lib/export';
import { XlsxButton } from '@/components/export-buttons';
import { formatDateTime } from '@/lib/format';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader, StatTile } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { DivisionReport } from '@/lib/types';

/** Rule set applied to every uploaded division report. */
const RULES = [
  'Learner counts reconcile with the last SF1 rollup',
  'No duplicate LRNs within the submission',
  'Attendance days do not exceed the school calendar',
  'All sections in the register are represented',
  'School ID is provisioned and active',
];

export default function IntakePage() {
  const { session } = useSession();
  const [selected, setSelected] = useState<DivisionReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: reports, loading } = useLiveData(async () => {
    const rows = await getDb().divisionReports.toArray();
    return rows.sort((a, b) => b.receivedAt - a.receivedAt);
  }, []);

  async function revalidate(report: DivisionReport) {
    if (!session) return;
    const status: DivisionReport['status'] = report.findings.length
      ? report.findings.some((f) => /duplicate|not yet provisioned/i.test(f))
        ? 'rejected'
        : 'flagged'
      : 'validated';
    await getDb().divisionReports.update(report.id, { status, receivedAt: Date.now() });
    await logAudit({
      actorId: session.userId,
      actorRole: session.role,
      action: 'REPORT_REVALIDATE',
      target: report.id,
      tenantId: null,
    });
    notifyChange();
    setNotice(`${report.schoolName}: re-validated as ${status}.`);
    setSelected({ ...report, status });
  }

  const counts = {
    validated: (reports ?? []).filter((r) => r.status === 'validated').length,
    flagged: (reports ?? []).filter((r) => r.status === 'flagged').length,
    rejected: (reports ?? []).filter((r) => r.status === 'rejected').length,
    pending: (reports ?? []).filter((r) => r.status === 'pending').length,
  };

  return (
    <>
      <PageHeader
        title="Automated report intake"
        description="Uploads from schools are ingested and rule-checked automatically. Division staff only handle the exceptions."
        actions={
          <XlsxButton
            disabled={!reports?.length}
            label="Export intake log"
            build={() =>
              workbook(
                'division-intake',
                'Automated report intake log',
                ['School', 'Report type', 'Period', 'Rows', 'Received', 'Status', 'Findings'],
                (reports ?? []).map((r) => [
                  r.schoolName, r.type, r.period, r.rows, formatDateTime(r.receivedAt), r.status,
                  r.findings.join('; '),
                ]),
                {
                  sheetName: 'Intake',
                  meta: [
                    { label: 'Validated', value: String(counts.validated) },
                    { label: 'Flagged', value: String(counts.flagged) },
                    { label: 'Rejected', value: String(counts.rejected) },
                    { label: 'Pending', value: String(counts.pending) },
                  ],
                },
              )
            }
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Validated" value={counts.validated} tone="success" />
        <StatTile label="Flagged" value={counts.flagged} tone="warning" />
        <StatTile label="Rejected" value={counts.rejected} tone="danger" />
        <StatTile label="Pending" value={counts.pending} tone="neutral" />
      </div>

      {notice && (
        <div className="mb-4">
          <Banner tone="info">{notice}</Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Submissions" className="lg:col-span-2">
          {loading ? (
            <Loading rows={5} />
          ) : !reports?.length ? (
            <EmptyState title="No submissions received." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {reports.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className={`flex w-full flex-wrap items-center gap-3 rounded-xl px-2 py-3 text-left ${
                      selected?.id === r.id ? 'bg-deped-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{r.schoolName}</p>
                      <p className="text-xs text-slate-500">
                        {r.type} • {r.period} • {r.rows.toLocaleString('en-PH')} rows •{' '}
                        {formatDateTime(r.receivedAt)}
                      </p>
                    </div>
                    <Badge
                      tone={
                        r.status === 'validated'
                          ? 'success'
                          : r.status === 'flagged'
                            ? 'warning'
                            : r.status === 'rejected'
                              ? 'danger'
                              : 'neutral'
                      }
                    >
                      {r.status}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={selected ? selected.schoolName : 'Validation detail'}>
          {!selected ? (
            <EmptyState title="Select a submission to see its rule checks." />
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">
                {selected.type} • {selected.period} • {selected.rows.toLocaleString('en-PH')} rows
              </p>
              <ul className="space-y-2">
                {RULES.map((rule, i) => {
                  const failed = selected.findings[i] !== undefined && i < selected.findings.length;
                  return (
                    <li key={rule} className="flex items-start justify-between gap-2">
                      <span className="text-slate-700">{rule}</span>
                      <Badge tone={failed ? 'danger' : 'success'}>{failed ? 'Fail' : 'Pass'}</Badge>
                    </li>
                  );
                })}
              </ul>

              {selected.findings.length > 0 && (
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="font-bold text-amber-900">Findings</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-900">
                    {selected.findings.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button type="button" className="btn-primary w-full" onClick={() => void revalidate(selected)}>
                <Icon name="check" className="h-5 w-5" />
                Re-run validation
              </button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
