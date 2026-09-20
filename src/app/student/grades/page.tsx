'use client';

import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import { getDb } from '@/lib/db';
import { attendanceSummary, reportCard, studentForUser } from '@/lib/queries';
import { printSection } from '@/lib/export';
import { Card, EmptyState, Loading, PageHeader } from '@/components/ui';
import { FormHeader, SF9Card } from '@/components/school-forms';
import { Icon } from '@/components/icons';

export default function StudentGradesPage() {
  const { session } = useSession();
  const userId = session?.userId ?? '';

  const { data, loading } = useLiveData(async () => {
    if (!userId) return null;
    const student = await studentForUser(userId);
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
  }, [userId]);

  if (loading) return <Loading rows={6} />;
  if (!data) return <EmptyState title="No learner record is linked to this account." />;

  return (
    <>
      <PageHeader
        title="Report card (SF9)"
        description="Quarterly grades computed with the DepEd Order No. 8, s. 2015 transmutation table."
        actions={
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => printSection('sf9')}>
            <Icon name="document" className="h-4 w-4" />
            Print / Save as PDF
          </button>
        }
      />
      <Card id="sf9">
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
    </>
  );
}
