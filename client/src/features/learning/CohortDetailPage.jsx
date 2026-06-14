import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Users, TrendingUp, ClipboardCheck, GraduationCap, Award, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Spinner } from '@/components/Spinner';
import { useCompletionReport, useLearningCohort, useLearningSessions } from '../../hooks/useLearning';
import { StatTile } from './DashboardWidgets';
import CohortRosterTab from './CohortRosterTab';

// ──────────────────────────────────────────────────────────
// CohortDetailPage — drill-in for one cohort (TMS.update S4). Roster + bulk
// ops are the centerpiece (CohortRosterTab). Composes the existing cohort
// completion report (roster + summary) + getCohort (header). Backend added:
// the nudge endpoint used by the roster's bulk Nudge action.
// ──────────────────────────────────────────────────────────
const c = 'learning.cohortDetail';
const pc = (v) => `${v ?? 0}%`;
const COHORT_TONE = { Ongoing: 'success', Completed: 'secondary', Cancelled: 'outline' };

export default function CohortDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [tab, setTab] = useState('overview');

  const { data: report, isLoading, isError } = useCompletionReport(id);
  const { data: cohort } = useLearningCohort(id);
  const { data: sessionsData } = useLearningSessions({ cohortId: id });
  const sessions = sessionsData?.data || [];

  const rows = useMemo(() => report?.rows || [], [report]);
  const summary = report?.summary || {};

  const avgAttendance = useMemo(() => {
    if (!rows.length) return 0;
    return Math.round(rows.reduce((acc, row) => acc + (row.attendancePercent || 0), 0) / rows.length);
  }, [rows]);

  const assessmentPass = useMemo(() => {
    const required = rows.filter((row) => row.assessmentRequired);
    if (!required.length) return null;
    return Math.round((required.filter((row) => row.assessmentMet).length / required.length) * 100);
  }, [rows]);

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner size={28} /></div>;
  }
  if (isError || !report) {
    return (
      <div className="space-y-4">
        <Link to="/learning?tab=cohorts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />{t(`${c}.back`)}
        </Link>
        <EmptyState title={isError ? t(`${c}.loadError`) : t(`${c}.notFound`)} />
      </div>
    );
  }

  const code = report.cohort?.code || cohort?.cohortCode;
  const programName = report.cohort?.programName || cohort?.programName;

  return (
    <div className="space-y-4">
      <Link to="/learning?tab=cohorts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />{t(`${c}.back`)}
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {programName}
            {cohort?.status && <Badge variant={COHORT_TONE[cohort.status] || 'secondary'}>{cohort.status}</Badge>}
            <span className="font-mono text-sm text-subtle-foreground">{code}</span>
          </span>
        }
        actions={
          <Button size="sm" variant="outline" onClick={() => setTab('roster')}>
            <MessageSquare className="mr-1.5 size-4" aria-hidden="true" />{t(`${c}.messageCohort`)}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile icon={Users} tone="info" label={t(`${c}.kpi.enrolled`)} value={summary.total ?? 0} />
        <StatTile icon={TrendingUp} tone="primary" label={t(`${c}.kpi.completion`)} value={pc(summary.completionRate)} />
        <StatTile icon={ClipboardCheck} tone="primary" label={t(`${c}.kpi.attendance`)} value={pc(avgAttendance)} />
        <StatTile icon={GraduationCap} tone="success" label={t(`${c}.kpi.assessment`)} value={assessmentPass == null ? '—' : pc(assessmentPass)} />
        <StatTile icon={Award} tone="success" label={t(`${c}.kpi.certificates`)} value={summary.certificatesIssued ?? 0} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t(`${c}.tabs.overview`)}</TabsTrigger>
          <TabsTrigger value="roster">{t(`${c}.tabs.roster`)}</TabsTrigger>
          <TabsTrigger value="sessions">{t(`${c}.tabs.sessions`)}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${c}.tabs.overview`)}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <StatTile label={t(`${c}.kpi.enrolled`)} value={summary.total ?? 0} />
              <StatTile label={t(`${c}.kpi.completion`)} value={pc(summary.completionRate)} />
              <StatTile label={t(`${c}.kpi.certificates`)} value={summary.certificatesIssued ?? 0} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roster">
          <CohortRosterTab cohortId={id} rows={rows} />
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${c}.tabs.sessions`)}</CardTitle></CardHeader>
            <CardContent>
              {sessions.length ? (
                <ul className="divide-y divide-border">
                  {sessions.map((sess, i) => (
                    <li key={sess._id}>
                      <Link to={`/learning/sessions/${sess._id}`} className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-accent/40">
                        <span className="text-sm font-medium text-foreground">{sess.topic || t(`${c}.sessionN`, { n: i + 1 })}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {sess.startTime ? new Date(sess.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title={t(`${c}.sessionsEmpty`)} />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
