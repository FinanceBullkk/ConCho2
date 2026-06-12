import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, GraduationCap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningCohorts, useLearningEnrollments } from '../../hooks/useLearning';

// ──────────────────────────────────────────────────────────
// MyProgramsPage — Cohesion P1 entry list
// Route: /me/programs  (Participant)
//
// One card per active cohort enrollment → opens that enrollment's hub
// (/me/programs/:cohortId). Enrollment rows are self-scoped server-side;
// program names come from the open cohort catalog (joined client-side).
// English literals by /me/* convention.
// ──────────────────────────────────────────────────────────

const STATUS_TONE = { Active: 'default', Completed: 'secondary', Dropped: 'destructive' };

export default function MyProgramsPage() {
  const { data: enrollmentData, isLoading: loadingEnrollments } = useLearningEnrollments();
  const { data: cohortData, isLoading: loadingCohorts } = useLearningCohorts();

  const cohortById = useMemo(() => {
    const map = new Map();
    (cohortData?.data || []).forEach((c) => map.set(String(c._id), c));
    return map;
  }, [cohortData]);

  const rows = useMemo(() => (
    (enrollmentData?.data || [])
      .filter((e) => e.status !== 'Dropped')
      .map((e) => ({ enrollment: e, cohort: cohortById.get(String(e.cohortId)) }))
  ), [enrollmentData, cohortById]);

  const loading = loadingEnrollments || loadingCohorts;

  let body;
  if (loading) {
    body = <TableSkeleton rows={3} cols={2} />;
  } else if (!rows.length) {
    body = (
      <EmptyState
        icon={GraduationCap}
        title="No program enrollments"
        description="Browse the catalog to enroll in a program."
        action={(
          <Link to="/me/catalog" className="text-sm text-primary font-medium hover:underline underline-offset-2">
            Browse catalog →
          </Link>
        )}
      />
    );
  } else {
    body = (
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(({ enrollment, cohort }) => (
          <Link key={enrollment.id} to={`/me/programs/${enrollment.cohortId}`} className="group">
            <Card className="h-full rounded-lg transition-colors group-hover:border-primary/40">
              <CardHeader className="space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="size-4 text-muted-foreground" aria-hidden="true" />
                    {cohort?.programName || cohort?.courseName || 'Program'}
                  </CardTitle>
                  <Badge variant={STATUS_TONE[enrollment.status] || 'secondary'}>{enrollment.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Cohort {enrollment.cohortCode || cohort?.cohortCode || ''}
                </p>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {cohort
                    ? `${cohort.bookedSessions ?? 0}/${cohort.totalSessions ?? '—'} sessions scheduled`
                    : 'View your progress'}
                </span>
                <span className="inline-flex items-center gap-1 text-primary font-medium">
                  Progress <ChevronRight className="size-4" aria-hidden="true" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="My programs" description="Your enrollments and progress toward completion." />
      {body}
    </div>
  );
}
