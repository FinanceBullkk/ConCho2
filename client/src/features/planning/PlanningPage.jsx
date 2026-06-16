import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Target, Plus, Archive } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import { useRole } from '@/hooks/useRole';
import { useLearningPrograms } from '../../hooks/useLearning';
import { useDepartments } from '../../hooks/useOrg';
import {
  useTrainingRequests, useDemand, useCreateRequest, useSetRequestStatus, useArchiveRequest,
} from './usePlanning';
import PlanPanel from './PlanPanel';

// ──────────────────────────────────────────────────────────
// PlanningPage — A4 (Modernization Horizon 2)
// Training Needs Analysis: demand intake → aggregated demand → a costed annual
// plan → scheduled cohorts. Gated by training.plan (Admin / Coordinator).
// ──────────────────────────────────────────────────────────

const inputCls =
  'h-(--control-h) rounded-md border border-input bg-background px-3 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring';

const yearOptions = () => { const y = new Date().getFullYear(); return [y - 1, y, y + 1].map(String); };
// Allowed next-statuses per current status (mirrors the server status machine).
const NEXT = { submitted: ['in-review', 'approved', 'rejected'], 'in-review': ['approved', 'rejected'], approved: ['rejected'] };

function NewRequestForm({ fy, programs, departments, onClose }) {
  const { t } = useTranslation();
  const create = useCreateRequest();
  const [form, setForm] = useState({ programId: '', departmentId: '', headcount: '', priority: 'med', targetQuarter: `${fy}-Q1` });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.programId || !form.headcount) return;
    create.mutate({
      target: { kind: 'program', id: form.programId },
      ...(form.departmentId ? { departmentId: form.departmentId } : {}),
      headcount: Number(form.headcount),
      priority: form.priority,
      targetQuarter: form.targetQuarter,
    }, { onSuccess: onClose });
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
      <select className={`${inputCls} w-48`} value={form.programId} onChange={set('programId')} required aria-label={t('planning.program')}>
        <option value="">{t('planning.pickProgram')}</option>
        {programs.map((p) => <option key={p._id} value={p._id}>{p.name || p.code}</option>)}
      </select>
      <select className={inputCls} value={form.departmentId} onChange={set('departmentId')} aria-label={t('planning.department')}>
        <option value="">{t('planning.allDepts')}</option>
        {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
      </select>
      <input className={`${inputCls} w-24`} type="number" min="1" placeholder={t('planning.headcount')} value={form.headcount} onChange={set('headcount')} required aria-label={t('planning.headcount')} />
      <select className={inputCls} value={form.priority} onChange={set('priority')} aria-label={t('planning.priority')}>
        {['low', 'med', 'high'].map((p) => <option key={p} value={p}>{t(`planning.priorities.${p}`)}</option>)}
      </select>
      <select className={inputCls} value={form.targetQuarter} onChange={set('targetQuarter')} aria-label={t('planning.quarter')}>
        {[1, 2, 3, 4].map((q) => <option key={q} value={`${fy}-Q${q}`}>{`${fy}-Q${q}`}</option>)}
      </select>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>{t('planning.submit')}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>{t('planning.cancel')}</Button>
      </div>
    </form>
  );
}

function DemandPanel({ fy }) {
  const { t } = useTranslation();
  const [by, setBy] = useState('program');
  const { data, isLoading } = useDemand({ by, fiscalYear: fy });

  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('planning.demandTitle')}</h2>
        <select className={`${inputCls} h-8`} value={by} onChange={(e) => setBy(e.target.value)} aria-label={t('planning.groupBy')}>
          {['program', 'skill', 'quarter', 'department'].map((b) => <option key={b} value={b}>{t(`planning.by.${b}`)}</option>)}
        </select>
      </div>
      {isLoading ? <div className="py-6 flex justify-center"><Spinner size={18} /></div>
        : (data?.rows || []).length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">{t('planning.noDemand')}</p>
          : (
            <table className="w-full text-sm">
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.key ?? 'none'} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{r.label}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{t('planning.headPeople', { n: r.demand })}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{t('planning.reqCount', { n: r.count })}</td>
                  </tr>
                ))}
                <tr className="font-medium"><td className="px-4 py-2">{t('planning.total')}</td><td className="px-4 py-2 text-right tabular-nums">{t('planning.headPeople', { n: data.totalDemand })}</td><td /></tr>
              </tbody>
            </table>
          )}
    </section>
  );
}

function RequestsPanel({ programs, canManage }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const { data: requests = [], isLoading } = useTrainingRequests(status ? { status } : {});
  const setStatusM = useSetRequestStatus();
  const archive = useArchiveRequest();
  const programNameById = new Map(programs.map((p) => [String(p._id), p.name || p.code]));

  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('planning.requestsTitle')}</h2>
        <select className={`${inputCls} h-8`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('planning.status')}>
          <option value="">{t('planning.allStatuses')}</option>
          {['submitted', 'in-review', 'approved', 'planned', 'rejected'].map((s) => <option key={s} value={s}>{t(`planning.statuses.${s}`)}</option>)}
        </select>
      </div>
      {isLoading ? <div className="py-6 flex justify-center"><Spinner size={18} /></div>
        : requests.length === 0 ? <EmptyState icon={Target} title={t('planning.noRequests')} />
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {requests.map((r) => (
                    <tr key={r._id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{r.target?.kind === 'program' ? (programNameById.get(String(r.target.id)) || t('planning.program')) : t('planning.skill')}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{t('planning.headPeople', { n: r.headcount })}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.targetQuarter}</td>
                      <td className="px-4 py-2"><span className="text-xs">{t(`planning.statuses.${r.status}`)}</span></td>
                      <td className="px-4 py-2 text-right">
                        {canManage && (
                          <span className="inline-flex gap-1">
                            {(NEXT[r.status] || []).map((s) => (
                              <Button key={s} size="sm" variant="outline" onClick={() => setStatusM.mutate({ id: r._id, status: s })}>{t(`planning.statuses.${s}`)}</Button>
                            ))}
                            <Button size="sm" variant="ghost" onClick={() => archive.mutate(r._id)} aria-label={t('planning.removeRequest')}><Archive className="size-3.5" aria-hidden="true" /></Button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </section>
  );
}

export default function PlanningPage() {
  const { t } = useTranslation();
  const { can } = useRole();
  const canManage = can('plan:training');
  const [fy, setFy] = useState(String(new Date().getFullYear()));
  const [showForm, setShowForm] = useState(false);

  const { data: programsData } = useLearningPrograms();
  const { data: departments = [] } = useDepartments();
  const programs = programsData?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={t('planning.title')} description={t('planning.description')} />
        {canManage && (
          <Button size="sm" className="shrink-0 mt-1" onClick={() => setShowForm((s) => !s)}>
            <Plus className="size-3.5" aria-hidden="true" />{t('planning.newRequest')}
          </Button>
        )}
      </div>

      {canManage && showForm && <NewRequestForm fy={fy} programs={programs} departments={departments} onClose={() => setShowForm(false)} />}

      <div className="flex items-center gap-2">
        <label htmlFor="p-fy" className="text-sm text-muted-foreground">{t('planning.fiscalYear')}</label>
        <select id="p-fy" className={`${inputCls} h-8`} value={fy} onChange={(e) => setFy(e.target.value)}>
          {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <DemandPanel fy={fy} />
      <RequestsPanel programs={programs} canManage={canManage} />
      <PlanPanel fy={fy} programs={programs} canManage={canManage} />
    </div>
  );
}
