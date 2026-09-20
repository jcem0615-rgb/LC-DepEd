'use client';

import Link from 'next/link';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb } from '@/lib/db';
import {
  alertsFor,
  attendanceSummary,
  gateEventsForStudent,
  reportCard,
  studentForUser,
} from '@/lib/queries';
import { formatDateTime, fullName, timeAgo } from '@/lib/format';
import { Badge, Card, EmptyState, Loading, PageHeader, StatTile } from '@/components/ui';
import { BarChart } from '@/components/charts';
import { Icon } from '@/components/icons';

export default function StudentDashboard() {
  const { session, t } = useSession();
  const userId = session?.userId ?? '';

  const { data, loading } = useLiveData(async () => {
    if (!userId) return null;
    const student = await studentForUser(userId);
    if (!student) return null;
    const [card, attendance, gates, alerts, section] = await Promise.all([
      reportCard(student.id),
      attendanceSummary(student.sectionId),
      gateEventsForStudent(student.id, 5),
      alertsFor(userId),
      getDb().sections.get(student.sectionId),
    ]);
    return {
      student,
      card,
      attendance: attendance.find((a) => a.student.id === student.id) ?? null,
      gates,
      alerts,
      section: section ?? null,
    };
  }, [userId]);

  if (loading) return <Loading rows={5} />;
  if (!data) {
    return <EmptyState title="No learner record is linked to this account." />;
  }

  const chart = data.card.rows.map((row) => ({
    label: row.subject.name.slice(0, 4),
    value: row.final,
  }));

  return (
    <>
      <PageHeader
        title={`${t('welcome_back')}, ${data.student.firstName}!`}
        description={`${data.section?.name ?? `Grade ${data.student.gradeLevel}`} • LRN ${data.student.lrn}`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t('general_average')} value={data.card.average || '—'} hint={data.card.remark} />
        <StatTile
          label="Attendance"
          value={data.attendance ? `${data.attendance.rate.toFixed(0)}%` : '—'}
          hint={data.attendance ? `${data.attendance.present} of ${data.attendance.days} days` : ''}
          tone={(data.attendance?.rate ?? 0) >= 90 ? 'success' : 'warning'}
        />
        <StatTile
          label="Recognition"
          value={data.card.honors ?? '—'}
          hint={data.card.honors ? 'DO 36, s. 2016' : 'Keep going!'}
          tone={data.card.honors ? 'success' : 'neutral'}
        />
        <StatTile label="Subjects" value={data.card.rows.length} hint="Learning areas this year" tone="info" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card title="Final grades by learning area" className="lg:col-span-2">
          {chart.some((c) => c.value > 0) ? (
            <BarChart data={chart} suffix="" />
          ) : (
            <EmptyState title="No grades posted yet." />
          )}
          <Link href="/student/grades" className="btn btn-sm btn-secondary mt-3 inline-flex">
            View full report card
          </Link>
        </Card>

        <div className="space-y-4">
          <Card title="My e-ID">
            <p className="text-sm text-slate-600">
              Show your rotating QR code at the gate. Your guardian is notified instantly — no SMS load
              required.
            </p>
            <Link href="/student/eid" className="btn-primary mt-3 w-full">
              <Icon name="qr" className="h-5 w-5" />
              Open my e-ID
            </Link>
          </Card>

          <Card title="Recent gate activity">
            {data.gates.length === 0 ? (
              <EmptyState title="No scans recorded yet." />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.gates.map((g) => (
                  <li key={g.id} className="flex items-center gap-2">
                    <Badge tone={g.direction === 'in' ? 'success' : 'neutral'}>
                      {g.direction === 'in' ? t('entry') : t('exit')}
                    </Badge>
                    <span className="text-slate-600">{formatDateTime(g.timestamp)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Notifications">
            {data.alerts.length === 0 ? (
              <EmptyState title={t('no_data')} />
            ) : (
              <ul className="space-y-2 text-sm">
                {data.alerts.slice(0, 4).map((a) => (
                  <li key={a.id}>
                    <p className="font-semibold text-ink">{a.title}</p>
                    <p className="text-xs text-slate-500">{a.body} • {timeAgo(a.timestamp)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">Signed in as {fullName(data.student)}</p>
    </>
  );
}
