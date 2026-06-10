import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { useCostConfig, useExecutiveDashboard } from '../../hooks/useLearningDashboard';
import { MetricBars, MetricUnavailable, StatTile } from './DashboardWidgets';
import { DonutStat, Sparkline } from './DashboardCharts';
import DashboardKirkpatrick from './DashboardKirkpatrick';
import DashboardCostConfigForm from './DashboardCostConfigForm';

// Executive (ROI) view — low density, trends and story; the persuasion layer.
// Server enforces Admin-only; this panel is reached via the Admin-only toggle.
const x = 'learning.dashboard.executive';
const pc = (value) => `${value ?? 0}%`;
const fmtMinor = (value, currency) =>
  value == null ? '—' : `${Number(value).toLocaleString()} ${currency}`;

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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={t(`${x}.costPerEmployee`)}
              value={fmtMinor(financials.costPerEmployeeMinor, financials.currency)}
              hint={t(`${x}.activeEmployees`) + `: ${financials.activeEmployees}`}
            />
            <StatTile
              label={t(`${x}.costPerCompletion`)}
              value={fmtMinor(financials.costPerCompletionMinor, financials.currency)}
              hint={t(`${x}.completions12m`) + `: ${financials.completionsTrailing12Months}`}
            />
            <StatTile
              label={t(`${x}.annualBudget`)}
              value={fmtMinor(financials.annualBudgetMinor, financials.currency)}
              hint={t(`${x}.minorUnitsHint`)}
            />
            <StatTile label={t(`${x}.activeEmployees`)} value={financials.activeEmployees} />
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
    <div className="space-y-4">
      {data.errors?.length ? (
        <p className="rounded-md border border-destructive/50 px-3 py-2 text-xs text-destructive">
          {t('learning.dashboard.partialWarning', {
            metrics: data.errors.map((e) => e.metric).join(', '),
          })}
        </p>
      ) : null}

      <FinancialsSection financials={financials} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t(`${x}.trendTitle`)}>
          {trend ? (
            <Sparkline
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
          ) : <MetricUnavailable />}
        </Section>

        <Section title={t(`${x}.kirkpatrickTitle`)}>
          {kirkpatrick ? <DashboardKirkpatrick kirkpatrick={kirkpatrick} /> : <MetricUnavailable />}
        </Section>

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
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile
                label={t('learning.dashboard.tiles.coverage')}
                value={pc(coverage.coveragePercent)}
                hint={`${coverage.engagedParticipants}/${coverage.activeParticipants}`}
              />
            </div>
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
          </>
        ) : <MetricUnavailable />}
      </Section>
    </div>
  );
}
