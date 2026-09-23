/**
 * GET /api/lis/batches?schoolId=…  — transmittal history for one school.
 * GET /api/lis/batches?batchId=…   — the rejected rows of one batch, LRNs masked.
 */
import { NextResponse } from 'next/server';
import { listBatches, listFindings, storeConfigured } from '@/lib/lis-store';
import { adapterConfigured } from '@/lib/lis-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId');
  const batchId = searchParams.get('batchId');

  if (!storeConfigured()) {
    return NextResponse.json({ configured: false, adapter: adapterConfigured(), batches: [] });
  }

  try {
    if (batchId) {
      if (!/^[0-9a-f-]{36}$/i.test(batchId)) {
        return NextResponse.json({ error: 'Invalid batch id.' }, { status: 400 });
      }
      return NextResponse.json({ configured: true, findings: await listFindings(batchId) });
    }
    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId is required.' }, { status: 400 });
    }
    return NextResponse.json({
      configured: true,
      adapter: adapterConfigured(),
      batches: await listBatches(schoolId),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The transmittal store is unreachable.' },
      { status: 502 },
    );
  }
}
