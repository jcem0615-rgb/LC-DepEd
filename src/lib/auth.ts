'use client';

/**
 * Demo authentication + granular RBAC.
 *
 * The demo build authenticates against the seeded local user table so the PWA
 * runs with zero backend. A production deployment swaps `signIn` for DepEd
 * GSuite OAuth 2.0 and keeps the same `Session` shape and permission matrix.
 */
import { ensureSeeded, getDb } from './db';
import { logAudit } from './audit';
import type { Role, Session, User } from './types';

const SESSION_KEY = 'lc-deped:session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type Permission =
  | 'attendance:write'
  | 'grades:write'
  | 'forms:submit'
  | 'forms:approve'
  | 'forms:export'
  | 'learner:pii:read'
  | 'ntp:assign'
  | 'lis:sync'
  | 'intake:validate'
  | 'analytics:division'
  | 'audit:read'
  | 'audit:read:global'
  | 'tenant:manage'
  | 'flags:manage'
  | 'system:maintain'
  | 'eid:generate'
  | 'gate:scan'
  | 'alerts:receive'
  | 'messages:send';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: [
    'audit:read', 'audit:read:global', 'tenant:manage', 'flags:manage',
    'system:maintain', 'analytics:division', 'forms:export', 'gate:scan',
  ],
  teacher: [
    'attendance:write', 'grades:write', 'forms:submit', 'forms:export',
    'learner:pii:read', 'messages:send', 'gate:scan',
  ],
  student: ['eid:generate', 'alerts:receive'],
  parent: ['alerts:receive', 'messages:send'],
  schoolhead: [
    'forms:approve', 'forms:export', 'learner:pii:read', 'ntp:assign',
    'lis:sync', 'audit:read', 'gate:scan', 'messages:send',
  ],
  sdo: ['intake:validate', 'analytics:division', 'audit:read', 'forms:export'],
};

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ROLE_HOME: Record<Role, string> = {
  superadmin: '/superadmin',
  teacher: '/teacher',
  student: '/student',
  parent: '/parent',
  schoolhead: '/school-head',
  sdo: '/sdo',
};

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Super Admin',
  teacher: 'Teacher',
  student: 'Learner',
  parent: 'Parent / Guardian',
  schoolhead: 'School Head',
  sdo: 'SDO / Regional Office',
};

export type SignInResult =
  | { ok: true; session: Session }
  | { ok: false; error: string };

export async function signIn(identifier: string, password: string): Promise<SignInResult> {
  await ensureSeeded();
  const db = getDb();
  const id = identifier.trim().toLowerCase();
  if (!id || !password) return { ok: false, error: 'Enter your email (or LRN) and password.' };

  let user: User | undefined = await db.users.where('email').equals(id).first();
  if (!user && /^\d{12}$/.test(id)) {
    user = await db.users.where('lrn').equals(id).first();
  }

  if (!user || user.password !== password) {
    await logAudit({
      actorId: user?.id ?? 'unknown',
      actorRole: user?.role ?? 'student',
      action: 'LOGIN_FAILED',
      target: id || '(empty)',
      tenantId: user?.tenantId ?? null,
      outcome: 'failure',
    });
    return { ok: false, error: 'Invalid credentials. Try a demo account below.' };
  }

  const now = Date.now();
  const session: Session = {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  writeSession(session);
  await db.users.update(user.id, { lastLogin: now });
  await logAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'LOGIN_SUCCESS',
    target: user.email,
    tenantId: user.tenantId,
  });
  return { ok: true, session };
}

export function writeSession(session: Session): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage may be blocked in private mode */
  }
}

export function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.userId || !parsed?.role) return null;
    if (parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
