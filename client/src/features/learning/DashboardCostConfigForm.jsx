import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSetCostConfig } from '../../hooks/useLearningDashboard';
import { LearningField, controlClass } from './LearningField';

// L&D cost inputs (integer minor currency units). Controlled-state form per
// the learning-form convention (see AssignmentFormModal). Server validates
// again (zod) and audits the upsert.
const isWholeNonNegative = (value) => /^\d+$/.test(value);

// Lazy-init from the saved config; the PARENT keys this component on whether
// the config has loaded, so a late-arriving config remounts the form instead
// of a setState-in-effect prefill (react-hooks/set-state-in-effect).
const initialForm = (current) => ({
  annualBudgetMinor: current?.annualBudgetMinor == null ? '' : String(current.annualBudgetMinor),
  currency: current?.currency || 'VND',
  hourlyCost: current?.avgLoadedHourlyCostMinor == null ? '' : String(current.avgLoadedHourlyCostMinor),
});

export default function DashboardCostConfigForm({ current, onSaved }) {
  const { t } = useTranslation();
  const x = 'learning.dashboard.executive.form';
  const save = useSetCostConfig();
  const [form, setForm] = useState(() => initialForm(current));
  const [error, setError] = useState('');

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const currency = form.currency.trim().toUpperCase();
    if (!isWholeNonNegative(form.annualBudgetMinor) || currency.length !== 3
      || (form.hourlyCost !== '' && !isWholeNonNegative(form.hourlyCost))) {
      setError(t(`${x}.invalid`));
      return;
    }
    try {
      await save.mutateAsync({
        annualBudgetMinor: Number(form.annualBudgetMinor),
        currency,
        avgLoadedHourlyCostMinor: form.hourlyCost === '' ? null : Number(form.hourlyCost),
      });
      toast.success(t(`${x}.saved`));
      onSaved?.();
    } catch {
      toast.error(t(`${x}.saveError`));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label={t(`${x}.title`)}>
      <div className="grid gap-3 sm:grid-cols-3">
        <LearningField label={t(`${x}.annualBudget`)}>
          <input
            aria-label={t(`${x}.annualBudget`)}
            className={controlClass}
            inputMode="numeric"
            value={form.annualBudgetMinor}
            onChange={set('annualBudgetMinor')}
          />
        </LearningField>
        <LearningField label={t(`${x}.currency`)}>
          <input
            aria-label={t(`${x}.currency`)}
            className={controlClass}
            maxLength={3}
            value={form.currency}
            onChange={set('currency')}
          />
        </LearningField>
        <LearningField label={t(`${x}.hourlyCost`)}>
          <input
            aria-label={t(`${x}.hourlyCost`)}
            className={controlClass}
            inputMode="numeric"
            value={form.hourlyCost}
            onChange={set('hourlyCost')}
          />
        </LearningField>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button type="submit" size="sm" disabled={save.isPending}>
        {save.isPending ? t(`${x}.saving`) : t(`${x}.save`)}
      </Button>
    </form>
  );
}
