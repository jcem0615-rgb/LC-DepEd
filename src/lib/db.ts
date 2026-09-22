'use client';

/**
 * Offline-first store. Dexie.js wraps IndexedDB so the whole PWA keeps working
 * with no connectivity; writes land locally first and are drained by the sync
 * queue when the device comes back online.
 */
import Dexie, { type Table } from 'dexie';
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
  SyncQueueItem,
  SystemSetting,
  Tenant,
  User,
} from './types';
import * as seed from '@/data/seed';

export class LcDepedDb extends Dexie {
  tenants!: Table<Tenant, string>;
  users!: Table<User, string>;
  students!: Table<Student, string>;
  sections!: Table<Section, string>;
  subjects!: Table<Subject, string>;
  attendance!: Table<AttendanceRecord, string>;
  grades!: Table<GradeRecord, string>;
  lessonLogs!: Table<LessonLog, string>;
  forms!: Table<FormSubmission, string>;
  gateEvents!: Table<GateEvent, string>;
  alerts!: Table<AlertItem, string>;
  messages!: Table<Message, string>;
  ntpTasks!: Table<NtpTask, string>;
  auditLogs!: Table<AuditLog, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  featureFlags!: Table<FeatureFlag, string>;
  divisionReports!: Table<DivisionReport, string>;
  resources!: Table<LearningResource, string>;
  settings!: Table<SystemSetting, string>;

  constructor() {
    super('lc-deped');
    this.version(1).stores({
      tenants: 'id, division, region, status',
      users: 'id, email, role, tenantId, lrn',
      students: 'id, lrn, sectionId, tenantId, gradeLevel, lastName',
      sections: 'id, tenantId, adviserId, gradeLevel',
      subjects: 'id, tenantId, teacherId, gradeLevel',
      attendance: 'id, studentId, sectionId, date, tenantId, syncState, [sectionId+date]',
      grades: 'id, studentId, subjectId, quarter, tenantId, [studentId+quarter], [subjectId+quarter]',
      lessonLogs: 'id, teacherId, subjectId, tenantId, week',
      forms: 'id, type, status, tenantId, submittedBy, sectionId',
      gateEvents: 'id, studentId, lrn, timestamp, tenantId',
      alerts: 'id, recipientId, timestamp, read',
      messages: 'id, threadId, fromId, toId, timestamp',
      ntpTasks: 'id, tenantId, status, assignedRole',
      auditLogs: 'id, timestamp, actorId, actorRole, tenantId, piiAccessed, outcome',
      syncQueue: 'id, entity, status, createdAt',
      featureFlags: 'key, enabled',
      divisionReports: 'id, tenantId, status, receivedAt',
      resources: 'id, gradeLevel, subject, cachedOffline',
      settings: 'key',
    });
  }
}

let instance: LcDepedDb | null = null;

export function getDb(): LcDepedDb {
  if (typeof window === 'undefined') {
    throw new Error('getDb() is browser-only; call it from a client component.');
  }
  if (!instance) instance = new LcDepedDb();
  return instance;
}

const SEED_VERSION = 4;

let seedPromise: Promise<void> | null = null;

/** Populates the local database once per device (idempotent). */
export function ensureSeeded(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!seedPromise) seedPromise = runSeed().catch((err) => {
    seedPromise = null;
    throw err;
  });
  return seedPromise;
}

async function runSeed(): Promise<void> {
  const db = getDb();
  await db.open();
  const current = await db.settings.get('seed_version');
  if (current && Number(current.value) >= SEED_VERSION) return;

  await db.transaction(
    'rw',
    [
      db.tenants, db.users, db.students, db.sections, db.subjects, db.attendance,
      db.grades, db.lessonLogs, db.forms, db.gateEvents, db.alerts, db.messages,
      db.ntpTasks, db.auditLogs, db.featureFlags, db.divisionReports, db.resources,
      db.settings, db.syncQueue,
    ],
    async () => {
      await Promise.all([
        db.tenants.clear(), db.users.clear(), db.students.clear(), db.sections.clear(),
        db.subjects.clear(), db.attendance.clear(), db.grades.clear(), db.lessonLogs.clear(),
        db.forms.clear(), db.gateEvents.clear(), db.alerts.clear(), db.messages.clear(),
        db.ntpTasks.clear(), db.auditLogs.clear(), db.featureFlags.clear(),
        db.divisionReports.clear(), db.resources.clear(), db.syncQueue.clear(),
      ]);
      await db.tenants.bulkPut(seed.tenants);
      await db.users.bulkPut(seed.users);
      await db.students.bulkPut(seed.students);
      await db.sections.bulkPut(seed.sections);
      await db.subjects.bulkPut(seed.subjects);
      await db.attendance.bulkPut(seed.buildAttendance());
      await db.grades.bulkPut(seed.buildGrades());
      await db.lessonLogs.bulkPut(seed.buildLessonLogs());
      await db.forms.bulkPut(seed.buildForms());
      await db.gateEvents.bulkPut(seed.buildGateEvents());
      await db.alerts.bulkPut(seed.buildAlerts());
      await db.messages.bulkPut(seed.buildMessages());
      await db.ntpTasks.bulkPut(seed.buildNtpTasks());
      await db.auditLogs.bulkPut(seed.buildAuditLogs());
      await db.featureFlags.bulkPut(seed.featureFlags);
      await db.divisionReports.bulkPut(seed.buildDivisionReports());
      await db.resources.bulkPut(seed.learningResources);
      await db.settings.bulkPut(seed.systemSettings);
      await db.settings.put({
        key: 'seed_version',
        value: String(SEED_VERSION),
        updatedAt: Date.now(),
      });
    },
  );
}

/** Wipes the local database and re-seeds it (used by the Super Admin portal). */
export async function resetLocalData(): Promise<void> {
  const db = getDb();
  await db.settings.put({ key: 'seed_version', value: '0', updatedAt: Date.now() });
  seedPromise = null;
  await ensureSeeded();
}

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const row = await getDb().settings.get(key);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getDb().settings.put({ key, value, updatedAt: Date.now() });
}
