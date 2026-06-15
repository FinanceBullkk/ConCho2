import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Users, Layers, CircleCheck, Award, TrendingUp, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Spinner } from '@/components/Spinner';
import { useLearningProgram, useLearningCohorts, useCompletionRollup, useCompletionTrend } from '../../hooks/useLearning';
import { useRole } from '../../hooks/useRole';
import { StatTile, MetricBars } from './DashboardWidgets';
import { Sparkline } from './DashboardCharts';
import ProgramFormModal from './ProgramFormModal';

// ──────────────────────────────────────────────────────────
// ProgramDetailPage — drill-in for one LearningProgram (TMS.update S3).
// Read-only composition over existing endpoints: getProgram (header/policy/
// settings) + getCohorts({programId}) (cohorts) + completion rollup (the
// program's real KPIs + funnel). No new backend.
// ──────────────────────────────────────────────────────────
const d = 'learning.programDetail';
const pc = (v) => `${v ?? 0}%`;
const STATUS_TONE = { active: 'success', inactive: 'secondary', archived: 'outline' };
const COHORT_TONE = { Ongoing: 'success', Completed: 'secondary', Cancelled: 'outline' };

function PolicyPanel({ program }) {
  const { t } = useTranslation();
  const p = program.completionPolicy || {};
  const gates = [];
  if (p.attendanceThresholdPercent > 0) gates.push(t(`${d}.policyAttendance`, { pct: p.attendanceThresholdPercent }));
  if (p.requiresAssessment) gates.push(t(`${d}.policyAssessment`));
  if (p.requiresFeedback) gates.push(t(`${d}.policyFeedback`));
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${d}.policyTitle`)}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {gates.length ? (
          <ul className="space-y-1.5">
            {gates.map((g) => (
              <li key={g} className="flex items-center gap-2 text-sm text-foreground">
                <CircleCheck className="size-4 text-success" aria-hidden="true" />{g}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">{t(`${d}.policyNone`)}</p>}
        <p className="pt-1 text-xs text-subtle-foreground">
          {program.certificateValidityDays
            ? t(`${d}.certValidity`, { days: program.certificateValidityDays })
            : t(`${d}.certNoExpiry`)}
        </p>
      </CardContent>
    </Card>
  );
}

function SettingRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function ProgramDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { isAdmin, can } = useRole();
  const canManage = can('update:program');
  const [editing, setEditing] = useState(false);

  const { data: program, isLoading, isError } = useLearningProgram(id);
  const { data: cohortsData } = useLearningCohorts({ programId: id });
  const { data: rollup } = useCompletionRollup({ enabled: isAdmin || can('read:reports') });
  const { data: trend } = useCompletionTrend(id, { enabled: isAdmin || can('read:reports') });

  const trendSeries = trend?.series || [];
  const cohorts = cohortsData?.data || [];
  const stats = (rollup?.programs || []).find((p) => p.key === id) || {};
  const enrolled = stats.learners ?? 0;

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner size={28} /></div>;
  }
  if (isError || !program) {
    return (
      <div className="space-y-4">
        <Link to="/learning?tab=programs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />{t(`${d}.back`)}
        </Link>
        <EmptyState title={isError ? t(`${d}.loadError`) : t(`${d}.notFound`)} />
      </div>
    );
  }

  const funnelRows = [
    { key: 'enrolled', label: t(`${d}.funnelEnrolled`), display: enrolled, percent: 100, detail: '100%' },
    { key: 'completed', label: t(`${d}.funnelCompleted`), display: stats.complete ?? 0, percent: enrolled ? ((stats.complete ?? 0) / enrolled) * 100 : 0 },
    { key: 'certified', label: t(`${d}.funnelCertified`), display: stats.certificatesIssued ?? 0, percent: enrolled ? ((stats.certificatesIssued ?? 0) / enrolled) * 100 : 0 },
  ];

  return (
    <div className="space-y-4">
      <Link to="/learning?tab=programs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />{t(`${d}.back`)}
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {program.name}
            <Badge variant={STATUS_TONE[program.status] || 'secondary'}>{t(`learning.status.${program.status}`, program.status)}</Badge>
            <span className="font-mono text-sm text-subtle-foreground">{program.code}</span>
          </span>
        }
        description={program.description || undefined}
        actions={canManage ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-1.5 size-4" aria-hidden="true" />{t(`${d}.editInBuilder`)}
          </Button>
        ) : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile icon={Users} tone="info" label={t(`${d}.kpi.enrolled`)} value={enrolled} />
        <StatTile icon={Layers} tone="neutral" label={t(`${d}.kpi.cohorts`)} value={stats.cohorts ?? cohorts.length} />
        <StatTile icon={TrendingUp} tone="primary" label={t(`${d}.kpi.completion`)} value={pc(stats.completionRate)} />
        <StatTile icon={CircleCheck} tone="success" label={t(`${d}.kpi.completed`)} value={stats.complete ?? 0} />
        <StatTile icon={Award} tone="success" label={t(`${d}.kpi.certificates`)} value={stats.certificatesIssued ?? 0} />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t(`${d}.tabs.overview`)}</TabsTrigger>
          <TabsTrigger value="cohorts">{t(`${d}.tabs.cohorts`)}</TabsTrigger>
          <TabsTrigger value="curriculum">{t(`${d}.tabs.curriculum`)}</TabsTrigger>
          <TabsTrigger value="analytics">{t(`${d}.tabs.analytics`)}</TabsTrigger>
          <TabsTrigger value="settings">{t(`${d}.tabs.settings`)}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {trendSeries.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t(`${d}.trendTitle`)}</CardTitle>
                <p className="text-xs text-muted-foreground">{t(`${d}.trendSub`)}</p>
              </CardHeader>
              <CardContent>
                <Sparkline
                  series={[{ points: trendSeries.map((s) => s.completions) }]}
                  labels={trendSeries.map((s) => s.month.slice(5))}
                  title={t(`${d}.trendTitle`)}
                />
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t(`${d}.funnelTitle`)}</CardTitle>
                <p className="text-xs text-muted-foreground">{t(`${d}.funnelSub`)}</p>
              </CardHeader>
              <CardContent><MetricBars title="" rows={funnelRows} /></CardContent>
            </Card>
            <PolicyPanel program={program} />
          </div>
        </TabsContent>

        <TabsContent value="cohorts">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${d}.cohortsTitle`)}</CardTitle></CardHeader>
            <CardContent>
              {cohorts.length ? (
                <ul className="divide-y divide-border">
                  {cohorts.map((c) => (
                    <li key={c._id}>
                      <Link to={`/learning/cohorts/${c._id}`} className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-accent/40">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{c.cohortCode || c.classCode}</p>
                          <p className="truncate text-xs text-subtle-foreground">{c.programName}</p>
                        </div>
                        <Badge variant={COHORT_TONE[c.status] || 'secondary'}>{c.status}</Badge>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c.bookedSessions}/{c.totalSessions}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title={t(`${d}.cohortsEmpty`)} />}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="curriculum">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${d}.curriculumTitle`)}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <SettingRow label={t(`${d}.deliveryMode`)} value={t(`learning.delivery.${program.deliveryMode}`, program.deliveryMode)} />
              <SettingRow label={t(`${d}.schedulingMode`)} value={t(`learning.scheduling.${program.schedulingMode}`, program.schedulingMode)} />
              <SettingRow label={t(`${d}.defaultSessions`)} value={program.defaultSessionCount} />
              <p className="pt-2 text-xs text-subtle-foreground">{t(`${d}.skillsNote`)}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${d}.analyticsTitle`)}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <MetricBars title="" rows={funnelRows} />
              <p className="text-xs text-subtle-foreground">{t(`${d}.analyticsNote`)}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${d}.settingsTitle`)}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <SettingRow label={t(`${d}.capacityPerCohort`)} value={program.capacityPolicy?.maxParticipants ?? t(`${d}.none`)} />
              <SettingRow label={t(`${d}.capacityPerSession`)} value={program.capacityPolicy?.maxParticipantsPerSession ?? t(`${d}.none`)} />
              <SettingRow label={t(`${d}.facilitatorRequired`)} value={program.facilitatorPolicy?.assignmentRequired ? t(`${d}.yes`) : t(`${d}.no`)} />
              <SettingRow label={t(`${d}.facilitatorVisibility`)} value={program.facilitatorPolicy?.visibility || t(`${d}.none`)} />
              <SettingRow label={t(`${d}.recertAuto`)} value={program.recertifyPolicy?.autoAssign ? t(`${d}.yes`) : t(`${d}.no`)} />
              <SettingRow label={t(`${d}.prerequisites`)} value={(program.prerequisitePrograms || []).length || t(`${d}.none`)} />
              <SettingRow label={t(`${d}.customFields`)} value={Object.keys(program.customFields || {}).length || t(`${d}.none`)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editing && <ProgramFormModal program={program} onClose={() => setEditing(false)} />}
    </div>
  );
}
