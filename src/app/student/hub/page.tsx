'use client';

import { useState } from 'react';
import { useLiveData, notifyChange, useOnlineStatus } from '@/lib/store';
import { getDb } from '@/lib/db';
import { Badge, Banner, Card, EmptyState, Loading, PageHeader, Toggle } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { LearningResource } from '@/lib/types';

export default function LearningHubPage() {
  const online = useOnlineStatus();
  const [open, setOpen] = useState<LearningResource | null>(null);
  const [subject, setSubject] = useState('all');

  const { data: resources, loading } = useLiveData(async () => getDb().resources.toArray(), []);

  const subjects = ['all', ...new Set((resources ?? []).map((r) => r.subject))];
  const filtered = (resources ?? []).filter((r) => subject === 'all' || r.subject === subject);
  const cachedKb = (resources ?? [])
    .filter((r) => r.cachedOffline)
    .reduce((a, r) => a + r.sizeKb, 0);

  async function toggleCache(resource: LearningResource, next: boolean) {
    await getDb().resources.update(resource.id, { cachedOffline: next });
    notifyChange();
    if (open?.id === resource.id) setOpen({ ...open, cachedOffline: next });
  }

  return (
    <>
      <PageHeader
        title="Digital Learning Hub"
        description="Self-Learning Kits and DepEd modules kept on the device. Anything marked offline opens with no data connection."
      />

      <div className="mb-4">
        <Banner tone={online ? 'info' : 'warning'}>
          {online
            ? `${cachedKb} KB of learning materials are stored offline on this device.`
            : 'You are offline — only materials saved to this device can be opened.'}
        </Banner>
      </div>

      <Card className="mb-4">
        <label className="label" htmlFor="subj">Learning area</label>
        <select id="subj" className="input sm:max-w-xs" value={subject} onChange={(e) => setSubject(e.target.value)}>
          {subjects.map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All learning areas' : s}</option>
          ))}
        </select>
      </Card>

      {loading ? (
        <Loading rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No materials for this learning area yet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((resource) => (
            <Card key={resource.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{resource.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {resource.subject} • Grade {resource.gradeLevel} • {resource.sizeKb} KB
                  </p>
                  <p className="mt-2">
                    <Badge tone={resource.cachedOffline ? 'success' : 'neutral'}>
                      {resource.kind}
                    </Badge>
                  </p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Toggle
                    checked={resource.cachedOffline}
                    label={`Keep ${resource.title} offline`}
                    onChange={(next) => void toggleCache(resource, next)}
                  />
                  <span className="text-[11px] font-semibold text-slate-500">Offline</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-secondary mt-3"
                disabled={!online && !resource.cachedOffline}
                onClick={() => setOpen(resource)}
              >
                <Icon name="book" className="h-4 w-4" />
                Open
              </button>
            </Card>
          ))}
        </div>
      )}

      {open && (
        <Card
          className="mt-4 border-2 border-deped-300"
          title={open.title}
          subtitle={`${open.kind} • ${open.subject} • Grade ${open.gradeLevel}`}
          action={
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(null)}>
              Close
            </button>
          }
        >
          <p className="text-sm leading-relaxed text-slate-700">{open.body}</p>
        </Card>
      )}
    </>
  );
}
