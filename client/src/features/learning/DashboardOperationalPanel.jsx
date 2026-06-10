import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { useOperationalDashboard } from '../../hooks/useLearningDashboard';
import { EnumSelect, LearningField } from './LearningField';
import { MetricBars, MetricUnavailable, StatTile } from './DashboardWidgets';
import { ExpiringCertificatesList, OverdueList } from './DashboardTopLists';

const WINDOWS = ['30', '60', '90'];
const TOP_BARS = 8; // dense-but-scannable cap for program/department bars
const pc = (value) => `${value ?? 0}%`;

function Section({ title, children }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

const completionBars = (rows) =>
  (rows || []).slice(0, TOP_BARS).map((row) => ({
    key: row.key,
    label: row.label,
    display: pc(row.completionRate),
    percent: row.completionRate,
    detail: `${row.complete}/${row.learners}`,
  }));

// Ratings are 1–5; scale the bar width to a percentage of the 5-point scale.
const feedbackBars = (rows) =>
  (rows || []).slice(0, TOP_BARS).map((row) => ({
    key: row.programId,
    label: row.programName,
    display: `${row.averageRating}/5`,
    percent: (row.averageRating / 5) * 100,
    detail: `${row.count}`,
  }));

export default function DashboardOperationalPanel() {
  const { t } = useTranslation();
  const [windowDays, setWindowDays] = useState('30');
  const { data, isLoading, isError, refetch } = useOperationalDashboard({ window: windowDays });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="dashboard-skeleton">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-3">
        <EmptyState
          title={t('learning.dashboard.loadError')}
          description={t('learning.dashboard.loadErrorDesc')}
        />
        <div className="flex justify-center">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            {t('learning.dashboard.retry')}
          </Button>
        </div>
      </div>
    );
  }

  const { completion, attendance, sessions, assignments, certificates, assessments, feedback, coverage } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {data.errors?.length ? (
          <p className="rounded-md border border-destructive/50 px-3 py-2 text-xs text-destructive">
            {t('learning.dashboard.partialWarning', {
              metrics: data.errors.map((e) => e.metric).join(', '),
            })}
          </p>
        ) : <span />}
        <div className="w-36">
          <LearningField label={t('learning.dashboard.windowLabel')}>
            <EnumSelect
              aria-label={t('learning.dashboard.windowLabel')}
              value={windowDays}
              onChange={setWindowDays}
              options={WINDOWS}
              labelFor={(opt) => t('learning.dashboard.windowDays', { days: opt })}
            />
          </LearningField>
        </div>
      </div>

      <Section title={t('learning.dashboard.sections.completion')}>
        {completion ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label={t('learning.dashboard.tiles.completionRate')} value={pc(completion.summary.completionRate)} />
              <StatTile label={t('learning.dashboard.tiles.learners')} value={completion.summary.learners} />
              <StatTile label={t('learning.dashboard.tiles.complete')} value={completion.summary.complete} />
              <StatTile label={t('learning.dashboard.tiles.certificatesIssued')} value={completion.summary.certificatesIssued} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <MetricBars title={t('learning.dashboard.byProgram')} rows={completionBars(completion.programs)} />
              <MetricBars title={t('learning.dashboard.byDepartment')} rows={completionBars(completion.departments)} />
            </div>
          </>
        ) : <MetricUnavailable />}
      </Section>

      <Section title={t('learning.dashboard.sections.attendanceSessions')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {attendance ? (
            <>
              <StatTile
                label={t('learning.dashboard.tiles.attendanceRate')}
                value={pc(attendance.rate)}
                hint={t('learning.dashboard.tiles.attendanceRecords', { count: attendance.totalRecords })}
              />
            </>
          ) : <MetricUnavailable />}
          {sessions ? (
            <>
              <StatTile label={t('learning.dashboard.tiles.upcoming')} value={sessions.upcoming} />
              <StatTile label={t('learning.dashboard.tiles.next7Days')} value={sessions.next7Days} />
              <StatTile label={t('learning.dashboard.tiles.past')} value={sessions.past} />
            </>
          ) : <MetricUnavailable />}
          {coverage ? (
            <StatTile
              label={t('learning.dashboard.tiles.coverage')}
              value={pc(coverage.coveragePercent)}
              hint={`${coverage.engagedParticipants}/${coverage.activeParticipants}`}
            />
          ) : <MetricUnavailable />}
        </div>
      </Section>

      <Section title={t('learning.dashboard.sections.obligations')}>
        {assignments ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile label={t('learning.dashboard.tiles.activeAssignments')} value={assignments.activeAssignments} />
            <StatTile
              label={t('learning.dashboard.tiles.overdueLearners')}
              value={assignments.overdueLearners}
              alert={assignments.overdueLearners > 0}
            />
          </div>
        ) : <MetricUnavailable />}
        {certificates ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              label={t('learning.dashboard.tiles.expired')}
              value={certificates.expired}
              alert={certificates.expired > 0}
            />
            <StatTile label={t('learning.dashboard.tiles.expiring30')} value={certificates.expiring30} />
            <StatTile label={t('learning.dashboard.tiles.expiring60')} value={certificates.expiring60} />
          </div>
        ) : <MetricUnavailable />}
        <div className="grid gap-4 lg:grid-cols-2">
          {assignments ? (
            <div>
              <h4 className="mb-2 text-sm font-medium">{t('learning.dashboard.topOverdue')}</h4>
              <OverdueList items={assignments.topOverdue} />
            </div>
          ) : null}
          {certificates ? (
            <div>
              <h4 className="mb-2 text-sm font-medium">{t('learning.dashboard.topExpiring')}</h4>
              <ExpiringCertificatesList items={certificates.topExpiring} />
            </div>
          ) : null}
        </div>
      </Section>

      <Section title={t('learning.dashboard.sections.quality')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {assessments ? (
            <StatTile
              label={t('learning.dashboard.tiles.passRate')}
              value={pc(assessments.passRate)}
              hint={t('learning.dashboard.tiles.attempts', { count: assessments.totalAttempts })}
            />
          ) : <MetricUnavailable />}
          {feedback ? (
            <StatTile
              label={t('learning.dashboard.tiles.feedbackAvg')}
              value={feedback.averageRating == null ? '—' : `${feedback.averageRating}/5`}
              hint={t('learning.dashboard.tiles.feedbackCount', { count: feedback.count })}
            />
          ) : <MetricUnavailable />}
        </div>
        {feedback ? (
          <MetricBars title={t('learning.dashboard.byProgram')} rows={feedbackBars(feedback.byProgram)} />
        ) : null}
      </Section>
    </div>
  );
}
