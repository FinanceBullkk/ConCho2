import { useMemo, useState } from 'react';
import { CheckCircle2, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningEnrollments, useLearningFeedback } from '../hooks/useLearning';
import { useMyClassSchedules } from '../hooks/useSchedules';
import FeedbackFormModal from './learning/FeedbackFormModal';

const classIdOf = (schedule) => schedule?.classId?._id || schedule?.classId || null;

const cohortRows = (enrollments, schedules) => {
  const rows = new Map();
  enrollments
    .filter((row) => row.status !== 'Dropped' && row.cohortId)
    .forEach((row) => rows.set(String(row.cohortId), {
      id: String(row.cohortId),
      code: row.cohortCode || 'Cohort',
      name: '',
    }));
  schedules.forEach((schedule) => {
    const id = classIdOf(schedule);
    if (!id) return;
    rows.set(String(id), {
      id: String(id),
      code: schedule.classId?.classCode || 'Cohort',
      name: schedule.classId?.courseName || '',
    });
  });
  return [...rows.values()];
};

export default function MyFeedbackPage() {
  const [activeCohort, setActiveCohort] = useState(null);
  const { data: enrollmentData, isLoading: loadingEnrollments } = useLearningEnrollments();
  const { data: scheduleData, isLoading: loadingSchedules } = useMyClassSchedules();
  const { data: feedbackData, isLoading: loadingFeedback } = useLearningFeedback();

  const cohorts = useMemo(
    () => cohortRows(enrollmentData?.data || [], scheduleData?.data || []),
    [enrollmentData, scheduleData],
  );
  const feedbackByCohort = useMemo(() => {
    const map = new Map();
    (feedbackData?.data || []).forEach((row) => map.set(String(row.cohortId), row));
    return map;
  }, [feedbackData]);

  const loading = loadingEnrollments || loadingSchedules || loadingFeedback;

  let body;
  if (loading) {
    body = <TableSkeleton rows={4} cols={3} />;
  } else if (!cohorts.length) {
    body = (
      <EmptyState
        icon={MessageSquare}
        title="No cohorts for feedback"
        description="Feedback opens once you are enrolled in a cohort."
      />
    );
  } else {
    body = (
      <div className="grid gap-4 md:grid-cols-2">
        {cohorts.map((cohort) => {
          const existing = feedbackByCohort.get(cohort.id);
          return (
            <Card key={cohort.id} className="rounded-lg">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{cohort.code}</CardTitle>
                    {cohort.name && <p className="text-xs text-muted-foreground mt-1">{cohort.name}</p>}
                  </div>
                  {existing ? (
                    <Badge className="gap-1"><CheckCircle2 className="size-3" aria-hidden="true" />Submitted</Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {existing && (
                  <p className="text-sm text-foreground">
                    Overall rating: <span className="font-semibold tabular-nums">{existing.rating}/5</span>
                  </p>
                )}
                <Button className="w-full" onClick={() => setActiveCohort({ cohort, existing })}>
                  {existing ? 'Update feedback' : 'Submit feedback'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Feedback"
        description="Submit course feedback for your enrolled cohorts."
      />
      {body}
      {activeCohort && (
        <FeedbackFormModal
          cohort={activeCohort.cohort}
          existing={activeCohort.existing}
          onClose={() => setActiveCohort(null)}
        />
      )}
    </div>
  );
}
