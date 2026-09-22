'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { setLearnerPhoto, studentForUser } from '@/lib/queries';
import { buildEid } from '@/lib/eid';
import { learnerPortraitPng, learnerPortraitSvg } from '@/lib/learner-photo';
import { formatDate, fullName } from '@/lib/format';
import { SCHOOL_YEAR } from '@/data/seed';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader } from '@/components/ui';
import { QrCode, qrDataUrl } from '@/components/qr-code';
import { PdfButton } from '@/components/export-buttons';
import { PhotoCapture } from '@/components/photo-capture';
import { Icon } from '@/components/icons';

export default function EidPage() {
  const { session } = useSession();
  const userId = session?.userId ?? '';
  const [payload, setPayload] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: student, loading } = useLiveData(
    async () => (userId ? studentForUser(userId) : null),
    [userId],
  );

  const build = useCallback(async () => {
    if (!student) return;
    try {
      setPayload(await buildEid(student.lrn, student.qrSecret));
      setError(null);
    } catch {
      setError('This browser blocks Web Crypto, so the signed e-ID cannot be generated here.');
    }
  }, [student]);

  useEffect(() => {
    void build();
  }, [build]);

  if (loading) return <Loading rows={5} />;
  if (!student) return <EmptyState title="No learner record is linked to this account." />;

  const portrait = learnerPortraitSvg(student);

  return (
    <>
      <PageHeader
        title="My student e-ID"
        description="Your permanent school ID. Show it at the gate — the scanner checks the signature offline and your guardian is notified straight away."
        actions={
          <PdfButton
            label="Print ID card (PDF)"
            fallbackElementId="eid-card"
            build={async () => {
              const photo = learnerPortraitPng(student, 360);
              const qr = await qrDataUrl(payload || (await buildEid(student.lrn, student.qrSecret)), 512);
              return {
                filename: `eID-${student.lrn}`,
                code: 'Learner e-ID',
                title: fullName(student),
                subtitle: `Grade ${student.gradeLevel} • School Year ${SCHOOL_YEAR}`,
                meta: [
                  { label: 'LRN', value: student.lrn },
                  { label: 'Sex', value: student.sex === 'M' ? 'Male' : 'Female' },
                  { label: 'Date of birth', value: formatDate(student.birthDate) },
                  { label: 'Mother tongue', value: student.motherTongue },
                ],
                images: [
                  ...(photo ? [{ dataUrl: photo, width: 130 }] : []),
                  { dataUrl: qr, width: 170 },
                ],
                imageCaption: 'Present this card at the school gate.',
                columns: [],
                rows: [],
                tableOptional: true,
                notes: [
                  'This code is unique to the learner and does not expire — the printed card and the card on screen are the same credential.',
                  'The code carries only the Learner Reference Number and its signature: no name, address or contact number.',
                  'If the card is lost, ask the school to re-issue the learner secret; the old card stops verifying immediately.',
                ],
                signatures: ['Learner signature', 'School head'],
                footer: 'LC-DepEd • Learner e-ID',
              };
            }}
          />
        }
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

            <div className="mt-4 flex items-center justify-center gap-4 sm:gap-5">
              <figure className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={portrait}
                  alt={`Portrait of ${fullName(student)}`}
                  width={120}
                  height={150}
                  className="rounded-xl border-4 border-white shadow-md ring-1 ring-slate-200"
                />
                {!student.photoUrl && (
                  <figcaption className="mt-1 text-[11px] text-slate-400">Photo on file</figcaption>
                )}
              </figure>

              {payload ? (
                <QrCode value={payload} size={176} alt="Student e-ID QR code" />
              ) : (
                <div className="skeleton h-[176px] w-[176px]" />
              )}
            </div>

            <h2 className="mt-4 text-xl font-extrabold text-ink">{fullName(student)}</h2>
            <p className="font-mono text-sm text-slate-600">LRN {student.lrn}</p>
            <p className="text-sm text-slate-500">
              Grade {student.gradeLevel} • Born {formatDate(student.birthDate)}
            </p>
            <p className="mt-3">
              <Badge tone="success">Permanent code — safe to print</Badge>
            </p>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4 text-left no-print">
            <PhotoCapture
              label="My ID photo"
              currentPhoto={student.photoUrl}
              onSave={async (dataUrl) => {
                if (!session) return;
                await setLearnerPhoto(session, student, dataUrl);
              }}
              onRemove={async () => {
                if (!session) return;
                await setLearnerPhoto(session, student, null);
              }}
            />
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="How it works">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>
                Your device derives one code from your LRN and a secret only the school holds, using{' '}
                <b>HMAC-SHA256</b>.
              </li>
              <li>
                The code is yours alone and does not change, so a printed card works exactly like the
                one on your phone.
              </li>
              <li>
                The gate scanner verifies the signature offline — no network and no clock needed.
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
              Format: version | LRN | truncated signature. Nothing else is encoded, and the signature
              cannot be produced without the learner secret.
            </p>
            <button type="button" className="btn btn-sm btn-secondary mt-3" onClick={() => void build()}>
              <Icon name="qr" className="h-4 w-4" />
              Regenerate
            </button>
          </Card>
        </div>
      </div>
    </>
  );
}
