'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { can } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { verifyEid, type VerifyResult } from '@/lib/eid';
import { recentGateEvents, recordGateEvent, studentByLrn } from '@/lib/queries';
import { logAudit } from '@/lib/audit';
import { showNotification } from '@/lib/push';
import { formatTime, fullName } from '@/lib/format';
import { Badge, Banner, EmptyState, Loading } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { GateDirection, Student } from '@/lib/types';

interface ScanOutcome {
  ok: boolean;
  headline: string;
  detail: string;
  student?: Student;
  at: number;
}

/** Short audio-visual confirmation so gate staff can work without reading the screen. */
function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);
  return useCallback((ok: boolean) => {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      if (!ctxRef.current) ctxRef.current = new Ctor();
      const ctx = ctxRef.current;
      void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = ok ? 'sine' : 'square';
      osc.frequency.setValueAtTime(ok ? 880 : 220, ctx.currentTime);
      if (ok) osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch {
      /* audio is a nicety, never a blocker */
    }
  }, []);
}

export default function ScannerPage() {
  const { session, ready } = useSession();
  const chime = useChime();
  const [direction, setDirection] = useState<GateDirection>('in');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [manual, setManual] = useState('');
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const lastPayload = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  const { data: recent } = useLiveData(async () => {
    const [events, students] = await Promise.all([recentGateEvents(12), getDb().students.toArray()]);
    return { events, byId: new Map(students.map((s) => [s.id, s])) };
  }, []);

  const handlePayload = useCallback(
    async (payload: string) => {
      const now = Date.now();
      // Debounce: the camera fires many frames for the same code.
      if (payload === lastPayload.current.value && now - lastPayload.current.at < 4000) return;
      lastPayload.current = { value: payload, at: now };

      const result: VerifyResult = await verifyEid(payload, async (lrn) => {
        const student = await studentByLrn(lrn);
        return student?.qrSecret;
      });

      if (!result.ok) {
        const reasons: Record<string, string> = {
          malformed: 'That code is not an LC-DepEd e-ID.',
          unknown_learner: 'No learner in this school matches that LRN.',
          bad_signature: 'Signature check failed — the code may be forged.',
        };
        chime(false);
        setOutcome({
          ok: false,
          headline: 'Scan rejected',
          detail: reasons[result.reason] ?? 'Verification failed.',
          at: now,
        });
        if (session) {
          void logAudit({
            actorId: session.userId,
            actorRole: session.role,
            action: 'GATE_SCAN_REJECTED',
            target: result.reason,
            tenantId: session.tenantId,
            outcome: 'denied',
          });
        }
        return;
      }

      const student = await studentByLrn(result.lrn);
      if (!student) return;
      await recordGateEvent({ student, direction, method: 'qr' });
      void showNotification(
        `${student.firstName} ${direction === 'in' ? 'entered' : 'left'} the school`,
        'Main Gate • verified e-ID',
        `gate-${student.id}`,
      );
      if (session) {
        void logAudit({
          actorId: session.userId,
          actorRole: session.role,
          action: direction === 'in' ? 'GATE_ENTRY' : 'GATE_EXIT',
          target: student.id,
          tenantId: session.tenantId,
          piiAccessed: true,
        });
      }
      chime(true);
      setOutcome({
        ok: true,
        headline: `${direction === 'in' ? 'Entry' : 'Exit'} recorded`,
        detail: `${fullName(student)} • guardian notified`,
        student,
        at: now,
      });
    },
    [chime, direction, session],
  );

  const stopCamera = useCallback(async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    if (!instance) return;
    try {
      await instance.stop();
      instance.clear();
    } catch {
      /* already stopped */
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const instance = new Html5Qrcode('scanner-view', { verbose: false });
      scannerRef.current = instance as unknown as { stop: () => Promise<void>; clear: () => void };
      await instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded: string) => void handlePayload(decoded),
        () => undefined,
      );
      setScanning(true);
    } catch (err) {
      scannerRef.current = null;
      setScanning(false);
      setCameraError(
        err instanceof Error && /permission|NotAllowed/i.test(err.message)
          ? 'Camera permission was denied. Use manual entry below, or allow the camera in your browser settings.'
          : 'No camera is available on this device. Use manual entry below.',
      );
    }
  }, [handlePayload]);

  useEffect(() => () => void stopCamera(), [stopCamera]);

  if (!ready) return <div className="grid min-h-screen place-items-center text-slate-500">Loading…</div>;

  if (!session || !can(session.role, 'gate:scan')) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-900 p-6">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center">
          <h1 className="text-xl font-extrabold text-ink">Gate scanner</h1>
          <p className="mt-2 text-sm text-slate-600">
            {session
              ? 'Your role does not have the gate:scan permission. Sign in as a teacher, school head or super admin.'
              : 'Sign in with a teacher, school head or super admin account to operate the gate kiosk.'}
          </p>
          <Link href="/login" className="btn-primary mt-4 inline-flex">Go to sign in</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900 p-4 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link href="/" className="btn btn-sm border-2 border-white/30 text-white">
            <Icon name="home" className="h-4 w-4" />
            Exit kiosk
          </Link>
          <h1 className="text-xl font-extrabold">Gate scanner</h1>
          <span className="ml-auto">
            <Badge tone={scanning ? 'success' : 'neutral'}>{scanning ? 'Camera live' : 'Camera idle'}</Badge>
          </span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          {(['in', 'out'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`min-h-[4rem] rounded-2xl text-lg font-extrabold transition ${
                direction === d
                  ? d === 'in'
                    ? 'bg-emerald-500 text-slate-900'
                    : 'bg-amber-400 text-slate-900'
                  : 'border-2 border-white/25 text-white'
              }`}
            >
              {d === 'in' ? 'ENTRY' : 'EXIT'}
            </button>
          ))}
        </div>

        {outcome && (
          <div
            className={`mb-4 rounded-2xl p-5 text-center ${
              outcome.ok ? 'bg-emerald-500 text-slate-900' : 'bg-rose-600 text-white'
            }`}
            role="status"
            aria-live="assertive"
          >
            <p className="text-2xl font-extrabold">{outcome.headline}</p>
            <p className="mt-1 text-base font-semibold">{outcome.detail}</p>
            <p className="mt-1 text-sm opacity-80">{formatTime(outcome.at)}</p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-black p-3">
            <div id="scanner-view" className="mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-slate-800" />
            <div className="mt-3 flex flex-wrap gap-2">
              {!scanning ? (
                <button type="button" className="btn bg-white text-slate-900" onClick={() => void startCamera()}>
                  <Icon name="scan" className="h-5 w-5" />
                  Start camera
                </button>
              ) : (
                <button
                  type="button"
                  className="btn border-2 border-white/30 text-white"
                  onClick={async () => {
                    await stopCamera();
                    setScanning(false);
                  }}
                >
                  Stop camera
                </button>
              )}
            </div>
            {cameraError && (
              <p className="mt-3 rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-900">
                {cameraError}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-4 text-ink">
              <h2 className="font-bold">Manual entry</h2>
              <p className="mt-1 text-sm text-slate-600">
                Paste a scanned payload, or type a 12-digit LRN to record a manual override.
              </p>
              <form
                className="mt-3 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const value = manual.trim();
                  if (!value) return;
                  if (/^\d{12}$/.test(value)) {
                    const student = await studentByLrn(value);
                    if (!student) {
                      chime(false);
                      setOutcome({ ok: false, headline: 'Scan rejected', detail: 'No learner with that LRN.', at: Date.now() });
                    } else {
                      await recordGateEvent({ student, direction, method: 'manual' });
                      chime(true);
                      setOutcome({
                        ok: true,
                        headline: `${direction === 'in' ? 'Entry' : 'Exit'} recorded (manual)`,
                        detail: `${fullName(student)} • guardian notified`,
                        student,
                        at: Date.now(),
                      });
                    }
                  } else {
                    await handlePayload(value);
                  }
                  setManual('');
                }}
              >
                <label className="sr-only" htmlFor="manual">e-ID payload or LRN</label>
                <input
                  id="manual"
                  className="input"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="LCD1|136001200001|… or 136001200001"
                />
                <button type="submit" className="btn-primary">Record</button>
              </form>
            </div>

            <div className="rounded-2xl bg-white p-4 text-ink">
              <h2 className="font-bold">Recent scans</h2>
              {!recent ? (
                <Loading rows={3} />
              ) : recent.events.length === 0 ? (
                <EmptyState title="No scans yet today." />
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {recent.events.map((e) => {
                    const student = recent.byId.get(e.studentId);
                    return (
                      <li key={e.id} className="flex items-center gap-2 py-2">
                        <Badge tone={e.direction === 'in' ? 'success' : 'neutral'}>
                          {e.direction === 'in' ? 'IN' : 'OUT'}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {student ? fullName(student) : e.lrn}
                        </span>
                        <span className="text-xs text-slate-500">{formatTime(e.timestamp)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm">
          <Banner tone="info">
            Each learner carries one permanent code. Scans are verified offline against the
            learner&apos;s HMAC secret; guardians receive a free Web Push notification the moment a
            scan is recorded.
          </Banner>
        </div>
      </div>
    </main>
  );
}
