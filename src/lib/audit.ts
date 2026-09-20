'use client';

/** RA 10173 audit trail. Every PII touch and privileged action is recorded. */
import { getDb } from './db';
import { randomId } from './crypto';
import { notifyChange } from './store';
import type { AuditLog, Role } from './types';

export interface AuditInput {
  actorId: string;
  actorRole: Role;
  action: string;
  target: string;
  tenantId: string | null;
  piiAccessed?: boolean;
  outcome?: AuditLog['outcome'];
}

export async function logAudit(input: AuditInput): Promise<void> {
  if (typeof window === 'undefined') return;
  const entry: AuditLog = {
    id: randomId('aud-'),
    timestamp: Date.now(),
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    target: input.target,
    tenantId: input.tenantId,
    piiAccessed: input.piiAccessed ?? false,
    outcome: input.outcome ?? 'success',
    // Device-local demo value; a server deployment records the real client IP.
    ip: 'device-local',
  };
  try {
    await getDb().auditLogs.put(entry);
    notifyChange();
  } catch {
    // Auditing must never break the user-facing action.
  }
}
