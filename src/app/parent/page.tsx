'use client';

import Link from 'next/link';
import { useSession } from '@/components/providers';
import { useLiveData } from '@/lib/store';
import {
  alertsFor,
  attendanceSummary,
  childrenForUser,
  gateEventsForStudent,
  reportCard,
} from '@/lib/queries';
import { formatDateTime, fullName, timeAgo } from '@/lib/format';
import { Badge, Card, EmptyState, Loading, PageHeader, StatTile } from '@/components/ui';
import { Icon } from '@/components/icons';
import { LANGUAGES } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

export default function ParentDashboard() {
  const { session, t, lang, setLang } = useSession();
  const userId = session?.userId ?? '';

  const { data, loading } = useLiveData(async () => {
    if (!userId) return null;
    const children = await childrenForUser(userId);
    const details = await Promise.all(
      children.map(async (child) => {
        const [card, attendance, gates] = await Promise.all([
          reportCard(child.id),
          attendanceSummary(child.sectionId),
          gateEventsForStudent(child.id, 3),
        ]);
        return {
          child,
          card,
          attendance: attendance.find((a) => a.student.id === child.id) ?? null,
          gates,
        };
      }),
    );
    const alerts = await alertsFor(userId);
    return { details, alerts };
  }, [userId]);

  if (loading) return <Loading rows={5} />;
  if (!data || data.details.length === 0) {
    return <EmptyState title="No learners are linked to this guardian account." />;
  }

  const unread = data.alerts.filter((a) => !a.read).length;

  return (
    <>
      <PageHeader
        title={t('dashboard')}
        description="Gate arrivals, grades and adviser messages for your children."
        actions={
          <Link href="/parent/alerts" className="btn btn-sm bg-deped-700 text-white">
            <Icon name="bell" className="h-4 w-4" />
            {t('alerts')} {unread > 0 ? `(${unread})` : ''}
          </Link>
        }
      />

      <Card className="mb-4" title={t('language')} subtitle="1-tap dialect switch for the whole app">
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code as Lang)}
              className={`btn btn-sm ${lang === l.code ? 'bg-deped-700 text-white' : 'btn-secondary'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        {data.details.map(({ child, card, attendance, gates }) => (
          <Card key={child.id} title={fullName(child)} subtitle={`Grade ${child.gradeLevel} • LRN ${child.lrn}`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile label={t('general_average')} value={card.average || '—'} hint={card.remark} />
              <StatTile
                label="Attendance"
                value={attendance ? `${attendance.rate.toFixed(0)}%` : '—'}
                hint={attendance ? `${attendance.absent} absences recorded` : ''}
                tone={(attendance?.rate ?? 0) >= 90 ? 'success' : 'warning'}
              />
              <StatTile
                label="Recognition"
                value={card.honors ?? '—'}
                tone={card.honors ? 'success' : 'neutral'}
                hint={card.honors ? 'DO 36, s. 2016' : ''}
              />
            </div>

            <h3 className="mb-2 mt-4 text-sm font-bold text-slate-700">Latest gate activity</h3>
            {gates.length === 0 ? (
              <EmptyState title="No scans yet." />
            ) : (
              <ul className="space-y-2 text-sm">
                {gates.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2">
                    <Badge tone={g.direction === 'in' ? 'success' : 'neutral'}>
                      {g.direction === 'in' ? t('entry') : t('exit')}
                    </Badge>
                    <span className="text-slate-600">{formatDateTime(g.timestamp)}</span>
                    <span className="text-xs text-slate-400">{g.gate}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/parent/progress" className="btn btn-sm btn-secondary">
                {t('report_card')}
              </Link>
              <Link href="/parent/messages" className="btn btn-sm btn-secondary">
                {t('messages')}
              </Link>
            </div>
          </Card>
        ))}

        <Card title={t('alerts')}>
          {data.alerts.length === 0 ? (
            <EmptyState title={t('no_data')} />
          ) : (
            <ul className="space-y-2">
              {data.alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <Badge tone={a.read ? 'neutral' : 'brand'}>{a.kind}</Badge>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{a.title}</p>
                    <p className="text-xs text-slate-500">{a.body}</p>
                    <p className="text-xs text-slate-400">{timeAgo(a.timestamp)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
