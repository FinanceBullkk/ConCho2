import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Calculator, ArrowUpRight } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { useCostConfig, useExecutiveDashboard } from '../../hooks/useLearningDashboard';
import DashboardCostConfigForm from '../learning/DashboardCostConfigForm';

// TMS.update — dedicated Cost & ROI settings surface (screenshot 27). Reuses the
// existing cost-config form + endpoint; the "Computed outputs" card mirrors the
// server-computed ROI figures (refreshes after save via the mutation's
// invalidation). No client-side math — every number is the §10 server value.

const fmtMinor = (value, currency) =>
  value == null ? '—' : `${Number(value).toLocaleString()} ${currency || ''}`.trim();

function OutputTile({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-subtle-foreground">{label}</div>
      <div className="mt-1 text-h3 font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

export default function CostRoiSettingsPage() {
  const { t } = useTranslation();
  const { data: costConfig, isLoading: configLoading } = useCostConfig();
  const { data: exec, isError } = useExecutiveDashboard();
  const financials = exec?.financials;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('costRoi.title')}
        description={t('costRoi.description')}
        actions={
          <Link
            to="/reports?tab=learning"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            {t('costRoi.viewDashboard')}<ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calculator className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">{t('costRoi.assumptions')}</h2>
          </div>
          {!configLoading && (
            <DashboardCostConfigForm key={costConfig ? 'loaded' : 'empty'} current={costConfig} />
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t('costRoi.computed')}</h2>
            <p className="text-xs text-muted-foreground">{t('costRoi.computedHint')}</p>
          </div>
          {isError ? (
            <EmptyState title={t('costRoi.loadError')} />
          ) : financials?.configured ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <OutputTile label={t('costRoi.costPerEmployee')} value={fmtMinor(financials.costPerEmployeeMinor, financials.currency)} />
              <OutputTile label={t('costRoi.costPerCompletion')} value={fmtMinor(financials.costPerCompletionMinor, financials.currency)} />
              <OutputTile label={t('costRoi.efficiencyDividend')} value={fmtMinor(financials.efficiencyDividendMinor, financials.currency)} />
            </div>
          ) : (
            <EmptyState title={t('costRoi.notConfigured')} />
          )}
        </section>
      </div>
    </div>
  );
}
