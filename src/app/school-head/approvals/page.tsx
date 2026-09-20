'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb } from '@/lib/db';
import { setFormStatus } from '@/lib/queries';
import { workbook } from '@/lib/export';
import { PdfButton, XlsxButton } from '@/components/export-buttons';
import { formatDateTime } from '@/lib/format';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader, Tabs } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { FormStatus } from '@/lib/types';

export default function ApprovalsPage() {
  const { session } = useSession();
  const tenantId = session?.tenantId ?? '';
  const [tab, setTab] = useState<FormStatus>('submitted');
  const [selected, setSelected] = useState<string[]>([]);
  const [remarks, setRemarks] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading } = useLiveData(async () => {
    if (!tenantId) return null;
    const db = getDb();
    const [forms, users] = await Promise.all([
      db.forms.where('tenantId').equals(tenantId).toArray(),
      db.users.toArray(),
    ]);
    return {
      forms: forms.sort((a, b) => b.submittedAt - a.submittedAt),
      names: new Map(users.map((u) => [u.id, u.name])),
    };
  }, [tenantId]);

  const visible = (data?.forms ?? []).filter((f) => f.status === tab);
  const allSelected = visible.length > 0 && visible.every((f) => selected.includes(f.id));

  async function apply(status: FormStatus) {
    if (!session || selected.length === 0) return;
    const count = await setFormStatus(session, selected, status, remarks || undefined);
    setNotice(
      status === 'approved'
        ? `${count} form${count === 1 ? '' : 's'} digitally signed and returned to the submitting teacher.`
        : `${count} form${count === 1 ? '' : 's'} returned for correction.`,
    );
    setSelected([]);
    setRemarks('');
  }

  return (
    <>
      <PageHeader
        title="Approval hub"
        description="Review, batch-sign and export the school forms your teachers submit. Every signature is written to the audit trail."
      />

      <Tabs
        tabs={[
          { id: 'submitted', label: 'Awaiting signature' },
          { id: 'approved', label: 'Approved' },
          { id: 'returned', label: 'Returned' },
          { id: 'draft', label: 'Drafts' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {notice && (
        <div className="mb-4">
          <Banner tone="success">{notice}</Banner>
        </div>
      )}

      {loading || !data ? (
        <Loading rows={5} />
      ) : (
        <Card
          id="approval-list"
          title={`${visible.length} form${visible.length === 1 ? '' : 's'}`}
          action={
            <>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={visible.length === 0}
                onClick={() => setSelected(allSelected ? [] : visible.map((f) => f.id))}
              >
                {allSelected ? 'Clear selection' : 'Select all'}
              </button>
              <XlsxButton
                disabled={visible.length === 0}
                build={() =>
                  workbook(
                    `forms-${tab}`,
                    `School forms — ${tab}`,
                    ['Type', 'Title', 'Period', 'Submitted by', 'Submitted at', 'Status', 'Signed at', 'Remarks'],
                    visible.map((f) => [
                      f.type,
                      f.title,
                      f.period,
                      data.names.get(f.submittedBy) ?? f.submittedBy,
                      formatDateTime(f.submittedAt),
                      f.status,
                      f.signedAt ? formatDateTime(f.signedAt) : '',
                      f.remarks ?? '',
                    ]),
                    {
                      sheetName: tab,
                      meta: [
                        { label: 'Queue', value: tab },
                        { label: 'Forms', value: String(visible.length) },
                      ],
                    },
                  )
                }
              />
              <PdfButton
                disabled={visible.length === 0}
                fallbackElementId="approval-list"
                build={() => ({
                  filename: `forms-${tab}`,
                  title: 'School forms — approval register',
                  subtitle: `Queue: ${tab}`,
                  meta: [
                    { label: 'Queue', value: tab },
                    { label: 'Forms', value: String(visible.length) },
                  ],
                  columns: [
                    { header: 'Type', width: 8 },
                    { header: 'Title', width: 40 },
                    { header: 'Period', width: 14 },
                    { header: 'Submitted by', width: 22 },
                    { header: 'Submitted at', width: 20 },
                    { header: 'Status', width: 12 },
                  ],
                  rows: visible.map((f) => [
                    f.type,
                    f.title,
                    f.period,
                    data.names.get(f.submittedBy) ?? f.submittedBy,
                    formatDateTime(f.submittedAt),
                    f.status,
                  ]),
                  signatures: ['School head'],
                  orientation: 'landscape' as const,
                  footer: 'LC-DepEd • Approval register',
                })}
              />
            </>
          }
        >
          {visible.length === 0 ? (
            <EmptyState title="Nothing in this queue." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                  {tab === 'submitted' && (
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-slate-300"
                      aria-label={`Select ${f.title}`}
                      checked={selected.includes(f.id)}
                      onChange={() =>
                        setSelected((prev) =>
                          prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id],
                        )
                      }
                    />
                  )}
                  <Badge tone="brand">{f.type}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{f.title}</p>
                    <p className="text-xs text-slate-500">
                      {f.period} • {data.names.get(f.submittedBy) ?? f.submittedBy} •{' '}
                      {formatDateTime(f.submittedAt)}
                      {f.signedAt ? ` • signed ${formatDateTime(f.signedAt)}` : ''}
                      {f.remarks ? ` • ${f.remarks}` : ''}
                    </p>
                  </div>
                  <Badge
                    tone={
                      f.status === 'approved'
                        ? 'success'
                        : f.status === 'returned'
                          ? 'danger'
                          : f.status === 'submitted'
                            ? 'info'
                            : 'neutral'
                    }
                  >
                    {f.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          {tab === 'submitted' && visible.length > 0 && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <label className="label" htmlFor="remarks">Remarks (sent with returned forms)</label>
              <input
                id="remarks"
                className="input"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Two learners lack Q2 MAPEH grades."
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={selected.length === 0}
                  onClick={() => void apply('approved')}
                >
                  <Icon name="check" className="h-5 w-5" />
                  Batch sign ({selected.length})
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={selected.length === 0}
                  onClick={() => void apply('returned')}
                >
                  Return for correction
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
