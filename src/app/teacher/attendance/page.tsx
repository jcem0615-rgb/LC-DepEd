'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import {
  attendanceForDate,
  attendanceSummary,
  bulkMarkPresent,
  rosterForSection,
  sectionsForTeacher,
  setAttendance,
  submitForm,
} from '@/lib/queries';
import { XlsxButton } from '@/components/export-buttons';
import { formWorkbookSpec } from '@/lib/form-specs';
import { getDb } from '@/lib/db';
import { fullName, lastSchoolDay, todayIso } from '@/lib/format';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader, Tabs } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { AttendanceStatus, Student } from '@/lib/types';

const STATUSES: { id: AttendanceStatus; label: string; tone: string }[] = [
  { id: 'present', label: 'Present', tone: 'bg-emerald-600 text-white' },
  { id: 'absent', label: 'Absent', tone: 'bg-rose-600 text-white' },
  { id: 'late', label: 'Late', tone: 'bg-amber-500 text-white' },
  { id: 'excused', label: 'Excused', tone: 'bg-sky-600 text-white' },
];

export default function AttendancePage() {
  const { session, t } = useSession();
  const userId = session?.userId ?? '';
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(lastSchoolDay());
  const [tab, setTab] = useState<'daily' | 'sf2'>('daily');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: sections } = useLiveData(
    async () => (userId ? sectionsForTeacher(userId) : []),
    [userId],
  );

  useEffect(() => {
    if (!sectionId && sections && sections.length) setSectionId(sections[0].id);
  }, [sections, sectionId]);

  const { data, loading } = useLiveData(async () => {
    if (!sectionId) return null;
    const [roster, marked, summary] = await Promise.all([
      rosterForSection(sectionId),
      attendanceForDate(sectionId, date),
      attendanceSummary(sectionId, date.slice(0, 7)),
    ]);
    return { roster, marked, summary };
  }, [sectionId, date]);

  const mark = useCallback(
    async (student: Student, status: AttendanceStatus) => {
      if (!session) return;
      await setAttendance(session, student, date, status);
      setSavedAt(Date.now());
    },
    [session, date],
  );

  const markAll = useCallback(async () => {
    if (!session || !data) return;
    setBusy(true);
    const unmarked = data.roster.filter((s) => !data.marked[s.id]);
    await bulkMarkPresent(session, unmarked.length ? unmarked : data.roster, date);
    setBusy(false);
    setSavedAt(Date.now());
    setNotice(`${(unmarked.length ? unmarked : data.roster).length} learners marked present.`);
  }, [session, data, date]);

  const counts = useMemo(() => {
    const out: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    if (!data) return out;
    for (const rec of Object.values(data.marked)) out[rec.status] += 1;
    return out;
  }, [data]);

  const section = sections?.find((s) => s.id === sectionId);

  return (
    <>
      <PageHeader
        title={t('attendance')}
        description="Tap once per learner. Records are written to this device immediately and pushed to the server when a signal is available — SF2 updates itself."
        actions={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={!data || busy}
              onClick={() => void markAll()}
            >
              <Icon name="check" className="h-4 w-4" />
              Mark all present
            </button>
            <XlsxButton
              className="btn btn-sm bg-deped-700 text-white"
              label="Export SF2 (XLSX)"
              disabled={!data}
              build={async () => {
                const tenant = session?.tenantId
                  ? ((await getDb().tenants.get(session.tenantId)) ?? null)
                  : null;
                return formWorkbookSpec({
                  formType: 'SF2',
                  tenant,
                  section: section ?? null,
                  roster: data?.roster ?? [],
                  summary: data?.summary ?? [],
                  period: date.slice(0, 7),
                });
              }}
              onResult={(outcome) =>
                setNotice(
                  outcome === 'xlsx'
                    ? 'SF2 workbook (.xlsx) downloaded.'
                    : 'No connection — exported CSV from this device instead.',
                )
              }
            />
          </>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="section">
              {t('section')}
            </label>
            <select
              id="section"
              className="input"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              {(sections ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.room})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="date">
              Date
            </label>
            <input
              id="date"
              type="date"
              className="input"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value || lastSchoolDay())}
            />
          </div>
          <div className="flex items-end">
            <div className="flex w-full flex-wrap gap-2">
              <Badge tone="success">P {counts.present}</Badge>
              <Badge tone="danger">A {counts.absent}</Badge>
              <Badge tone="warning">L {counts.late}</Badge>
              <Badge tone="info">E {counts.excused}</Badge>
            </div>
          </div>
        </div>
        {savedAt && (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <Icon name="check" className="h-4 w-4" />
            {t('saved_locally')} ✓
          </p>
        )}
        {notice && (
          <div className="mt-3">
            <Banner tone="success">{notice}</Banner>
          </div>
        )}
      </Card>

      <Tabs
        tabs={[
          { id: 'daily', label: 'Daily tally' },
          { id: 'sf2', label: 'SF2 monthly summary' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {loading || !data ? (
        <Loading rows={6} />
      ) : tab === 'daily' ? (
        <Card title={section?.name ?? 'Roster'} subtitle={`${data.roster.length} learners • ${date}`}>
          {data.roster.length === 0 ? (
            <EmptyState title="No learners in this section." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.roster.map((student, index) => {
                const current = data.marked[student.id]?.status;
                return (
                  <li key={student.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 text-sm font-bold text-slate-400">{index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{fullName(student)}</span>
                        <span className="block text-xs text-slate-500">
                          LRN {student.lrn} • {student.sex === 'M' ? 'Male' : 'Female'}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {STATUSES.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            aria-pressed={current === s.id}
                            onClick={() => void mark(student, s.id)}
                            className={`min-h-touch min-w-touch rounded-xl px-3 text-sm font-bold transition ${
                              current === s.id
                                ? s.tone
                                : 'border-2 border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                            }`}
                          >
                            {s.label[0]}
                          </button>
                        ))}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : (
        <Card
          title="SF2 — School Form 2 (Daily Attendance Report)"
          subtitle={`${section?.name ?? ''} • ${date.slice(0, 7)}`}
          action={
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={async () => {
                if (!session || !section) return;
                await submitForm(session, {
                  type: 'SF2',
                  title: `SF2 Daily Attendance — ${section.name}`,
                  sectionId: section.id,
                  period: date.slice(0, 7),
                });
                setNotice('SF2 submitted to the School Head for approval.');
              }}
            >
              Submit to School Head
            </button>
          }
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Learner</th>
                  <th>Sex</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Late</th>
                  <th>Excused</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.map((row, i) => (
                  <tr key={row.student.id}>
                    <td className="text-slate-400">{i + 1}</td>
                    <td className="font-semibold">{fullName(row.student)}</td>
                    <td>{row.student.sex}</td>
                    <td>{row.present}</td>
                    <td>{row.absent}</td>
                    <td>{row.late}</td>
                    <td>{row.excused}</td>
                    <td>
                      <Badge tone={row.rate >= 90 ? 'success' : row.rate >= 80 ? 'warning' : 'danger'}>
                        {row.rate.toFixed(1)}%
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
