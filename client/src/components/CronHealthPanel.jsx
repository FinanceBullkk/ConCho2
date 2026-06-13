import { useTranslation } from 'react-i18next';
import { Clock, AlertTriangle, CheckCircle2, CircleSlash, Loader2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

// ──────────────────────────────────────────────────────────
// CronHealthPanel — presentational view of scheduled-job heartbeats.
//
// Consumes GET /api/admin/cron/health (cronAPI.getHealth). Lets an admin
// confirm that the nightly reconcile + reminder jobs actually fire — the
// "did cron run on the free tier?" production-readiness check. Pure props
// in, no data fetching, so it's trivially testable.
// ──────────────────────────────────────────────────────────

// health verdict (from server deriveHealth) → badge tone + label + icon.
const HEALTH_META = {
  ok:    { tone: 'success',  labelKey: 'cronHealth.status.ok',    icon: CheckCircle2 },
  stale: { tone: 'warning',  labelKey: 'cronHealth.status.stale', icon: AlertTriangle },
  error: { tone: 'danger',   labelKey: 'cronHealth.status.error', icon: AlertTriangle },
  never: { tone: 'upcoming', labelKey: 'cronHealth.status.never', icon: CircleSlash },
};

// Friendly labels for known job names; unknown jobs fall back to the raw id.
const JOB_LABEL_KEYS = {
  reconcile: 'cronHealth.jobs.reconcile',
  'attendance-reminders': 'cronHealth.jobs.attendanceReminders',
  'assignment-reminders': 'cronHealth.jobs.assignmentReminders',
  'certificate-expiry-reminders': 'cronHealth.jobs.certificateExpiryReminders',
};

function relTime(value, t) {
  if (!value) return t('cronHealth.time.never');
  const diffMs = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diffMs)) return t('cronHealth.time.never');
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return t('cronHealth.time.justNow');
  if (mins < 60) return t('cronHealth.time.minutesAgo', { count: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t('cronHealth.time.hoursAgo', { count: hrs });
  return t('cronHealth.time.daysAgo', { count: Math.round(hrs / 24) });
}

function JobRow({ job }) {
  const { t } = useTranslation();
  const meta = HEALTH_META[job.health] ?? HEALTH_META.never;
  const Icon = meta.icon;
  const labelKey = JOB_LABEL_KEYS[job.jobName];
  return (
    <div className="flex items-start gap-3 py-3 px-4 border-b border-border last:border-0">
      <Icon className="size-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">
          {labelKey ? t(labelKey) : job.jobName}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-subtle-foreground">
          <span>{t('cronHealth.lastRun')}: <span className="text-muted-foreground">{relTime(job.lastRunAt, t)}</span></span>
          <span>{t('cronHealth.lastSuccess')}: <span className="text-muted-foreground">{relTime(job.lastSuccessAt, t)}</span></span>
          {job.lastDurationMs > 0 && (
            <span>{t('cronHealth.duration')}: <span className="text-muted-foreground">{job.lastDurationMs}ms</span></span>
          )}
          {job.failCount > 0 && (
            <span>{t('cronHealth.failures')}: <span className="text-warning">{job.failCount}/{job.runCount}</span></span>
          )}
        </div>
        {job.health === 'error' && job.lastError && (
          <div className="mt-1 text-xs text-destructive font-mono break-words">{job.lastError}</div>
        )}
      </div>
      <StatusBadge tone={meta.tone} size="sm" className="shrink-0">{t(meta.labelKey)}</StatusBadge>
    </div>
  );
}

export default function CronHealthPanel({ jobs, isLoading }) {
  const { t } = useTranslation();
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium text-foreground">{t('cronHealth.title')}</span>
        <span className="text-xs text-subtle-foreground ml-auto">{t('cronHealth.subtitle')}</span>
      </div>

      {isLoading && (
        <div className="py-8 flex items-center justify-center text-subtle-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        </div>
      )}

      {!isLoading && (!jobs || jobs.length === 0) && (
        <div className="py-8 text-center text-subtle-foreground text-sm">
          {t('cronHealth.empty')}
        </div>
      )}

      {!isLoading && jobs?.length > 0 && (
        <div className="divide-y divide-border">
          {jobs.map((job) => <JobRow key={job.jobName} job={job} />)}
        </div>
      )}
    </div>
  );
}
