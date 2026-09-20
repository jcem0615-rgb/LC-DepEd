'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData, notifyChange } from '@/lib/store';
import { getDb } from '@/lib/db';
import { randomId } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import { formatDate } from '@/lib/format';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader, StatTile } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { NtpCategory, NtpTask } from '@/lib/types';

const CATEGORIES: NtpCategory[] = ['DRRM', 'Feeding Program', 'Inventory', 'Records', 'Facilities', 'Finance'];
const ROLES: NtpTask['assignedRole'][] = ['AO', 'PDO', 'Registrar', 'Property Custodian'];
const STAFF = ['Mr. Allan Tiongco', 'Ms. Grace Ilagan', 'Mr. Rey Bautista', 'Ms. Lorna Aguilar'];

export default function NtpPage() {
  const { session } = useSession();
  const tenantId = session?.tenantId ?? '';
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<NtpCategory>('DRRM');
  const [assignedTo, setAssignedTo] = useState(STAFF[0]);
  const [assignedRole, setAssignedRole] = useState<NtpTask['assignedRole']>('PDO');
  const [due, setDue] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const { data: tasks, loading } = useLiveData(
    async () => (tenantId ? getDb().ntpTasks.where('tenantId').equals(tenantId).toArray() : []),
    [tenantId],
  );

  async function create() {
    if (!session || !title.trim()) return;
    const task: NtpTask = {
      id: randomId('ntp-'),
      title: title.trim(),
      category,
      assignedTo,
      assignedRole,
      status: 'open',
      due: due || new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      tenantId: session.tenantId ?? '',
      origin: 'school_head',
      createdAt: Date.now(),
    };
    await getDb().ntpTasks.put(task);
    await logAudit({
      actorId: session.userId,
      actorRole: session.role,
      action: 'NTP_TASK_ASSIGN',
      target: `${task.assignedRole}:${task.title}`,
      tenantId: session.tenantId,
    });
    notifyChange();
    setTitle('');
    setNotice(`Routed to ${assignedTo} (${assignedRole}).`);
  }

  async function advance(task: NtpTask) {
    const next = task.status === 'open' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'open';
    await getDb().ntpTasks.update(task.id, { status: next });
    notifyChange();
  }

  const offloaded = (tasks ?? []).filter((t) => t.origin === 'teacher_offload').length;
  const open = (tasks ?? []).filter((t) => t.status !== 'done').length;

  return (
    <>
      <PageHeader
        title="NTP task routing"
        description="DepEd Order No. 2, s. 2024 — administrative work belongs with Non-Teaching Personnel, not with teachers."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Tasks routed" value={tasks?.length ?? 0} hint="This school year" />
        <StatTile label="Offloaded from teachers" value={offloaded} tone="success" hint="Originally teacher paperwork" />
        <StatTile label="Still open" value={open} tone={open ? 'warning' : 'success'} />
      </div>

      {notice && (
        <div className="mb-4">
          <Banner tone="success">{notice}</Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Route a new task" className="lg:col-span-1">
          <div className="mb-3">
            <label className="label" htmlFor="ntitle">Task</label>
            <input
              id="ntitle"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Nutritional status encoding"
            />
          </div>
          <div className="mb-3">
            <label className="label" htmlFor="ncat">Category</label>
            <select id="ncat" className="input" value={category} onChange={(e) => setCategory(e.target.value as NtpCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="label" htmlFor="nstaff">Assign to</label>
            <select id="nstaff" className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              {STAFF.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="label" htmlFor="nrole">Role</label>
            <select
              id="nrole"
              className="input"
              value={assignedRole}
              onChange={(e) => setAssignedRole(e.target.value as NtpTask['assignedRole'])}
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="label" htmlFor="ndue">Due date</label>
            <input id="ndue" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <button type="button" className="btn-primary w-full" disabled={!title.trim()} onClick={() => void create()}>
            <Icon name="users" className="h-5 w-5" />
            Route task
          </button>
        </Card>

        <Card title="Routed tasks" className="lg:col-span-2">
          {loading ? (
            <Loading rows={5} />
          ) : !tasks?.length ? (
            <EmptyState title="No tasks routed yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...tasks]
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Badge tone="info">{task.category}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{task.title}</p>
                      <p className="text-xs text-slate-500">
                        {task.assignedTo} ({task.assignedRole}) • due {formatDate(task.due)}
                        {task.origin === 'teacher_offload' ? ' • offloaded from teachers' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => void advance(task)}
                    >
                      <Badge
                        tone={task.status === 'done' ? 'success' : task.status === 'in_progress' ? 'info' : 'warning'}
                      >
                        {task.status.replace('_', ' ')}
                      </Badge>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
