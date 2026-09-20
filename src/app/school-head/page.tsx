'use client';

import Link from 'next/link';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb } from '@/lib/db';
import { attendanceTrend, schoolOverview } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, EmptyState, Loading, PageHeader, StatTile } from '@/components/ui';
import { Donut, LineChart } from '@/components/charts';
import { Icon } from '@/components/icons';

export default function SchoolHeadDashboard() {
  const { session } = useSession();
  const tenantId = session?.tenantId ?? '';

  const { data, loading } = useLiveData(async () => {
    if (!tenantId) return null;
    const db = getDb();
    const [overview, forms, tasks, sections, tenant] = await Promise.all([
      schoolOverview(tenantId),
      db.forms.where('tenantId').equals(tenantId).toArray(),
      db.ntpTasks.where('tenantId').equals(tenantId).toArray(),
      db.sections.where('tenantId').equals(tenantId).toArray(),
      db.tenants.get(tenantId),
    ]);
    const trend = sections.length ? await attendanceTrend(sections[0].id, 10) : [];
    return { overview, forms, tasks, trend, tenant: tenant ?? null };
  }, [tenantId]);

  if (loading || !data) return <Loading rows={5} />;

  const pending = data.forms.filter((f) => f.status === 'submitted');
  const taskSegments = [
    { label: 'Open', value: data.tasks.filter((t) => t.status === 'open').length, color: '#f59e0b' },
    { label: 'In progress', value: data.tasks.filter((t) => t.status === 'in_progress').length, color: '#0284c7' },
    { label: 'Done', value: data.tasks.filter((t) => t.status === 'done').length, color: '#059669' },
  ];

  return (
    <>
      <PageHeader
        title={data.tenant?.name ?? 'School dashboard'}
        description={`${data.tenant?.division ?? ''} • School ID ${data.tenant?.schoolId ?? '—'}`}
        actions={
          <Link href="/school-head/approvals" className="btn btn-sm bg-deped-700 text-white">
            <Icon name="check" className="h-4 w-4" />
            Approval hub ({pending.length})
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Learners" value={data.overview.learners} hint={`${data.overview.sections} sections`} />
        <StatTile
          label="Attendance today"
          value={`${data.overview.attendanceToday}%`}
          hint={`${data.overview.markedToday} learners marked`}
          tone={data.overview.attendanceToday >= 90 ? 'success' : 'warning'}
        />
        <StatTile
          label="Forms awaiting signature"
          value={pending.length}
          tone={pending.length ? 'warning' : 'success'}
          hint={`${data.overview.approvedForms} approved this year`}
        />
        <StatTile
          label="Open NTP tasks"
          value={data.overview.openTasks}
          tone="info"
          hint="Administrative work routed away from teachers"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card title="Attendance rate — last 10 school days" className="lg:col-span-2">
          {data.trend.length > 1 ? <LineChart data={data.trend} /> : <EmptyState title="Not enough data yet." />}
        </Card>

        <Card title="NTP task load" subtitle="DepEd Order No. 2, s. 2024">
          <Donut segments={taskSegments} />
        </Card>
      </div>

      <Card className="mt-4" title="Queue for approval" subtitle="Newest submissions first">
        {pending.length === 0 ? (
          <EmptyState title="Nothing awaiting your signature." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...pending]
              .sort((a, b) => b.submittedAt - a.submittedAt)
              .slice(0, 6)
              .map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Badge tone="brand">{f.type}</Badge>
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{f.title}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(f.submittedAt)}</span>
                </li>
              ))}
          </ul>
        )}
        <Link href="/school-head/approvals" className="btn btn-sm btn-secondary mt-3 inline-flex">
          Open the approval hub
        </Link>
      </Card>
    </>
  );
}
