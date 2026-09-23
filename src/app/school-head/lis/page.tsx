'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { workbook } from '@/lib/export';
import { XlsxButton } from '@/components/export-buttons';
import { formatDateTime, fullName } from '@/lib/format';
import {
  LIS_COLUMNS,
  LIS_RULES,
  toLisRow,
  validateBatch,
  type LisLearnerInput,
  type LisRuleCode,
} from '@/lib/lis';
import { Badge, Banner, Card, Loading, PageHeader, ProgressBar, StatTile } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { Section, Student } from '@/lib/types';

interface SyncReceipt {
  batchId: string;
  idempotent: boolean;
  status: string;
  accepted: number;
  rejected: number;
  findings: { code: LisRuleCode; message: string; count: number }[];
  submittedAt: string;
  transmission: { configured: boolean; reference: string | null; error: string | null };
}

interface HistoryBatch {
  id: string;
  submitted_at: string;
  row_count: number;
  accepted_count: number;
  rejected_count: number;
  status: string;
  transmission_ref: string | null;
  transmission_error: string | null;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  transmitted: 'success',
  validated: 'info',
  partially_accepted: 'warning',
  rejected: 'danger',
  transmission_failed: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  transmitted: 'Transmitted to LIS',
  validated: 'Validated — ready for upload',
  partially_accepted: 'Partly accepted',
  rejected: 'Rejected',
  transmission_failed: 'Transmission failed',
};

/** Learner records in the shape the LIS expects. */
function toLisRows(students: Student[], sections: Section[]): LisLearnerInput[] {
  const sectionName = new Map(sections.map((s) => [s.id, s.name]));
  return students.map((s) => ({
    lrn: s.lrn,
    lastName: s.lastName,
    firstName: s.firstName,
    middleName: s.middleName,
    sex: s.sex,
    birthDate: s.birthDate,
    gradeLevel: s.gradeLevel,
    section: sectionName.get(s.sectionId) ?? '',
    guardianName: s.guardianName,
    guardianContact: s.guardianContact,
    motherTongue: s.motherTongue,
    address: s.address,
  }));
}

export default function LisSyncPage() {
  const { session } = useSession();
  const tenantId = session?.tenantId ?? '';
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<SyncReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryBatch[]>([]);
  const [storeReady, setStoreReady] = useState<boolean | null>(null);

  const { data, loading } = useLiveData(async () => {
    if (!tenantId) return null;
    const db = getDb();
    const [students, sections, tenant] = await Promise.all([
      db.students.where('tenantId').equals(tenantId).toArray(),
      db.sections.where('tenantId').equals(tenantId).toArray(),
      db.tenants.get(tenantId),
    ]);
    const rows = toLisRows(students, sections);
    return { students, sections, tenant: tenant ?? null, rows, validation: validateBatch({
      schoolId: tenant?.schoolId ?? '',
      schoolName: tenant?.name ?? '',
      schoolYear: sections[0]?.schoolYear ?? '',
      submittedBy: session?.userId ?? '',
      rows,
    }) };
  }, [tenantId, session?.userId]);

  const schoolId = data?.tenant?.schoolId ?? '';

  const loadHistory = useCallback(async () => {
    if (!schoolId) return;
    try {
      const res = await fetch(`/api/lis/batches?schoolId=${encodeURIComponent(schoolId)}`, {
        cache: 'no-store',
      });
      const body = await res.json();
      setStoreReady(Boolean(body.configured));
      setHistory(Array.isArray(body.batches) ? body.batches : []);
    } catch {
      setStoreReady(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function sendTransmittal() {
    if (!session || !data?.tenant) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/lis/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: data.tenant.schoolId,
          schoolName: data.tenant.name,
          schoolYear: data.sections[0]?.schoolYear ?? '',
          submittedBy: session.userId,
          rows: data.rows,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'The transmittal could not be sent.');
      } else {
        setReceipt(body as SyncReceipt);
        await logAudit({
          actorId: session.userId,
          actorRole: session.role,
          action: 'LIS_TRANSMITTAL',
          target: `batch:${body.batchId}`,
          tenantId: session.tenantId,
          piiAccessed: true,
        });
        await loadHistory();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The transmittal could not be sent.');
    }
    setBusy(false);
  }

  if (loading || !data) return <Loading rows={5} />;

  const { validation } = data;
  const blocked = validation.accepted === 0;

  return (
    <>
      <PageHeader
        title="LIS transmittal"
        description="Validate enrolment against the Learner Information System rules, then record the transmittal. Rejected rows stay behind with the reason, so only clean records go."
        actions={
          <XlsxButton
            label="LIS upload file"
            disabled={!data.rows.length}
            build={() =>
              workbook(
                `LIS-${data.tenant?.schoolId ?? 'school'}-${data.sections[0]?.schoolYear ?? ''}`,
                'LIS enrolment upload',
                [...LIS_COLUMNS],
                data.rows.filter((_, i) => validation.rows[i]?.accepted).map(toLisRow),
                {
                  sheetName: 'Enrolment',
                  subtitle: 'Accepted rows only, in LIS template column order',
                  meta: [
                    { label: 'School ID', value: data.tenant?.schoolId ?? '—' },
                    { label: 'School year', value: data.sections[0]?.schoolYear ?? '—' },
                    { label: 'Rows', value: String(validation.accepted) },
                  ],
                  notes: ['Contains personal data — handle under RA 10173 and delete local copies after upload.'],
                },
              )
            }
          />
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Learners in scope" value={data.rows.length} />
        <StatTile label="Pass validation" value={validation.accepted} tone="success" />
        <StatTile
          label="Held back"
          value={validation.rejected}
          tone={validation.rejected ? 'warning' : 'success'}
        />
        <StatTile
          label="Transmittals sent"
          value={history.length}
          tone="info"
          hint={history[0] ? formatDateTime(history[0].submitted_at) : 'None yet'}
        />
      </div>

      {storeReady === false && (
        <div className="mb-4">
          <Banner tone="warning">
            The transmittal store is not reachable, so batches cannot be recorded. Set{' '}
            <code>SUPABASE_URL</code> and a Supabase key on the deployment. Validation and the upload
            file still work.
          </Banner>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}

      {receipt && (
        <div className="mb-4">
          <Banner tone={receipt.rejected === 0 ? 'success' : 'warning'}>
            <p className="font-semibold">
              {receipt.idempotent
                ? 'This enrolment data was already transmitted — the original receipt stands.'
                : 'Transmittal recorded.'}{' '}
              {STATUS_LABEL[receipt.status] ?? receipt.status}
            </p>
            <p className="mt-1 text-sm">
              Batch <code className="font-mono">{receipt.batchId.slice(0, 8)}</code> •{' '}
              {receipt.accepted} accepted • {receipt.rejected} held back
              {receipt.transmission.reference ? ` • DepEd ref ${receipt.transmission.reference}` : ''}
            </p>
            {!receipt.transmission.configured && (
              <p className="mt-1 text-sm">
                No DepEd endpoint is configured, so the batch is validated and waiting for the portal
                upload — use the LIS upload file above.
              </p>
            )}
            {receipt.transmission.error && (
              <p className="mt-1 text-sm">Transmission error: {receipt.transmission.error}</p>
            )}
          </Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pre-transmittal validation" subtitle="The same rules the LIS applies on upload">
          <ProgressBar
            value={data.rows.length ? (validation.accepted / data.rows.length) * 100 : 0}
            tone={validation.rejected === 0 ? 'success' : 'warning'}
          />
          <p className="mt-2 text-sm text-slate-600">
            {validation.accepted} of {data.rows.length} learner records pass.
          </p>

          {validation.findings.length === 0 ? (
            <div className="mt-3">
              <Banner tone="success">Every record passes the LIS rules.</Banner>
            </div>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {validation.findings.map((f) => (
                <li key={f.code} className="flex items-start justify-between gap-2">
                  <span className="text-slate-700">{f.message}</span>
                  <Badge tone="warning">{f.count}</Badge>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="btn-primary mt-4 w-full"
            disabled={busy || blocked}
            onClick={() => void sendTransmittal()}
          >
            <Icon name="cloud" className="h-5 w-5" />
            {busy ? 'Sending…' : `Send transmittal (${validation.accepted} learners)`}
          </button>
          {blocked && (
            <p className="mt-2 text-xs text-rose-700">
              Nothing passes validation yet, so there is nothing to send.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Re-sending the same enrolment data returns the original receipt instead of creating a
            second transmittal.
          </p>
        </Card>

        <Card title="Records held back" subtitle="Fix these, then send again">
          {validation.rejected === 0 ? (
            <Banner tone="success">Nothing is being held back.</Banner>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Learner</th>
                    <th>LRN</th>
                    <th>Why it is held back</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.rows
                    .map((row, i) => ({ row, student: data.students[i] }))
                    .filter(({ row }) => !row.accepted)
                    .slice(0, 25)
                    .map(({ row, student }) => (
                      <tr key={`${row.lrn}-${student?.id ?? ''}`}>
                        <td className="font-semibold">{student ? fullName(student) : '—'}</td>
                        <td className="font-mono text-xs">{row.lrn}</td>
                        <td className="text-xs">
                          {row.errors.map((code) => LIS_RULES[code]).join('; ')}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4" title="Transmittal history" subtitle="Recorded server-side, shared across devices">
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">
            {storeReady === false
              ? 'Unavailable while the transmittal store is unreachable.'
              : 'No transmittals recorded yet.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>Batch</th>
                  <th>Learners</th>
                  <th>Accepted</th>
                  <th>Held back</th>
                  <th>Status</th>
                  <th>DepEd reference</th>
                </tr>
              </thead>
              <tbody>
                {history.map((batch) => (
                  <tr key={batch.id}>
                    <td className="whitespace-nowrap text-xs">{formatDateTime(batch.submitted_at)}</td>
                    <td className="font-mono text-xs">{batch.id.slice(0, 8)}</td>
                    <td>{batch.row_count}</td>
                    <td>{batch.accepted_count}</td>
                    <td>{batch.rejected_count}</td>
                    <td>
                      <Badge tone={STATUS_TONE[batch.status] ?? 'neutral'}>
                        {STATUS_LABEL[batch.status] ?? batch.status}
                      </Badge>
                    </td>
                    <td className="font-mono text-xs">{batch.transmission_ref ?? '—'}</td>
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
