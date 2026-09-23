/**
 * DepEd LIS adapter.
 *
 * The LIS has no public API: schools upload through the portal with its
 * spreadsheet template. So unless an endpoint is configured, a validated batch
 * stops here, ready for that upload, and says so honestly.
 *
 * To transmit for real, set LIS_API_BASE (and LIS_API_KEY if the endpoint wants
 * one). Nothing else in the pipeline changes.
 */
import type { LisBatchInput, LisValidation } from './lis';

export type TransmitResult =
  | { transmitted: true; reference: string }
  | { transmitted: false; reason: 'not_configured' }
  | { transmitted: false; reason: 'failed'; error: string };

export function adapterConfigured(): boolean {
  return Boolean(process.env.LIS_API_BASE);
}

export async function transmitToLis(
  input: LisBatchInput,
  validation: LisValidation,
  batchId: string,
): Promise<TransmitResult> {
  const base = process.env.LIS_API_BASE;
  if (!base) return { transmitted: false, reason: 'not_configured' };

  const acceptedLrns = new Set(validation.rows.filter((r) => r.accepted).map((r) => r.lrn));
  const payload = {
    batchId,
    schoolId: input.schoolId,
    schoolYear: input.schoolYear,
    // Only rows that passed validation are ever sent upstream.
    learners: input.rows.filter((row) => acceptedLrns.has(row.lrn)),
  };

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/enrolment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.LIS_API_KEY ? { Authorization: `Bearer ${process.env.LIS_API_KEY}` } : {}),
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (!res.ok) {
      return { transmitted: false, reason: 'failed', error: `${res.status} ${await res.text()}` };
    }
    const body = (await res.json().catch(() => ({}))) as { reference?: string };
    return { transmitted: true, reference: body.reference ?? batchId };
  } catch (error) {
    return {
      transmitted: false,
      reason: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
