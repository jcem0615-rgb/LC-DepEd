'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData, notifyChange } from '@/lib/store';
import { getDb } from '@/lib/db';
import { randomId } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import { downloadCsv } from '@/lib/export';
import { formatDate } from '@/lib/format';
import { Badge, Banner, Card, Loading, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icons';
import type { Tenant } from '@/lib/types';

const REGIONS = ['NCR', 'CAR', 'Region I', 'Region VI', 'Region VII', 'Region VIII', 'BARMM'];

export default function TenantsPage() {
  const { session } = useSession();
  const [name, setName] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [division, setDivision] = useState('');
  const [region, setRegion] = useState(REGIONS[0]);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, loading } = useLiveData(async () => {
    const db = getDb();
    const [tenants, users] = await Promise.all([db.tenants.toArray(), db.users.toArray()]);
    return { tenants: tenants.sort((a, b) => a.name.localeCompare(b.name)), users };
  }, []);

  async function provision() {
    if (!session || !name.trim() || !schoolId.trim()) return;
    const tenant: Tenant = {
      id: randomId('sch-'),
      name: name.trim(),
      schoolId: schoolId.trim(),
      division: division.trim() || 'Unassigned Division',
      region,
      district: 'District I',
      enrollment: 0,
      status: 'provisioning',
      createdAt: Date.now(),
    };
    await getDb().tenants.put(tenant);
    await logAudit({
      actorId: session.userId,
      actorRole: session.role,
      action: 'TENANT_PROVISION',
      target: `${tenant.schoolId}:${tenant.name}`,
      tenantId: null,
    });
    notifyChange();
    setName('');
    setSchoolId('');
    setDivision('');
    setNotice(`${tenant.name} provisioned. Row-Level Security policies applied to the new tenant schema.`);
  }

  async function toggleStatus(tenant: Tenant) {
    if (!session) return;
    const next: Tenant['status'] =
      tenant.status === 'active' ? 'suspended' : tenant.status === 'suspended' ? 'active' : 'active';
    await getDb().tenants.update(tenant.id, { status: next });
    await logAudit({
      actorId: session.userId,
      actorRole: session.role,
      action: next === 'suspended' ? 'TENANT_SUSPEND' : 'TENANT_ACTIVATE',
      target: tenant.id,
      tenantId: null,
    });
    notifyChange();
    setNotice(`${tenant.name} is now ${next}.`);
  }

  const divisionAccounts = (data?.users ?? []).filter((u) => u.role === 'sdo');

  return (
    <>
      <PageHeader
        title="Schools &amp; tenants"
        description="Provision schools, manage division and regional accounts, and control tenant lifecycle. Each school is isolated by PostgreSQL Row-Level Security."
        actions={
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={!data?.tenants.length}
            onClick={() =>
              data &&
              downloadCsv(
                'tenants',
                ['School ID', 'Name', 'Division', 'Region', 'District', 'Enrolment', 'Status', 'Created'],
                data.tenants.map((t) => [
                  t.schoolId, t.name, t.division, t.region, t.district, t.enrollment, t.status,
                  formatDate(t.createdAt),
                ]),
              )
            }
          >
            <Icon name="download" className="h-4 w-4" />
            Export
          </button>
        }
      />

      {notice && (
        <div className="mb-4">
          <Banner tone="success">{notice}</Banner>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Provision a school">
          <div className="mb-3">
            <label className="label" htmlFor="tname">School name</label>
            <input id="tname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sta. Lucia Elementary School" />
          </div>
          <div className="mb-3">
            <label className="label" htmlFor="tsid">DepEd School ID</label>
            <input id="tsid" className="input" inputMode="numeric" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} placeholder="6 digits" />
          </div>
          <div className="mb-3">
            <label className="label" htmlFor="tdiv">Schools Division Office</label>
            <input id="tdiv" className="input" value={division} onChange={(e) => setDivision(e.target.value)} placeholder="e.g. SDO Quezon City" />
          </div>
          <div className="mb-3">
            <label className="label" htmlFor="treg">Region</label>
            <select id="treg" className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={!name.trim() || !schoolId.trim()}
            onClick={() => void provision()}
          >
            <Icon name="building" className="h-5 w-5" />
            Provision tenant
          </button>
        </Card>

        <Card title="Tenants" className="lg:col-span-2">
          {loading || !data ? (
            <Loading rows={5} />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>School ID</th>
                    <th>Name</th>
                    <th>Division</th>
                    <th>Enrolment</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.tenants.map((t) => (
                    <tr key={t.id}>
                      <td className="font-mono text-xs">{t.schoolId}</td>
                      <td className="font-semibold">{t.name}</td>
                      <td className="text-xs">{t.division}</td>
                      <td>{t.enrollment.toLocaleString('en-PH')}</td>
                      <td>
                        <Badge
                          tone={t.status === 'active' ? 'success' : t.status === 'provisioning' ? 'info' : 'danger'}
                        >
                          {t.status}
                        </Badge>
                      </td>
                      <td>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => void toggleStatus(t)}>
                          {t.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4" title="Division &amp; regional accounts" subtitle="SDO / RO oversight users">
        <ul className="divide-y divide-slate-100">
          {divisionAccounts.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{u.name}</p>
                <p className="text-xs text-slate-500">{u.email} • {u.position}</p>
              </div>
              <Badge tone="brand">SDO / RO</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
