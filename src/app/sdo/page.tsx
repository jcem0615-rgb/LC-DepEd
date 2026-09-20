'use client';

import { useLiveData } from '@/lib/store';
import { divisionAnalytics } from '@/lib/queries';

import { XlsxButton } from '@/components/export-buttons';
import { compactNumber, maskLrn } from '@/lib/format';
import { getDb } from '@/lib/db';
import { Badge, Banner, Card, Loading, PageHeader, StatTile } from '@/components/ui';
import { BarChart, Donut } from '@/components/charts';

export default function SdoAnalyticsPage() {
  const { data, loading } = useLiveData(async () => {
    const analytics = await divisionAnalytics();
    const atRisk = analytics.atRiskIds.length
      ? await getDb().students.bulkGet(analytics.atRiskIds)
      : [];
    return { analytics, atRisk: atRisk.filter(Boolean) };
  }, []);

  if (loading || !data) return <Loading rows={6} />;
  const a = data.analytics;

  const enrollmentBySchool = a.tenants.map((t) => ({
    label: t.name.split(' ')[0],
    value: t.enrollment,
  }));

  const intakeSegments = [
    { label: 'Validated', value: a.validated, color: '#059669' },
    { label: 'Flagged', value: a.flagged, color: '#f59e0b' },
    { label: 'Rejected', value: a.rejected, color: '#e11d48' },
    { label: 'Pending', value: a.pending, color: '#64748b' },
  ];

  return (
    <>
      <PageHeader
        title="Division analytics"
        description="Live enrolment, attendance and dropout-risk indicators across every school reporting to this division."
        actions={
          <XlsxButton
            label="Export division report"
            build={() => ({
              filename: 'division-report',
              title: 'Division analytics',
              subtitle: 'Enrolment, intake status and anonymised dropout risk',
              sheets: [
                {
                  name: 'Enrolment',
                  columns: [
                    { header: 'School ID' }, { header: 'School' }, { header: 'Division' },
                    { header: 'Region' }, { header: 'District' },
                    { header: 'Enrolment', align: 'right' }, { header: 'Status' },
                  ],
                  rows: a.tenants.map((t) => [
                    t.schoolId, t.name, t.division, t.region, t.district, t.enrollment, t.status,
                  ]),
                  totals: ['', '', '', '', 'TOTAL', a.enrollment, ''],
                },
                {
                  name: 'Report intake',
                  columns: [
                    { header: 'School' }, { header: 'Report type' }, { header: 'Period' },
                    { header: 'Rows', align: 'right' }, { header: 'Status' }, { header: 'Findings' },
                  ],
                  rows: a.reports.map((r) => [
                    r.schoolName, r.type, r.period, r.rows, r.status, r.findings.join('; '),
                  ]),
                },
                {
                  name: 'Dropout risk',
                  columns: [
                    { header: 'Masked LRN' }, { header: 'Grade', align: 'right' },
                    { header: 'Sex', align: 'center' }, { header: 'Risk driver' },
                    { header: 'Recommended action' },
                  ],
                  rows: data.atRisk.map((s) => [
                    maskLrn(s!.lrn), s!.gradeLevel, s!.sex, 'Chronic absence',
                    'Home visit + Project SPEED referral',
                  ]),
                  notes: ['Learner identifiers are masked under RA 10173 — division staff see risk, not identities.'],
                },
              ],
            })}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Schools reporting" value={a.tenants.length} hint="Across the division" />
        <StatTile label="Total enrolment" value={compactNumber(a.enrollment)} tone="info" hint="Consolidated SF1 rollup" />
        <StatTile
          label="Attendance rate"
          value={`${a.attendanceRate.toFixed(1)}%`}
          tone={a.attendanceRate >= 90 ? 'success' : 'warning'}
          hint="Sampled from synced SF2 data"
        />
        <StatTile
          label="Learners at risk"
          value={a.atRiskCount}
          tone={a.atRiskCount ? 'danger' : 'success'}
          hint="4+ absences in the reporting window"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card title="Enrolment by school" className="lg:col-span-2">
          <BarChart data={enrollmentBySchool} />
        </Card>
        <Card title="Report intake status">
          <Donut segments={intakeSegments} />
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Dropout-risk watchlist (SARDO)"
        subtitle="Learner identifiers are masked — division staff see risk, not identities."
      >
        <div className="mb-3">
          <Banner tone="info">
            PII anonymisation is applied automatically to division-level reports under RA 10173.
            Unmasking requires a school-level account with a documented lawful purpose.
          </Banner>
        </div>
        {data.atRisk.length === 0 ? (
          <p className="text-sm text-slate-500">No learners currently breach the absence threshold.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Masked LRN</th>
                  <th>Grade</th>
                  <th>Sex</th>
                  <th>Risk driver</th>
                  <th>Recommended action</th>
                </tr>
              </thead>
              <tbody>
                {data.atRisk.map((s) => (
                  <tr key={s!.id}>
                    <td className="font-mono text-xs">{maskLrn(s!.lrn)}</td>
                    <td>{s!.gradeLevel}</td>
                    <td>{s!.sex}</td>
                    <td>
                      <Badge tone="warning">Chronic absence</Badge>
                    </td>
                    <td className="text-xs">Home visit + Project SPEED referral</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
