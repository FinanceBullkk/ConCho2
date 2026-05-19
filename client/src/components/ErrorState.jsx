import {
  WifiOff,
  FileQuestion,
  ShieldX,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

const VARIANT_DEFAULTS = {
  network: {
    icon: WifiOff,
    tone: 'danger',
    title: 'Connection lost',
    description: "Couldn't reach the server. Check your network and try again.",
  },
  notFound: {
    icon: FileQuestion,
    tone: 'neutral',
    title: 'Not found',
    description: "We couldn't find what you were looking for.",
  },
  permissionDenied: {
    icon: ShieldX,
    tone: 'warning',
    title: 'Permission denied',
    description: 'You don’t have access to this page. Switch role or sign in.',
  },
  validation: {
    icon: AlertTriangle,
    tone: 'warning',
    title: 'Something needs attention',
    description: 'Please review the highlighted fields.',
  },
};

const TONE_ICON_CLS = {
  danger: 'text-destructive',
  warning: 'text-warning',
  neutral: 'text-subtle-foreground',
};

/**
 * Standard error state.
 *
 * Variants:
 *   network             — request failed / offline / 5xx
 *   notFound            — 404 / missing resource
 *   permissionDenied    — 401 / 403
 *   validation          — form-level error (inline use)
 *
 * Props:
 *   variant         — default 'network'
 *   title           — override default title
 *   description     — override default description
 *   error           — error object/string; overrides description if provided
 *   onRetry         — if provided, renders "Try again" button
 *   onSecondary     — if provided, renders secondary action (e.g. Go back)
 *   secondaryLabel  — label for secondary action (default: 'Go back')
 */
export function ErrorState({
  variant = 'network',
  title,
  description,
  error,
  onRetry,
  onSecondary,
  secondaryLabel = 'Go back',
  className,
}) {
  const cfg = VARIANT_DEFAULTS[variant] ?? VARIANT_DEFAULTS.network;
  const Icon = cfg.icon;
  const iconCls = TONE_ICON_CLS[cfg.tone];

  const resolvedTitle = title ?? cfg.title;
  const errMsg =
    error?.response?.data?.message ||
    (typeof error === 'string' ? error : error?.message);
  const resolvedDescription = description ?? errMsg ?? cfg.description;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-border bg-card px-6 py-12 text-center',
        className
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={2}
        className={cn('size-7', iconCls)}
      />
      <h3 className="text-h3 text-foreground">{resolvedTitle}</h3>
      <p className="text-body max-w-sm text-muted-foreground">{resolvedDescription}</p>
      {(onRetry || onSecondary) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {onSecondary && (
            <Button variant="ghost" size="sm" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              <RotateCcw aria-hidden="true" />
              Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
