import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ──────────────────────────────────────────────────────────
// ProgramEnrollmentCard — one active enrollment → its program hub
// (Cohesion P1/P2). Shared by /me/programs and the Participant
// dashboard "My programs" band. English literals (/me/* convention).
// ──────────────────────────────────────────────────────────

const STATUS_TONE = { Active: 'default', Completed: 'secondary', Dropped: 'destructive' };

export default function ProgramEnrollmentCard({ enrollment, cohort }) {
  return (
    <Link to={`/me/programs/${enrollment.cohortId}`} className="group">
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
  );
}
