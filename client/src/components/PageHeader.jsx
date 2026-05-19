import { cn } from '@/lib/utils';

/**
 * Page-level header. Layout-only, no internal state.
 *
 * Slots:
 *   title       — required, string or node, rendered as h1 (h2 in compact)
 *   description — optional, short body paragraph
 *   breadcrumb  — optional, render before title (e.g. <Breadcrumbs />)
 *   actions     — optional, right-aligned button cluster
 *   filters     — optional, full-width row below header (e.g. <FilterBar />)
 *
 * Variants (implicit from slot combinations):
 *   bare              — title + description
 *   with-actions      — title + description + actions
 *   with-breadcrumb   — breadcrumb + title + actions
 *   full              — all slots
 *   compact           — title becomes h2, description hidden
 *
 * Phase 1 §01 spec. No entry animation; structural element, not surprise.
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  filters,
  compact = false,
  className,
}) {
  const TitleTag = compact ? 'h2' : 'h1';
  return (
    <header className={cn('mb-6 border-b border-border pb-4', className)}>
      {breadcrumb && <div className="mb-3 text-small">{breadcrumb}</div>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <TitleTag
            className={cn(
              'text-foreground',
              compact ? 'text-h2' : 'text-h1'
            )}
          >
            {title}
          </TitleTag>
          {description && !compact && (
            <p className="text-body max-w-[65ch] text-muted-foreground">{description}</p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            {actions}
          </div>
        )}
      </div>

      {filters && <div className="mt-4">{filters}</div>}
    </header>
  );
}
