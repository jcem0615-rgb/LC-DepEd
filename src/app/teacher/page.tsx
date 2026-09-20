'use client';

import Link from 'next/link';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb } from '@/lib/db';
import {
  alertsFor,
  attendanceForDate,
  attendanceTrend,
  rosterForSection,
  schoolOverview,
  sectionsForTeacher,
} from '@/lib/queries';
import { lastSchoolDay, timeAgo, formatDate, greetingName } from '@/lib/format';
import { Card, PageHeader, StatTile, Loading, EmptyState, Badge, ProgressBar } from '@/components/ui';
import { LineChart } from '@/components/charts';
import { Icon } from '@/components/icons';

export default function TeacherDashboard() {
  const { session, user, t } = useSession();
  const userId = session?.userId ?? '';
  const tenantId = session?.tenantId ?? '';

  const { data, loading } = useLiveData(async () => {
    if (!userId) return null;
    const sections = await sectionsForTeacher(userId);
    const primary = sections[0];
    const today = lastSchoolDay();
    const [roster, marked, trend, overview, alerts, forms] = await Promise.all([
      primary ? rosterForSection(primary.id) : Promise.resolve([]),
      primary ? attendanceForDate(primary.id, today) : Promise.resolve({}),
      primary ? attendanceTrend(primary.id, 10) : Promise.resolve([]),
      tenantId ? schoolOverview(tenantId) : Promise.resolve(null),
      alertsFor(userId),
      getDb().forms.where('submittedBy').equals(userId).toArray(),
    ]);
    return { sections, primary, roster, marked, trend, overview, alerts, forms, today };
  }, [userId, tenantId]);

  if (loading || !data) {
    return (
      <>
        <PageHeader title={t('dashboard')} />
        <Loading rows={5} />
      </>
    );
  }

  const markedCount = Object.keys(data.marked).length;
  const rosterCount = data.roster.length;
  const completion = rosterCount ? (markedCount / rosterCount) * 100 : 0;
  const pendingForms = data.forms.filter((f) => f.status === 'draft' || f.status === 'returned');

  return (
    <>
      <PageHeader
        title={`${t('welcome_back')}, ${greetingName(user?.name ?? session?.name ?? '')}`}
        description={`${user?.position ?? 'Teacher'} • ${formatDate(Date.now(), { weekday: 'long', month: 'long', day: 'numeric' })}`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t('students')} value={rosterCount} hint={data.primary?.name ?? '—'} />
        <StatTile
          label="Attendance today"
          value={`${markedCount}/${rosterCount}`}
          hint={markedCount === rosterCount && rosterCount > 0 ? 'Complete' : 'Not yet complete'}
          tone={markedCount === rosterCount && rosterCount > 0 ? 'success' : 'warning'}
        />
        <StatTile
          label="Forms needing action"
          value={pendingForms.length}
          hint="Drafts and returned submissions"
          tone={pendingForms.length ? 'warning' : 'success'}
        />
        <StatTile
          label="School attendance"
          value={`${data.overview?.attendanceToday ?? 0}%`}
          hint={`${data.overview?.markedToday ?? 0} learners marked school-wide`}
          tone="info"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card
          title="Latest attendance"
          subtitle={data.primary ? `${data.primary.name} • ${data.today}` : 'No advisory section'}
          className="lg:col-span-2"
          action={
            <Link href="/teacher/attendance" className="btn btn-sm bg-deped-700 text-white">
              <Icon name="calendar" className="h-4 w-4" />
              Take attendance
            </Link>
          }
        >
          <ProgressBar value={completion} tone={completion === 100 ? 'success' : 'brand'} />
          <p className="mt-2 text-sm text-slate-600">
            {markedCount} of {rosterCount} learners marked. Records save to this device instantly and
            sync when a signal is available.
          </p>

          <h3 className="mb-2 mt-5 text-sm font-bold text-slate-700">Attendance rate — last 10 days</h3>
          {data.trend.length > 1 ? (
            <LineChart data={data.trend} />
          ) : (
            <EmptyState title="Not enough attendance history yet." />
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Quick actions">
            <div className="grid gap-2">
              <QuickLink href="/teacher/grades" icon="chart" label="Encode grades (DO 8 s.2015)" />
              <QuickLink href="/teacher/forms" icon="document" label="Generate School Forms" />
              <QuickLink href="/teacher/dll" icon="book" label="Build Daily Lesson Log" />
              <QuickLink href="/teacher/ipcrf" icon="clipboard" label="Update IPCRF portfolio" />
            </div>
          </Card>

          <Card title="Notifications">
            {data.alerts.length === 0 ? (
              <EmptyState title={t('no_data')} />
            ) : (
              <ul className="space-y-3">
                {data.alerts.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="mt-0.5">
                      <Badge tone={a.read ? 'neutral' : 'brand'}>{a.kind}</Badge>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{a.title}</p>
                      <p className="truncate text-xs text-slate-500">{a.body}</p>
                      <p className="text-xs text-slate-400">{timeAgo(a.timestamp)}</p>
                    </div>
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

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-touch items-center gap-3 rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-deped-400 hover:bg-deped-50"
    >
      <Icon name={icon} className="h-5 w-5 text-deped-700" />
      {label}
    </Link>
  );
}
