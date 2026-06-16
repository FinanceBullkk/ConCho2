import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Save, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { useTrainingPlan, useUpsertPlan, useScheduleItem } from './usePlanning';

// ──────────────────────────────────────────────────────────
// PlanPanel — A4 annual plan for one fiscal year: edit items (one PUT) + schedule
// a program item into a cohort (creates a Class + carries est cost into a budget).
// ──────────────────────────────────────────────────────────

const inputCls =
  'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring';

const QUARTERS = (fy) => [1, 2, 3, 4].map((q) => `${fy}-Q${q}`);
const fmtMinor = (v) => (v ? Number(v).toLocaleString() : '0');

// Strip a stored item to schema-allowed fields (drops _id, keeps cohortIds).
const cleanItem = (it) => ({
  target: { kind: it.target.kind, id: String(it.target.id) },
  quarter: it.quarter || undefined,
  demand: Number(it.demand) || 0,
  estCostMinor: Number(it.estCostMinor) || 0,
  cohortIds: (it.cohortIds || []).map(String),
});

function ScheduleRow({ fy, itemId, onDone }) {
  const { t } = useTranslation();
  const schedule = useScheduleItem();
  const [form, setForm] = useState({ classCode: '', totalSessions: 10 });
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!form.classCode.trim()) return; schedule.mutate({ fy, itemId, classCode: form.classCode.trim(), totalSessions: Number(form.totalSessions) || 1 }, { onSuccess: onDone }); }}
      className="flex flex-wrap items-end gap-2 mt-1"
    >
      <input className={`${inputCls} w-32`} placeholder={t('planning.classCode')} value={form.classCode} onChange={(e) => setForm((f) => ({ ...f, classCode: e.target.value }))} aria-label={t('planning.classCode')} />
      <input className={`${inputCls} w-24`} type="number" min="1" value={form.totalSessions} onChange={(e) => setForm((f) => ({ ...f, totalSessions: e.target.value }))} aria-label={t('planning.totalSessions')} />
      <Button size="sm" type="submit" disabled={schedule.isPending}><CalendarPlus className="size-3.5" aria-hidden="true" />{t('planning.createCohort')}</Button>
    </form>
  );
}

export default function PlanPanel({ fy, programs, canManage }) {
  const { t } = useTranslation();
  const { data: plan, isLoading } = useTrainingPlan(fy);
  const upsert = useUpsertPlan();
  const programNameById = new Map(programs.map((p) => [String(p._id), p.name || p.code]));

  const [items, setItems] = useState(null); // local edit buffer (seeded on first render)
  const [scheduling, setScheduling] = useState(null);
  const [draft, setDraft] = useState({ programId: '', quarter: `${fy}-Q1`, demand: '', estCostMinor: '' });

  const serverItems = plan?.items || [];
  const view = items ?? serverItems;
  const dirty = items !== null && JSON.stringify(items.map(cleanItem)) !== JSON.stringify(serverItems.map(cleanItem));

  const addItem = () => {
    if (!draft.programId) return;
    const next = [...view, {
      target: { kind: 'program', id: draft.programId }, quarter: draft.quarter,
      demand: Number(draft.demand) || 0, estCostMinor: Number(draft.estCostMinor) || 0, cohortIds: [],
    }];
    setItems(next);
    setDraft({ programId: '', quarter: `${fy}-Q1`, demand: '', estCostMinor: '' });
  };
  const removeItem = (i) => setItems((view).filter((_, idx) => idx !== i));
  const save = () => upsert.mutate({ fy, items: view.map(cleanItem) }, { onSuccess: () => setItems(null) });

  if (isLoading) return <div className="py-6 flex justify-center"><Spinner size={18} /></div>;

  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('planning.annualPlan')} · FY{fy}</h2>
        {canManage && dirty && <Button size="sm" onClick={save} disabled={upsert.isPending}><Save className="size-3.5" aria-hidden="true" />{t('planning.savePlan')}</Button>}
      </div>

      {view.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t('planning.noItems')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2 text-overline text-muted-foreground">{t('planning.target')}</th>
                <th className="px-4 py-2 text-overline text-muted-foreground">{t('planning.quarter')}</th>
                <th className="px-4 py-2 text-overline text-muted-foreground text-right">{t('planning.demand')}</th>
                <th className="px-4 py-2 text-overline text-muted-foreground text-right">{t('planning.estCost')}</th>
                <th className="px-4 py-2 text-overline text-muted-foreground text-right">{t('planning.cohorts')}</th>
                <th className="px-4 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {view.map((it, i) => (
                <tr key={it._id || i} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-2">{it.target.kind === 'program' ? (programNameById.get(String(it.target.id)) || t('planning.program')) : t('planning.skill')}</td>
                  <td className="px-4 py-2 text-muted-foreground">{it.quarter || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.demand || 0}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMinor(it.estCostMinor)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{(it.cohortIds || []).length}</td>
                  <td className="px-4 py-2 text-right">
                    {canManage && it.target.kind === 'program' && it._id && (
                      <Button size="sm" variant="outline" onClick={() => setScheduling(scheduling === it._id ? null : it._id)}>{t('planning.schedule')}</Button>
                    )}
                    {canManage && items !== null && <Button size="sm" variant="ghost" onClick={() => removeItem(i)} aria-label={t('planning.removeItem')}><Trash2 className="size-3.5" aria-hidden="true" /></Button>}
                    {scheduling === it._id && <ScheduleRow fy={fy} itemId={it._id} onDone={() => setScheduling(null)} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <div className="border-t border-border px-4 py-3 flex flex-wrap items-end gap-2">
          <select className={`${inputCls} w-48`} value={draft.programId} onChange={(e) => setDraft((d) => ({ ...d, programId: e.target.value }))} aria-label={t('planning.program')}>
            <option value="">{t('planning.pickProgram')}</option>
            {programs.map((p) => <option key={p._id} value={p._id}>{p.name || p.code}</option>)}
          </select>
          <select className={inputCls} value={draft.quarter} onChange={(e) => setDraft((d) => ({ ...d, quarter: e.target.value }))} aria-label={t('planning.quarter')}>
            {QUARTERS(fy).map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
          <input className={`${inputCls} w-24`} type="number" min="0" placeholder={t('planning.demand')} value={draft.demand} onChange={(e) => setDraft((d) => ({ ...d, demand: e.target.value }))} aria-label={t('planning.demand')} />
          <input className={`${inputCls} w-32`} type="number" min="0" placeholder={t('planning.estCost')} value={draft.estCostMinor} onChange={(e) => setDraft((d) => ({ ...d, estCostMinor: e.target.value }))} aria-label={t('planning.estCost')} />
          <Button size="sm" variant="outline" onClick={addItem}><Plus className="size-3.5" aria-hidden="true" />{t('planning.addItem')}</Button>
        </div>
      )}
    </section>
  );
}
