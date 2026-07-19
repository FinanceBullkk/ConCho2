import { cn } from '@/lib/utils';

// Small status pill for the English-training tables/overview. Maps the domain's
// status strings (cohort/run status, eligibility, employment, enrollment) to the
// app's 5 semantic tones so the tables read at a glance instead of as raw text.
const TONE_CLS = {
  neutral: 'bg-neutral-tint text-neutral border-border-strong',
  warning: 'bg-warning-tint text-warning border-warning/30',
  info: 'bg-info-tint text-info border-info/30',
  success: 'bg-success-tint text-success border-success/30',
  danger: 'bg-destructive-tint text-destructive border-destructive/30',
};

const STATUS_TONE = {
  // cohort / course-run lifecycle
  planned: 'neutral', active: 'info', completed: 'success', archived: 'neutral', cancelled: 'danger',
  // enrollment
  waiting: 'neutral', transferred: 'neutral', dropped: 'danger',
  // employment
  inactive: 'neutral', unknown: 'neutral',
  // eligibility (exam-sit)
  eligible: 'success', within_limit: 'info', not_eligible: 'danger', not_applicable: 'neutral',
};

const LABELS = {
  within_limit: 'Within limit', not_eligible: 'Not eligible', not_applicable: 'N/A',
};

const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function EngBadge({ status, className }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const tone = STATUS_TONE[status] || 'neutral';
  const label = LABELS[status] || titleCase(status);
  return (
    <span className={cn(
      'inline-flex h-[22px] items-center rounded-full border px-2 text-[12px] font-medium',
      TONE_CLS[tone], className,
    )}>
      {label}
    </span>
  );
}
