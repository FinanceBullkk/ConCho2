import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Compact breadcrumb trail.
 *
 * Usage:
 *   <Breadcrumbs items={[
 *     { label: 'Home', to: '/' },
 *     { label: 'Academy', to: '/academy' },
 *     { label: 'Classes', to: '/academy?tab=classes' },
 *     { label: classCode },                            // last item: no `to`
 *   ]} />
 */
export function Breadcrumbs({ items, className }) {
  if (!items || items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center text-sm', className)}>
      <ol className="flex items-center gap-1 text-muted-foreground">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={idx} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="size-3.5 text-muted-foreground/60" />}
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  className="rounded px-1 transition-colors hover:bg-accent hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn('px-1', isLast && 'font-medium text-foreground')}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
