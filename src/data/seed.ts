/**
 * Deterministic demo dataset.
 *
 * Everything here is synthetic sample data generated from a fixed seed so that
 * every install of the PWA shows an identical, reproducible school. No real
 * learner PII is present.
 */
import type {
  AlertItem,
  AttendanceRecord,
  AuditLog,
  DivisionReport,
  FeatureFlag,
  FormSubmission,
  GateEvent,
  GradeRecord,
  LearningResource,
  LessonLog,
  Message,
  NtpTask,
  Section,
  Student,
  Subject,
  SystemSetting,
  Tenant,
  User,
} from '@/lib/types';

export const DEMO_PASSWORD = 'Demo@1234';
export const SCHOOL_YEAR = '2025-2026';

/** Deterministic PRNG (mulberry32) so seeded data never shifts between runs. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20250607);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length) % arr.length];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));

/* ------------------------------------------------------------------ */
/* Tenants                                                             */
/* ------------------------------------------------------------------ */

export const tenants: Tenant[] = [
  {
    id: 'sch-lagro',
    name: 'Lagro Central Elementary School',
    schoolId: '136001',
    division: 'SDO Quezon City',
    region: 'NCR',
    district: 'District IV',
    enrollment: 1284,
    status: 'active',
    createdAt: Date.parse('2024-06-03T01:00:00Z'),
  },
  {
    id: 'sch-banaue',
    name: 'Banaue Integrated School',
    schoolId: '124455',
    division: 'SDO Ifugao',
    region: 'CAR',
    district: 'District II',
    enrollment: 612,
    status: 'active',
    createdAt: Date.parse('2024-06-10T01:00:00Z'),
  },
  {
    id: 'sch-sanjose',
    name: 'San Jose National High School',
    schoolId: '305122',
    division: 'SDO Antique',
    region: 'Region VI',
    district: 'District I',
    enrollment: 1903,
    status: 'active',
    createdAt: Date.parse('2024-07-01T01:00:00Z'),
  },
  {
    id: 'sch-maasin',
    name: 'Maasin Elementary School',
    schoolId: '118207',
    division: 'SDO Southern Leyte',
    region: 'Region VIII',
    district: 'District III',
    enrollment: 431,
    status: 'provisioning',
    createdAt: Date.parse('2025-08-19T01:00:00Z'),
  },
];

export const HOME_TENANT = tenants[0].id;

/* ------------------------------------------------------------------ */
/* Sections & subjects                                                 */
/* ------------------------------------------------------------------ */

export const sections: Section[] = [
  {
    id: 'sec-g5-mabini',
    name: 'Grade 5 - Mabini',
    gradeLevel: 5,
    adviserId: 'usr-teacher',
    tenantId: HOME_TENANT,
    schoolYear: SCHOOL_YEAR,
    room: 'Room 12',
  },
  {
    id: 'sec-g5-rizal',
    name: 'Grade 5 - Rizal',
    gradeLevel: 5,
    adviserId: 'usr-teacher2',
    tenantId: HOME_TENANT,
    schoolYear: SCHOOL_YEAR,
    room: 'Room 14',
  },
];

export const subjects: Subject[] = [
  { id: 'sub-fil', name: 'Filipino', gradeLevel: 5, weightGroup: 'languages', teacherId: 'usr-teacher', tenantId: HOME_TENANT },
  { id: 'sub-eng', name: 'English', gradeLevel: 5, weightGroup: 'languages', teacherId: 'usr-teacher', tenantId: HOME_TENANT },
  { id: 'sub-math', name: 'Mathematics', gradeLevel: 5, weightGroup: 'science_math', teacherId: 'usr-teacher', tenantId: HOME_TENANT },
  { id: 'sub-sci', name: 'Science', gradeLevel: 5, weightGroup: 'science_math', teacherId: 'usr-teacher', tenantId: HOME_TENANT },
  { id: 'sub-ap', name: 'Araling Panlipunan', gradeLevel: 5, weightGroup: 'languages', teacherId: 'usr-teacher', tenantId: HOME_TENANT },
  { id: 'sub-esp', name: 'Edukasyon sa Pagpapakatao', gradeLevel: 5, weightGroup: 'languages', teacherId: 'usr-teacher', tenantId: HOME_TENANT },
  { id: 'sub-mapeh', name: 'MAPEH', gradeLevel: 5, weightGroup: 'mapeh_tle', teacherId: 'usr-teacher2', tenantId: HOME_TENANT },
  { id: 'sub-epp', name: 'EPP / TLE', gradeLevel: 5, weightGroup: 'mapeh_tle', teacherId: 'usr-teacher2', tenantId: HOME_TENANT },
];

/* ------------------------------------------------------------------ */
/* Learners                                                            */
/* ------------------------------------------------------------------ */

const FIRST_M = ['Juan', 'Miguel', 'Rafael', 'Andres', 'Joshua', 'Carlo', 'Nathaniel', 'Gabriel', 'Emmanuel', 'Paolo', 'Liam', 'Kyle'];
const FIRST_F = ['Maria', 'Angelica', 'Sofia', 'Kristine', 'Jasmine', 'Reyna', 'Althea', 'Bea', 'Camille', 'Divine', 'Ella', 'Faith'];
const MIDDLE = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Mendoza', 'Garcia', 'Torres', 'Flores', 'Villanueva', 'Ramos'];
const LAST = ['Dela Cruz', 'Aquino', 'Lopez', 'Fernandez', 'Castillo', 'Navarro', 'Salazar', 'Domingo', 'Bernardo', 'Panganiban', 'Espiritu', 'Marasigan'];
const BARANGAY = ['Brgy. Greater Lagro', 'Brgy. North Fairview', 'Brgy. Novaliches', 'Brgy. San Bartolome', 'Brgy. Kaligayahan'];
const TONGUE = ['Tagalog', 'Ilokano', 'Cebuano', 'Bikol'];

/** Demo e-ID secret derived from the LRN — stable and clearly non-production. */
export const eidSecretFor = (lrn: string) => `demo-eid-seed::${lrn}::LC-DepEd`;

function buildStudents(): Student[] {
  const out: Student[] = [];
  let n = 1;
  for (const section of sections) {
    const count = section.id === 'sec-g5-mabini' ? 20 : 16;
    for (let i = 0; i < count; i += 1) {
      const sex: 'M' | 'F' = rnd() > 0.5 ? 'M' : 'F';
      const lrn = `13600120${String(n).padStart(4, '0')}`;
      const first = sex === 'M' ? pick(FIRST_M) : pick(FIRST_F);
      out.push({
        id: `stu-${n}`,
        lrn,
        firstName: first,
        middleName: pick(MIDDLE),
        lastName: pick(LAST),
        sex,
        birthDate: `2014-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
        gradeLevel: 5,
        sectionId: section.id,
        tenantId: HOME_TENANT,
        guardianName: `${pick(FIRST_F)} ${pick(LAST)}`,
        guardianContact: `09${int(10, 99)}${int(1000000, 9999999)}`,
        address: pick(BARANGAY),
        motherTongue: pick(TONGUE),
        ipCommunity: rnd() > 0.9 ? 'Dumagat' : 'N/A',
        fourPs: rnd() > 0.7,
        qrSecret: eidSecretFor(lrn),
        enrolledAt: Date.parse('2025-06-16T01:00:00Z'),
      });
      n += 1;
    }
  }
  // Fixed identity for the demo student/parent pair.
  out[0] = {
    ...out[0],
    firstName: 'Althea',
    middleName: 'Santos',
    lastName: 'Dela Cruz',
    sex: 'F',
    birthDate: '2014-08-21',
    guardianName: 'Rosalinda Dela Cruz',
    guardianContact: '09171234567',
    address: 'Brgy. Greater Lagro, Quezon City',
    motherTongue: 'Tagalog',
    fourPs: true,
  };
  return out;
}

export const students: Student[] = buildStudents();
export const DEMO_STUDENT = students[0];
export const DEMO_STUDENT_2 = students[1];

/* ------------------------------------------------------------------ */
/* Users — one demo account per portal                                 */
/* ------------------------------------------------------------------ */

export const users: User[] = [
  {
    id: 'usr-superadmin',
    email: 'superadmin@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Engr. Noel Villamor',
    role: 'superadmin',
    tenantId: null,
    position: 'National System Administrator',
    lang: 'en',
  },
  {
    id: 'usr-teacher',
    email: 'teacher@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Ma. Teresa R. Ramos',
    role: 'teacher',
    tenantId: HOME_TENANT,
    position: 'Teacher III — Adviser, Grade 5 Mabini',
    sectionIds: ['sec-g5-mabini', 'sec-g5-rizal'],
    lang: 'en',
  },
  {
    id: 'usr-teacher2',
    email: 'teacher2@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Jerome B. Cabrera',
    role: 'teacher',
    tenantId: HOME_TENANT,
    position: 'Teacher I — Adviser, Grade 5 Rizal',
    sectionIds: ['sec-g5-rizal'],
    lang: 'tl',
  },
  {
    id: 'usr-student',
    email: 'student@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: `${DEMO_STUDENT.firstName} ${DEMO_STUDENT.lastName}`,
    role: 'student',
    tenantId: HOME_TENANT,
    lrn: DEMO_STUDENT.lrn,
    lang: 'en',
  },
  {
    id: 'usr-parent',
    email: 'parent@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Rosalinda S. Dela Cruz',
    role: 'parent',
    tenantId: HOME_TENANT,
    position: 'Parent / Guardian',
    childLrns: [DEMO_STUDENT.lrn, DEMO_STUDENT_2.lrn],
    lang: 'tl',
  },
  {
    id: 'usr-head',
    email: 'head@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Dr. Aurora M. Beltran',
    role: 'schoolhead',
    tenantId: HOME_TENANT,
    position: 'School Principal IV',
    lang: 'en',
  },
  {
    id: 'usr-sdo',
    email: 'sdo@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Atty. Ferdinand L. Oliveros',
    role: 'sdo',
    tenantId: null,
    position: 'Schools Division Superintendent — SDO Quezon City',
    lang: 'en',
  },
];

export interface DemoAccount {
  role: string;
  portal: string;
  email: string;
  password: string;
  name: string;
  blurb: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'superadmin',
    portal: 'Super Admin System Portal',
    email: 'superadmin@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Engr. Noel Villamor',
    blurb: 'Telemetry, tenants, privacy control room, backups & maintenance.',
  },
  {
    role: 'teacher',
    portal: 'Teacher Portal',
    email: 'teacher@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Ma. Teresa R. Ramos',
    blurb: 'Attendance, DO 8 s.2015 grading, SF automation, DLL builder, IPCRF.',
  },
  {
    role: 'student',
    portal: 'Student Portal',
    email: 'student@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Althea Dela Cruz',
    blurb: `Grades, attendance, e-ID QR with photo, offline SLKs. LRN login: ${DEMO_STUDENT.lrn}`,
  },
  {
    role: 'parent',
    portal: 'Parent / Guardian Portal',
    email: 'parent@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Rosalinda S. Dela Cruz',
    blurb: 'Gate push alerts, SF9 report card, adviser messaging, dialect toggle.',
  },
  {
    role: 'schoolhead',
    portal: 'School Head / Admin Portal',
    email: 'head@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Dr. Aurora M. Beltran',
    blurb: 'Approval hub with batch signing, NTP routing, LIS sync.',
  },
  {
    role: 'sdo',
    portal: 'SDO / RO Portal',
    email: 'sdo@lcdeped.ph',
    password: DEMO_PASSWORD,
    name: 'Atty. Ferdinand L. Oliveros',
    blurb: 'Automated intake validation, division analytics, security console.',
  },
];

/* ------------------------------------------------------------------ */
/* Attendance — last 20 school days                                    */
/* ------------------------------------------------------------------ */

export function schoolDays(count: number, from: Date = new Date()): string[] {
  const days: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (days.length < count) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
          cursor.getDate(),
        ).padStart(2, '0')}`,
      );
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return days.reverse();
}

export function buildAttendance(): AttendanceRecord[] {
  const out: AttendanceRecord[] = [];
  const days = schoolDays(20);
  for (const day of days) {
    for (const s of students) {
      const roll = rnd();
      const status =
        roll > 0.94 ? 'absent' : roll > 0.88 ? 'late' : roll > 0.86 ? 'excused' : 'present';
      out.push({
        id: `att-${s.id}-${day}`,
        studentId: s.id,
        sectionId: s.sectionId,
        date: day,
        status,
        recordedBy: s.sectionId === 'sec-g5-mabini' ? 'usr-teacher' : 'usr-teacher2',
        tenantId: HOME_TENANT,
        updatedAt: Date.parse(`${day}T00:30:00Z`),
        syncState: 'synced',
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Grades                                                              */
/* ------------------------------------------------------------------ */

export function buildGrades(): GradeRecord[] {
  const out: GradeRecord[] = [];
  for (const s of students) {
    const ability = 0.62 + rnd() * 0.36; // learner baseline
    for (const sub of subjects) {
      for (const quarter of [1, 2] as const) {
        const wwTotals = [20, 20, 25, 15];
        const ptTotals = [30, 30, 40];
        const jitter = () => (rnd() - 0.5) * 0.14;
        const ww = wwTotals.map((t) => Math.round(Math.min(t, Math.max(t * 0.35, t * (ability + jitter())))));
        const pt = ptTotals.map((t) => Math.round(Math.min(t, Math.max(t * 0.4, t * (ability + jitter())))));
        const qaTotal = 50;
        const qa = Math.round(Math.min(qaTotal, Math.max(qaTotal * 0.35, qaTotal * (ability + jitter()))));
        out.push({
          id: `grd-${s.id}-${sub.id}-q${quarter}`,
          studentId: s.id,
          subjectId: sub.id,
          quarter,
          writtenWork: ww,
          writtenWorkTotals: wwTotals,
          performanceTasks: pt,
          performanceTaskTotals: ptTotals,
          quarterlyAssessment: qa,
          quarterlyAssessmentTotal: qaTotal,
          tenantId: HOME_TENANT,
          updatedAt: Date.now() - quarter * 86_400_000 * 30,
          syncState: 'synced',
        });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Lesson logs, forms, tasks, alerts, logs                             */
/* ------------------------------------------------------------------ */

export const MATATAG_COMPETENCIES: { code: string; subjectId: string; text: string }[] = [
  { code: 'M5NS-Ia-1.1', subjectId: 'sub-math', text: 'Visualizes and represents numbers up to 10 000 000' },
  { code: 'M5NS-Ib-2.2', subjectId: 'sub-math', text: 'Multiplies whole numbers up to 3-digit factors' },
  { code: 'M5NS-Ic-3.4', subjectId: 'sub-math', text: 'Solves routine problems involving division of decimals' },
  { code: 'S5MT-Ia-1', subjectId: 'sub-sci', text: 'Describes the properties of materials based on use' },
  { code: 'S5LT-IIa-2', subjectId: 'sub-sci', text: 'Identifies the reproductive parts of plants' },
  { code: 'EN5RC-Ia-2.1', subjectId: 'sub-eng', text: 'Infers the meaning of unfamiliar words using context clues' },
  { code: 'EN5WC-Ib-1.2', subjectId: 'sub-eng', text: 'Composes a three-paragraph descriptive essay' },
  { code: 'F5PB-Ia-3', subjectId: 'sub-fil', text: 'Nagagamit ang magagalang na pananalita sa pakikipag-usap' },
  { code: 'F5PN-Ib-5', subjectId: 'sub-fil', text: 'Naibibigay ang pangunahing diwa ng napakinggang teksto' },
  { code: 'AP5PLP-Ia-1', subjectId: 'sub-ap', text: 'Nailalarawan ang heograpiya ng Pilipinas' },
  { code: 'ESP5PKP-Ia-1', subjectId: 'sub-esp', text: 'Naipapakita ang pagmamalasakit sa kapwa' },
  { code: 'PE5GS-Ia-1', subjectId: 'sub-mapeh', text: 'Executes the skills involved in the game' },
  { code: 'EPP5IA-0a-1', subjectId: 'sub-epp', text: 'Nakagagawa ng simpleng produktong pang-agrikultura' },
];

export function buildLessonLogs(): LessonLog[] {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  return MATATAG_COMPETENCIES.slice(0, 5).map((c, i) => ({
    id: `dll-${i + 1}`,
    teacherId: 'usr-teacher',
    tenantId: HOME_TENANT,
    subjectId: c.subjectId,
    gradeLevel: 5,
    week: 'Week 3',
    day: days[i % days.length],
    competencyCode: c.code,
    competency: c.text,
    objectives: `At the end of the lesson, learners can demonstrate: ${c.text.toLowerCase()}.`,
    procedure: 'Review → Motivation → Presentation → Guided Practice → Independent Practice → Generalization',
    assessment: '10-item formative quiz with differentiated tasks for struggling learners.',
    remarks: 'Delivered as planned; 3 learners need follow-up remediation.',
    updatedAt: Date.now() - (i + 1) * 86_400_000,
    syncState: 'synced',
  }));
}

export function buildForms(): FormSubmission[] {
  const now = Date.now();
  const base: Omit<FormSubmission, 'id'>[] = [
    { type: 'SF2', title: 'SF2 Daily Attendance — Grade 5 Mabini', sectionId: 'sec-g5-mabini', tenantId: HOME_TENANT, submittedBy: 'usr-teacher', submittedAt: now - 3 * 86_400_000, status: 'submitted', period: 'September 2025', syncState: 'synced' },
    { type: 'SF2', title: 'SF2 Daily Attendance — Grade 5 Rizal', sectionId: 'sec-g5-rizal', tenantId: HOME_TENANT, submittedBy: 'usr-teacher2', submittedAt: now - 3 * 86_400_000, status: 'submitted', period: 'September 2025', syncState: 'synced' },
    { type: 'SF1', title: 'SF1 School Register — Grade 5 Mabini', sectionId: 'sec-g5-mabini', tenantId: HOME_TENANT, submittedBy: 'usr-teacher', submittedAt: now - 20 * 86_400_000, status: 'approved', signedBy: 'usr-head', signedAt: now - 19 * 86_400_000, period: SCHOOL_YEAR, syncState: 'synced' },
    { type: 'SF9', title: 'SF9 Report Cards Q1 — Grade 5 Mabini', sectionId: 'sec-g5-mabini', tenantId: HOME_TENANT, submittedBy: 'usr-teacher', submittedAt: now - 8 * 86_400_000, status: 'submitted', period: 'Quarter 1', syncState: 'synced' },
    { type: 'SF5', title: 'SF5 Promotion Report — Grade 5 Rizal', sectionId: 'sec-g5-rizal', tenantId: HOME_TENANT, submittedBy: 'usr-teacher2', submittedAt: now - 6 * 86_400_000, status: 'returned', remarks: 'Two learners lack Q2 MAPEH grades.', period: SCHOOL_YEAR, syncState: 'synced' },
    { type: 'SF10', title: 'SF10 Permanent Record — Transfer-out (1 learner)', sectionId: 'sec-g5-mabini', tenantId: HOME_TENANT, submittedBy: 'usr-teacher', submittedAt: now - 2 * 86_400_000, status: 'submitted', period: SCHOOL_YEAR, syncState: 'pending' },
    { type: 'IPCRF', title: 'IPCRF Portfolio — Ma. Teresa R. Ramos', sectionId: null, tenantId: HOME_TENANT, submittedBy: 'usr-teacher', submittedAt: now - 12 * 86_400_000, status: 'approved', signedBy: 'usr-head', signedAt: now - 11 * 86_400_000, period: 'Mid-year Review', syncState: 'synced' },
    { type: 'DLL', title: 'Daily Lesson Log — Week 3', sectionId: 'sec-g5-mabini', tenantId: HOME_TENANT, submittedBy: 'usr-teacher', submittedAt: now - 86_400_000, status: 'draft', period: 'Week 3', syncState: 'pending' },
  ];
  return base.map((f, i) => ({ ...f, id: `frm-${i + 1}` }));
}

export function buildNtpTasks(): NtpTask[] {
  const rows: Omit<NtpTask, 'id' | 'tenantId' | 'createdAt'>[] = [
    { title: 'Quarterly DRRM drill documentation', category: 'DRRM', assignedTo: 'Mr. Allan Tiongco', assignedRole: 'PDO', status: 'in_progress', due: '2025-09-30', origin: 'teacher_offload' },
    { title: 'School-Based Feeding Program weight monitoring encoding', category: 'Feeding Program', assignedTo: 'Ms. Grace Ilagan', assignedRole: 'AO', status: 'open', due: '2025-10-05', origin: 'teacher_offload' },
    { title: 'ICT equipment inventory reconciliation', category: 'Inventory', assignedTo: 'Mr. Rey Bautista', assignedRole: 'Property Custodian', status: 'open', due: '2025-10-10', origin: 'school_head' },
    { title: 'Transfer-in records filing (SF10 batch)', category: 'Records', assignedTo: 'Ms. Lorna Aguilar', assignedRole: 'Registrar', status: 'done', due: '2025-09-15', origin: 'teacher_offload' },
    { title: 'Comfort room repair request to SDO', category: 'Facilities', assignedTo: 'Mr. Allan Tiongco', assignedRole: 'PDO', status: 'in_progress', due: '2025-10-02', origin: 'school_head' },
    { title: 'MOOE liquidation report — September', category: 'Finance', assignedTo: 'Ms. Grace Ilagan', assignedRole: 'AO', status: 'open', due: '2025-10-07', origin: 'school_head' },
  ];
  return rows.map((r, i) => ({
    ...r,
    id: `ntp-${i + 1}`,
    tenantId: HOME_TENANT,
    createdAt: Date.now() - (i + 2) * 86_400_000,
  }));
}

export function buildGateEvents(): GateEvent[] {
  const out: GateEvent[] = [];
  const days = schoolDays(5);
  let n = 1;
  for (const day of days) {
    for (const s of students.slice(0, 10)) {
      out.push({
        id: `gate-${n++}`,
        studentId: s.id,
        lrn: s.lrn,
        direction: 'in',
        timestamp: Date.parse(`${day}T00:05:00Z`) + int(0, 1800) * 1000,
        verified: true,
        method: 'qr',
        tenantId: HOME_TENANT,
        gate: 'Main Gate',
      });
      out.push({
        id: `gate-${n++}`,
        studentId: s.id,
        lrn: s.lrn,
        direction: 'out',
        timestamp: Date.parse(`${day}T08:00:00Z`) + int(0, 2400) * 1000,
        verified: true,
        method: 'qr',
        tenantId: HOME_TENANT,
        gate: 'Main Gate',
      });
    }
  }
  return out.sort((a, b) => b.timestamp - a.timestamp);
}

export function buildAlerts(): AlertItem[] {
  const now = Date.now();
  return [
    { id: 'alr-1', recipientId: 'usr-parent', title: 'Althea entered the school', body: 'Main Gate • verified e-ID', timestamp: now - 5 * 3600_000, read: false, kind: 'gate' },
    { id: 'alr-2', recipientId: 'usr-parent', title: 'Althea left the school', body: 'Main Gate • verified e-ID', timestamp: now - 1 * 3600_000, read: false, kind: 'gate' },
    { id: 'alr-3', recipientId: 'usr-parent', title: 'Quarter 1 report card is ready', body: 'SF9 signed by the class adviser.', timestamp: now - 2 * 86_400_000, read: true, kind: 'grade' },
    { id: 'alr-4', recipientId: 'usr-teacher', title: 'SF5 returned by the School Head', body: 'Two learners lack Q2 MAPEH grades.', timestamp: now - 6 * 86_400_000, read: false, kind: 'form' },
    { id: 'alr-5', recipientId: 'usr-head', title: '3 forms awaiting your signature', body: 'SF2, SF9 and SF10 submissions are queued.', timestamp: now - 3600_000, read: false, kind: 'form' },
    { id: 'alr-6', recipientId: 'usr-student', title: 'New SLK available offline', body: 'Science 5 — Parts of a Flower has been cached.', timestamp: now - 86_400_000, read: false, kind: 'system' },
  ];
}

export function buildMessages(): Message[] {
  const now = Date.now();
  const thread = 'thr-parent-teacher';
  return [
    { id: 'msg-1', threadId: thread, fromId: 'usr-teacher', toId: 'usr-parent', body: 'Magandang araw po! Si Althea ay nakakuha ng Outstanding sa Science ngayong Q1.', timestamp: now - 3 * 86_400_000, read: true },
    { id: 'msg-2', threadId: thread, fromId: 'usr-parent', toId: 'usr-teacher', body: 'Maraming salamat po, Teacher. May remedial po ba sa Math?', timestamp: now - 3 * 86_400_000 + 3600_000, read: true },
    { id: 'msg-3', threadId: thread, fromId: 'usr-teacher', toId: 'usr-parent', body: 'Opo, tuwing Miyerkules 3:00 PM po sa Room 12.', timestamp: now - 2 * 86_400_000, read: false },
  ];
}

export function buildAuditLogs(): AuditLog[] {
  const now = Date.now();
  const rows: Omit<AuditLog, 'id'>[] = [
    { timestamp: now - 600_000, actorId: 'usr-teacher', actorRole: 'teacher', action: 'ATTENDANCE_SAVE', target: 'sec-g5-mabini', tenantId: HOME_TENANT, piiAccessed: false, outcome: 'success', ip: '10.12.4.31' },
    { timestamp: now - 1_200_000, actorId: 'usr-head', actorRole: 'schoolhead', action: 'FORM_APPROVE', target: 'frm-3', tenantId: HOME_TENANT, piiAccessed: true, outcome: 'success', ip: '10.12.4.9' },
    { timestamp: now - 2_400_000, actorId: 'usr-sdo', actorRole: 'sdo', action: 'REPORT_EXPORT', target: 'enrollment-q1.csv', tenantId: null, piiAccessed: true, outcome: 'success', ip: '10.40.1.7' },
    { timestamp: now - 3_600_000, actorId: 'unknown', actorRole: 'teacher', action: 'LOGIN_FAILED', target: 'teacher@lcdeped.ph', tenantId: HOME_TENANT, piiAccessed: false, outcome: 'failure', ip: '203.177.22.14' },
    { timestamp: now - 5_400_000, actorId: 'usr-superadmin', actorRole: 'superadmin', action: 'VAPID_ROTATE', target: 'push-keys', tenantId: null, piiAccessed: false, outcome: 'success', ip: '10.0.0.2' },
    { timestamp: now - 7_200_000, actorId: 'usr-teacher2', actorRole: 'teacher', action: 'SF10_VIEW', target: 'stu-14', tenantId: HOME_TENANT, piiAccessed: true, outcome: 'success', ip: '10.12.4.44' },
    { timestamp: now - 9_000_000, actorId: 'usr-parent', actorRole: 'parent', action: 'SF9_VIEW', target: 'stu-1', tenantId: HOME_TENANT, piiAccessed: true, outcome: 'success', ip: '112.198.3.88' },
    { timestamp: now - 12_600_000, actorId: 'usr-sdo', actorRole: 'sdo', action: 'PII_EXPORT_DENIED', target: 'sch-banaue/learners', tenantId: null, piiAccessed: false, outcome: 'denied', ip: '10.40.1.7' },
  ];
  return rows.map((r, i) => ({ ...r, id: `aud-${i + 1}` }));
}

export const featureFlags: FeatureFlag[] = [
  { key: 'learner_eid', label: 'Learner e-ID QR', enabled: true, description: 'One permanent signed QR per learner, printed on the ID card and shown in the portal.', rollout: 100 },
  { key: 'web_push', label: 'Web Push gate alerts', enabled: true, description: 'VAPID push notifications to parents, replacing paid SMS.', rollout: 100 },
  { key: 'matatag_dll', label: 'MATATAG DLL competencies', enabled: true, description: 'Serve MATATAG curriculum codes in the Daily Lesson Log builder.', rollout: 80 },
  { key: 'lis_autosync', label: 'LIS auto-sync', enabled: false, description: 'Nightly enrollment push to the DepEd Learner Information System.', rollout: 25 },
  { key: 'voice_dll', label: 'Voice-to-text DLL input', enabled: true, description: 'Web Speech API dictation for lesson logs.', rollout: 60 },
  { key: 'offline_slk', label: 'Offline SLK caching', enabled: true, description: 'Pre-cache Self-Learning Kits for low-bandwidth areas.', rollout: 100 },
];

export function buildDivisionReports(): DivisionReport[] {
  const now = Date.now();
  const rows: Omit<DivisionReport, 'id'>[] = [
    { tenantId: 'sch-lagro', schoolName: 'Lagro Central ES', type: 'Monthly Enrollment (SF1 rollup)', period: 'September 2025', receivedAt: now - 86_400_000, status: 'validated', findings: [], rows: 1284 },
    { tenantId: 'sch-banaue', schoolName: 'Banaue Integrated School', type: 'Monthly Attendance (SF2 rollup)', period: 'September 2025', receivedAt: now - 2 * 86_400_000, status: 'flagged', findings: ['12 learners have attendance days exceeding school days', 'Missing Grade 8 section'], rows: 612 },
    { tenantId: 'sch-sanjose', schoolName: 'San Jose NHS', type: 'Quarterly Grades (SF5 rollup)', period: 'Quarter 1', receivedAt: now - 3 * 86_400_000, status: 'validated', findings: [], rows: 1903 },
    { tenantId: 'sch-maasin', schoolName: 'Maasin ES', type: 'Monthly Enrollment (SF1 rollup)', period: 'September 2025', receivedAt: now - 4 * 86_400_000, status: 'rejected', findings: ['Duplicate LRNs detected (7 rows)', 'School ID not yet provisioned'], rows: 431 },
    { tenantId: 'sch-lagro', schoolName: 'Lagro Central ES', type: 'DRRM Incident Report', period: 'September 2025', receivedAt: now - 5 * 3600_000, status: 'pending', findings: [], rows: 3 },
  ];
  return rows.map((r, i) => ({ ...r, id: `rpt-${i + 1}` }));
}

export const learningResources: LearningResource[] = [
  { id: 'res-1', title: 'Science 5 — Parts of a Flower', subject: 'Science', gradeLevel: 5, kind: 'SLK', sizeKb: 412, body: 'A Self-Learning Kit covering the reproductive parts of plants: sepal, petal, stamen and pistil, with a labelled drawing activity and a 10-item check-up.', cachedOffline: true },
  { id: 'res-2', title: 'Math 5 — Division of Decimals', subject: 'Mathematics', gradeLevel: 5, kind: 'Module', sizeKb: 288, body: 'Step-by-step worked examples on dividing decimals by whole numbers and by decimals, with 20 practice items and an answer key.', cachedOffline: true },
  { id: 'res-3', title: 'Filipino 5 — Magagalang na Pananalita', subject: 'Filipino', gradeLevel: 5, kind: 'SLK', sizeKb: 196, body: 'Mga gawain sa paggamit ng po, opo, at magagalang na pananalita sa pang-araw-araw na pakikipag-usap.', cachedOffline: true },
  { id: 'res-4', title: 'English 5 — Context Clues', subject: 'English', gradeLevel: 5, kind: 'Worksheet', sizeKb: 154, body: 'Reading passages with 15 exercises on inferring word meaning from definition, example and contrast clues.', cachedOffline: false },
  { id: 'res-5', title: 'AP 5 — Heograpiya ng Pilipinas', subject: 'Araling Panlipunan', gradeLevel: 5, kind: 'Module', sizeKb: 502, body: 'Mapa-based na aralin tungkol sa kinaroroonan, klima at likas na yaman ng Pilipinas.', cachedOffline: false },
  { id: 'res-6', title: 'EsP 5 — Pagmamalasakit sa Kapwa', subject: 'EsP', gradeLevel: 5, kind: 'SLK', sizeKb: 132, body: 'Mga sitwasyong pagsusuri at repleksyon tungkol sa pagmamalasakit sa kapwa at komunidad.', cachedOffline: true },
];

export const systemSettings: SystemSetting[] = [
  { key: 'maintenance_mode', value: 'off', updatedAt: Date.now() - 86_400_000 },
  { key: 'vapid_public_key', value: 'BJ2s-demo-vapid-public-key-not-for-production-use-0001', updatedAt: Date.now() - 12 * 86_400_000 },
  { key: 'vapid_rotated_at', value: String(Date.now() - 12 * 86_400_000), updatedAt: Date.now() - 12 * 86_400_000 },
  { key: 'last_backup_at', value: String(Date.now() - 6 * 3600_000), updatedAt: Date.now() - 6 * 3600_000 },
  { key: 'retention_days', value: '1825', updatedAt: Date.now() - 30 * 86_400_000 },
  { key: 'seed_version', value: '1', updatedAt: Date.now() },
];
