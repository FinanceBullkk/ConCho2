import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useCompletion, useCertificates, useLearningSessions } from '../../hooks/useLearning';

// ──────────────────────────────────────────────────────────
// MyProgramPage — Cohesion P1 "Learner Program Home"
// Route: /me/programs/:cohortId  (Participant)
//
// One hub per active enrollment: the completion checklist (the program's
// completionPolicy requirements vs MY current state), certificate state,
// this cohort's upcoming sessions, and links to take a quiz / submit
// feedback. Pure composition over EXISTING self-scoped read APIs — the
// completion engine already computes everything server-side.
// English literals by /me/* convention.
// ──────────────────────────────────────────────────────────

const CERT_BADGE = {
  issued:   { variant: 'default',     label: 'Certificate issued' },
  expiring: { variant: 'secondary',   label: 'Certificate expiring soon' },
  expired:  { variant: 'destructive', label: 'Certificate expired' },
  revoked:  { variant: 'destructive', label: 'Certificate revoked' },
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const fmtSession = (s) => {
  const start = new Date(s.startTime);
  const end = s.endTime ? new Date(s.endTime) : null;
  const day = start.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
  const hm = (x) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
  return `${day} · ${hm(start)}${end ? `–${hm(end)}` : ''}`;
};

// One checklist row: requirement label + met/unmet state + detail + optional CTA.
function ChecklistRow({ icon, met, title, detail, action }) {
  const StateIcon = met ? CheckCircle2 : XCircle;
  const ReqIcon = icon;
  return (
    <li className="flex items-start gap-3 py-3">
      <StateIcon
        className={`mt-0.5 size-5 shrink-0 ${met ? 'text-success' : 'text-muted-foreground'}`}
        aria-label={met ? 'Requirement met' : 'Requirement not met'}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ReqIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </div>
      {action}
    </li>
  );
}

export default function MyProgramPage() {
  const { cohortId } = useParams();
  const { data: completion, isLoading: loadingCompletion, isError } = useCompletion({ cohortId });
  const { data: certificates = [] } = useCertificates({ cohortId });
  const { data: sessionData, isLoading: loadingSessions } = useLearningSessions({ cohortId, limit: 200 });

  // Mount-time "now" via lazy state init — render stays pure
  // (react-hooks/purity); the upcoming split doesn't need a live clock.
  const [now] = useState(() => Date.now());
  const upcoming = useMemo(() => (
    (sessionData?.data || [])
      .filter((s) => new Date(s.startTime).getTime() >= now)
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
      .slice(0, 5)
  ), [sessionData, now]);

  // Latest live certificate for this cohort (list is mine-scoped already).
  const certificate = useMemo(() => {
    const live = certificates.filter((c) => c.certificateState !== 'revoked');
    const pool = live.length ? live : certificates;
    return [...pool].sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt))[0] || null;
  }, [certificates]);

  if (loadingCompletion) {
    return (
      <div>
        <PageHeader title="My program" description="Loading your progress…" />
        <TableSkeleton rows={4} cols={2} />
      </div>
    );
  }

  if (isError || !completion) {
    return (
      <div>
        <PageHeader title="My program" description="Program progress." />
        <EmptyState
          icon={GraduationCap}
          title="Progress unavailable"
          description="We could not load this program. It may have been archived, or you are not enrolled."
        />
        <div className="mt-4 text-center">
          <Link to="/me/programs" className="text-sm text-primary font-medium hover:underline underline-offset-2">
            ← Back to my programs
          </Link>
        </div>
      </div>
    );
  }

  const { attendance, assessment, feedback, complete, programName, cohortCode } = completion;
  const certBadge = certificate ? CERT_BADGE[certificate.certificateState] : null;

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/me/programs"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" /> My programs
        </Link>
        <PageHeader
          title={programName || 'My program'}
          description={`Cohort ${cohortCode || ''} · your progress toward completion.`}
        />
      </div>

      {/* ── Completion state banner ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={complete ? 'default' : 'secondary'}>
          {complete ? 'Requirements complete' : 'In progress'}
        </Badge>
        {certBadge && <Badge variant={certBadge.variant}>{certBadge.label}</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Checklist ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Completion checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              <ChecklistRow
                icon={ClipboardList}
                met={attendance.met}
                title="Attendance"
                detail={`${attendance.attendedSessions}/${attendance.totalSessions} sessions attended (${attendance.percent}% · required ${attendance.thresholdPercent}%)`}
              />
              {assessment.required && (
                <ChecklistRow
                  icon={GraduationCap}
                  met={assessment.met}
                  title="Assessment"
                  detail={assessment.met
                    ? (assessment.attemptScorePercent != null
                      ? `Passed with ${assessment.attemptScorePercent}%`
                      : 'Requirement met')
                    : 'Pass a published quiz for this cohort'}
                  action={!assessment.met && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/me/assessments">Take quiz</Link>
                    </Button>
                  )}
                />
              )}
              {feedback.required && (
                <ChecklistRow
                  icon={MessageSquare}
                  met={feedback.met}
                  title="Feedback"
                  detail={feedback.submitted ? 'Feedback submitted' : 'Share your feedback for this cohort'}
                  action={!feedback.met && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/me/feedback">Give feedback</Link>
                    </Button>
                  )}
                />
              )}
            </ul>
          </CardContent>
        </Card>

        {/* ── Certificate ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="size-4 text-muted-foreground" aria-hidden="true" />
              Certificate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {certificate ? (
              <>
                <p className="font-mono text-foreground">{certificate.certificateNumber}</p>
                <p className="text-muted-foreground">
                  Issued {fmtDate(certificate.issuedAt)}
                  {certificate.validUntil && <> · valid until {fmtDate(certificate.validUntil)}</>}
                </p>
              </>
            ) : complete ? (
              <p className="text-muted-foreground">
                All requirements are met — your certificate will appear here once issued.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Complete the checklist to earn a certificate for this program.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Upcoming sessions ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
            Upcoming sessions
          </CardTitle>
          <Link to="/me/sessions" className="text-xs text-primary font-medium hover:underline underline-offset-2">
            All sessions →
          </Link>
        </CardHeader>
        <CardContent>
          {loadingSessions ? (
            <TableSkeleton rows={2} cols={2} />
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming sessions scheduled for this cohort.</p>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((s) => (
                <li key={s.id || s._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="text-foreground">{fmtSession(s)}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.room?.name || s.office?.name || (s.meetLink ? 'Online' : '')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
