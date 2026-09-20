'use client';

/** Printable DepEd School Form renderers (SF1, SF2, SF5, SF9, SF10). */
import { fullName, formatDate } from '@/lib/format';
import { SCHOOL_YEAR } from '@/data/seed';
import type { AttendanceSummaryRow, SubjectGradeRow } from '@/lib/queries';
import type { Student, Section, Tenant } from '@/lib/types';

export function FormHeader({
  code,
  title,
  tenant,
  section,
  period,
}: {
  code: string;
  title: string;
  tenant?: Tenant | null;
  section?: Section | null;
  period?: string;
}) {
  return (
    <header className="mb-4 border-b-2 border-slate-300 pb-3 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Republic of the Philippines • Department of Education
      </p>
      <h2 className="mt-1 text-lg font-extrabold text-ink">
        {code} — {title}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {tenant ? `${tenant.name} (School ID ${tenant.schoolId})` : '—'}
        {tenant ? ` • ${tenant.division}` : ''}
      </p>
      <p className="text-sm text-slate-600">
        {section ? `${section.name} • ${section.room} • ` : ''}School Year {SCHOOL_YEAR}
        {period ? ` • ${period}` : ''}
      </p>
    </header>
  );
}

export function SF1Table({ students }: { students: Student[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>LRN</th>
            <th>Name (Last, First M.I.)</th>
            <th>Sex</th>
            <th>Birth date</th>
            <th>Mother tongue</th>
            <th>IP</th>
            <th>4Ps</th>
            <th>Address</th>
            <th>Parent / Guardian</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.id}>
              <td className="text-slate-400">{i + 1}</td>
              <td className="font-mono text-xs">{s.lrn}</td>
              <td className="font-semibold">{fullName(s)}</td>
              <td>{s.sex}</td>
              <td>{formatDate(s.birthDate)}</td>
              <td>{s.motherTongue}</td>
              <td>{s.ipCommunity}</td>
              <td>{s.fourPs ? 'Yes' : 'No'}</td>
              <td className="text-xs">{s.address}</td>
              <td className="text-xs">
                {s.guardianName}
                <br />
                {s.guardianContact}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SF2Table({ rows }: { rows: AttendanceSummaryRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      present: acc.present + r.present,
      absent: acc.absent + r.absent,
      late: acc.late + r.late,
      excused: acc.excused + r.excused,
    }),
    { present: 0, absent: 0, late: 0, excused: 0 },
  );
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Learner</th>
            <th>Sex</th>
            <th>Days present</th>
            <th>Days absent</th>
            <th>Late</th>
            <th>Excused</th>
            <th>Attendance %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.student.id}>
              <td className="text-slate-400">{i + 1}</td>
              <td className="font-semibold">{fullName(r.student)}</td>
              <td>{r.student.sex}</td>
              <td>{r.present}</td>
              <td>{r.absent}</td>
              <td>{r.late}</td>
              <td>{r.excused}</td>
              <td>{r.rate.toFixed(1)}%</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-bold">
            <td colSpan={3}>Total</td>
            <td>{totals.present}</td>
            <td>{totals.absent}</td>
            <td>{totals.late}</td>
            <td>{totals.excused}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export interface PromotionRow {
  student: Student;
  average: number;
  remark: string;
  honors: string | null;
  failedSubjects: number;
}

export function SF5Table({ rows }: { rows: PromotionRow[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>LRN</th>
            <th>Learner</th>
            <th>Sex</th>
            <th>General average</th>
            <th>Failed subjects</th>
            <th>Action taken</th>
            <th>Recognition</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.student.id}>
              <td className="text-slate-400">{i + 1}</td>
              <td className="font-mono text-xs">{r.student.lrn}</td>
              <td className="font-semibold">{fullName(r.student)}</td>
              <td>{r.student.sex}</td>
              <td className="font-bold">{r.average || '—'}</td>
              <td>{r.failedSubjects}</td>
              <td>{r.remark}</td>
              <td>{r.honors ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SF9Card({
  student,
  rows,
  average,
  honors,
  remark,
  attendance,
}: {
  student: Student;
  rows: SubjectGradeRow[];
  average: number;
  honors: string | null;
  remark: string;
  attendance?: AttendanceSummaryRow | null;
}) {
  return (
    <div>
      <div className="mb-4 grid gap-1 text-sm sm:grid-cols-2">
        <p>
          <span className="text-slate-500">Learner: </span>
          <b>{fullName(student)}</b>
        </p>
        <p>
          <span className="text-slate-500">LRN: </span>
          <b className="font-mono">{student.lrn}</b>
        </p>
        <p>
          <span className="text-slate-500">Grade &amp; Section: </span>
          <b>Grade {student.gradeLevel}</b>
        </p>
        <p>
          <span className="text-slate-500">Sex: </span>
          <b>{student.sex === 'M' ? 'Male' : 'Female'}</b>
        </p>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Learning area</th>
              <th>Q1</th>
              <th>Q2</th>
              <th>Q3</th>
              <th>Q4</th>
              <th>Final</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.subject.id}>
                <td className="font-semibold">{row.subject.name}</td>
                {[1, 2, 3, 4].map((q) => (
                  <td key={q}>{row.quarters[q]?.quarterlyGrade ?? '—'}</td>
                ))}
                <td className="font-bold">{row.final || '—'}</td>
                <td className="text-xs">{row.descriptor}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold">
              <td colSpan={5}>General average</td>
              <td>{average || '—'}</td>
              <td className="text-xs">{remark}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {honors && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
          Academic recognition: {honors} (DepEd Order No. 36, s. 2016)
        </p>
      )}

      {attendance && (
        <p className="mt-3 text-sm text-slate-600">
          Attendance: <b>{attendance.present}</b> days present, <b>{attendance.absent}</b> absent,{' '}
          <b>{attendance.late}</b> late — {attendance.rate.toFixed(1)}% of {attendance.days} school days recorded.
        </p>
      )}

      <div className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 text-slate-500">Class adviser</p>
        </div>
        <div>
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 text-slate-500">Parent / Guardian signature</p>
        </div>
      </div>
    </div>
  );
}

export function SF10Card({
  student,
  rows,
  average,
  remark,
}: {
  student: Student;
  rows: SubjectGradeRow[];
  average: number;
  remark: string;
}) {
  return (
    <div>
      <div className="mb-4 grid gap-1 text-sm sm:grid-cols-2">
        <p><span className="text-slate-500">Name: </span><b>{fullName(student)}</b></p>
        <p><span className="text-slate-500">LRN: </span><b className="font-mono">{student.lrn}</b></p>
        <p><span className="text-slate-500">Date of birth: </span><b>{formatDate(student.birthDate)}</b></p>
        <p><span className="text-slate-500">Sex: </span><b>{student.sex === 'M' ? 'Male' : 'Female'}</b></p>
        <p className="sm:col-span-2"><span className="text-slate-500">Address: </span><b>{student.address}</b></p>
        <p className="sm:col-span-2"><span className="text-slate-500">Parent / Guardian: </span><b>{student.guardianName}</b></p>
      </div>

      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600">
        Scholastic record — Grade {student.gradeLevel}, SY {SCHOOL_YEAR}
      </h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Learning area</th>
              <th>Q1</th>
              <th>Q2</th>
              <th>Q3</th>
              <th>Q4</th>
              <th>Final rating</th>
              <th>Action taken</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.subject.id}>
                <td className="font-semibold">{row.subject.name}</td>
                {[1, 2, 3, 4].map((q) => (
                  <td key={q}>{row.quarters[q]?.quarterlyGrade ?? '—'}</td>
                ))}
                <td className="font-bold">{row.final || '—'}</td>
                <td className="text-xs">{row.final ? (row.final >= 75 ? 'Passed' : 'Failed') : '—'}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold">
              <td colSpan={5}>General average</td>
              <td>{average || '—'}</td>
              <td className="text-xs">{remark}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 text-slate-500">Class adviser</p>
        </div>
        <div>
          <div className="h-10 border-b border-slate-400" />
          <p className="mt-1 text-slate-500">School head</p>
        </div>
      </div>
    </div>
  );
}
