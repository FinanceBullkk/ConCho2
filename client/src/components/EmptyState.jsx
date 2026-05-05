import { cn } from '@/lib/utils';

/**
 * Standard empty / "no data" state with optional CTA.
 *
 * Usage:
 *   <EmptyState
 *     icon={<Inbox className="size-10" />}
 *     title="No schedules yet"
 *     description="Pick an empty slot on the calendar to book a session."
 *     action={<Button>Open calendar</Button>}
 *   />
 */
export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-card/40 px-6 py-12 text-center',
        className
      )}
    >
      {icon && <div className="text-muted-foreground/80">{icon}</div>}
      {title && <h3 className="text-base font-semibold text-foreground">{title}</h3>}
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
