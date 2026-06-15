import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, Coins, PiggyBank, Users, Target, Award, Zap, Sparkles, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { useCostConfig, useExecutiveDashboard } from '../../hooks/useLearningDashboard';
import { MetricBars, MetricUnavailable, StatTile } from './DashboardWidgets';
import { AreaTrend, DonutStat } from './DashboardCharts';
import DashboardKirkpatrick from './DashboardKirkpatrick';
import DashboardCostConfigForm from './DashboardCostConfigForm';

// Executive (ROI) view — low density, trends and story; the persuasion layer.
// Server enforces Admin-only; this panel is reached via the Admin-only toggle.
const x = 'learning.dashboard.executive';
const pc = (value) => `${value ?? 0}%`;
const fmtMinor = (value, currency) =>
  value == null ? '—' : `${Number(value).toLocaleString()} ${currency}`;

const ROI_TONE = {
  primary: 'bg-primary-tint text-primary',
  success: 'bg-success-tint text-success',
  info: 'bg-info-tint text-info',
  warning: 'bg-warning-tint text-warning',
};

// Small "how it's calculated" info popover — keeps the §10 formula visible so
// leadership can audit every headline figure (handoff requirement).
function InfoTip({ text }) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={t(`${x}.howCalculated`)} className="text-subtle-foreground transition-colors hover:text-foreground">
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}

// ROI hero tile — like StatTile but carries an info tooltip on the label row.
function RoiHero({ icon: Icon, tone = 'primary', label, value, hint, info }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className={cn('grid size-[30px] shrink-0 place-items-center rounded-lg', ROI_TONE[tone])}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {info && <span className="ml-auto"><InfoTip text={info} /></span>}
      </div>
      <p className="mt-2.5 text-[28px] font-bold leading-none tracking-tight tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-subtle-foreground">{hint}</p> : null}
    </div>
  );
}

// One-sentence story assembled from the real bundle; unconfigured parts drop
// out so we never narrate a fabricated number.
function NarrativeBanner({ coverage, financials }) {
  const { t } = useTranslation();
  if (!coverage) return null;
  let text = t(`${x}.narrativeCoverage`, {
    coverage: coverage.coveragePercent ?? 0,
    engaged: coverage.engagedParticipants ?? 0,
    active: coverage.activeParticipants ?? 0,
  });
  if (financials?.configured) {
    if (financials.completionsTrailing12Months != null) {
      text += t(`${x}.narrativeCompletions`, { count: financials.completionsTrailing12Months });
    }
    if (financials.costPerCompletionMinor != null) {
      text += t(`${x}.narrativeCost`, { value: fmtMinor(financials.costPerCompletionMinor, financials.currency) });
    }
    if (financials.efficiencyDividendMinor != null) {
      text += t(`${x}.narrativeEfficiency`, { value: fmtMinor(financials.efficiencyDividendMinor, financials.currency) });
    }
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary-tint/40 p-4">
      <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-sm text-foreground">{`${text}.`}</p>
    </div>
  );
}

// ROI heroes row — the four headline figures from §10, each with a tooltip.
function RoiHeroes({ coverage, financials }) {
  const { t } = useTranslation();
  if (!coverage && !financials?.configured) return null;
  const f = financials?.configured ? financials : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {coverage ? (
        <RoiHero
          icon={Target}
          tone="primary"
          label={t(`${x}.roiCoverage`)}
          value={pc(coverage.coveragePercent)}
          hint={t(`${x}.ofEmployees`, { engaged: coverage.engagedParticipants ?? 0, active: coverage.activeParticipants ?? 0 })}
          info={t(`${x}.howCoverage`)}
        />
      ) : null}
      {f && f.completionsTrailing12Months != null ? (
        <RoiHero
          icon={Award}
          tone="success"
          label={t(`${x}.roiCompletions`)}
          value={f.completionsTrailing12Months}
          info={t(`${x}.howCompletions`)}
        />
      ) : null}
      {f ? (
        <RoiHero
          icon={Coins}
          tone="info"
          label={t(`${x}.roiCostPerCompletion`)}
          value={fmtMinor(f.costPerCompletionMinor, f.currency)}
          info={`${t(`${x}.howCostPerCompletion`)} ${t(`${x}.atdBenchmark`)}`}
        />
      ) : null}
      {f ? (
        <RoiHero
          icon={Zap}
          tone="warning"
          label={t(`${x}.roiEfficiency`)}
          value={f.efficiencyDividendMinor == null ? '—' : `${fmtMinor(f.efficiencyDividendMinor, f.currency)}${t(`${x}.perYear`)}`}
          hint={f.efficiencyDividendMinor == null ? t(`${x}.efficiencyNotConfigured`) : undefined}
          info={t(`${x}.howEfficiency`)}
        />
      ) : null}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function FinancialsSection({ financials }) {
  const { t } = useTranslation();
  const { data: costConfig } = useCostConfig();
  // Show the form by default when nothing is configured; otherwise behind Edit.
  const [editing, setEditing] = useState(false);
  const configured = financials?.configured;

  return (
    <Section title={t(`${x}.financialsTitle`)}>
      {financials == null ? <MetricUnavailable /> : null}
      {financials && !configured ? (
        <p className="text-sm text-muted-foreground">{t(`${x}.notConfigured`)}</p>
      ) : null}
      {configured ? (
        <>
          {/* Cost per completion + efficiency dividend are now ROI heroes at
              the top; this detail section keeps budget context + the editor. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile
              icon={Wallet}
              tone="primary"
              label={t(`${x}.costPerEmployee`)}
              value={fmtMinor(financials.costPerEmployeeMinor, financials.currency)}
              hint={t(`${x}.activeEmployees`) + `: ${financials.activeEmployees}`}
            />
            <StatTile
              icon={PiggyBank}
              tone="success"
              label={t(`${x}.annualBudget`)}
              value={fmtMinor(financials.annualBudgetMinor, financials.currency)}
              hint={t(`${x}.minorUnitsHint`)}
            />
            <StatTile icon={Users} tone="neutral" label={t(`${x}.activeEmployees`)} value={financials.activeEmployees} />
          </div>
          {!editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {t(`${x}.editBudget`)}
            </Button>
          ) : null}
        </>
      ) : null}
      {financials && (!configured || editing) ? (
        // Key on config presence: when the saved config loads, the form
        // remounts with prefilled values (no setState-in-effect).
        <DashboardCostConfigForm
          key={costConfig ? 'loaded' : 'empty'}
          current={costConfig}
          onSaved={() => setEditing(false)}
        />
      ) : null}
    </Section>
  );
}

export default function DashboardExecutivePanel() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useExecutiveDashboard();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" data-testid="executive-skeleton">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-3">
        <EmptyState title={t(`${x}.loadError`)} description={t(`${x}.loadErrorDesc`)} />
        <div className="flex justify-center">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            {t('learning.dashboard.retry')}
          </Button>
        </div>
      </div>
    );
  }

  const { coverage, trend, kirkpatrick, mobility, certificates, financials } = data;

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4">
      {data.errors?.length ? (
        <p className="rounded-md border border-destructive/50 px-3 py-2 text-xs text-destructive">
          {t('learning.dashboard.partialWarning', {
            metrics: data.errors.map((e) => e.metric).join(', '),
          })}
        </p>
      ) : null}

      <NarrativeBanner coverage={coverage} financials={financials} />
      <RoiHeroes coverage={coverage} financials={financials} />

      <FinancialsSection financials={financials} />

      {/* Trend (hero area chart, wider) + Kirkpatrick rollup */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Section title={t(`${x}.trendTitle`)}>
          {trend ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">
                  {trend.months[trend.months.length - 1]?.enrollments ?? 0}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(`${x}.trendEnrollments`)} · {trend.months[trend.months.length - 1]?.month}
                </span>
              </div>
              <AreaTrend
                title={t(`${x}.trendTitle`)}
                labels={trend.months.map((m) => m.month)}
                series={[
                  {
                    key: 'enrollments',
                    label: t(`${x}.trendEnrollments`),
                    points: trend.months.map((m) => m.enrollments),
                    className: 'text-primary',
                  },
                  {
                    key: 'certificates',
                    label: t(`${x}.trendCertificates`),
                    points: trend.months.map((m) => m.certificatesIssued),
                    className: 'text-muted-foreground',
                  },
                ]}
              />
            </>
          ) : <MetricUnavailable />}
        </Section>

        <Section title={t(`${x}.kirkpatrickTitle`)}>
          {kirkpatrick ? <DashboardKirkpatrick kirkpatrick={kirkpatrick} /> : <MetricUnavailable />}
        </Section>
      </div>

      {/* Certificate validity + internal mobility */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t(`${x}.certTitle`)}>
          {certificates ? (
            <DonutStat
              title={t(`${x}.certTitle`)}
              centerValue={certificates.totalIssued}
              centerLabel={t(`${x}.certValid`)}
              segments={[
                { label: t(`${x}.certValid`), value: certificates.valid, className: 'text-primary' },
                { label: t(`${x}.certExpiring`), value: certificates.expiring30, className: 'text-muted-foreground' },
                { label: t(`${x}.certExpired`), value: certificates.expired, className: 'text-destructive' },
              ]}
            />
          ) : <MetricUnavailable />}
        </Section>

        <Section title={t(`${x}.mobilityTitle`)}>
          {mobility ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile label={t(`${x}.activePaths`)} value={mobility.activePaths} />
              <StatTile
                label={t(`${x}.pathCompletions`)}
                value={mobility.certificateBasedPathCompletions}
                hint={t(`${x}.pathCompletionsHint`)}
              />
            </div>
          ) : <MetricUnavailable />}
        </Section>
      </div>

      <Section title={t(`${x}.coverageTitle`)}>
        {coverage ? (
          // Headline coverage % is a ROI hero above; this section keeps the
          // by-department breakdown the hero doesn't show.
          <MetricBars
            title={t('learning.dashboard.byDepartment')}
            rows={(coverage.departments || []).slice(0, 8).map((row) => ({
              key: row.department,
              label: row.department,
              display: pc(row.percent),
              percent: row.percent,
              detail: `${row.engaged}/${row.active}`,
            }))}
          />
        ) : <MetricUnavailable />}
      </Section>
    </div>
    </TooltipProvider>
  );
}
