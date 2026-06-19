import { useState } from 'react';
import { ClipboardEdit, GraduationCap, ArrowLeft, ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { Spinner } from '@/components/Spinner';
import { useGradingQueue } from './useGrading';
import { useAssessment } from '../../hooks/useAssessment';
import ManualGradingModal from '../learning/ManualGradingModal';
import EvaluationPage from '../evaluations/EvaluationPage';

// ──────────────────────────────────────────────────────────
// GradingPage — unified Grading workspace (converge Phase 4 slice C2)
// Route: /grading (Learning group). ONE place for staff to grade across BOTH
// assessment modes:
//   • Quiz   — assessments with manually-graded (short_text) items → open the
//     native ManualGradingModal in place.
//   • Rubric — team-world (English) classes → grade in place via the existing
//     EvaluationPage, scoped to the class (its picker hidden).
// The feed (GET /api/assessment/grading-queue) is server-scoped to what the
// actor can grade; the rubric list is empty for non-(Admin/Teacher).
// ──────────────────────────────────────────────────────────

// Fetches the full assessment (with items[]) the native modal needs, then mounts it.
function QuizReview({ id, onClose }) {
  const { data: assessment, isLoading } = useAssessment(id);
  if (isLoading || !assessment) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <Spinner size={28} />
      </div>
    );
  }
  return <ManualGradingModal assessment={assessment} onClose={onClose} />;
}

export default function GradingPage() {
  const { data, isLoading } = useGradingQueue();
  const quiz = data?.quiz || [];
  const rubric = data?.rubric || [];
  const [reviewQuizId, setReviewQuizId] = useState(null);
  const [rubricClass, setRubricClass] = useState(null); // { classId, classCode, courseName }

  // Rubric: grade one class in place by reusing the existing EvaluationPage,
  // scoped to the class (its picker hidden). A back link returns to the queue.
  if (rubricClass) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setRubricClass(null)}>
            <ArrowLeft className="size-4 mr-1.5" aria-hidden="true" /> Back to grading
          </Button>
          <span className="text-sm text-muted-foreground">
            {rubricClass.classCode}{rubricClass.courseName ? ` — ${rubricClass.courseName}` : ''}
          </span>
        </div>
        <EvaluationPage classId={rubricClass.classId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Grading" description="Review quiz attempts and enter English evaluations in one place." />

      {/* ── Quiz units ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4" aria-hidden="true" /> Quizzes to review
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : !quiz.length ? (
            <EmptyState title="No quizzes to review" description="Published quizzes with free-text answers appear here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assessment</TableHead>
                  <TableHead>Cohort</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quiz.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.title}</TableCell>
                    <TableCell>{q.cohortCode || '—'}</TableCell>
                    <TableCell className="text-right">{q.attemptCount}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setReviewQuizId(q.id)}>
                        <ClipboardEdit className="size-4 mr-1.5" aria-hidden="true" /> Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Rubric units ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="size-4" aria-hidden="true" /> English class evaluations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : !rubric.length ? (
            <EmptyState title="No classes to evaluate" description="Team-world English classes you can grade appear here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-right">Evaluations</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rubric.map((r) => (
                  <TableRow key={r.classId}>
                    <TableCell className="font-medium">{r.classCode}</TableCell>
                    <TableCell>{r.courseName}</TableCell>
                    <TableCell className="text-right">{r.evaluatedCount}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setRubricClass(r)}>
                        <ClipboardEdit className="size-4 mr-1.5" aria-hidden="true" /> Grade
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {reviewQuizId && <QuizReview id={reviewQuizId} onClose={() => setReviewQuizId(null)} />}
    </div>
  );
}
