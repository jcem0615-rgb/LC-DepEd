/**
 * POST /api/lis/sync — validate an enrolment batch and record the transmittal.
 *
 * The batch is fingerprinted, so re-sending identical data returns the original
 * receipt rather than creating a second transmittal.
 */
import { NextResponse } from 'next/server';
import { batchFingerprint, validateBatch, type LisBatchInput, type LisLearnerInput } from '@/lib/lis';
import { adapterConfigured, transmitToLis } from '@/lib/lis-adapter';
import {
  findBatchByFingerprint,
  insertBatch,
  insertRows,
  markTransmission,
  storeConfigured,
} from '@/lib/lis-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_ROWS = 5000;
const MAX_BODY_BYTES = 8_000_000;

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Batch is too large.' }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return badRequest('Invalid JSON body.');
  }

  const input = parsed as LisBatchInput;
  if (!input || typeof input !== 'object') return badRequest('A batch is required.');
  if (!input.schoolId || typeof input.schoolId !== 'string') return badRequest('schoolId is required.');
  if (!input.schoolYear || typeof input.schoolYear !== 'string') return badRequest('schoolYear is required.');
  if (!input.submittedBy || typeof input.submittedBy !== 'string') return badRequest('submittedBy is required.');
  if (!Array.isArray(input.rows) || input.rows.length === 0) return badRequest('The batch has no learners.');
  if (input.rows.length > MAX_ROWS) return badRequest(`A batch may carry at most ${MAX_ROWS} learners.`);
  if (input.rows.some((row: LisLearnerInput) => !row || typeof row !== 'object')) {
    return badRequest('Every learner row must be an object.');
  }

  if (!storeConfigured()) {
    return NextResponse.json(
      {
        error:
          'The transmittal store is not configured. Set SUPABASE_URL and a Supabase key to record transmittals.',
      },
      { status: 503 },
    );
  }

  const validation = validateBatch(input);
  const fingerprint = await batchFingerprint(input);

  try {
    // Idempotency: identical enrolment data reuses the original receipt.
    const existing = await findBatchByFingerprint(fingerprint);
    if (existing) {
      return NextResponse.json({
        batchId: existing.id,
        idempotent: true,
        status: existing.status,
        accepted: existing.accepted_count,
        rejected: existing.rejected_count,
        findings: existing.findings,
        rows: validation.rows,
        submittedAt: existing.submitted_at,
        transmission: {
          configured: adapterConfigured(),
          reference: existing.transmission_ref,
          error: existing.transmission_error,
        },
      });
    }

    const batch = await insertBatch(input, fingerprint, validation);
    await insertRows(batch.id, input, validation);

    let status: string = validation.status;
    let reference: string | null = null;
    let transmissionError: string | null = null;

    if (validation.accepted > 0) {
      const result = await transmitToLis(input, validation, batch.id);
      if (result.transmitted) {
        status = 'transmitted';
        reference = result.reference;
        await markTransmission(batch.id, {
          status,
          transmitted_at: new Date().toISOString(),
          transmission_ref: reference,
        });
      } else if (result.reason === 'failed') {
        status = 'transmission_failed';
        transmissionError = result.error;
        await markTransmission(batch.id, { status, transmission_error: result.error });
      }
      // 'not_configured' leaves the batch validated and ready for the upload file.
    }

    return NextResponse.json({
      batchId: batch.id,
      idempotent: false,
      status,
      accepted: validation.accepted,
      rejected: validation.rejected,
      findings: validation.findings,
      rows: validation.rows,
      submittedAt: batch.submitted_at,
      transmission: { configured: adapterConfigured(), reference, error: transmissionError },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The transmittal could not be recorded.' },
      { status: 502 },
    );
  }
}
