import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, Plus, Archive, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import { useRole } from '@/hooks/useRole';
import { useLearningPrograms } from '../../hooks/useLearning';
import { useDepartments } from '../../hooks/useOrg';
import {
  useTenantCurrency, useBudgetVariance, useCostRollup,
  useCreateBudget, useArchiveBudget, useCreateCostEntry,
} from './useFinance';

// ──────────────────────────────────────────────────────────
// BudgetDashboardPage — A1 (Modernization Horizon 1)
// Budget-vs-actual variance + cost roll-up per fiscal year. Amounts are integer
// MINOR currency units. Read + write both need budget.manage (Admin/Coordinator).
// ──────────────────────────────────────────────────────────

const inputCls =
  'h-(--control-h) rounded-md border border-input bg-background px-3 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring';

const COST_TYPES = ['trainer', 'venue', 'material', 'vendor', 'travel', 'other'];
const GROUP_BYS = ['program', 'department', 'type', 'cohort', 'vendor'];

const fmtMinor = (value, currency) =>
  value == null ? '—' : `${Number(value).toLocaleString()}${currency ? ` ${currency}` : ''}`;

// Current year and the two on either side — enough for FY navigation.
const yearOptions = () => {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1].map(String);
};

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-overline text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function NewBudgetForm({ fiscalYear, programs, departments, onClose }) {
  const { t } = useTranslation();
  const create = useCreateBudget();
  const [form, setForm] = useState({ fiscalYear, departmentId: '', programId: '', amountMinor: '', label: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(form.fiscalYear) || !form.amountMinor) return;
    create.mutate({
      fiscalYear: form.fiscalYear,
      ...(form.departmentId ? { departmentId: form.departmentId } : {}),
      ...(form.programId ? { programId: form.programId } : {}),
      amountMinor: Number(form.amountMinor),
      ...(form.label.trim() ? { label: form.label.trim() } : {}),
    }, { onSuccess: onClose });
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
      <Field label={t('budget.fiscalYear')}><input value={form.fiscalYear} onChange={set('fiscalYear')} className={`${inputCls} w-24`} /></Field>
      <Field label={`${t('budget.department')} (${t('budget.optional')})`}>
        <select value={form.departmentId} onChange={set('departmentId')} className={`${inputCls} min-w-[160px]`}>
          <option value="">—</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label={`${t('budget.program')} (${t('budget.optional')})`}>
        <select value={form.programId} onChange={set('programId')} className={`${inputCls} min-w-[160px]`}>
          <option value="">—</option>
          {programs.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label={t('budget.amountMinor')}><input type="number" min="0" value={form.amountMinor} onChange={set('amountMinor')} className={`${inputCls} w-36`} /></Field>
      <Button type="submit" size="sm" disabled={create.isPending}><Plus className="size-3.5" aria-hidden="true" />{t('budget.create')}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={onClose}>{t('budget.cancel')}</Button>
    </form>
  );
}

function NewCostForm({ programs, departments, onClose }) {
  const { t } = useTranslation();
  const create = useCreateCostEntry();
  const [form, setForm] = useState({ type: 'trainer', amountMinor: '', incurredOn: '', programId: '', departmentId: '', poRef: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.amountMinor || !form.incurredOn) return;
    const scope = {};
    if (form.programId) scope.programId = form.programId;
    if (form.departmentId) scope.departmentId = form.departmentId;
    create.mutate({
      ...(Object.keys(scope).length ? { scope } : {}),
      type: form.type,
      amountMinor: Number(form.amountMinor),
      incurredOn: form.incurredOn,
      ...(form.poRef.trim() ? { poRef: form.poRef.trim() } : {}),
    }, { onSuccess: onClose });
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
      <Field label={t('budget.type')}>
        <select value={form.type} onChange={set('type')} className={inputCls}>
          {COST_TYPES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
        </select>
      </Field>
      <Field label={t('budget.amountMinor')}><input type="number" min="0" value={form.amountMinor} onChange={set('amountMinor')} className={`${inputCls} w-36`} /></Field>
      <Field label={t('budget.incurredOn')}><input type="date" value={form.incurredOn} onChange={set('incurredOn')} className={inputCls} /></Field>
      <Field label={`${t('budget.program')} (${t('budget.optional')})`}>
        <select value={form.programId} onChange={set('programId')} className={`${inputCls} min-w-[150px]`}>
          <option value="">—</option>
          {programs.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label={`${t('budget.department')} (${t('budget.optional')})`}>
        <select value={form.departmentId} onChange={set('departmentId')} className={`${inputCls} min-w-[150px]`}>
          <option value="">—</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label={`${t('budget.poRef')} (${t('budget.optional')})`}><input value={form.poRef} onChange={set('poRef')} className={`${inputCls} w-32`} /></Field>
      <Button type="submit" size="sm" disabled={create.isPending}><Plus className="size-3.5" aria-hidden="true" />{t('budget.create')}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={onClose}>{t('budget.cancel')}</Button>
    </form>
  );
}

function VarianceTable({ fiscalYear, canManage }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useBudgetVariance({ fiscalYear });
  const archive = useArchiveBudget();
  const rows = data?.rows || [];
  const totals = data?.totals;

  if (isLoading) return <div className="py-10 flex justify-center"><Spinner size={22} /></div>;
  if (isError) return <div className="py-8 text-center text-destructive text-sm">{t('budget.loadError')}</div>;
  if (!rows.length) return <EmptyState icon={Wallet} title={t('budget.noBudgets')} />;

  const scopeLabel = (r) => r.label || r.program || r.department || 'Org-wide';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Scope</th>
            <th scope="col" className="px-4 py-2 text-overline text-muted-foreground text-right">{t('budget.budgetCol')}</th>
            <th scope="col" className="px-4 py-2 text-overline text-muted-foreground text-right">{t('budget.actualCol')}</th>
            <th scope="col" className="px-4 py-2 text-overline text-muted-foreground text-right">{t('budget.varianceCol')}</th>
            <th scope="col" className="px-4 py-2 text-overline text-muted-foreground text-right">{t('budget.utilization')}</th>
            <th scope="col" className="px-4 py-2 w-12" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.budgetId} className="border-b border-border">
              <td className="px-4 py-2">
                {scopeLabel(r)}
                {r.overBudget && <span className="ml-2 inline-flex items-center gap-1 text-destructive text-xs"><AlertTriangle className="size-3.5" aria-hidden="true" />{t('budget.overBudget')}</span>}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtMinor(r.budgetMinor, r.currency)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtMinor(r.actualMinor, r.currency)}</td>
              <td className={`px-4 py-2 text-right tabular-nums ${r.varianceMinor < 0 ? 'text-destructive' : 'text-success'}`}>{fmtMinor(r.varianceMinor, r.currency)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.utilizationPct == null ? '—' : `${r.utilizationPct}%`}</td>
              <td className="px-4 py-2 text-right">
                {canManage && <Button size="sm" variant="ghost" onClick={() => archive.mutate(r.budgetId)} aria-label={`Archive ${scopeLabel(r)}`}><Archive className="size-3.5" aria-hidden="true" /></Button>}
              </td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="font-medium">
              <td className="px-4 py-2">{t('budget.total')}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtMinor(totals.budgetMinor, data.currency)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtMinor(totals.actualMinor, data.currency)}</td>
              <td className={`px-4 py-2 text-right tabular-nums ${totals.varianceMinor < 0 ? 'text-destructive' : 'text-success'}`}>{fmtMinor(totals.varianceMinor, data.currency)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function RollupPanel({ fiscalYear, currency }) {
  const { t } = useTranslation();
  const [by, setBy] = useState('program');
  const { data, isLoading } = useCostRollup({ by, fiscalYear });
  const rows = data?.rows || [];

  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold text-foreground">{t('budget.rollup')}</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t('budget.groupBy')}
          <select value={by} onChange={(e) => setBy(e.target.value)} className={`${inputCls} h-8`}>
            {GROUP_BYS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </div>
      {isLoading ? (
        <div className="py-10 flex justify-center"><Spinner size={22} /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Wallet} title={t('budget.noCosts')} />
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key ?? 'unallocated'} className="border-b border-border last:border-0">
                <td className="px-4 py-2">{r.label}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs tabular-nums">{r.count}×</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtMinor(r.totalMinor, currency)}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="px-4 py-2">{t('budget.total')}</td>
              <td />
              <td className="px-4 py-2 text-right tabular-nums">{fmtMinor(data?.grandTotalMinor, currency)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function BudgetDashboardPage() {
  const { t } = useTranslation();
  const { can } = useRole();
  const canManage = can('manage:budget');
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [form, setForm] = useState(null); // 'budget' | 'cost' | null

  const { data: currency } = useTenantCurrency();
  const { data: programsData } = useLearningPrograms();
  const { data: departments = [] } = useDepartments();
  const programs = programsData?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={t('budget.title')} description={t('budget.description')} />
        {canManage && (
          <div className="flex gap-2 shrink-0 mt-1">
            <Button size="sm" variant="outline" onClick={() => setForm(form === 'cost' ? null : 'cost')}><Plus className="size-3.5" aria-hidden="true" />{t('budget.newCost')}</Button>
            <Button size="sm" onClick={() => setForm(form === 'budget' ? null : 'budget')}><Plus className="size-3.5" aria-hidden="true" />{t('budget.newBudget')}</Button>
          </div>
        )}
      </div>

      {canManage && form === 'budget' && <NewBudgetForm fiscalYear={fiscalYear} programs={programs} departments={departments} onClose={() => setForm(null)} />}
      {canManage && form === 'cost' && <NewCostForm programs={programs} departments={departments} onClose={() => setForm(null)} />}

      <div className="flex items-center gap-2">
        <label htmlFor="fy" className="text-sm text-muted-foreground">{t('budget.fiscalYear')}</label>
        <select id="fy" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} className={`${inputCls} h-8`}>
          {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {currency && <span className="text-xs text-muted-foreground">· {currency}</span>}
      </div>

      <section className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="border-b border-border px-4 py-2.5"><h2 className="text-sm font-semibold text-foreground">{t('budget.variance')} · FY{fiscalYear}</h2></div>
        <VarianceTable fiscalYear={fiscalYear} canManage={canManage} />
      </section>

      <RollupPanel fiscalYear={fiscalYear} currency={currency} />
    </div>
  );
}
