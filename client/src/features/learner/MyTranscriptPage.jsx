import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, GraduationCap, Award, ClipboardCheck, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useLearningEnrollments, useLearningCohorts, useCertificates } from '../../hooks/useLearning';
import { useAssessments, useAssessmentAttempts } from '../../hooks/useAssessment';
import { useMyAttendanceStats } from '../../hooks/useAttendance';

// ──────────────────────────────────────────────────────────
// MyTranscriptPage — Cohesion P6 "Learner transcript"
// Route: /me/transcript  (Participant)
//
// One print-friendly record of the learner's training history: program
// enrollments (+ certificate state), an attendance summary, and passed
// assessments. Pure composition over EXISTING self-scoped reads (enrollments,
// cohorts, certificates, attempts, attendance my-stats) — ZERO new backend.
// "Export" = browser print / Save-as-PDF (window.print). English literals
// per the /me/* convention.
// ──────────────────────────────────────────────────────────

const CERT_TONE = {
  issued: 'default',
  expiring: 'secondary',
  expired: 'destructive',
  revoked: 'destructive',
};
const STATUS_TONE = { Active: 'default', Completed: 'secondary', Dropped: 'destructive' };

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function MyTranscriptPage() {
  const { user } = useAuth();
  const { data: enrollmentData, isLoading: loadingEnrollments } = useLearningEnrollments();
  const { data: cohortData, isLoading: loadingCohorts } = useLearningCohorts();
  const { data: certificates = [] } = useCertificates();
  const { data: assessmentsData } = useAssessments();
  const { data: attemptsData } = useAssessmentAttempts();
  const { data: attendance } = useMyAttendanceStats();

  // Mount-time stamp via lazy init — render stays pure (react-hooks/purity).
  const [generatedAt] = useState(() => Date.now());

  const cohortById = useMemo(() => {
    const m = new Map();
    (cohortData?.data || []).forEach((c) => m.set(String(c._id), c));
    return m;
  }, [cohortData]);

  // Latest certificate per cohort (cert list is mine-scoped server-side).
  const certByCohort = useMemo(() => {
    const m = new Map();
    certificates.forEach((c) => {
      const k = String(c.cohortId);
      const cur = m.get(k);
      if (!cur || new Date(c.issuedAt) > new Date(cur.issuedAt)) m.set(k, c);
    });
    return m;
  }, [certificates]);

  const assessmentById = useMemo(() => {
    const m = new Map();
    (assessmentsData?.data || []).forEach((a) => m.set(String(a.id || a._id), a));
    return m;
  }, [assessmentsData]);

  const programs = useMemo(() => (
    (enrollmentData?.data || []).map((e) => {
      const cohort = cohortById.get(String(e.cohortId));
      return {
        id: e.id || e._id,
        program: cohort?.programName || cohort?.courseName || 'Program',
        cohortCode: e.cohortCode || cohort?.cohortCode || '—',
        status: e.status,
        cert: certByCohort.get(String(e.cohortId)) || null,
      };
    })
  ), [enrollmentData, cohortById, certByCohort]);

  const passedQuizzes = useMemo(() => (
    (attemptsData?.data || [])
      .filter((a) => a.passed)
      .map((a) => ({
        id: a.id,
        title: a.assessmentTitle || assessmentById.get(String(a.assessmentId))?.title || 'Quiz',
        scorePercent: a.scorePercent,
        submittedAt: a.submittedAt,
      }))
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
  ), [attemptsData, assessmentById]);

  const loading = loadingEnrollments || loadingCohorts;
  const empty = !loading && programs.length === 0 && passedQuizzes.length === 0
    && (!attendance || attendance.totalSessions === 0);

  return (
    <div className="space-y-5">
      {/* Print: drop the app chrome + the toolbar so the transcript prints clean. */}
      <style>{'@media print { header, .no-print { display: none !important; } body { background: #fff; } }'}</style>

      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Learning transcript"
          description={`${user?.name || ''}${user?.empCode ? ` · ${user.empCode}` : ''}`}
        />
        <Button onClick={() => window.print()} variant="outline" size="sm" className="no-print shrink-0">
          <Printer className="size-4 mr-1.5" aria-hidden="true" /> Print / Save PDF
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Generated {fmtDate(generatedAt)} · your self-service record of completed training, certificates, and attendance.
      </p>

      {loading ? (
        <TableSkeleton rows={5} cols={3} />
      ) : empty ? (
        <EmptyState
          icon={GraduationCap}
          title="No training history yet"
          description="Once you enroll, attend sessions, and pass assessments, your transcript will fill in here."
          action={(
            <Link to="/me/catalog" className="text-sm text-primary font-medium hover:underline underline-offset-2">
              Browse catalog →
            </Link>
          )}
        />
      ) : (
        <>
          {/* ── Attendance summary ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                Attendance summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {attendance && attendance.totalSessions > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    ['Attendance', `${attendance.attendanceRate}%`],
                    ['Present', attendance.present],
                    ['Late', attendance.late],
                    ['Excused', attendance.excused],
                    ['Absent', attendance.absent],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border p-3 text-center">
                      <p className="text-lg font-bold text-foreground">{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>
              )}
            </CardContent>
          </Card>

          {/* ── Programs + certificates ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Award className="size-4 text-muted-foreground" aria-hidden="true" />
                Programs &amp; certificates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {programs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No program enrollments.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Program</th>
                      <th className="py-2 pr-3 font-medium">Cohort</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 font-medium">Certificate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programs.map((p) => (
                      <tr key={p.id} className="border-b border-border/60 align-top">
                        <td className="py-2.5 pr-3 font-medium text-foreground">{p.program}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{p.cohortCode}</td>
                        <td className="py-2.5 pr-3">
                          <Badge variant={STATUS_TONE[p.status] || 'secondary'}>{p.status}</Badge>
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {p.cert ? (
                            <span>
                              <span className="font-mono text-foreground">{p.cert.certificateNumber}</span>
                              {' · '}
                              <Badge variant={CERT_TONE[p.cert.certificateState] || 'secondary'}>
                                {p.cert.certificateState}
                              </Badge>
                              {p.cert.validUntil && <> · valid until {fmtDate(p.cert.validUntil)}</>}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* ── Assessments passed ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                Assessments passed
              </CardTitle>
            </CardHeader>
            <CardContent>
              {passedQuizzes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No passed assessments yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {passedQuizzes.map((q) => (
                    <li key={q.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="text-foreground">{q.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {q.scorePercent != null && <>{q.scorePercent}% · </>}
                        {fmtDate(q.submittedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
