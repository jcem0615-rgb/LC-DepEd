/**
 * Server-side transmittal store (Supabase Postgres, via PostgREST).
 *
 * Auth: a service-role key is used when one is configured, otherwise the
 * publishable key. The publishable key can record a transmittal and read
 * batch-level counts, but the row-level table grants no SELECT to it, so
 * learner records cannot be read back out through the public key.
 */
import type { LisBatchInput, LisValidation } from './lis';

const URL_ENV = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_ENV =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function storeConfigured(): boolean {
  return Boolean(URL_ENV && KEY_ENV);
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: KEY_ENV as string,
    Authorization: `Bearer ${KEY_ENV}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  if (!storeConfigured()) throw new Error('Transmittal store is not configured.');
  return fetch(`${URL_ENV}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers as Record<string, string>) },
    cache: 'no-store',
  });
}

export interface StoredBatch {
  id: string;
  fingerprint: string;
  school_id: string;
  school_name: string | null;
  school_year: string;
  submitted_by: string;
  submitted_at: string;
  row_count: number;
  accepted_count: number;
  rejected_count: number;
  status: string;
  findings: { code: string; message: string; count: number }[];
  transmitted_at: string | null;
  transmission_ref: string | null;
  transmission_error: string | null;
}

export async function findBatchByFingerprint(fingerprint: string): Promise<StoredBatch | null> {
  const res = await rest(
    `lis_batches?fingerprint=eq.${encodeURIComponent(fingerprint)}&select=*&limit=1`,
  );
  if (!res.ok) throw new Error(`Store read failed (${res.status}): ${await res.text()}`);
  const rows = (await res.json()) as StoredBatch[];
  return rows[0] ?? null;
}

export async function insertBatch(
  input: LisBatchInput,
  fingerprint: string,
  validation: LisValidation,
): Promise<StoredBatch> {
  const res = await rest('lis_batches?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      fingerprint,
      school_id: input.schoolId,
      school_name: input.schoolName,
      school_year: input.schoolYear,
      submitted_by: input.submittedBy,
      row_count: input.rows.length,
      accepted_count: validation.accepted,
      rejected_count: validation.rejected,
      status: validation.status,
      findings: validation.findings,
    }),
  });
  if (!res.ok) throw new Error(`Store write failed (${res.status}): ${await res.text()}`);
  const rows = (await res.json()) as StoredBatch[];
  return rows[0];
}

export async function insertRows(
  batchId: string,
  input: LisBatchInput,
  validation: LisValidation,
): Promise<void> {
  const byLrn = new Map(validation.rows.map((r) => [r.lrn, r]));
  const payload = input.rows.map((row) => {
    const result = byLrn.get(row.lrn);
    return {
      batch_id: batchId,
      lrn: row.lrn,
      last_name: row.lastName,
      first_name: row.firstName,
      middle_name: row.middleName ?? null,
      sex: row.sex,
      // An invalid date must not abort the insert — it is already a finding.
      birth_date: Number.isNaN(new Date(row.birthDate).getTime()) ? null : row.birthDate,
      grade_level: Number.isInteger(row.gradeLevel) ? row.gradeLevel : null,
      section: row.section,
      guardian_name: row.guardianName ?? null,
      guardian_contact: row.guardianContact ?? null,
      accepted: result?.accepted ?? false,
      errors: result?.errors ?? [],
    };
  });

  // Chunked so a whole-school roster does not exceed the request limit.
  for (let i = 0; i < payload.length; i += 250) {
    const res = await rest('lis_rows', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(payload.slice(i, i + 250)),
    });
    if (!res.ok) throw new Error(`Row write failed (${res.status}): ${await res.text()}`);
  }
}

export async function markTransmission(
  batchId: string,
  patch: {
    status: string;
    transmitted_at?: string | null;
    transmission_ref?: string | null;
    transmission_error?: string | null;
  },
): Promise<void> {
  const res = await rest(`lis_batches?id=eq.${batchId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Status update failed (${res.status}): ${await res.text()}`);
}

export async function listBatches(schoolId: string, limit = 20): Promise<StoredBatch[]> {
  const res = await rest(
    `lis_batches?school_id=eq.${encodeURIComponent(schoolId)}&select=*&order=submitted_at.desc&limit=${limit}`,
  );
  if (!res.ok) throw new Error(`Store read failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as StoredBatch[];
}

/** Rejected rows for one batch, with the LRN masked by the database view. */
export async function listFindings(
  batchId: string,
): Promise<{ masked_lrn: string; errors: string[] }[]> {
  const res = await rest(
    `lis_batch_findings?batch_id=eq.${batchId}&select=masked_lrn,errors&limit=200`,
  );
  if (!res.ok) throw new Error(`Store read failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as { masked_lrn: string; errors: string[] }[];
}
