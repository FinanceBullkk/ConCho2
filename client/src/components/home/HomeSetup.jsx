import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Check, ArrowRight, X } from 'lucide-react';

// Home onboarding checklist + "At a glance" panel (screenshot 01). Both read the
// /dashboard/setup endpoint (real config signals + this-week counts) — no mock data.

const DISMISS_KEY = 'tms-onboarding-dismissed';

export function OnboardingChecklist({ setup }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  if (dismissed || !setup) return null;

  const pct = setup.totalSteps ? Math.round((setup.completedSteps / setup.totalSteps) * 100) : 0;
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode — just hide for now */ }
    setDismissed(true);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="onboarding-checklist">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary"><Sparkles className="size-4" aria-hidden="true" /></span>
          <div>
            <div className="font-semibold text-foreground">{t('dashboard.onboarding.title')}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.onboarding.progress', { done: setup.completedSteps, total: setup.totalSteps, pct })}</div>
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label={t('dashboard.onboarding.dismiss')} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {setup.steps.map((s) => (
          <div key={s.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            {s.done
              ? <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
              : <span className="size-4 shrink-0 rounded-full border border-muted-foreground/40" aria-hidden="true" />}
            <span className={s.done ? 'text-muted-foreground line-through' : 'text-foreground'}>{t(`dashboard.onboarding.steps.${s.key}`)}</span>
            {!s.done && <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AtAGlance({ atGlance }) {
  const { t } = useTranslation();
  if (!atGlance) return null;
  const { activeLearners = 0, totalEmployees = 0, sessionsThisWeek = 0, pendingEnrollment = 0 } = atGlance;
  const pct = totalEmployees > 0 ? Math.round((activeLearners / totalEmployees) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="at-a-glance">
      <div className="text-sm font-semibold text-foreground">{t('dashboard.atGlance.title')}</div>
      <div className="text-xs text-muted-foreground">{t('dashboard.atGlance.thisWeek')}</div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted-foreground">{t('dashboard.atGlance.activeLearners')}</div>
          <div className="text-h3 font-semibold tabular-nums text-foreground">
            {activeLearners.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">/ {totalEmployees.toLocaleString()}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t('dashboard.atGlance.sessionsScheduled')}</div>
          <div className="text-h3 font-semibold tabular-nums text-foreground">{sessionsThisWeek}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{t('dashboard.atGlance.pendingEnrollment')}</div>
          <div className="text-h3 font-semibold tabular-nums text-foreground">{pendingEnrollment}</div>
        </div>
      </div>
    </div>
  );
}
