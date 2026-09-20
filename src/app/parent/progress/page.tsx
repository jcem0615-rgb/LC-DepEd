'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb } from '@/lib/db';
import { attendanceSummary, childrenForUser, reportCard } from '@/lib/queries';
import { logAudit } from '@/lib/audit';
import { printSection } from '@/lib/export';
import { fullName } from '@/lib/format';
import { Card, EmptyState, Loading, PageHeader } from '@/components/ui';
import { FormHeader, SF9Card } from '@/components/school-forms';
import { Icon } from '@/components/icons';

export default function ParentProgressPage() {
  const { session, t } = useSession();
  const userId = session?.userId ?? '';
  const [childId, setChildId] = useState('');

  const { data: children } = useLiveData(
    async () => (userId ? childrenForUser(userId) : []),
    [userId],
  );

  useEffect(() => {
    if (children?.length && !childId) setChildId(children[0].id);
  }, [children, childId]);

  const { data, loading } = useLiveData(async () => {
    if (!childId) return null;
    const student = await getDb().students.get(childId);
    if (!student) return null;
    const [card, attendance, section, tenant] = await Promise.all([
      reportCard(student.id),
      attendanceSummary(student.sectionId),
      getDb().sections.get(student.sectionId),
      getDb().tenants.get(student.tenantId),
    ]);
    return {
      student,
      card,
      attendance: attendance.find((a) => a.student.id === student.id) ?? null,
      section: section ?? null,
      tenant: tenant ?? null,
    };
  }, [childId]);

  useEffect(() => {
    if (session && childId) {
      void logAudit({
        actorId: session.userId,
        actorRole: session.role,
        action: 'SF9_VIEW',
        target: childId,
        tenantId: session.tenantId,
        piiAccessed: true,
      });
    }
  }, [session, childId]);

  if (!children?.length) return <EmptyState title="No learners are linked to this account." />;

  return (
    <>
      <PageHeader
        title={t('report_card')}
        description="The same SF9 your child's adviser signs — viewable offline once opened."
        actions={
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => printSection('parent-sf9')}>
            <Icon name="document" className="h-4 w-4" />
            {t('print')}
          </button>
        }
      />

      <Card className="mb-4">
        <label className="label" htmlFor="child">{t('child')}</label>
        <select id="child" className="input sm:max-w-sm" value={childId} onChange={(e) => setChildId(e.target.value)}>
          {children.map((c) => (
            <option key={c.id} value={c.id}>{fullName(c)}</option>
          ))}
        </select>
      </Card>

      {loading || !data ? (
        <Loading rows={6} />
      ) : (
        <Card id="parent-sf9">
          <FormHeader code="SF9" title="Learner Progress Report Card" tenant={data.tenant} section={data.section} />
          <SF9Card
            student={data.student}
            rows={data.card.rows}
            average={data.card.average}
            honors={data.card.honors}
            remark={data.card.remark}
            attendance={data.attendance}
          />
        </Card>
      )}
    </>
  );
}
