'use client';

import { useMemo, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb } from '@/lib/db';
import { submitForm } from '@/lib/queries';
import { PdfButton, XlsxButton } from '@/components/export-buttons';
import { formatDateTime } from '@/lib/format';
import { Badge, Banner, Card, PageHeader, ProgressBar } from '@/components/ui';

/** RPMS-PPST key result areas (weights per the DepEd RPMS tool for Teacher I-III). */
const KRAS = [
  {
    id: 'kra1',
    title: 'KRA 1 — Content knowledge and pedagogy',
    weight: 20,
    objectives: [
      'Applied knowledge of content within and across curriculum teaching areas',
      'Used research-based knowledge and principles of teaching and learning',
      'Displayed proficient use of Mother Tongue, Filipino and English',
    ],
  },
  {
    id: 'kra2',
    title: 'KRA 2 — Learning environment and diversity of learners',
    weight: 20,
    objectives: [
      'Established a safe and secure learning environment',
      'Maintained learning environments that nurture fairness',
      'Used differentiated strategies for learners in difficult circumstances',
    ],
  },
  {
    id: 'kra3',
    title: 'KRA 3 — Curriculum and planning',
    weight: 30,
    objectives: [
      'Planned, managed and implemented developmentally sequenced learning',
      'Participated in collegial discussions that use learner performance data',
      'Selected, developed and used a variety of teaching resources',
    ],
  },
  {
    id: 'kra4',
    title: 'KRA 4 — Assessment and reporting',
    weight: 30,
    objectives: [
      'Designed, selected and used diagnostic, formative and summative assessment',
      'Monitored and evaluated learner progress using assessment data',
      'Communicated learner needs and progress to key stakeholders',
    ],
  },
];

const EVIDENCE = [
  'Daily Lesson Logs (Weeks 1-8)',
  'Class records with transmuted grades',
  'SF2 attendance reports',
  'Learner outputs / portfolio samples',
  'Parent-teacher conference minutes',
  'Certificates of LAC session participation',
];

function adjectival(rating: number): { label: string; tone: 'success' | 'info' | 'warning' | 'danger' } {
  if (rating >= 4.5) return { label: 'Outstanding', tone: 'success' };
  if (rating >= 3.5) return { label: 'Very Satisfactory', tone: 'info' };
  if (rating >= 2.5) return { label: 'Satisfactory', tone: 'warning' };
  return { label: 'Needs Improvement', tone: 'danger' };
}

export default function IpcrfPage() {
  const { session, user } = useSession();
  const [ratings, setRatings] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const kra of KRAS) kra.objectives.forEach((_, i) => (initial[`${kra.id}-${i}`] = 4));
    return initial;
  });
  const [evidence, setEvidence] = useState<string[]>(EVIDENCE.slice(0, 3));
  const [notice, setNotice] = useState<string | null>(null);

  const { data: submissions } = useLiveData(
    async () =>
      session
        ? (await getDb().forms.where('submittedBy').equals(session.userId).toArray()).filter(
            (f) => f.type === 'IPCRF',
          )
        : [],
    [session?.userId],
  );

  const result = useMemo(() => {
    let weighted = 0;
    const perKra = KRAS.map((kra) => {
      const values = kra.objectives.map((_, i) => ratings[`${kra.id}-${i}`] ?? 0);
      const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);
      weighted += (avg * kra.weight) / 100;
      return { kra, avg };
    });
    return { perKra, final: Number(weighted.toFixed(3)) };
  }, [ratings]);

  const verdict = adjectival(result.final);
  const completeness = Math.round((evidence.length / EVIDENCE.length) * 100);

  const ratingRows = () =>
    KRAS.flatMap((kra) =>
      kra.objectives.map((objective, i) => [
        kra.title.split(' — ')[0],
        objective,
        kra.weight,
        ratings[`${kra.id}-${i}`] ?? 0,
      ]),
    );

  const exportMeta = () => [
    { label: 'Ratee', value: user?.name ?? session?.name ?? '—' },
    { label: 'Position', value: user?.position ?? 'Teacher' },
    { label: 'Review period', value: 'Mid-year Review' },
    { label: 'Final rating', value: `${result.final.toFixed(3)} (${verdict.label})` },
    { label: 'Evidence attached', value: `${evidence.length} of ${EVIDENCE.length}` },
  ];

  const buildPdf = () => ({
    filename: `IPCRF-${(user?.name ?? 'teacher').replace(/\s+/g, '-')}`,
    code: 'IPCRF',
    title: 'Individual Performance Commitment and Review Form',
    subtitle: 'RPMS-PPST • Mid-year Review',
    meta: exportMeta(),
    columns: [
      { header: 'KRA', width: 10 },
      { header: 'Objective', width: 60 },
      { header: 'Weight %', width: 10, align: 'right' as const },
      { header: 'Rating (1-5)', width: 12, align: 'center' as const },
    ],
    rows: ratingRows(),
    totals: ['', 'WEIGHTED FINAL RATING', '', result.final.toFixed(3)],
    notes: [
      `Adjectival equivalent: ${verdict.label}.`,
      `Portfolio evidence attached: ${evidence.join('; ') || 'none'}.`,
      'Weighted across KRA 1-4 (20/20/30/30) on the 5-point RPMS scale.',
    ],
    signatures: ['Ratee', 'Rater'],
    footer: 'LC-DepEd • IPCRF / RPMS',
  });

  const buildWorkbook = () => ({
    filename: `IPCRF-${(user?.name ?? 'teacher').replace(/\s+/g, '-')}`,
    title: 'IPCRF / RPMS portfolio',
    subtitle: `Final rating ${result.final.toFixed(3)} — ${verdict.label}`,
    sheets: [
      {
        name: 'Ratings',
        columns: [
          { header: 'KRA' },
          { header: 'Objective' },
          { header: 'Weight %', align: 'right' as const },
          { header: 'Rating (1-5)', align: 'center' as const },
        ],
        rows: ratingRows(),
        totals: ['', 'WEIGHTED FINAL RATING', '', result.final.toFixed(3)],
        meta: exportMeta(),
      },
      {
        name: 'Evidence',
        columns: [{ header: 'Portfolio evidence' }, { header: 'Attached' }],
        rows: EVIDENCE.map((item) => [item, evidence.includes(item) ? 'Yes' : 'No']),
        notes: [`Completeness: ${completeness}%`],
      },
    ],
  });

  return (
    <>
      <PageHeader
        title="IPCRF / RPMS portfolio"
        description="Self-rate each RPMS-PPST objective; the weighted final rating and its adjectival equivalent are computed as you go."
        actions={
          <>
            <PdfButton build={buildPdf} fallbackElementId="ipcrf-sheet" />
            <XlsxButton build={buildWorkbook} />
          </>
        }
      />

      {notice && (
        <div className="mb-4">
          <Banner tone="success">{notice}</Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2" id="ipcrf-sheet">
          {KRAS.map((kra) => {
            const entry = result.perKra.find((p) => p.kra.id === kra.id);
            return (
              <Card key={kra.id} title={kra.title} subtitle={`Weight ${kra.weight}%`}>
                <ul className="space-y-3">
                  {kra.objectives.map((objective, i) => {
                    const key = `${kra.id}-${i}`;
                    return (
                      <li key={key}>
                        <p className="text-sm font-semibold text-slate-700">{objective}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={ratings[key] === value}
                              onClick={() => setRatings((r) => ({ ...r, [key]: value }))}
                              className={`min-h-touch min-w-touch rounded-xl text-sm font-bold ${
                                ratings[key] === value
                                  ? 'bg-deped-700 text-white'
                                  : 'border-2 border-slate-200 bg-white text-slate-600'
                              }`}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-sm text-slate-600">
                  KRA average: <b>{entry?.avg.toFixed(2) ?? '—'}</b>
                </p>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card title="Final rating">
            <p className="text-4xl font-extrabold text-ink">{result.final.toFixed(3)}</p>
            <p className="mt-1">
              <Badge tone={verdict.tone}>{verdict.label}</Badge>
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Weighted across KRA 1-4 (20/20/30/30) on the 5-point RPMS scale.
            </p>
            <button
              type="button"
              className="btn-primary mt-4 w-full"
              onClick={async () => {
                if (!session) return;
                await submitForm(session, {
                  type: 'IPCRF',
                  title: `IPCRF Portfolio — final rating ${result.final.toFixed(3)} (${verdict.label})`,
                  sectionId: null,
                  period: 'Mid-year Review',
                });
                setNotice('IPCRF portfolio submitted to the School Head.');
              }}
            >
              Submit to School Head
            </button>
          </Card>

          <Card title="Portfolio evidence" subtitle={`${evidence.length} of ${EVIDENCE.length} attached`}>
            <ProgressBar value={completeness} tone={completeness === 100 ? 'success' : 'brand'} />
            <ul className="mt-3 space-y-2">
              {EVIDENCE.map((item) => {
                const checked = evidence.includes(item);
                return (
                  <li key={item}>
                    <label className="flex min-h-touch items-center gap-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-slate-300"
                        checked={checked}
                        onChange={() =>
                          setEvidence((prev) =>
                            checked ? prev.filter((e) => e !== item) : [...prev, item],
                          )
                        }
                      />
                      {item}
                    </label>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Previous submissions">
            {!submissions?.length ? (
              <p className="text-sm text-slate-500">No IPCRF submissions yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {submissions.map((s) => (
                  <li key={s.id} className="rounded-lg border border-slate-200 p-2">
                    <p className="font-semibold text-ink">{s.title}</p>
                    <p className="text-xs text-slate-500">
                      {s.period} • {formatDateTime(s.submittedAt)} • {s.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
