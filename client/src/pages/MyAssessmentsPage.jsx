import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, PlayCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useAssessments, useAssessmentAttempts } from '../hooks/useAssessment';
import { useLearningEnrollments } from '../hooks/useLearning';
import { useMyClassSchedules } from '../hooks/useSchedules';
import AssessmentAttemptModal from './learning/AssessmentAttemptModal';

const classIdOf = (schedule) => {
  const cls = schedule?.classId;
  return cls?._id || cls || null;
};

const newestAttemptByAssessment = (attempts) => {
  const map = new Map();
  attempts.forEach((attempt) => {
    const current = map.get(attempt.assessmentId);
    if (!current || new Date(attempt.submittedAt) > new Date(current.submittedAt)) {
      map.set(attempt.assessmentId, attempt);
    }
  });
  return map;
};

export default function MyAssessmentsPage() {
  const [activeAssessment, setActiveAssessment] = useState(null);
  const { data: assessmentData, isLoading: loadingAssessments } = useAssessments();
  const { data: attemptData, isLoading: loadingAttempts } = useAssessmentAttempts();
  const { data: enrollmentData, isLoading: loadingEnrollments } = useLearningEnrollments();
  const { data: scheduleData, isLoading: loadingSchedules } = useMyClassSchedules();

  const cohortIds = useMemo(() => {
    const ids = new Set();
    (enrollmentData?.data || [])
      .filter((row) => row.status !== 'Dropped')
      .forEach((row) => row.cohortId && ids.add(String(row.cohortId)));
    (scheduleData?.data || [])
      .forEach((schedule) => {
        const classId = classIdOf(schedule);
        if (classId) ids.add(String(classId));
      });
    return ids;
  }, [enrollmentData, scheduleData]);

  const attemptByAssessment = useMemo(
    () => newestAttemptByAssessment(attemptData?.data || []),
    [attemptData],
  );
  const assessments = useMemo(() => {
    const rows = assessmentData?.data || [];
    return rows.filter((assessment) => cohortIds.has(String(assessment.cohortId)));
  }, [assessmentData, cohortIds]);

  const loading = loadingAssessments || loadingAttempts || loadingEnrollments || loadingSchedules;

  let body;
  if (loading) {
    body = <TableSkeleton rows={4} cols={3} />;
  } else if (!assessments.length) {
    body = (
      <EmptyState
        icon={ClipboardList}
        title="No assessments yet"
        description="Published assessments for your cohorts will appear here."
      />
    );
  } else {
    body = (
      <div className="grid gap-4 md:grid-cols-2">
        {assessments.map((assessment) => {
          const attempt = attemptByAssessment.get(assessment.id);
          return (
            <Card key={assessment.id} className="rounded-lg">
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{assessment.title}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {assessment.cohortCode || 'Cohort'} · {assessment.itemCount} items · pass {assessment.passingScorePercent}%
                    </p>
                  </div>
                  <AttemptBadge attempt={attempt} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {assessment.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{assessment.description}</p>
                )}
                {attempt && (
                  <p className="text-sm text-foreground">
                    Latest score: <span className="font-semibold tabular-nums">{attempt.scorePercent}%</span>
                  </p>
                )}
                <Button className="w-full" onClick={() => setActiveAssessment(assessment)}>
                  <PlayCircle className="size-4 mr-1.5" aria-hidden="true" />
                  {attempt ? 'Retake assessment' : 'Start assessment'}
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
        title="My Assessments"
        description="Take published quizzes for your enrolled cohorts."
      />
      {body}
      {activeAssessment && (
        <AssessmentAttemptModal
          assessment={activeAssessment}
          onClose={() => setActiveAssessment(null)}
        />
      )}
    </div>
  );
}

function AttemptBadge({ attempt }) {
  if (!attempt) return <Badge variant="secondary">Not started</Badge>;
  return attempt.passed ? (
    <Badge className="gap-1"><CheckCircle2 className="size-3" aria-hidden="true" />Passed</Badge>
  ) : (
    <Badge variant="destructive" className="gap-1"><XCircle className="size-3" aria-hidden="true" />Not passed</Badge>
  );
}
