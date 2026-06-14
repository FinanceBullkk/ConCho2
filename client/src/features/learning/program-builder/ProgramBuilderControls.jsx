// Presentational controls for the Program builder: the clickable step rail and
// the delivery-profile (schedulingMode) picker cards.

import { useTranslation } from 'react-i18next';
import { Check, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STEP_KEYS } from './program-form-config';

// Step indicator rail. Past steps show a tick, the current step is filled, and
// every step is clickable to jump straight there.
export function StepRail({ step, setStep }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-5 py-3">
      {STEP_KEYS.map((key, i) => (
        <div key={key} className="flex items-center">
          <button
            type="button"
            onClick={() => setStep(i)}
            className="flex items-center gap-2 whitespace-nowrap rounded-md px-1.5 py-1 hover:bg-accent"
          >
            <span
              className={cn(
                'grid h-[22px] w-[22px] place-items-center rounded-full text-[11px] font-bold tabular-nums',
                i < step
                  ? 'bg-success text-success-foreground'
                  : i === step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-2 text-subtle-foreground',
              )}
            >
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={cn('text-small', i === step ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>
              {t(`learning.builder.steps.${key}`)}
            </span>
          </button>
          {i < STEP_KEYS.length - 1 && <div className="mx-1 h-px w-3.5 bg-border" />}
        </div>
      ))}
    </div>
  );
}

// One delivery-profile card. The whole card is a <label> wrapping a visually
// hidden radio, so it is keyboard-reachable and screen-reader labelled while
// looking like a selectable tile.
export function ProfileCard({ profile, active, onSelect }) {
  const { t } = useTranslation();
  const Icon = profile.icon;
  const label = t(`learning.scheduling.${profile.key}`);
  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col rounded-lg border p-3 transition-colors',
        active ? 'border-primary bg-primary-tint' : 'border-border bg-card hover:border-primary/50',
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className={cn(
            'grid h-[30px] w-[30px] place-items-center rounded-lg',
            active ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <input
          type="radio"
          name="schedulingMode"
          value={profile.key}
          checked={active}
          onChange={onSelect}
          aria-label={label}
          className="sr-only"
        />
        {active && <CircleCheck className="h-4 w-4 text-primary" />}
      </div>
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-0.5 text-xs text-subtle-foreground">{t(`learning.builder.schedulingDesc.${profile.key}`)}</div>
    </label>
  );
}
