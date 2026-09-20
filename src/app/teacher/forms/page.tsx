'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb } from '@/lib/db';
import {
  attendanceSummary,
  reportCard,
  rosterForSection,
  sectionsForTeacher,
  submitForm,
} from '@/lib/queries';
import { generalAverage, honorsFor, promotionRemark } from '@/lib/deped-grading';
import { downloadCsv, printSection } from '@/lib/export';
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
import type { FormType, Student } from '@/lib/types';

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
        description="Forms are generated from records already captured — no re-encoding. Print to PDF or export to spreadsheet, then submit for the School Head's digital signature."
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
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => printSection('form-preview')}>
                <Icon name="document" className="h-4 w-4" />
                Print / Save as PDF
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={!data}
                onClick={() => exportCsv(formType, data ?? null)}
              >
                <Icon name="download" className="h-4 w-4" />
                Export CSV
              </button>
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

type PreviewData = {
  roster: Student[];
  summary: Awaited<ReturnType<typeof attendanceSummary>>;
  promotion: PromotionRow[];
  card: Awaited<ReturnType<typeof reportCard>> | null;
} | null;

function exportCsv(formType: FormType, data: PreviewData) {
  if (!data) return;
  if (formType === 'SF1') {
    downloadCsv(
      'SF1-School-Register',
      ['LRN', 'Name', 'Sex', 'Birth date', 'Mother tongue', 'IP', '4Ps', 'Address', 'Guardian', 'Contact'],
      data.roster.map((s) => [
        s.lrn, fullName(s), s.sex, s.birthDate, s.motherTongue, s.ipCommunity,
        s.fourPs ? 'Yes' : 'No', s.address, s.guardianName, s.guardianContact,
      ]),
    );
    return;
  }
  if (formType === 'SF2') {
    downloadCsv(
      'SF2-Attendance',
      ['LRN', 'Name', 'Sex', 'Present', 'Absent', 'Late', 'Excused', 'Rate %'],
      data.summary.map((r) => [
        r.student.lrn, fullName(r.student), r.student.sex, r.present, r.absent, r.late, r.excused, r.rate.toFixed(1),
      ]),
    );
    return;
  }
  if (formType === 'SF5') {
    downloadCsv(
      'SF5-Promotion',
      ['LRN', 'Name', 'Sex', 'General average', 'Failed subjects', 'Action taken', 'Recognition'],
      data.promotion.map((r) => [
        r.student.lrn, fullName(r.student), r.student.sex, r.average, r.failedSubjects, r.remark, r.honors ?? '',
      ]),
    );
    return;
  }
  if (data.card?.student) {
    downloadCsv(
      `${formType}-${data.card.student.lrn}`,
      ['Learning area', 'Q1', 'Q2', 'Q3', 'Q4', 'Final', 'Remarks'],
      data.card.rows.map((row) => [
        row.subject.name,
        row.quarters[1]?.quarterlyGrade ?? '',
        row.quarters[2]?.quarterlyGrade ?? '',
        row.quarters[3]?.quarterlyGrade ?? '',
        row.quarters[4]?.quarterlyGrade ?? '',
        row.final,
        row.descriptor,
      ]),
    );
  }
}
