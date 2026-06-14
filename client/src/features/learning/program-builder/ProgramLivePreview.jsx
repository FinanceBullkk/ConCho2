// Live preview pane for the Program builder — a sticky card that reflects the
// form state in real time, so the configurer sees the resulting program shape
// (delivery, completion rules, certificate) as they build.

import { useTranslation } from 'react-i18next';
import { BookOpen, Check, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { completionRules, neverExpires } from './program-form-config';

const overline = 'text-[10.5px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground';

export function ProgramLivePreview({ form }) {
  const { t } = useTranslation();
  const rules = completionRules(form, t);
  const validity = form.certificateValidityDays;
  const never = neverExpires(validity);
  const cap = form.capacityPolicy?.maxParticipants;
  const sched = t(`learning.scheduling.${form.schedulingMode}`);
  const autoRecert = Boolean(form.recertifyPolicy?.autoAssign);

  return (
    <div className="md:sticky md:top-0 md:self-start">
      <div className={cn(overline, 'mb-2.5')}>{t('learning.builder.livePreview')}</div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="px-4 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="grid h-[34px] w-[34px] place-items-center rounded-lg bg-primary-tint text-primary">
              <BookOpen className="h-4 w-4" />
            </span>
            <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {sched}
            </span>
          </div>
          <div className="text-h3 text-foreground">{form.name || t('learning.builder.untitled')}</div>
          <div className="mt-0.5 text-xs text-subtle-foreground">
            {sched}
            {' · '}
            {cap ? t('learning.builder.capacityLabel', { n: cap }) : t('learning.builder.unlimited')}
          </div>
        </div>

        <div className="px-4 pb-4 pt-3.5">
          <div className={cn(overline, 'mb-2')}>{t('learning.builder.completesWhen')}</div>
          <div className="flex flex-wrap gap-1.5">
            {rules.length ? (
              rules.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-1 text-[11px] font-semibold text-success">
                  <Check className="h-3 w-3" />
                  {r}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                {t('learning.builder.enrollmentOnly')}
              </span>
            )}
          </div>

          <hr className="my-3.5 border-border" />

          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('learning.builder.certificate')}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-tint px-2 py-1 text-[11px] font-semibold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {t('learning.builder.issued')}
            </span>
          </div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('learning.builder.validity')}</span>
            <span className="font-medium text-foreground">
              {never ? t('learning.builder.neverExpires') : t('learning.builder.daysValid', { n: validity })}
            </span>
          </div>
          {autoRecert && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('learning.builder.recert')}</span>
              <span className="inline-flex items-center rounded-full bg-primary-tint px-2 py-1 text-[11px] font-semibold text-primary">
                {t('learning.builder.automatic')}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-subtle-foreground">
        <Info className="h-3 w-3 shrink-0" />
        {t('learning.builder.mapsTo')} <span className="font-mono">LearningProgram.completionPolicy</span>
      </div>
    </div>
  );
}
