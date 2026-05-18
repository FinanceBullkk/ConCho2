import { Inbox, SearchX, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const VARIANT_DEFAULTS = {
  firstTime: {
    icon: Inbox,
    tone: 'neutral',
  },
  filtered: {
    icon: SearchX,
    tone: 'neutral',
  },
  success: {
    icon: CheckCircle2,
    tone: 'success',
  },
};

const TONE_ICON_CLS = {
  neutral: 'text-subtle-foreground',
  success: 'text-success',
};

/**
 * Empty / "no data" state.
 *
 * Anatomy (Phase 1 §02): icon + title + description + actions
 *
 * Variants:
 *   firstTime  — first time a list is empty (offer primary CTA)
 *   filtered   — empty after filter (offer reset)
 *   success    — passive success (no CTA needed)
 *
 * Props:
 *   variant            — one of the above. Default 'firstTime'.
 *   icon               — override default Lucide icon (component, not element)
 *   title              — string or node, h3
 *   description        — string or node, body
 *   action             — primary action node (Button)
 *   secondaryAction    — secondary action node
 */
export function EmptyState({
  variant = 'firstTime',
  icon: IconOverride,
  title,
  description,
  action,
  secondaryAction,
  className,
}) {
  const cfg = VARIANT_DEFAULTS[variant] ?? VARIANT_DEFAULTS.firstTime;
  const Icon = IconOverride ?? cfg.icon;
  const iconCls = TONE_ICON_CLS[cfg.tone];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-border bg-card px-6 py-12 text-center',
        className
      )}
    >
      {Icon && (
        <Icon
          aria-hidden="true"
          strokeWidth={2}
          className={cn('size-7', iconCls)}
        />
      )}
      {title && <h3 className="text-h3 text-foreground">{title}</h3>}
      {description && (
        <p className="text-body max-w-sm text-muted-foreground">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {secondaryAction}
          {action}
        </div>
      )}
    </div>
  );
}
