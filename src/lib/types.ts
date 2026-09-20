/** Shared domain types for LC-DepEd. */

export type Role =
  | 'superadmin'
  | 'teacher'
  | 'student'
  | 'parent'
  | 'schoolhead'
  | 'sdo';

export type Lang = 'en' | 'tl' | 'ilo' | 'ceb';

export type SyncState = 'synced' | 'pending' | 'conflict';

export interface Tenant {
  id: string;
  name: string;
  schoolId: string; // DepEd School ID
  division: string;
  region: string;
  district: string;
  enrollment: number;
  status: 'active' | 'suspended' | 'provisioning';
  createdAt: number;
}

export interface User {
  id: string;
  email: string;
  /** Demo-only credential. Never ship plaintext credentials to production. */
  password: string;
  name: string;
  role: Role;
  tenantId: string | null;
  position?: string;
  lrn?: string; // students
  childLrns?: string[]; // parents
  sectionIds?: string[]; // teachers
  lang: Lang;
  lastLogin?: number;
}

export type Sex = 'M' | 'F';

export interface Student {
  id: string;
  lrn: string;
  firstName: string;
  middleName: string;
  lastName: string;
  sex: Sex;
  birthDate: string; // ISO date
  gradeLevel: number;
  sectionId: string;
  tenantId: string;
  guardianName: string;
  guardianContact: string;
  address: string;
  motherTongue: string;
  ipCommunity: string;
  fourPs: boolean;
  qrSecret: string; // HMAC seed for the dynamic e-ID
  enrolledAt: number;
}

export interface Section {
  id: string;
  name: string;
  gradeLevel: number;
  adviserId: string;
  tenantId: string;
  schoolYear: string;
  room: string;
}

export type SubjectWeightGroup =
  | 'languages'
  | 'science_math'
  | 'mapeh_tle'
  | 'shs_core'
  | 'shs_academic'
  | 'shs_tvl';

export interface Subject {
  id: string;
  name: string;
  gradeLevel: number;
  weightGroup: SubjectWeightGroup;
  teacherId: string;
  tenantId: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
  id: string;
  studentId: string;
  sectionId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  recordedBy: string;
  tenantId: string;
  updatedAt: number;
  syncState: SyncState;
}

export interface GradeRecord {
  id: string;
  studentId: string;
  subjectId: string;
  quarter: 1 | 2 | 3 | 4;
  writtenWork: number[];
  writtenWorkTotals: number[];
  performanceTasks: number[];
  performanceTaskTotals: number[];
  quarterlyAssessment: number;
  quarterlyAssessmentTotal: number;
  tenantId: string;
  updatedAt: number;
  syncState: SyncState;
}

export interface LessonLog {
  id: string;
  teacherId: string;
  tenantId: string;
  subjectId: string;
  gradeLevel: number;
  week: string;
  day: string;
  competencyCode: string;
  competency: string;
  objectives: string;
  procedure: string;
  assessment: string;
  remarks: string;
  updatedAt: number;
  syncState: SyncState;
}

export type FormType =
  | 'SF1'
  | 'SF2'
  | 'SF5'
  | 'SF9'
  | 'SF10'
  | 'IPCRF'
  | 'DLL';

export type FormStatus = 'draft' | 'submitted' | 'approved' | 'returned';

export interface FormSubmission {
  id: string;
  type: FormType;
  title: string;
  sectionId: string | null;
  tenantId: string;
  submittedBy: string;
  submittedAt: number;
  status: FormStatus;
  signedBy?: string;
  signedAt?: number;
  remarks?: string;
  period: string;
  syncState: SyncState;
}

export type GateDirection = 'in' | 'out';

export interface GateEvent {
  id: string;
  studentId: string;
  lrn: string;
  direction: GateDirection;
  timestamp: number;
  verified: boolean;
  method: 'dynamic' | 'static' | 'manual';
  tenantId: string;
  gate: string;
}

export interface AlertItem {
  id: string;
  recipientId: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  kind: 'gate' | 'grade' | 'form' | 'system';
}

export interface Message {
  id: string;
  threadId: string;
  fromId: string;
  toId: string;
  body: string;
  timestamp: number;
  read: boolean;
}

export type NtpCategory =
  | 'DRRM'
  | 'Feeding Program'
  | 'Inventory'
  | 'Records'
  | 'Facilities'
  | 'Finance';

export interface NtpTask {
  id: string;
  title: string;
  category: NtpCategory;
  assignedTo: string;
  assignedRole: 'AO' | 'PDO' | 'Registrar' | 'Property Custodian';
  status: 'open' | 'in_progress' | 'done';
  due: string;
  tenantId: string;
  origin: 'teacher_offload' | 'school_head';
  createdAt: number;
}

export interface AuditLog {
  id: string;
  timestamp: number;
  actorId: string;
  actorRole: Role;
  action: string;
  target: string;
  tenantId: string | null;
  piiAccessed: boolean;
  outcome: 'success' | 'denied' | 'failure';
  ip: string;
}

export interface SyncQueueItem {
  id: string;
  entity: string;
  op: 'create' | 'update' | 'delete';
  recordId: string;
  payload: string;
  createdAt: number;
  attempts: number;
  status: 'queued' | 'syncing' | 'done' | 'failed';
}

export interface FeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
  description: string;
  rollout: number;
}

export interface DivisionReport {
  id: string;
  tenantId: string;
  schoolName: string;
  type: string;
  period: string;
  receivedAt: number;
  status: 'validated' | 'flagged' | 'rejected' | 'pending';
  findings: string[];
  rows: number;
}

export interface LearningResource {
  id: string;
  title: string;
  subject: string;
  gradeLevel: number;
  kind: 'SLK' | 'Module' | 'Worksheet' | 'Video Script';
  sizeKb: number;
  body: string;
  cachedOffline: boolean;
}

export interface SystemSetting {
  key: string;
  value: string;
  updatedAt: number;
}

export interface Session {
  userId: string;
  role: Role;
  tenantId: string | null;
  name: string;
  email: string;
  issuedAt: number;
  expiresAt: number;
}
