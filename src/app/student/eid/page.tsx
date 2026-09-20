'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { studentForUser } from '@/lib/queries';
import { buildEid, EID_PERIOD_SECONDS, secondsRemaining } from '@/lib/eid';
import { printSection } from '@/lib/export';
import { formatDate, fullName } from '@/lib/format';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader, ProgressBar, Tabs } from '@/components/ui';
import { QrCode } from '@/components/qr-code';
import { Icon } from '@/components/icons';

export default function EidPage() {
  const { session } = useSession();
  const userId = session?.userId ?? '';
  const [mode, setMode] = useState<'dynamic' | 'static'>('dynamic');
  const [payload, setPayload] = useState('');
  const [remaining, setRemaining] = useState(EID_PERIOD_SECONDS);
  const [error, setError] = useState<string | null>(null);

  const { data: student, loading } = useLiveData(
    async () => (userId ? studentForUser(userId) : null),
    [userId],
  );

  const regenerate = useCallback(async () => {
    if (!student) return;
    try {
      const next = await buildEid(student.lrn, student.qrSecret, mode);
      setPayload(next);
      setError(null);
    } catch {
      setError('This browser blocks Web Crypto, so the signed e-ID cannot be generated here.');
    }
  }, [student, mode]);

  // Dynamic codes roll over with the 30-second TOTP window.
  useEffect(() => {
    if (!student) return;
    void regenerate();
    if (mode === 'static') return;
    const id = setInterval(() => {
      const left = secondsRemaining();
      setRemaining(left);
      if (left === EID_PERIOD_SECONDS || left <= 1) void regenerate();
    }, 1000);
    setRemaining(secondsRemaining());
    return () => clearInterval(id);
  }, [student, mode, regenerate]);

  if (loading) return <Loading rows={5} />;
  if (!student) return <EmptyState title="No learner record is linked to this account." />;

  return (
    <>
      <PageHeader
        title="My student e-ID"
        description="A signed QR code that proves who you are at the school gate. Nothing personal is stored in the code itself — only your LRN and a rotating HMAC-SHA256 signature."
        actions={
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => printSection('eid-card')}>
            <Icon name="document" className="h-4 w-4" />
            Print ID card
          </button>
        }
      />

      <Tabs
        tabs={[
          { id: 'dynamic', label: 'Dynamic (rotates every 30s)' },
          { id: 'static', label: 'Printed card (static)' },
        ]}
        active={mode}
        onChange={setMode}
      />

      {error && (
        <div className="mb-4">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="eid-card">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Department of Education • Learner e-ID
            </p>
            <h2 className="mt-1 text-xl font-extrabold text-ink">{fullName(student)}</h2>
            <p className="font-mono text-sm text-slate-600">LRN {student.lrn}</p>
            <p className="text-sm text-slate-500">
              Grade {student.gradeLevel} • Born {formatDate(student.birthDate)}
            </p>

            <div className="mt-4 flex justify-center">
              {payload ? (
                <QrCode value={payload} size={248} alt="Student e-ID QR code" />
              ) : (
                <div className="skeleton h-[248px] w-[248px]" />
              )}
            </div>

            {mode === 'dynamic' ? (
              <div className="mx-auto mt-4 max-w-xs">
                <ProgressBar
                  value={(remaining / EID_PERIOD_SECONDS) * 100}
                  tone={remaining <= 5 ? 'warning' : 'brand'}
                />
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  Refreshes in {remaining}s
                </p>
              </div>
            ) : (
              <p className="mt-4">
                <Badge tone="info">Static signature — safe to print</Badge>
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="How it works">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>
                Your device derives a code from your LRN and a per-learner secret using{' '}
                <b>HMAC-SHA256</b>.
              </li>
              <li>
                In dynamic mode the signature also covers the current 30-second time window, so a
                screenshot stops working almost immediately.
              </li>
              <li>
                The gate scanner verifies the signature offline — it accepts a ±30 second clock drift
                so kiosks work without a network.
              </li>
              <li>
                On a successful scan your guardian receives a free Web Push notification instead of a
                paid SMS.
              </li>
            </ol>
          </Card>

          <Card title="Payload preview" subtitle="What the scanner reads">
            <code className="block break-all rounded-xl bg-slate-900 p-3 font-mono text-xs text-emerald-300">
              {payload || '…'}
            </code>
            <p className="mt-2 text-xs text-slate-500">
              Format: version | mode | LRN | time-window | truncated signature. No names, addresses or
              contact details are ever encoded.
            </p>
            <button type="button" className="btn btn-sm btn-secondary mt-3" onClick={() => void regenerate()}>
              <Icon name="qr" className="h-4 w-4" />
              Regenerate now
            </button>
          </Card>
        </div>
      </div>
    </>
  );
}
