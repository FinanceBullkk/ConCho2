import { CheckCircle2, Lock, PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Presentational view of one learning path's per-learner progress.
// `progress` is the `/paths/:id/progress` payload ({ steps, summary }) or
// undefined while loading. Pure — the parent owns data fetching.
const STEP = {
  completed: { label: 'Completed', icon: CheckCircle2, tone: 'text-success', badge: 'default' },
  current: { label: 'Current', icon: PlayCircle, tone: 'text-primary', badge: 'secondary' },
  locked: { label: 'Locked', icon: Lock, tone: 'text-muted-foreground', badge: 'outline' },
};

export default function PathProgressView({ title, code, progress, loading }) {
  const summary = progress?.summary;
  const steps = progress?.steps || [];
  const percent = summary?.percentComplete ?? 0;

  return (
    <Card className="rounded-lg">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{code}</p>
          </div>
          {summary && (
            <Badge variant={summary.complete ? 'default' : 'secondary'} className="tabular-nums">
              {summary.completed}/{summary.total}
            </Badge>
          )}
        </div>
        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading progress…</p>
        ) : !steps.length ? (
          <p className="text-sm text-muted-foreground">This path has no programs yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {steps.map((step) => {
              const meta = STEP[step.status] || STEP.locked;
              const Icon = meta.icon;
              return (
                <li key={step.order} className="flex items-center gap-2.5">
                  <span className="text-xs text-muted-foreground w-5 tabular-nums">{step.order}.</span>
                  <Icon className={`size-4 shrink-0 ${meta.tone}`} aria-hidden="true" />
                  <span className="text-sm text-foreground flex-1 truncate">
                    {step.program?.name || step.program?.code || '—'}
                  </span>
                  <Badge variant={meta.badge} className="shrink-0">{meta.label}</Badge>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
