'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData, notifyChange } from '@/lib/store';
import { getDb } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { Badge, Banner, Card, Loading, PageHeader, ProgressBar, Toggle } from '@/components/ui';
import type { FeatureFlag } from '@/lib/types';

export default function FlagsPage() {
  const { session } = useSession();
  const [notice, setNotice] = useState<string | null>(null);

  const { data: flags, loading } = useLiveData(async () => getDb().featureFlags.toArray(), []);

  async function toggle(flag: FeatureFlag, enabled: boolean) {
    if (!session) return;
    await getDb().featureFlags.update(flag.key, { enabled });
    await logAudit({
      actorId: session.userId,
      actorRole: session.role,
      action: enabled ? 'FLAG_ENABLE' : 'FLAG_DISABLE',
      target: flag.key,
      tenantId: null,
    });
    notifyChange();
    setNotice(`${flag.label} is now ${enabled ? 'enabled' : 'disabled'} system-wide.`);
  }

  async function setRollout(flag: FeatureFlag, rollout: number) {
    await getDb().featureFlags.update(flag.key, { rollout });
    notifyChange();
  }

  return (
    <>
      <PageHeader
        title="Feature flags"
        description="Roll capabilities out gradually across tenants — useful when a curriculum update or a new scanner mode needs a staged release."
      />

      {notice && (
        <div className="mb-4">
          <Banner tone="success">{notice}</Banner>
        </div>
      )}

      {loading || !flags ? (
        <Loading rows={5} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {flags.map((flag) => (
            <Card key={flag.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{flag.label}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{flag.key}</p>
                  <p className="mt-2 text-sm text-slate-600">{flag.description}</p>
                </div>
                <Toggle
                  checked={flag.enabled}
                  label={`Toggle ${flag.label}`}
                  onChange={(next) => void toggle(flag, next)}
                />
              </div>

              <div className="mt-4">
                <p className="mb-1 flex items-center justify-between text-sm font-semibold text-slate-700">
                  <span>Rollout</span>
                  <Badge tone={flag.enabled ? 'success' : 'neutral'}>{flag.rollout}% of tenants</Badge>
                </p>
                <ProgressBar value={flag.rollout} tone={flag.enabled ? 'brand' : 'neutral'} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={flag.rollout}
                  aria-label={`${flag.label} rollout percentage`}
                  className="mt-2 w-full"
                  onChange={(e) => void setRollout(flag, Number(e.target.value))}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
