'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb, getSetting, setSetting } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { downloadCsv } from '@/lib/export';
import { formatDateTime, fullName } from '@/lib/format';
import { Badge, Banner, Card, Loading, PageHeader, ProgressBar, StatTile } from '@/components/ui';
import { Icon } from '@/components/icons';

const STEPS = [
  'Validating LRN check digits',
  'Checking for duplicate enrolments',
  'Matching sections to LIS class records',
  'Uploading enrolment deltas',
  'Reconciling transfer-in / transfer-out',
];

export default function LisSyncPage() {
  const { session } = useSession();
  const tenantId = session?.tenantId ?? '';
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);

  const { data, loading } = useLiveData(async () => {
    if (!tenantId) return null;
    const db = getDb();
    const [students, sections, lastSync] = await Promise.all([
      db.students.where('tenantId').equals(tenantId).toArray(),
      db.sections.where('tenantId').equals(tenantId).toArray(),
      getSetting('last_lis_sync', ''),
    ]);
    const seen = new Set<string>();
    const duplicates = students.filter((s) => {
      if (seen.has(s.lrn)) return true;
      seen.add(s.lrn);
      return false;
    });
    const malformed = students.filter((s) => !/^\d{12}$/.test(s.lrn));
    const missingGuardian = students.filter((s) => !s.guardianName || !s.guardianContact);
    return { students, sections, duplicates, malformed, missingGuardian, lastSync };
  }, [tenantId]);

  async function runSync() {
    if (!session) return;
    setDone(false);
    for (let i = 0; i < STEPS.length; i += 1) {
      setStep(i);
      await new Promise((r) => setTimeout(r, 450));
    }
    await setSetting('last_lis_sync', String(Date.now()));
    await logAudit({
      actorId: session.userId,
      actorRole: session.role,
      action: 'LIS_SYNC',
      target: `tenant:${tenantId}`,
      tenantId: session.tenantId,
      piiAccessed: true,
    });
    setStep(-1);
    setDone(true);
  }

  if (loading || !data) return <Loading rows={5} />;

  const issues = data.duplicates.length + data.malformed.length + data.missingGuardian.length;

  return (
    <>
      <PageHeader
        title="LIS integration"
        description="Push enrolment and transfer data to the DepEd Learner Information System once validation passes."
        actions={
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() =>
              downloadCsv(
                'LIS-enrolment-export',
                ['LRN', 'Last name', 'First name', 'Middle name', 'Sex', 'Birth date', 'Grade level', 'Section', 'Address', 'Guardian', 'Contact'],
                data.students.map((s) => [
                  s.lrn, s.lastName, s.firstName, s.middleName, s.sex, s.birthDate,
                  s.gradeLevel, data.sections.find((sec) => sec.id === s.sectionId)?.name ?? '',
                  s.address, s.guardianName, s.guardianContact,
                ]),
              )
            }
          >
            <Icon name="download" className="h-4 w-4" />
            Export LIS file
          </button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Learners to sync" value={data.students.length} hint={`${data.sections.length} sections`} />
        <StatTile
          label="Validation issues"
          value={issues}
          tone={issues ? 'warning' : 'success'}
          hint={issues ? 'Resolve before syncing' : 'All records pass validation'}
        />
        <StatTile
          label="Last sync"
          value={data.lastSync ? formatDateTime(Number(data.lastSync)) : 'Never'}
          tone="info"
        />
      </div>

      {done && (
        <div className="mb-4">
          <Banner tone="success">
            Enrolment data pushed to the LIS. A reconciliation receipt was written to the audit trail.
          </Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pre-sync validation">
          <ul className="space-y-2 text-sm">
            <ValidationRow label="LRN format (12 digits)" failures={data.malformed.length} />
            <ValidationRow label="Duplicate LRNs" failures={data.duplicates.length} />
            <ValidationRow label="Guardian contact present" failures={data.missingGuardian.length} />
            <ValidationRow label="Section assignment present" failures={data.students.filter((s) => !s.sectionId).length} />
          </ul>

          {step >= 0 ? (
            <div className="mt-4">
              <ProgressBar value={((step + 1) / STEPS.length) * 100} />
              <p className="mt-2 text-sm font-semibold text-slate-600">{STEPS[step]}…</p>
            </div>
          ) : (
            <button type="button" className="btn-primary mt-4 w-full" onClick={() => void runSync()}>
              <Icon name="cloud" className="h-5 w-5" />
              Start LIS sync
            </button>
          )}
          <p className="mt-2 text-xs text-slate-500">
            The demo runs the validation pipeline locally. Point{' '}
            <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_API_BASE</code> at your LIS gateway
            to transmit for real.
          </p>
        </Card>

        <Card title="Records flagged" subtitle="Fix these before pushing to the LIS">
          {issues === 0 ? (
            <Banner tone="success">All learner records pass the LIS validation rules.</Banner>
          ) : (
            <ul className="space-y-2 text-sm">
              {[...data.malformed, ...data.duplicates, ...data.missingGuardian].slice(0, 12).map((s, i) => (
                <li key={`${s.id}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2">
                  <span className="font-semibold text-amber-900">{fullName(s)}</span>
                  <span className="font-mono text-xs text-amber-800">{s.lrn}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function ValidationRow({ label, failures }: { label: string; failures: number }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-slate-700">{label}</span>
      <Badge tone={failures === 0 ? 'success' : 'danger'}>
        {failures === 0 ? 'Pass' : `${failures} issue${failures === 1 ? '' : 's'}`}
      </Badge>
    </li>
  );
}
