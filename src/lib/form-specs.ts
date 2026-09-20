/**
 * Builds the XLSX / PDF specs for the DepEd School Forms.
 *
 * One projection per form, shared by the Teacher, Student and Parent portals so
 * a learner, their guardian and their adviser all export the same document.
 */
import { SCHOOL_YEAR } from '@/data/seed';
import { formatDate, fullName } from './format';
import type {
  CellValue,
  ColumnSpec,
  MetaRow,
  PdfSpec,
  WorkbookSpec,
} from './export-spec';
import type { FormType, Section, Student, Tenant } from './types';

export interface ReportCardLike {
  student?: Student;
  rows: {
    subject: { id: string; name: string };
    quarters: Record<number, { quarterlyGrade: number } | null>;
    final: number;
    descriptor: string;
  }[];
  average: number;
  honors: string | null;
  remark: string;
}

export interface AttendanceRowLike {
  student: Student;
  present: number;
  absent: number;
  late: number;
  excused: number;
  days: number;
  rate: number;
}

export interface PromotionRowLike {
  student: Student;
  average: number;
  remark: string;
  honors: string | null;
  failedSubjects: number;
}

export interface FormContext {
  formType: FormType;
  tenant?: Tenant | null;
  section?: Section | null;
  roster?: Student[];
  summary?: AttendanceRowLike[];
  promotion?: PromotionRowLike[];
  card?: ReportCardLike | null;
  period?: string;
}

export interface TableSpec {
  columns: ColumnSpec[];
  rows: CellValue[][];
  totals?: CellValue[];
  notes?: string[];
}

export const FORM_TITLES: Record<FormType, string> = {
  SF1: 'School Register',
  SF2: 'Daily Attendance Report of Learners',
  SF5: 'Report on Promotion and Level of Proficiency',
  SF9: 'Learner Progress Report Card',
  SF10: 'Learner Permanent Academic Record',
  IPCRF: 'Individual Performance Commitment and Review Form',
  DLL: 'Daily Lesson Log',
};

const SIGNATURES: Record<FormType, string[]> = {
  SF1: ['Class adviser', 'School head'],
  SF2: ['Class adviser', 'School head'],
  SF5: ['Class adviser', 'School head'],
  SF9: ['Class adviser', 'Parent / Guardian signature'],
  SF10: ['Class adviser', 'School head'],
  IPCRF: ['Ratee', 'Rater'],
  DLL: ['Teacher', 'School head'],
};

export function formFileStem(ctx: FormContext): string {
  const { formType } = ctx;
  if ((formType === 'SF9' || formType === 'SF10') && ctx.card?.student) {
    return `${formType}-${ctx.card.student.lrn}`;
  }
  return `${formType}-${(ctx.section?.name ?? 'section').replace(/\s+/g, '-')}`;
}

export function formSubtitle(ctx: FormContext): string {
  return [ctx.tenant?.division, ctx.section?.name, ctx.period ?? `SY ${SCHOOL_YEAR}`]
    .filter(Boolean)
    .join(' • ');
}

export function formMeta(ctx: FormContext): MetaRow[] {
  const student = ctx.card?.student;
  if ((ctx.formType === 'SF9' || ctx.formType === 'SF10') && student) {
    const rows: MetaRow[] = [
      { label: 'Learner', value: fullName(student) },
      { label: 'LRN', value: student.lrn },
      { label: 'Grade level', value: `Grade ${student.gradeLevel}` },
      { label: 'Section', value: ctx.section?.name ?? '—' },
      { label: 'Sex', value: student.sex === 'M' ? 'Male' : 'Female' },
      { label: 'Date of birth', value: formatDate(student.birthDate) },
    ];
    if (ctx.formType === 'SF10') {
      rows.push({ label: 'Address', value: student.address });
      rows.push({ label: 'Parent / Guardian', value: student.guardianName });
    }
    return rows;
  }
  return [
    { label: 'Section', value: ctx.section?.name ?? '—' },
    { label: 'Room', value: ctx.section?.room ?? '—' },
    { label: 'Learners', value: String(ctx.roster?.length ?? 0) },
    { label: 'School year', value: SCHOOL_YEAR },
  ];
}

export function formTable(ctx: FormContext): TableSpec {
  const roster = ctx.roster ?? [];
  const summary = ctx.summary ?? [];
  const promotion = ctx.promotion ?? [];

  if (ctx.formType === 'SF1') {
    return {
      columns: [
        { header: '#', width: 5, align: 'right' },
        { header: 'LRN', width: 15 },
        { header: 'Name (Last, First M.I.)', width: 30 },
        { header: 'Sex', width: 6, align: 'center' },
        { header: 'Birth date', width: 14 },
        { header: 'Mother tongue', width: 14 },
        { header: 'IP community', width: 13 },
        { header: '4Ps', width: 7, align: 'center' },
        { header: 'Address', width: 26 },
        { header: 'Parent / Guardian', width: 24 },
        { header: 'Contact', width: 14 },
      ],
      rows: roster.map((s, i) => [
        i + 1, s.lrn, fullName(s), s.sex, formatDate(s.birthDate), s.motherTongue,
        s.ipCommunity, s.fourPs ? 'Yes' : 'No', s.address, s.guardianName, s.guardianContact,
      ]),
      notes: [
        `Male: ${roster.filter((s) => s.sex === 'M').length}  •  Female: ${roster.filter((s) => s.sex === 'F').length}  •  Total: ${roster.length}`,
      ],
    };
  }

  if (ctx.formType === 'SF2') {
    const totals = summary.reduce(
      (acc, r) => ({
        present: acc.present + r.present,
        absent: acc.absent + r.absent,
        late: acc.late + r.late,
        excused: acc.excused + r.excused,
      }),
      { present: 0, absent: 0, late: 0, excused: 0 },
    );
    return {
      columns: [
        { header: '#', width: 5, align: 'right' },
        { header: 'LRN', width: 15 },
        { header: 'Learner', width: 30 },
        { header: 'Sex', width: 6, align: 'center' },
        { header: 'Days present', width: 13, align: 'right' },
        { header: 'Days absent', width: 13, align: 'right' },
        { header: 'Late', width: 8, align: 'right' },
        { header: 'Excused', width: 10, align: 'right' },
        { header: 'Attendance %', width: 14, align: 'right', percent: true },
      ],
      rows: summary.map((r, i) => [
        i + 1, r.student.lrn, fullName(r.student), r.student.sex,
        r.present, r.absent, r.late, r.excused, Number(r.rate.toFixed(1)),
      ]),
      totals: ['', '', 'TOTAL', '', totals.present, totals.absent, totals.late, totals.excused, ''],
      notes: ['Late arrivals are counted as days present, per SF2 tallying rules.'],
    };
  }

  if (ctx.formType === 'SF5') {
    return {
      columns: [
        { header: '#', width: 5, align: 'right' },
        { header: 'LRN', width: 15 },
        { header: 'Learner', width: 30 },
        { header: 'Sex', width: 6, align: 'center' },
        { header: 'General average', width: 16, align: 'right' },
        { header: 'Failed subjects', width: 15, align: 'right' },
        { header: 'Action taken', width: 26 },
        { header: 'Recognition', width: 20 },
      ],
      rows: promotion.map((r, i) => [
        i + 1, r.student.lrn, fullName(r.student), r.student.sex,
        r.average || '', r.failedSubjects, r.remark, r.honors ?? '',
      ]),
      notes: [
        `Promoted: ${promotion.filter((r) => r.remark === 'Promoted').length}  •  Conditional: ${promotion.filter((r) => r.remark.startsWith('Conditional')).length}  •  Retained: ${promotion.filter((r) => r.remark === 'Retained').length}`,
        'Grades follow DepEd Order No. 8, s. 2015; recognition follows DepEd Order No. 36, s. 2016.',
      ],
    };
  }

  // SF9 / SF10 — one learner, learning areas down the page.
  const card = ctx.card;
  const isSf10 = ctx.formType === 'SF10';
  const rows: CellValue[][] = (card?.rows ?? []).map((row) => [
    row.subject.name,
    row.quarters[1]?.quarterlyGrade ?? '',
    row.quarters[2]?.quarterlyGrade ?? '',
    row.quarters[3]?.quarterlyGrade ?? '',
    row.quarters[4]?.quarterlyGrade ?? '',
    row.final || '',
    isSf10 ? (row.final ? (row.final >= 75 ? 'Passed' : 'Failed') : '') : row.descriptor,
  ]);

  const notes: string[] = [];
  if (card?.honors) notes.push(`Academic recognition: ${card.honors} (DepEd Order No. 36, s. 2016).`);
  const attendance = summary.find((a) => a.student.id === card?.student?.id);
  if (attendance && ctx.formType === 'SF9') {
    notes.push(
      `Attendance: ${attendance.present} days present, ${attendance.absent} absent, ${attendance.late} late — ${attendance.rate.toFixed(1)}% of ${attendance.days} recorded school days.`,
    );
  }

  return {
    columns: [
      { header: 'Learning area', width: 32 },
      { header: 'Q1', width: 7, align: 'center' },
      { header: 'Q2', width: 7, align: 'center' },
      { header: 'Q3', width: 7, align: 'center' },
      { header: 'Q4', width: 7, align: 'center' },
      { header: 'Final rating', width: 13, align: 'center' },
      { header: isSf10 ? 'Action taken' : 'Remarks', width: 26 },
    ],
    rows,
    totals: ['GENERAL AVERAGE', '', '', '', '', card?.average || '', card?.remark ?? ''],
    notes,
  };
}

export function formPdfSpec(ctx: FormContext): PdfSpec {
  const table = formTable(ctx);
  return {
    filename: formFileStem(ctx),
    code: ctx.formType,
    title: FORM_TITLES[ctx.formType],
    school: ctx.tenant ? `${ctx.tenant.name} (School ID ${ctx.tenant.schoolId})` : undefined,
    subtitle: formSubtitle(ctx),
    meta: formMeta(ctx),
    columns: table.columns,
    rows: table.rows,
    totals: table.totals,
    notes: table.notes,
    signatures: SIGNATURES[ctx.formType],
    orientation: table.columns.length > 7 ? 'landscape' : 'portrait',
    footer: `LC-DepEd • ${ctx.tenant?.name ?? 'DepEd'} • SY ${SCHOOL_YEAR}`,
  };
}

export function formWorkbookSpec(ctx: FormContext): WorkbookSpec {
  const table = formTable(ctx);
  return {
    filename: formFileStem(ctx),
    title: `${ctx.formType} — ${FORM_TITLES[ctx.formType]}`,
    subtitle: formSubtitle(ctx),
    sheets: [
      {
        name: ctx.formType,
        columns: table.columns,
        rows: table.rows,
        totals: table.totals,
        meta: formMeta(ctx),
        notes: table.notes,
      },
    ],
  };
}

/** SF9 context shared by the Student and Parent portals. */
export function sf9Context(input: {
  student: Student;
  card: ReportCardLike;
  attendance?: AttendanceRowLike | null;
  section?: Section | null;
  tenant?: Tenant | null;
}): FormContext {
  return {
    formType: 'SF9',
    tenant: input.tenant ?? null,
    section: input.section ?? null,
    roster: [input.student],
    summary: input.attendance ? [input.attendance] : [],
    card: { ...input.card, student: input.student },
  };
}
