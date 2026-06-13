import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import ProgramEnrollmentCard from './ProgramEnrollmentCard';
import { useLearningCohorts, useMyEnrollments } from '../../hooks/useLearning';

// ──────────────────────────────────────────────────────────
// MyProgramsPage — Cohesion P1 entry list
// Route: /me/programs  (Participant)
//
// One card per active enrollment → opens that enrollment's hub
// (/me/programs/:cohortId). Reads the unified self enrollment surface
// (converge Phase 2): BOTH team-based group enrollments and direct cohort
// enrollments show here, so a learner sees every cohort regardless of how they
// joined. Program names come from the open cohort catalog where available, with
// the enrollment's own cohortName as a fallback (team cohorts may not be in the
// catalog). English literals by /me/* convention.
// ──────────────────────────────────────────────────────────

export default function MyProgramsPage() {
  const { data: enrollmentData, isLoading: loadingEnrollments } = useMyEnrollments();
  const { data: cohortData, isLoading: loadingCohorts } = useLearningCohorts();

  const cohortById = useMemo(() => {
    const map = new Map();
    (cohortData?.data || []).forEach((c) => map.set(String(c._id), c));
    return map;
  }, [cohortData]);

  const rows = useMemo(() => (
    (enrollmentData?.data || [])
      .filter((e) => e.status !== 'Dropped' && e.cohortId)
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
          <ProgramEnrollmentCard key={enrollment.id} enrollment={enrollment} cohort={cohort} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="My programs" description="Your enrollments and progress toward completion." />
        <Link
          to="/me/transcript"
          className="shrink-0 text-sm text-primary font-medium hover:underline underline-offset-2"
        >
          View transcript →
        </Link>
      </div>
      {body}
    </div>
  );
}
