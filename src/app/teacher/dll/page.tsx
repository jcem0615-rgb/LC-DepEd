'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData, notifyChange } from '@/lib/store';
import { getDb } from '@/lib/db';
import { enqueue } from '@/lib/sync';
import { randomId } from '@/lib/crypto';
import { MATATAG_COMPETENCIES } from '@/data/seed';
import { formatDateTime } from '@/lib/format';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { LessonLog } from '@/lib/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const WEEKS = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6', 'Week 7', 'Week 8'];

const PROCEDURES = [
  'Review → Motivation → Presentation → Guided Practice → Independent Practice → Generalization',
  '4A: Activity → Analysis → Abstraction → Application',
  '5E: Engage → Explore → Explain → Elaborate → Evaluate',
  'Explicit instruction: I do → We do → You do',
];

const ASSESSMENTS = [
  '10-item formative quiz with differentiated tasks',
  'Performance task with rubric (group presentation)',
  'Exit ticket — 3-2-1 reflection',
  'Oral recitation and board work',
  'Portfolio entry / written output',
];

/** Web Speech API dictation — silently unavailable on unsupported browsers. */
function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    setSupported(Boolean(SR));
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = 'en-PH';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const text = Array.from(event.results)
        .map((r: any) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (text) onText(text);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      setListening(false);
      return;
    }
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return { listening, supported, toggle };
}

export default function DllPage() {
  const { session } = useSession();
  const userId = session?.userId ?? '';
  const [subjectId, setSubjectId] = useState('sub-math');
  const [competencyCode, setCompetencyCode] = useState('');
  const [week, setWeek] = useState('Week 3');
  const [day, setDay] = useState('Monday');
  const [objectives, setObjectives] = useState('');
  const [procedure, setProcedure] = useState(PROCEDURES[0]);
  const [assessment, setAssessment] = useState(ASSESSMENTS[0]);
  const [remarks, setRemarks] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const dictation = useDictation((text) =>
    setObjectives((prev) => (prev ? `${prev} ${text}` : text)),
  );

  const { data: subjects } = useLiveData(async () => getDb().subjects.toArray(), []);
  const { data: logs, loading } = useLiveData(
    async () => (userId ? getDb().lessonLogs.where('teacherId').equals(userId).toArray() : []),
    [userId],
  );

  const options = MATATAG_COMPETENCIES.filter((c) => c.subjectId === subjectId);

  useEffect(() => {
    setCompetencyCode(options[0]?.code ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const competency = options.find((c) => c.code === competencyCode);

  async function save() {
    if (!session || !competency) return;
    const log: LessonLog = {
      id: randomId('dll-'),
      teacherId: session.userId,
      tenantId: session.tenantId ?? '',
      subjectId,
      gradeLevel: 5,
      week,
      day,
      competencyCode: competency.code,
      competency: competency.text,
      objectives: objectives || `At the end of the lesson, learners can ${competency.text.toLowerCase()}.`,
      procedure,
      assessment,
      remarks,
      updatedAt: Date.now(),
      syncState: 'pending',
    };
    await getDb().lessonLogs.put(log);
    await enqueue('lessonLogs', 'create', log.id, log);
    notifyChange();
    setNotice('Lesson log saved locally ✓ — it will sync automatically.');
    setObjectives('');
    setRemarks('');
  }

  return (
    <>
      <PageHeader
        title="Daily Lesson Log builder"
        description="Pick a MATATAG / K-12 competency and the log writes itself. Dictate objectives with your voice when typing is slow on a phone."
      />

      {notice && (
        <div className="mb-4">
          <Banner tone="success">{notice}</Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="New lesson log">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="dsub">Learning area</label>
              <select id="dsub" className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {(subjects ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dcomp">Competency code</label>
              <select
                id="dcomp"
                className="input"
                value={competencyCode}
                onChange={(e) => setCompetencyCode(e.target.value)}
              >
                {options.length === 0 && <option value="">No competency seeded</option>}
                {options.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dweek">Week</label>
              <select id="dweek" className="input" value={week} onChange={(e) => setWeek(e.target.value)}>
                {WEEKS.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dday">Day</label>
              <select id="dday" className="input" value={day} onChange={(e) => setDay(e.target.value)}>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {competency && (
            <p className="mt-3 rounded-xl bg-deped-50 p-3 text-sm text-deped-900">
              <b>{competency.code}</b> — {competency.text}
            </p>
          )}

          <div className="mt-3">
            <label className="label" htmlFor="dobj">Objectives</label>
            <textarea
              id="dobj"
              className="input min-h-[7rem]"
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              placeholder={competency ? `At the end of the lesson, learners can ${competency.text.toLowerCase()}.` : ''}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`btn btn-sm ${dictation.listening ? 'bg-rose-600 text-white' : 'btn-secondary'}`}
                onClick={dictation.toggle}
                disabled={!dictation.supported}
              >
                <Icon name="sparkles" className="h-4 w-4" />
                {dictation.listening ? 'Listening… tap to stop' : 'Dictate objectives'}
              </button>
              {!dictation.supported && (
                <span className="text-xs text-slate-500">
                  Voice input is not available in this browser — typing works normally.
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="dproc">Procedure</label>
              <select id="dproc" className="input" value={procedure} onChange={(e) => setProcedure(e.target.value)}>
                {PROCEDURES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dass">Assessment</label>
              <select id="dass" className="input" value={assessment} onChange={(e) => setAssessment(e.target.value)}>
                {ASSESSMENTS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="label" htmlFor="drem">Reflection / remarks</label>
            <input
              id="drem"
              className="input"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. 3 learners need follow-up remediation"
            />
          </div>

          <button type="button" className="btn-primary mt-4 w-full" disabled={!competency} onClick={() => void save()}>
            <Icon name="check" className="h-5 w-5" />
            Save lesson log
          </button>
        </Card>

        <Card title="Saved lesson logs" subtitle="Stored on this device; synced in the background.">
          {loading ? (
            <Loading rows={4} />
          ) : !logs?.length ? (
            <EmptyState title="No lesson logs yet." />
          ) : (
            <ul className="space-y-3">
              {[...logs]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((log) => (
                  <li key={log.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{log.competencyCode}</Badge>
                      <span className="text-sm font-semibold text-ink">{log.week} • {log.day}</span>
                      {log.syncState === 'pending' && <Badge tone="warning">queued</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{log.competency}</p>
                    <p className="mt-1 text-xs text-slate-500">{log.objectives}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDateTime(log.updatedAt)}</p>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
