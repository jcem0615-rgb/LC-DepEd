'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb } from '@/lib/db';
import {
  attendanceSummary,
  type AttendanceSummaryRow,
  reportCard,
  rosterForSection,
  sectionsForTeacher,
  submitForm,
} from '@/lib/queries';
import { generalAverage, honorsFor, promotionRemark } from '@/lib/deped-grading';

import { formatDateTime, fullName, todayIso } from '@/lib/format';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader, Tabs } from '@/components/ui';
import { Icon } from '@/components/icons';
import {
  FormHeader,
  SF10Card,
  SF1Table,
  SF2Table,
  SF5Table,
  SF9Card,
  type PromotionRow,
} from '@/components/school-forms';
import type { FormType, Section, Student, Tenant } from '@/lib/types';
import { formPdfSpec, formWorkbookSpec, type FormContext } from '@/lib/form-specs';
import { PdfButton, XlsxButton } from '@/components/export-buttons';

const GENERATED: { id: FormType; label: string; description: string }[] = [
  { id: 'SF1', label: 'SF1 — School Register', description: 'Learner profile, guardian and enrolment data.' },
  { id: 'SF2', label: 'SF2 — Daily Attendance Report', description: 'Monthly attendance tally, auto-filled from daily marking.' },
  { id: 'SF5', label: 'SF5 — Promotion Report', description: 'General averages, promotion status and recognition.' },
  { id: 'SF9', label: 'SF9 — Report Card (Form 138)', description: 'Per-learner quarterly grades and attendance.' },
  { id: 'SF10', label: 'SF10 — Permanent Record (Form 137)', description: 'Scholastic record for transfer or archiving.' },
];

export default function FormsPage() {
  const { session } = useSession();
  const userId = session?.userId ?? '';
  const tenantId = session?.tenantId ?? '';
  const [tab, setTab] = useState<'generate' | 'submissions'>('generate');
  const [formType, setFormType] = useState<FormType>('SF1');
  const [sectionId, setSectionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const { data: meta } = useLiveData(async () => {
    if (!userId) return null;
    const [sections, tenant] = await Promise.all([
      sectionsForTeacher(userId),
      tenantId ? getDb().tenants.get(tenantId) : Promise.resolve(undefined),
    ]);
    return { sections, tenant: tenant ?? null };
  }, [userId, tenantId]);

  useEffect(() => {
    if (meta?.sections.length && !sectionId) setSectionId(meta.sections[0].id);
  }, [meta, sectionId]);

  const { data, loading } = useLiveData(async () => {
    if (!sectionId) return null;
    const roster = await rosterForSection(sectionId);
    const section = await getDb().sections.get(sectionId);
    const needsLearner = formType === 'SF9' || formType === 'SF10';
    const activeStudent: Student | undefined =
      roster.find((s) => s.id === studentId) ?? roster[0];

    const [summary, card] = await Promise.all([
      formType === 'SF2' || formType === 'SF9'
        ? attendanceSummary(sectionId, todayIso().slice(0, 7))
        : Promise.resolve([]),
      needsLearner && activeStudent ? reportCard(activeStudent.id) : Promise.resolve(null),
    ]);

    let promotion: PromotionRow[] = [];
    if (formType === 'SF5') {
      promotion = await Promise.all(
        roster.map(async (student) => {
          const rc = await reportCard(student.id);
          const average = generalAverage(rc.rows.map((r) => r.final));
          const failed = rc.rows.filter((r) => r.final > 0 && r.final < 75).length;
          return {
            student,
            average,
            failedSubjects: failed,
            remark: promotionRemark(average, failed),
            honors: honorsFor(average),
          };
        }),
      );
    }
    return { roster, section: section ?? null, summary, card, promotion, activeStudent };
  }, [sectionId, formType, studentId]);

  const { data: submissions } = useLiveData(
    async () => (userId ? getDb().forms.where('submittedBy').equals(userId).toArray() : []),
    [userId],
  );

  const activeMeta = GENERATED.find((g) => g.id === formType);

  return (
    <>
      <PageHeader
        title="School Forms"
        description="Forms are generated from records already captured — no re-encoding. Download a ready-to-file PDF or an Excel workbook, then submit for the School Head's digital signature."
      />

      <Tabs
        tabs={[
          { id: 'generate', label: 'Generate' },
          { id: 'submissions', label: `My submissions (${submissions?.length ?? 0})` },
        ]}
        active={tab}
        onChange={setTab}
      />

      {notice && (
        <div className="mb-4">
          <Banner tone="success">{notice}</Banner>
        </div>
      )}

      {tab === 'generate' ? (
        <>
          <Card className="mb-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="ftype">Form</label>
                <select
                  id="ftype"
                  className="input"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as FormType)}
                >
                  {GENERATED.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="fsec">Section</label>
                <select id="fsec" className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                  {(meta?.sections ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              {(formType === 'SF9' || formType === 'SF10') && (
                <div>
                  <label className="label" htmlFor="fstu">Learner</label>
                  <select
                    id="fstu"
                    className="input"
                    value={data?.activeStudent?.id ?? ''}
                    onChange={(e) => setStudentId(e.target.value)}
                  >
                    {(data?.roster ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{fullName(s)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <p className="mt-3 text-sm text-slate-600">{activeMeta?.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PdfButton
                build={() => formPdfSpec(exportContext(formType, data, meta?.tenant ?? null))}
                fallbackElementId="form-preview"
                disabled={!data}
                onResult={(outcome) =>
                  setNotice(
                    outcome === 'pdf'
                      ? `${formType} PDF downloaded.`
                      : 'No connection — opened the print dialog instead (choose "Save as PDF").',
                  )
                }
              />
              <XlsxButton
                build={() => formWorkbookSpec(exportContext(formType, data, meta?.tenant ?? null))}
                disabled={!data}
                onResult={(outcome) =>
                  setNotice(
                    outcome === 'xlsx'
                      ? `${formType} workbook (.xlsx) downloaded.`
                      : 'No connection — exported CSV from this device instead.',
                  )
                }
              />
              <button
                type="button"
                className="btn btn-sm bg-deped-700 text-white"
                disabled={!data || !session}
                onClick={async () => {
                  if (!session || !data?.section) return;
                  await submitForm(session, {
                    type: formType,
                    title: `${formType} — ${data.section.name}`,
                    sectionId: data.section.id,
                    period: formType === 'SF2' ? todayIso().slice(0, 7) : 'SY 2025-2026',
                  });
                  setNotice(`${formType} submitted to the School Head for approval.`);
                  setTab('submissions');
                }}
              >
                <Icon name="check" className="h-4 w-4" />
                Submit for approval
              </button>
            </div>
          </Card>

          {loading || !data ? (
            <Loading rows={6} />
          ) : (
            <Card id="form-preview">
              <FormHeader
                code={formType}
                title={activeMeta?.label.split('— ')[1] ?? ''}
                tenant={meta?.tenant}
                section={data.section}
                period={formType === 'SF2' ? todayIso().slice(0, 7) : undefined}
              />
              {formType === 'SF1' && <SF1Table students={data.roster} />}
              {formType === 'SF2' && <SF2Table rows={data.summary} />}
              {formType === 'SF5' && <SF5Table rows={data.promotion} />}
              {formType === 'SF9' && data.card?.student && (
                <SF9Card
                  student={data.card.student}
                  rows={data.card.rows}
                  average={data.card.average}
                  honors={data.card.honors}
                  remark={data.card.remark}
                  attendance={data.summary.find((s) => s.student.id === data.card?.student?.id) ?? null}
                />
              )}
              {formType === 'SF10' && data.card?.student && (
                <SF10Card
                  student={data.card.student}
                  rows={data.card.rows}
                  average={data.card.average}
                  remark={data.card.remark}
                />
              )}
            </Card>
          )}
        </>
      ) : (
        <Card title="My submissions" subtitle="Status updates arrive from the School Head's approval hub.">
          {!submissions?.length ? (
            <EmptyState title="No submissions yet." hint="Generate a form and submit it for approval." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...submissions]
                .sort((a, b) => b.submittedAt - a.submittedAt)
                .map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Badge tone="brand">{f.type}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{f.title}</p>
                      <p className="text-xs text-slate-500">
                        {f.period} • submitted {formatDateTime(f.submittedAt)}
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
                    {f.syncState === 'pending' && <Badge tone="warning">queued</Badge>}
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

interface PreviewData {
  roster: Student[];
  section: Section | null;
  summary: AttendanceSummaryRow[];
  promotion: PromotionRow[];
  card: Awaited<ReturnType<typeof reportCard>> | null;
  activeStudent?: Student;
}

/** Assembles what the shared form-spec builders need from this page's state. */
function exportContext(
  formType: FormType,
  data: PreviewData | null | undefined,
  tenant: Tenant | null,
): FormContext {
  return {
    formType,
    tenant,
    section: data?.section ?? null,
    roster: data?.roster ?? [],
    summary: data?.summary ?? [],
    promotion: data?.promotion ?? [],
    card: data?.card ?? null,
    period: formType === 'SF2' ? todayIso().slice(0, 7) : undefined,
  };
}
