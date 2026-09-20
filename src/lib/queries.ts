'use client';

/** Data access + mutations shared by the portals. All reads hit IndexedDB. */
import { getDb } from './db';
import { enqueue } from './sync';
import { notifyChange } from './store';
import { logAudit } from './audit';
import { randomId } from './crypto';
import {
  computeQuarter,
  descriptorFor,
  finalSubjectGrade,
  generalAverage,
  honorsFor,
  promotionRemark,
  type QuarterComputation,
} from './deped-grading';
import { lastSchoolDay } from './format';
import type {
  AlertItem,
  AttendanceRecord,
  AttendanceStatus,
  FormStatus,
  FormSubmission,
  FormType,
  GateEvent,
  GradeRecord,
  Section,
  Session,
  Student,
  Subject,
} from './types';

/* ------------------------------------------------------------------ */
/* Roster & attendance                                                 */
/* ------------------------------------------------------------------ */

/** DepEd SF1/SF2 ordering: males first, then females, each alphabetical. */
export function sortRoster(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    if (a.sex !== b.sex) return a.sex === 'M' ? -1 : 1;
    return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
  });
}

export async function rosterForSection(sectionId: string): Promise<Student[]> {
  const rows = await getDb().students.where('sectionId').equals(sectionId).toArray();
  return sortRoster(rows);
}

export async function sectionsForTeacher(teacherId: string): Promise<Section[]> {
  const db = getDb();
  const advised = await db.sections.where('adviserId').equals(teacherId).toArray();
  const user = await db.users.get(teacherId);
  const extraIds = (user?.sectionIds ?? []).filter((id) => !advised.some((s) => s.id === id));
  const extras = extraIds.length ? await db.sections.bulkGet(extraIds) : [];
  return [...advised, ...extras.filter(Boolean as unknown as (s: Section | undefined) => s is Section)];
}

export async function attendanceForDate(
  sectionId: string,
  date: string,
): Promise<Record<string, AttendanceRecord>> {
  const rows = await getDb()
    .attendance.where('[sectionId+date]')
    .equals([sectionId, date])
    .toArray();
  const map: Record<string, AttendanceRecord> = {};
  for (const row of rows) map[row.studentId] = row;
  return map;
}

export async function setAttendance(
  session: Session,
  student: Student,
  date: string,
  status: AttendanceStatus,
): Promise<void> {
  const db = getDb();
  const id = `att-${student.id}-${date}`;
  const record: AttendanceRecord = {
    id,
    studentId: student.id,
    sectionId: student.sectionId,
    date,
    status,
    recordedBy: session.userId,
    tenantId: student.tenantId,
    updatedAt: Date.now(),
    syncState: 'pending',
  };
  await db.attendance.put(record);
  await enqueue('attendance', 'update', id, record);
  notifyChange();
}

export async function bulkMarkPresent(
  session: Session,
  students: Student[],
  date: string,
): Promise<number> {
  for (const student of students) {
    await setAttendance(session, student, date, 'present');
  }
  await logAudit({
    actorId: session.userId,
    actorRole: session.role,
    action: 'ATTENDANCE_BULK_PRESENT',
    target: `${students[0]?.sectionId ?? 'section'}@${date}`,
    tenantId: session.tenantId,
  });
  return students.length;
}

export interface AttendanceSummaryRow {
  student: Student;
  present: number;
  absent: number;
  late: number;
  excused: number;
  days: number;
  rate: number;
}

export async function attendanceSummary(
  sectionId: string,
  monthPrefix?: string,
): Promise<AttendanceSummaryRow[]> {
  const db = getDb();
  const [students, records] = await Promise.all([
    rosterForSection(sectionId),
    db.attendance.where('sectionId').equals(sectionId).toArray(),
  ]);
  const filtered = monthPrefix ? records.filter((r) => r.date.startsWith(monthPrefix)) : records;
  return students.map((student) => {
    const own = filtered.filter((r) => r.studentId === student.id);
    const present = own.filter((r) => r.status === 'present').length;
    const late = own.filter((r) => r.status === 'late').length;
    const absent = own.filter((r) => r.status === 'absent').length;
    const excused = own.filter((r) => r.status === 'excused').length;
    const days = own.length;
    // Late still counts as a day in attendance, per SF2 tallying.
    const rate = days ? ((present + late) / days) * 100 : 0;
    return { student, present, absent, late, excused, days, rate };
  });
}

export async function attendanceTrend(sectionId: string, days = 10) {
  const records = await getDb().attendance.where('sectionId').equals(sectionId).toArray();
  const byDate = new Map<string, { present: number; total: number }>();
  for (const r of records) {
    const entry = byDate.get(r.date) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (r.status === 'present' || r.status === 'late') entry.present += 1;
    byDate.set(r.date, entry);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-days)
    .map(([date, v]) => ({
      label: date.slice(5),
      value: v.total ? Math.round((v.present / v.total) * 100) : 0,
    }));
}

/* ------------------------------------------------------------------ */
/* Grades                                                              */
/* ------------------------------------------------------------------ */

export interface SubjectGradeRow {
  subject: Subject;
  quarters: Record<number, QuarterComputation | null>;
  final: number;
  descriptor: string;
}

export async function reportCard(studentId: string) {
  const db = getDb();
  const student = await db.students.get(studentId);
  const [subjects, grades] = await Promise.all([
    db.subjects.where('gradeLevel').equals(student?.gradeLevel ?? 5).toArray(),
    db.grades.where('studentId').equals(studentId).toArray(),
  ]);
  const rows: SubjectGradeRow[] = subjects.map((subject) => {
    const quarters: Record<number, QuarterComputation | null> = { 1: null, 2: null, 3: null, 4: null };
    for (const q of [1, 2, 3, 4] as const) {
      const record = grades.find((g) => g.subjectId === subject.id && g.quarter === q);
      quarters[q] = record ? computeQuarter(record, subject.weightGroup) : null;
    }
    const final = finalSubjectGrade(
      [1, 2, 3, 4].map((q) => quarters[q]?.quarterlyGrade ?? 0),
    );
    return { subject, quarters, final, descriptor: final ? descriptorFor(final) : '—' };
  });
  const average = generalAverage(rows.map((r) => r.final));
  const failed = rows.filter((r) => r.final > 0 && r.final < 75).length;
  return {
    student,
    rows,
    average,
    honors: honorsFor(average),
    remark: promotionRemark(average, failed),
    failedSubjects: failed,
  };
}

export async function classRecord(subjectId: string, sectionId: string, quarter: 1 | 2 | 3 | 4) {
  const db = getDb();
  const [subject, students] = await Promise.all([
    db.subjects.get(subjectId),
    rosterForSection(sectionId),
  ]);
  const grades = await db.grades.where('[subjectId+quarter]').equals([subjectId, quarter]).toArray();
  const byStudent = new Map(grades.map((g) => [g.studentId, g]));
  const rows = students.map((student) => {
    const record = byStudent.get(student.id);
    return {
      student,
      record: record ?? null,
      computed:
        record && subject ? computeQuarter(record, subject.weightGroup) : null,
    };
  });
  return { subject, rows };
}

export async function saveGrade(
  session: Session,
  existing: GradeRecord | null,
  patch: Partial<GradeRecord> & { studentId: string; subjectId: string; quarter: 1 | 2 | 3 | 4 },
): Promise<void> {
  const db = getDb();
  const id = existing?.id ?? `grd-${patch.studentId}-${patch.subjectId}-q${patch.quarter}`;
  const record: GradeRecord = {
    id,
    studentId: patch.studentId,
    subjectId: patch.subjectId,
    quarter: patch.quarter,
    writtenWork: patch.writtenWork ?? existing?.writtenWork ?? [],
    writtenWorkTotals: patch.writtenWorkTotals ?? existing?.writtenWorkTotals ?? [],
    performanceTasks: patch.performanceTasks ?? existing?.performanceTasks ?? [],
    performanceTaskTotals: patch.performanceTaskTotals ?? existing?.performanceTaskTotals ?? [],
    quarterlyAssessment: patch.quarterlyAssessment ?? existing?.quarterlyAssessment ?? 0,
    quarterlyAssessmentTotal: patch.quarterlyAssessmentTotal ?? existing?.quarterlyAssessmentTotal ?? 0,
    tenantId: session.tenantId ?? existing?.tenantId ?? '',
    updatedAt: Date.now(),
    syncState: 'pending',
  };
  await db.grades.put(record);
  await enqueue('grades', 'update', id, record);
  await logAudit({
    actorId: session.userId,
    actorRole: session.role,
    action: 'GRADE_SAVE',
    target: `${patch.studentId}/${patch.subjectId}/Q${patch.quarter}`,
    tenantId: session.tenantId,
    piiAccessed: true,
  });
  notifyChange();
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

export async function submitForm(
  session: Session,
  input: { type: FormType; title: string; sectionId: string | null; period: string },
): Promise<FormSubmission> {
  const form: FormSubmission = {
    id: randomId('frm-'),
    type: input.type,
    title: input.title,
    sectionId: input.sectionId,
    tenantId: session.tenantId ?? '',
    submittedBy: session.userId,
    submittedAt: Date.now(),
    status: 'submitted',
    period: input.period,
    syncState: 'pending',
  };
  await getDb().forms.put(form);
  await enqueue('forms', 'create', form.id, form);
  await pushAlert({
    recipientId: 'usr-head',
    title: `${input.type} submitted for approval`,
    body: input.title,
    kind: 'form',
  });
  await logAudit({
    actorId: session.userId,
    actorRole: session.role,
    action: 'FORM_SUBMIT',
    target: `${input.type}:${form.id}`,
    tenantId: session.tenantId,
  });
  notifyChange();
  return form;
}

export async function setFormStatus(
  session: Session,
  ids: string[],
  status: FormStatus,
  remarks?: string,
): Promise<number> {
  const db = getDb();
  let changed = 0;
  for (const id of ids) {
    const form = await db.forms.get(id);
    if (!form) continue;
    const next: FormSubmission = {
      ...form,
      status,
      remarks: remarks ?? form.remarks,
      signedBy: status === 'approved' ? session.userId : form.signedBy,
      signedAt: status === 'approved' ? Date.now() : form.signedAt,
      syncState: 'pending',
    };
    await db.forms.put(next);
    await enqueue('forms', 'update', id, next);
    await pushAlert({
      recipientId: form.submittedBy,
      title: status === 'approved' ? `${form.type} approved` : `${form.type} ${status}`,
      body: form.title + (remarks ? ` — ${remarks}` : ''),
      kind: 'form',
    });
    changed += 1;
  }
  await logAudit({
    actorId: session.userId,
    actorRole: session.role,
    action: status === 'approved' ? 'FORM_BATCH_SIGN' : `FORM_${status.toUpperCase()}`,
    target: ids.join(','),
    tenantId: session.tenantId,
    piiAccessed: true,
  });
  notifyChange();
  return changed;
}

/* ------------------------------------------------------------------ */
/* Alerts, gate events, messages                                       */
/* ------------------------------------------------------------------ */

export async function pushAlert(input: {
  recipientId: string;
  title: string;
  body: string;
  kind: AlertItem['kind'];
}): Promise<AlertItem> {
  const alert: AlertItem = {
    id: randomId('alr-'),
    recipientId: input.recipientId,
    title: input.title,
    body: input.body,
    timestamp: Date.now(),
    read: false,
    kind: input.kind,
  };
  await getDb().alerts.put(alert);
  notifyChange();
  return alert;
}

export async function alertsFor(userId: string): Promise<AlertItem[]> {
  const rows = await getDb().alerts.where('recipientId').equals(userId).toArray();
  return rows.sort((a, b) => b.timestamp - a.timestamp);
}

export async function markAlertsRead(userId: string): Promise<void> {
  const db = getDb();
  const rows = await db.alerts.where('recipientId').equals(userId).toArray();
  await Promise.all(rows.filter((r) => !r.read).map((r) => db.alerts.update(r.id, { read: true })));
  notifyChange();
}

export async function recordGateEvent(input: {
  student: Student;
  direction: GateEvent['direction'];
  method: GateEvent['method'];
  gate?: string;
}): Promise<GateEvent> {
  const event: GateEvent = {
    id: randomId('gate-'),
    studentId: input.student.id,
    lrn: input.student.lrn,
    direction: input.direction,
    timestamp: Date.now(),
    verified: true,
    method: input.method,
    tenantId: input.student.tenantId,
    gate: input.gate ?? 'Main Gate',
  };
  await getDb().gateEvents.put(event);
  const guardians = await getDb().users.where('role').equals('parent').toArray();
  const recipients = guardians.filter((g) => g.childLrns?.includes(input.student.lrn));
  for (const guardian of recipients) {
    await pushAlert({
      recipientId: guardian.id,
      title: `${input.student.firstName} ${input.direction === 'in' ? 'entered' : 'left'} the school`,
      body: `${event.gate} • verified ${input.method} e-ID • ${new Date(event.timestamp).toLocaleTimeString('en-PH')}`,
      kind: 'gate',
    });
  }
  notifyChange();
  return event;
}

export async function recentGateEvents(limit = 25): Promise<GateEvent[]> {
  const rows = await getDb().gateEvents.orderBy('timestamp').reverse().limit(limit).toArray();
  return rows;
}

export async function gateEventsForStudent(studentId: string, limit = 20): Promise<GateEvent[]> {
  const rows = await getDb().gateEvents.where('studentId').equals(studentId).toArray();
  return rows.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Aggregates for the head / division / super admin dashboards          */
/* ------------------------------------------------------------------ */

export async function schoolOverview(tenantId: string) {
  const db = getDb();
  const [students, sections, forms, tasks, attendance] = await Promise.all([
    db.students.where('tenantId').equals(tenantId).toArray(),
    db.sections.where('tenantId').equals(tenantId).toArray(),
    db.forms.where('tenantId').equals(tenantId).toArray(),
    db.ntpTasks.where('tenantId').equals(tenantId).toArray(),
    db.attendance.where('tenantId').equals(tenantId).toArray(),
  ]);
  const today = lastSchoolDay();
  const todays = attendance.filter((a) => a.date === today);
  const presentToday = todays.filter((a) => a.status === 'present' || a.status === 'late').length;
  return {
    learners: students.length,
    sections: sections.length,
    pendingForms: forms.filter((f) => f.status === 'submitted').length,
    approvedForms: forms.filter((f) => f.status === 'approved').length,
    openTasks: tasks.filter((t) => t.status !== 'done').length,
    attendanceToday: todays.length ? Math.round((presentToday / todays.length) * 100) : 0,
    markedToday: todays.length,
  };
}

export async function divisionAnalytics() {
  const db = getDb();
  const [tenants, reports, students, attendance] = await Promise.all([
    db.tenants.toArray(),
    db.divisionReports.toArray(),
    db.students.toArray(),
    db.attendance.toArray(),
  ]);
  const enrollment = tenants.reduce((a, t) => a + t.enrollment, 0);
  const present = attendance.filter((a) => a.status === 'present' || a.status === 'late').length;
  const attendanceRate = attendance.length ? (present / attendance.length) * 100 : 0;
  // Learners with 4+ absences in the sampled window are flagged at risk (SARDO).
  const absencesByStudent = new Map<string, number>();
  for (const row of attendance) {
    if (row.status === 'absent') {
      absencesByStudent.set(row.studentId, (absencesByStudent.get(row.studentId) ?? 0) + 1);
    }
  }
  const atRisk = [...absencesByStudent.entries()].filter(([, n]) => n >= 4);
  return {
    tenants,
    reports,
    enrollment,
    sampledLearners: students.length,
    attendanceRate,
    atRiskCount: atRisk.length,
    atRiskIds: atRisk.map(([id]) => id),
    validated: reports.filter((r) => r.status === 'validated').length,
    flagged: reports.filter((r) => r.status === 'flagged').length,
    rejected: reports.filter((r) => r.status === 'rejected').length,
    pending: reports.filter((r) => r.status === 'pending').length,
  };
}

export async function auditFeed(limit = 60, onlyPii = false) {
  const rows = await getDb().auditLogs.orderBy('timestamp').reverse().limit(limit * 2).toArray();
  return (onlyPii ? rows.filter((r) => r.piiAccessed) : rows).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Identity helpers                                                    */
/* ------------------------------------------------------------------ */

/** Resolves the learner record behind a student account. */
export async function studentForUser(userId: string): Promise<Student | null> {
  const db = getDb();
  const user = await db.users.get(userId);
  if (!user?.lrn) return null;
  const student = await db.students.where('lrn').equals(user.lrn).first();
  return student ?? null;
}

/** Resolves the learners linked to a parent/guardian account. */
export async function childrenForUser(userId: string): Promise<Student[]> {
  const db = getDb();
  const user = await db.users.get(userId);
  const lrns = user?.childLrns ?? [];
  if (!lrns.length) return [];
  const rows = await db.students.where('lrn').anyOf(lrns).toArray();
  return sortRoster(rows);
}

export async function studentByLrn(lrn: string): Promise<Student | null> {
  const row = await getDb().students.where('lrn').equals(lrn).first();
  return row ?? null;
}
