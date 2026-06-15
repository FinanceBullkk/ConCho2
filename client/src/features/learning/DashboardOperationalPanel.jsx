import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, Users, CircleCheck, Award, ClipboardCheck, CalendarClock, CalendarDays,
  CalendarCheck, Target, ClipboardList, AlertTriangle, ShieldAlert, GraduationCap, MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { useOperationalDashboard } from '../../hooks/useLearningDashboard';
import { useRole } from '../../hooks/useRole';
import { EnumSelect, LearningField } from './LearningField';
import { MetricBars, MetricUnavailable, StatTile } from './DashboardWidgets';
import { DonutStat } from './DashboardCharts';
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

// "Overall completion" donut segments from the real completion summary (+ overdue
// learners when the assignment block is present). Zero slices are dropped.
const overallSegments = (summary, assignments, t) => {
  const complete = summary.complete ?? 0;
  const inProgress = Math.max(0, (summary.learners ?? 0) - complete);
  const overdue = assignments?.overdueLearners ?? 0;
  return [
    { label: t('learning.dashboard.overall.completed'), value: complete, className: 'text-success' },
    { label: t('learning.dashboard.overall.inProgress'), value: inProgress, className: 'text-primary' },
    { label: t('learning.dashboard.overall.overdue'), value: overdue, className: 'text-destructive' },
  ].filter((s) => s.value > 0);
};

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
  const { isAdmin } = useRole();
  const [windowDays, setWindowDays] = useState('30');
  const { data, isLoading, isError, refetch } = useOperationalDashboard({ window: windowDays });

  // Click-through to the filtered drill list. The drill reads the Admin-only
  // org-wide compliance report, so only surface the link for Admins; other
  // roles still see the KPI value, just not the navigation affordance.
  const drillTo = (metric) => (isAdmin ? `/reports/drill?metric=${metric}` : undefined);

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
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatTile icon={TrendingUp} tone="primary" label={t('learning.dashboard.tiles.completionRate')} value={pc(completion.summary.completionRate)} />
                <StatTile icon={Users} tone="info" label={t('learning.dashboard.tiles.learners')} value={completion.summary.learners} />
                <StatTile icon={CircleCheck} tone="success" label={t('learning.dashboard.tiles.complete')} value={completion.summary.complete} />
                <StatTile icon={Award} tone="success" label={t('learning.dashboard.tiles.certificatesIssued')} value={completion.summary.certificatesIssued} />
              </div>
              <div className="flex items-center rounded-xl border border-border bg-card p-4 lg:w-72">
                <DonutStat
                  title={t('learning.dashboard.overall.title')}
                  centerValue={pc(completion.summary.completionRate)}
                  centerLabel={t('learning.dashboard.overall.center')}
                  segments={overallSegments(completion.summary, assignments, t)}
                />
              </div>
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
                icon={ClipboardCheck}
                tone="primary"
                label={t('learning.dashboard.tiles.attendanceRate')}
                value={pc(attendance.rate)}
                hint={t('learning.dashboard.tiles.attendanceRecords', { count: attendance.totalRecords })}
              />
            </>
          ) : <MetricUnavailable />}
          {sessions ? (
            <>
              <StatTile icon={CalendarClock} tone="info" label={t('learning.dashboard.tiles.upcoming')} value={sessions.upcoming} />
              <StatTile icon={CalendarDays} tone="info" label={t('learning.dashboard.tiles.next7Days')} value={sessions.next7Days} />
              <StatTile icon={CalendarCheck} tone="neutral" label={t('learning.dashboard.tiles.past')} value={sessions.past} />
            </>
          ) : <MetricUnavailable />}
          {coverage ? (
            <StatTile
              icon={Target}
              tone="primary"
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
            <StatTile icon={ClipboardList} tone="info" label={t('learning.dashboard.tiles.activeAssignments')} value={assignments.activeAssignments} />
            <StatTile
              icon={AlertTriangle}
              label={t('learning.dashboard.tiles.overdueLearners')}
              value={assignments.overdueLearners}
              alert={assignments.overdueLearners > 0}
              to={drillTo('overdue')}
            />
          </div>
        ) : <MetricUnavailable />}
        {certificates ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              icon={ShieldAlert}
              label={t('learning.dashboard.tiles.expired')}
              value={certificates.expired}
              alert={certificates.expired > 0}
              to={drillTo('expired')}
            />
            <StatTile icon={Award} tone="warning" label={t('learning.dashboard.tiles.expiring30')} value={certificates.expiring30} to={drillTo('expiring')} />
            <StatTile icon={Award} tone="neutral" label={t('learning.dashboard.tiles.expiring60')} value={certificates.expiring60} />
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
              icon={GraduationCap}
              tone="success"
              label={t('learning.dashboard.tiles.passRate')}
              value={pc(assessments.passRate)}
              hint={t('learning.dashboard.tiles.attempts', { count: assessments.totalAttempts })}
            />
          ) : <MetricUnavailable />}
          {feedback ? (
            <StatTile
              icon={MessageSquare}
              tone="primary"
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
