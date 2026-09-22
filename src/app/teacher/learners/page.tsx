'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { logAudit } from '@/lib/audit';
import {
  attendanceSummary,
  gateEventsForStudent,
  reportCard,
  rosterForSection,
  sectionsForTeacher,
  setLearnerPhoto,
} from '@/lib/queries';
import { PhotoCapture } from '@/components/photo-capture';
import { buildEid } from '@/lib/eid';
import { learnerPortraitSvg } from '@/lib/learner-photo';
import { QrCode } from '@/components/qr-code';
import { formatDate, formatDateTime, fullName, maskLrn } from '@/lib/format';
import { Badge, Card, EmptyState, Loading, PageHeader, Toggle } from '@/components/ui';
import type { Student } from '@/lib/types';

export default function LearnersPage() {
  const { session } = useSession();
  const userId = session?.userId ?? '';
  const [sectionId, setSectionId] = useState('');
  const [query, setQuery] = useState('');
  const [revealPii, setRevealPii] = useState(false);
  const [selected, setSelected] = useState<Student | null>(null);

  const { data: sections } = useLiveData(
    async () => (userId ? sectionsForTeacher(userId) : []),
    [userId],
  );

  useEffect(() => {
    if (sections?.length && !sectionId) setSectionId(sections[0].id);
  }, [sections, sectionId]);

  const { data: roster, loading } = useLiveData(
    async () => (sectionId ? rosterForSection(sectionId) : []),
    [sectionId],
  );

  const { data: detail } = useLiveData(async () => {
    if (!selected) return null;
    const [card, attendance, gates, eid] = await Promise.all([
      reportCard(selected.id),
      attendanceSummary(selected.sectionId),
      gateEventsForStudent(selected.id, 6),
      buildEid(selected.lrn, selected.qrSecret).catch(() => ''),
    ]);
    return {
      card,
      attendance: attendance.find((a) => a.student.id === selected.id) ?? null,
      gates,
      eid,
    };
  }, [selected?.id]);

  const filtered = (roster ?? []).filter((s) =>
    `${s.firstName} ${s.lastName} ${s.lrn}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Learners"
        description="Learner Reference Numbers are masked by default. Revealing them is recorded in the RA 10173 audit trail."
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="lsec">Section</label>
            <select id="lsec" className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {(sections ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="lq">Search</label>
            <input
              id="lq"
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or LRN"
            />
          </div>
          <div className="flex items-end gap-3">
            <Toggle
              checked={revealPii}
              label="Reveal Learner Reference Numbers"
              onChange={(next) => {
                setRevealPii(next);
                if (next && session) {
                  void logAudit({
                    actorId: session.userId,
                    actorRole: session.role,
                    action: 'PII_REVEAL_LRN',
                    target: sectionId,
                    tenantId: session.tenantId,
                    piiAccessed: true,
                  });
                }
              }}
            />
            <span className="text-sm font-semibold text-slate-600">Reveal LRN</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Roster (${filtered.length})`}>
          {loading ? (
            <Loading rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState title="No learners match that search." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((student) => (
                <li key={student.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(student)}
                    className={`flex w-full min-h-touch items-center gap-3 rounded-xl px-2 py-3 text-left ${
                      selected?.id === student.id ? 'bg-deped-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={learnerPortraitSvg(student)}
                      alt=""
                      width={36}
                      height={45}
                      className="h-11 w-9 shrink-0 rounded-md object-cover ring-1 ring-slate-200"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{fullName(student)}</span>
                      <span className="block font-mono text-xs text-slate-500">
                        {revealPii ? student.lrn : maskLrn(student.lrn)}
                      </span>
                    </span>
                    {student.fourPs && <Badge tone="info">4Ps</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={selected ? fullName(selected) : 'Learner profile'}>
          {!selected ? (
            <EmptyState title="Select a learner to view their record." />
          ) : !detail ? (
            <Loading rows={4} />
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={learnerPortraitSvg(selected)}
                  alt={`Portrait of ${fullName(selected)}`}
                  width={104}
                  height={130}
                  className="rounded-lg border-4 border-white shadow ring-1 ring-slate-200"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Learner e-ID
                  </p>
                  <p className="mt-0.5 font-bold text-ink">{fullName(selected)}</p>
                  <p className="font-mono text-xs text-slate-500">
                    {revealPii ? selected.lrn : maskLrn(selected.lrn)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Grade {selected.gradeLevel} • permanent code
                  </p>
                </div>
                {detail.eid ? (
                  <QrCode value={detail.eid} size={104} alt={`e-ID QR code for ${fullName(selected)}`} className="ml-auto" />
                ) : (
                  <div className="skeleton ml-auto h-[104px] w-[104px]" />
                )}
              </div>

              <PhotoCapture
                label="ID photo"
                currentPhoto={selected.photoUrl}
                onSave={async (dataUrl) => {
                  if (!session) return;
                  await setLearnerPhoto(session, selected, dataUrl);
                  setSelected({ ...selected, photoUrl: dataUrl });
                }}
                onRemove={async () => {
                  if (!session) return;
                  await setLearnerPhoto(session, selected, null);
                  setSelected({ ...selected, photoUrl: undefined });
                }}
              />

              <div className="grid gap-1 sm:grid-cols-2">
                <p><span className="text-slate-500">LRN: </span><b className="font-mono">{revealPii ? selected.lrn : maskLrn(selected.lrn)}</b></p>
                <p><span className="text-slate-500">Sex: </span><b>{selected.sex === 'M' ? 'Male' : 'Female'}</b></p>
                <p><span className="text-slate-500">Birth date: </span><b>{formatDate(selected.birthDate)}</b></p>
                <p><span className="text-slate-500">Mother tongue: </span><b>{selected.motherTongue}</b></p>
                <p className="sm:col-span-2"><span className="text-slate-500">Guardian: </span><b>{selected.guardianName}</b> • {selected.guardianContact}</p>
                <p className="sm:col-span-2"><span className="text-slate-500">Address: </span><b>{selected.address}</b></p>
              </div>

              <div>
                <h3 className="mb-1 font-bold text-slate-700">Academic standing</h3>
                <p>
                  General average <b>{detail.card.average || '—'}</b> • {detail.card.remark}
                  {detail.card.honors ? ` • ${detail.card.honors}` : ''}
                </p>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {detail.card.rows.map((row) => (
                    <li key={row.subject.id} className="flex justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1">
                      <span className="truncate">{row.subject.name}</span>
                      <b className={row.final && row.final < 75 ? 'text-rose-700' : 'text-slate-800'}>
                        {row.final || '—'}
                      </b>
                    </li>
                  ))}
                </ul>
              </div>

              {detail.attendance && (
                <div>
                  <h3 className="mb-1 font-bold text-slate-700">Attendance</h3>
                  <p>
                    {detail.attendance.present} present • {detail.attendance.absent} absent •{' '}
                    {detail.attendance.late} late ({detail.attendance.rate.toFixed(1)}%)
                  </p>
                </div>
              )}

              <div>
                <h3 className="mb-1 font-bold text-slate-700">Recent gate scans</h3>
                {detail.gates.length === 0 ? (
                  <p className="text-slate-500">No gate activity recorded.</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.gates.map((g) => (
                      <li key={g.id} className="flex items-center gap-2">
                        <Badge tone={g.direction === 'in' ? 'success' : 'neutral'}>
                          {g.direction === 'in' ? 'Entry' : 'Exit'}
                        </Badge>
                        <span className="text-slate-600">{formatDateTime(g.timestamp)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
