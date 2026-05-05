import { cn } from '@/lib/utils';

/**
 * Standard page header — title, optional description and breadcrumbs slot,
 * with right-aligned actions area.
 *
 * Usage:
 *   <PageHeader
 *     title="Classes"
 *     description="All cohorts and their progress"
 *     breadcrumbs={<Breadcrumbs items={[...]} />}
 *     actions={<Button>New cohort</Button>}
 *   />
 */
export function PageHeader({ title, description, breadcrumbs, actions, className }) {
  return (
    <div className={cn('mb-6 space-y-3', className)}>
      {breadcrumbs}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
