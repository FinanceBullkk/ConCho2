import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Hourglass, MessageSquare, PlayCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAssessments, useAssessmentAttempts } from '../../hooks/useAssessment';
import { useLearningEnrollments, useLearningFeedback } from '../../hooks/useLearning';
import { useMyClassSchedules } from '../../hooks/useSchedules';
import { useMyWaitlist } from '../learner/useWaitlist';

// ──────────────────────────────────────────────────────────
// NextActionsFeed — Cohesion P2 "what should I do next?"
//
// Client-side composition over EXISTING self-scoped queries (no new
// backend): quizzes not yet passed for my cohorts, feedback not yet
// submitted for my enrollments, and my waitlist positions. The next
// session itself stays in the dashboard's NextClassCard band.
// Assignment items arrive with P3 (needs a self-scoped read).
// English literals (/me/* convention).
// ──────────────────────────────────────────────────────────

const MAX_ITEMS = 5;

// Mirrors MyAssessmentsPage: cohorts from active enrollments ∪ my class
// schedules (team world), newest attempt per assessment wins.
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

const classIdOf = (schedule) => {
  const cls = schedule?.classId;
  return cls && typeof cls === 'object' ? cls._id : cls;
};

export default function NextActionsFeed() {
  const { data: assessmentData } = useAssessments();
  const { data: attemptData } = useAssessmentAttempts();
  const { data: enrollmentData } = useLearningEnrollments();
  const { data: feedbackData } = useLearningFeedback();
  const { data: scheduleData } = useMyClassSchedules();
  const { data: waitlistData } = useMyWaitlist();

  const actions = useMemo(() => {
    const items = [];

    const activeEnrollments = (enrollmentData?.data || []).filter((row) => row.status !== 'Dropped');
    const cohortIds = new Set(activeEnrollments.map((row) => String(row.cohortId)));
    (scheduleData?.data || []).forEach((schedule) => {
      const classId = classIdOf(schedule);
      if (classId) cohortIds.add(String(classId));
    });

    // 1) Quizzes for my cohorts without a passing attempt yet.
    const attemptBy = newestAttemptByAssessment(attemptData?.data || []);
    (assessmentData?.data || [])
      .filter((a) => cohortIds.has(String(a.cohortId)))
      .filter((a) => !attemptBy.get(a.id)?.passed)
      .forEach((a) => items.push({
        key: `quiz:${a.id}`,
        icon: PlayCircle,
        label: `Take quiz: ${a.title}`,
        to: '/me/assessments',
      }));

    // 2) Enrolled cohorts without submitted feedback.
    const feedbackCohorts = new Set((feedbackData?.data || []).map((row) => String(row.cohortId)));
    activeEnrollments
      .filter((row) => !feedbackCohorts.has(String(row.cohortId)))
      .forEach((row) => items.push({
        key: `feedback:${row.cohortId}`,
        icon: MessageSquare,
        label: `Give feedback · ${row.cohortCode || 'your cohort'}`,
        to: '/me/feedback',
      }));

    // 3) Waitlist positions (a freed seat auto-promotes — keep an eye on it).
    (waitlistData?.data || []).forEach((entry) => items.push({
      key: `waitlist:${entry._id || entry.scheduleId}`,
      icon: Hourglass,
      label: `Waiting #${entry.position} on a full session`,
      to: '/me/sessions',
    }));

    return items.slice(0, MAX_ITEMS);
  }, [assessmentData, attemptData, enrollmentData, feedbackData, scheduleData, waitlistData]);

  return (
    <Card data-testid="next-actions-feed">
      <CardHeader>
        <CardTitle className="text-base">Next actions</CardTitle>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            You're all caught up — nothing waiting on you.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {actions.map((item) => {
              const ActionIcon = item.icon;
              return (
                <li key={item.key}>
                  <Link
                    to={item.to}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm hover:bg-accent rounded-md px-2 -mx-2 transition-colors"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-foreground">
                      <ActionIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
