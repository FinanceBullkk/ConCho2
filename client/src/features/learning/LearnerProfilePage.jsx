import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CircleCheck, Loader, Award, TrendingUp, Clock, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Spinner } from '@/components/Spinner';
import { cn } from '@/lib/utils';
import { useUser } from '../../hooks/useUsers';
import { useLearningEnrollments, useCertificates } from '../../hooks/useLearning';
import { StatTile } from './DashboardWidgets';

// ──────────────────────────────────────────────────────────
// LearnerProfilePage — admin 360° view of one learner (TMS.update S6).
// Composes useUser + the learner-scoped L&D enrollments + certificates reads
// (no new backend). Admin-only: usersAPI.getById is Admin-gated.
// Skills / role-readiness (Phase 5) were removed with the scope-trim of the
// speculative skills domain (2026-07-09) — this page reverted to the
// enrollments/certificates/activity slices that ship with the core loop.
// ──────────────────────────────────────────────────────────
const p = 'learning.learnerProfile';
const pc = (v) => `${v ?? 0}%`;
const isComplete = (status) => /complete/i.test(status || '');
const ROLE_TONE = { Admin: 'info', Coordinator: 'info', Teacher: 'success', Participant: 'secondary' };
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export default function LearnerProfilePage() {
  const { t } = useTranslation();
  const { userId } = useParams();
  const [tab, setTab] = useState('overview');

  const { data: user, isLoading, isError } = useUser(userId);
  const { data: enrollData } = useLearningEnrollments({ learnerId: userId });
  const { data: certs = [] } = useCertificates({ learnerId: userId });

  const enrollments = useMemo(() => enrollData?.data || [], [enrollData]);
  const completed = enrollments.filter((e) => isComplete(e.status)).length;
  const inProgress = enrollments.length - completed;
  const completionRate = enrollments.length ? Math.round((completed / enrollments.length) * 100) : 0;

  const activity = useMemo(() => {
    const items = [
      ...certs.map((crt) => ({ kind: 'issued', at: crt.issuedAt, label: t(`${p}.issued`), detail: crt.programName || crt.certificateNumber })),
      ...enrollments.map((e) => ({ kind: 'enrolled', at: e.enrolledAt || e.createdAt, label: t(`${p}.enrolledIn`, { cohort: e.cohortCode || '' }), detail: e.status })),
    ].filter((x) => x.at);
    return items.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 12);
  }, [certs, enrollments, t]);

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner size={28} /></div>;
  }
  if (isError || !user) {
    return (
      <div className="space-y-4">
        <Link to="/people" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />{t(`${p}.back`)}
        </Link>
        <EmptyState title={t(`${p}.loadError`)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/people" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />{t(`${p}.back`)}
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {user.name}
            <Badge variant={ROLE_TONE[user.role] || 'secondary'}>{user.role}</Badge>
            <span className="font-mono text-sm text-subtle-foreground">{user.empCode}</span>
          </span>
        }
        description={[user.department, user.email].filter(Boolean).join(' · ') || undefined}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile icon={CircleCheck} tone="success" label={t(`${p}.kpi.completed`)} value={completed} />
        <StatTile icon={Loader} tone="info" label={t(`${p}.kpi.inProgress`)} value={inProgress} />
        <StatTile icon={Award} tone="success" label={t(`${p}.kpi.certificates`)} value={certs.length} />
        <StatTile icon={TrendingUp} tone="primary" label={t(`${p}.kpi.completion`)} value={pc(completionRate)} />
        <StatTile icon={Clock} tone="neutral" label={t(`${p}.kpi.hours`)} value="—" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t(`${p}.tabs.overview`)}</TabsTrigger>
          <TabsTrigger value="transcript">{t(`${p}.tabs.transcript`)}</TabsTrigger>
          <TabsTrigger value="certificates">{t(`${p}.tabs.certificates`)}</TabsTrigger>
          <TabsTrigger value="activity">{t(`${p}.tabs.activity`)}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${p}.currentPrograms`)}</CardTitle></CardHeader>
            <CardContent>
              {enrollments.length ? (
                <ul className="divide-y divide-border">
                  {enrollments.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Link to={e.cohortId ? `/learning/cohorts/${e.cohortId}` : '#'} className="font-medium text-foreground hover:underline">{e.cohortCode || e.id}</Link>
                      <Badge variant={isComplete(e.status) ? 'success' : 'info'}>{e.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">{t(`${p}.noPrograms`)}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transcript">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${p}.transcriptTitle`)}</CardTitle></CardHeader>
            <CardContent>
              {enrollments.length ? (
                <ul className="divide-y divide-border">
                  {enrollments.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="font-medium text-foreground">{e.cohortCode || e.id}</span>
                      <Badge variant={isComplete(e.status) ? 'success' : 'secondary'}>{e.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">{t(`${p}.noPrograms`)}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="certificates">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${p}.certificatesTitle`)}</CardTitle></CardHeader>
            <CardContent>
              {certs.length ? (
                <ul className="divide-y divide-border">
                  {certs.map((crt) => (
                    <li key={crt.id || crt.certificateNumber} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{crt.programName || crt.certificateNumber}</p>
                        <p className="text-[11px] text-subtle-foreground">{crt.certificateNumber} · {fmtDate(crt.issuedAt)}</p>
                      </div>
                      <Badge variant={crt.status === 'Issued' ? 'success' : 'secondary'}>{crt.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">{t(`${p}.noCertificates`)}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${p}.activityTitle`)}</CardTitle></CardHeader>
            <CardContent>
              {activity.length ? (
                <ol className="relative">
                  {activity.map((item, i) => {
                    const last = i === activity.length - 1;
                    const issued = item.kind === 'issued';
                    const Icon = issued ? Award : BookOpen;
                    return (
                      <li key={i} className="relative flex gap-3.5 pb-4 last:pb-0">
                        {/* vertical rail connecting the markers (prototype timeline) */}
                        {!last && <span className="absolute left-4 top-9 bottom-0 w-px bg-border" aria-hidden="true" />}
                        <span className={cn(
                          'relative z-[1] grid size-[34px] shrink-0 place-items-center rounded-lg',
                          issued ? 'bg-success-tint text-success' : 'bg-primary-tint text-primary',
                        )}>
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 pt-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{item.label}</span>
                            <Badge variant="secondary">{t(`${p}.${issued ? 'catCertificate' : 'catEnrollment'}`)}</Badge>
                          </div>
                          {item.detail ? <p className="truncate text-[11px] text-subtle-foreground">{item.detail}</p> : null}
                          <p className="text-[11px] tabular-nums text-subtle-foreground">{fmtDate(item.at)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : <p className="text-sm text-muted-foreground">{t(`${p}.noActivity`)}</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
