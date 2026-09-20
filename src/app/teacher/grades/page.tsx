'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb } from '@/lib/db';
import { classRecord, saveGrade, sectionsForTeacher } from '@/lib/queries';
import { WEIGHTS, WEIGHT_GROUP_LABELS, computeQuarter } from '@/lib/deped-grading';
import { downloadCsv } from '@/lib/export';
import { fullName } from '@/lib/format';
import { Badge, Banner, Card, Loading, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { GradeRecord, Student } from '@/lib/types';

type Quarter = 1 | 2 | 3 | 4;

interface EditorState {
  student: Student;
  record: GradeRecord | null;
  ww: string[];
  wwT: string[];
  pt: string[];
  ptT: string[];
  qa: string;
  qaT: string;
}

const nums = (values: string[]) => values.map((v) => Number(v) || 0);

export default function GradesPage() {
  const { session } = useSession();
  const userId = session?.userId ?? '';
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [quarter, setQuarter] = useState<Quarter>(1);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: meta } = useLiveData(async () => {
    if (!userId) return null;
    const [sections, subjects] = await Promise.all([
      sectionsForTeacher(userId),
      getDb().subjects.toArray(),
    ]);
    return { sections, subjects };
  }, [userId]);

  useEffect(() => {
    if (meta?.sections.length && !sectionId) setSectionId(meta.sections[0].id);
    if (meta?.subjects.length && !subjectId) setSubjectId(meta.subjects[0].id);
  }, [meta, sectionId, subjectId]);

  const { data, loading } = useLiveData(async () => {
    if (!sectionId || !subjectId) return null;
    return classRecord(subjectId, sectionId, quarter);
  }, [sectionId, subjectId, quarter]);

  const subject = data?.subject;
  const weights = subject ? WEIGHTS[subject.weightGroup] : null;

  return (
    <>
      <PageHeader
        title="Class record"
        description="Grades follow DepEd Order No. 8, s. 2015: percentage score × component weight → initial grade → transmuted quarterly grade."
        actions={
          <button
            type="button"
            className="btn btn-sm bg-deped-700 text-white"
            disabled={!data}
            onClick={() => {
              if (!data || !subject) return;
              downloadCsv(
                `ClassRecord-${subject.name}-Q${quarter}`,
                ['LRN', 'Learner', 'WW PS', 'WW WS', 'PT PS', 'PT WS', 'QA PS', 'QA WS', 'Initial Grade', 'Quarterly Grade', 'Descriptor'],
                data.rows.map((r) => [
                  r.student.lrn,
                  fullName(r.student),
                  r.computed?.wwPs ?? '',
                  r.computed?.wwWs ?? '',
                  r.computed?.ptPs ?? '',
                  r.computed?.ptWs ?? '',
                  r.computed?.qaPs ?? '',
                  r.computed?.qaWs ?? '',
                  r.computed?.initialGrade ?? '',
                  r.computed?.quarterlyGrade ?? '',
                  r.computed?.descriptor ?? '',
                ]),
              );
            }}
          >
            <Icon name="download" className="h-4 w-4" />
            Export class record
          </button>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="sec">Section</label>
            <select id="sec" className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {(meta?.sections ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sub">Subject</label>
            <select id="sub" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {(meta?.subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="qtr">Quarter</label>
            <select
              id="qtr"
              className="input"
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value) as Quarter)}
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>Quarter {q}</option>
              ))}
            </select>
          </div>
        </div>
        {weights && subject && (
          <p className="mt-3 text-sm text-slate-600">
            <span className="font-semibold text-slate-700">{WEIGHT_GROUP_LABELS[subject.weightGroup]}</span>{' '}
            — Written Work {weights.ww}% • Performance Tasks {weights.pt}% • Quarterly Assessment {weights.qa}%
          </p>
        )}
        {notice && <div className="mt-3"><Banner tone="success">{notice}</Banner></div>}
      </Card>

      {loading || !data ? (
        <Loading rows={6} />
      ) : (
        <Card title="Learners" subtitle={`${data.rows.length} records • Quarter ${quarter}`}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Learner</th>
                  <th>WW %</th>
                  <th>PT %</th>
                  <th>QA %</th>
                  <th>Initial</th>
                  <th>Quarterly</th>
                  <th>Descriptor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={row.student.id}>
                    <td className="text-slate-400">{i + 1}</td>
                    <td className="font-semibold">{fullName(row.student)}</td>
                    <td>{row.computed ? row.computed.wwPs.toFixed(1) : '—'}</td>
                    <td>{row.computed ? row.computed.ptPs.toFixed(1) : '—'}</td>
                    <td>{row.computed ? row.computed.qaPs.toFixed(1) : '—'}</td>
                    <td>{row.computed ? row.computed.initialGrade.toFixed(2) : '—'}</td>
                    <td>
                      {row.computed ? (
                        <Badge tone={row.computed.quarterlyGrade >= 75 ? 'success' : 'danger'}>
                          {row.computed.quarterlyGrade}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-xs">{row.computed?.descriptor ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        onClick={() =>
                          setEditor({
                            student: row.student,
                            record: row.record,
                            ww: (row.record?.writtenWork ?? [0, 0, 0, 0]).map(String),
                            wwT: (row.record?.writtenWorkTotals ?? [20, 20, 25, 15]).map(String),
                            pt: (row.record?.performanceTasks ?? [0, 0, 0]).map(String),
                            ptT: (row.record?.performanceTaskTotals ?? [30, 30, 40]).map(String),
                            qa: String(row.record?.quarterlyAssessment ?? 0),
                            qaT: String(row.record?.quarterlyAssessmentTotal ?? 50),
                          })
                        }
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editor && subject && (
        <Card
          className="mt-4 border-2 border-deped-300"
          title={`Encode scores — ${fullName(editor.student)}`}
          subtitle={`${subject.name} • Quarter ${quarter}`}
          action={
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditor(null)}>
              Close
            </button>
          }
        >
          <ScoreGroup
            legend="Written Work"
            scores={editor.ww}
            totals={editor.wwT}
            onScore={(i, v) => setEditor({ ...editor, ww: replaceAt(editor.ww, i, v) })}
            onTotal={(i, v) => setEditor({ ...editor, wwT: replaceAt(editor.wwT, i, v) })}
          />
          <ScoreGroup
            legend="Performance Tasks"
            scores={editor.pt}
            totals={editor.ptT}
            onScore={(i, v) => setEditor({ ...editor, pt: replaceAt(editor.pt, i, v) })}
            onTotal={(i, v) => setEditor({ ...editor, ptT: replaceAt(editor.ptT, i, v) })}
          />
          <fieldset className="mb-4">
            <legend className="label">Quarterly Assessment</legend>
            <div className="flex items-center gap-2">
              <input
                className="input w-24"
                inputMode="numeric"
                aria-label="Quarterly assessment score"
                value={editor.qa}
                onChange={(e) => setEditor({ ...editor, qa: e.target.value })}
              />
              <span className="text-slate-500">/</span>
              <input
                className="input w-24"
                inputMode="numeric"
                aria-label="Quarterly assessment highest possible score"
                value={editor.qaT}
                onChange={(e) => setEditor({ ...editor, qaT: e.target.value })}
              />
            </div>
          </fieldset>

          <LivePreview editor={editor} weightGroup={subject.weightGroup} />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={async () => {
                if (!session) return;
                await saveGrade(session, editor.record, {
                  studentId: editor.student.id,
                  subjectId: subject.id,
                  quarter,
                  writtenWork: nums(editor.ww),
                  writtenWorkTotals: nums(editor.wwT),
                  performanceTasks: nums(editor.pt),
                  performanceTaskTotals: nums(editor.ptT),
                  quarterlyAssessment: Number(editor.qa) || 0,
                  quarterlyAssessmentTotal: Number(editor.qaT) || 0,
                });
                setNotice(`Saved locally ✓ — ${fullName(editor.student)} (Q${quarter} ${subject.name})`);
                setEditor(null);
              }}
            >
              <Icon name="check" className="h-5 w-5" />
              Save locally
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditor(null)}>
              Cancel
            </button>
          </div>
        </Card>
      )}
    </>
  );
}

function replaceAt(arr: string[], index: number, value: string): string[] {
  const next = [...arr];
  next[index] = value;
  return next;
}

function ScoreGroup({
  legend,
  scores,
  totals,
  onScore,
  onTotal,
}: {
  legend: string;
  scores: string[];
  totals: string[];
  onScore: (index: number, value: string) => void;
  onTotal: (index: number, value: string) => void;
}) {
  return (
    <fieldset className="mb-4">
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-3">
        {scores.map((score, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              className="input w-20"
              inputMode="numeric"
              aria-label={`${legend} ${i + 1} score`}
              value={score}
              onChange={(e) => onScore(i, e.target.value)}
            />
            <span className="text-slate-400">/</span>
            <input
              className="input w-20"
              inputMode="numeric"
              aria-label={`${legend} ${i + 1} highest possible score`}
              value={totals[i] ?? ''}
              onChange={(e) => onTotal(i, e.target.value)}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function LivePreview({
  editor,
  weightGroup,
}: {
  editor: EditorState;
  weightGroup: Parameters<typeof computeQuarter>[1];
}) {
  const computed = computeQuarter(
    {
      writtenWork: nums(editor.ww),
      writtenWorkTotals: nums(editor.wwT),
      performanceTasks: nums(editor.pt),
      performanceTaskTotals: nums(editor.ptT),
      quarterlyAssessment: Number(editor.qa) || 0,
      quarterlyAssessmentTotal: Number(editor.qaT) || 0,
    },
    weightGroup,
  );
  return (
    <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
      <p>WW: <b>{computed.wwPs.toFixed(2)}%</b> → WS <b>{computed.wwWs.toFixed(2)}</b></p>
      <p>PT: <b>{computed.ptPs.toFixed(2)}%</b> → WS <b>{computed.ptWs.toFixed(2)}</b></p>
      <p>QA: <b>{computed.qaPs.toFixed(2)}%</b> → WS <b>{computed.qaWs.toFixed(2)}</b></p>
      <p className="sm:col-span-3">
        Initial grade <b>{computed.initialGrade.toFixed(2)}</b> → transmuted quarterly grade{' '}
        <b className={computed.quarterlyGrade >= 75 ? 'text-emerald-700' : 'text-rose-700'}>
          {computed.quarterlyGrade}
        </b>{' '}
        ({computed.descriptor})
      </p>
    </div>
  );
}
