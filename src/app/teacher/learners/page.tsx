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
} from '@/lib/queries';
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
    const [card, attendance, gates] = await Promise.all([
      reportCard(selected.id),
      attendanceSummary(selected.sectionId),
      gateEventsForStudent(selected.id, 6),
    ]);
    return {
      card,
      attendance: attendance.find((a) => a.student.id === selected.id) ?? null,
      gates,
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
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-deped-100 text-sm font-bold text-deped-800">
                      {student.firstName[0]}
                      {student.lastName[0]}
                    </span>
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
