import { useState } from 'react';
import { ShieldCheck, Plus, Archive, ChevronDown, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import { useRole } from '@/hooks/useRole';
import { useLearningPrograms } from '../../hooks/useLearning';
import { useComplianceMatrix, useCreateRequirement, useArchiveRequirement } from './useCompliance';

// ──────────────────────────────────────────────────────────
// ComplianceMatrixPage — A3 (Modernization Horizon 1)
// Define "role/department must complete this training within N days" and see a
// live, derived compliance matrix (compliant/total/% + overdue, drill-down).
// Read = report.read; manage = compliance.manage (Admin/Coordinator).
// ──────────────────────────────────────────────────────────

const inputCls =
  'h-(--control-h) rounded-md border border-input bg-background px-3 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring';

const ROLES = ['Participant', 'Teacher', 'Coordinator', 'Admin'];
const blankForm = { type: 'role', value: 'Participant', programId: '', dueWithinDays: 90, recurrence: 'once' };

// Heat tone for a compliance percentage (prototype thresholds).
const heat = (pct) => {
  if (pct == null) return 'text-muted-foreground';
  if (pct >= 95) return 'text-success';
  if (pct >= 80) return 'text-primary';
  if (pct >= 65) return 'text-warning';
  return 'text-destructive';
};
const heatBar = (pct) => {
  if (pct == null) return 'bg-muted-foreground';
  if (pct >= 95) return 'bg-success';
  if (pct >= 80) return 'bg-primary';
  if (pct >= 65) return 'bg-warning';
  return 'bg-destructive';
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function NewRequirementForm({ programs, onClose }) {
  const create = useCreateRequirement();
  const [form, setForm] = useState(blankForm);

  const submit = (e) => {
    e.preventDefault();
    if (form.type !== 'all' && !String(form.value).trim()) return;
    if (!form.programId) return;
    create.mutate({
      appliesTo: { type: form.type, value: form.type === 'all' ? '' : String(form.value).trim() },
      target: { kind: 'program', id: form.programId },
      dueWithinDays: Number(form.dueWithinDays) || 90,
      recurrence: form.recurrence,
    }, { onSuccess: onClose });
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="rt-type" className="text-overline text-muted-foreground">Applies to</label>
        <select id="rt-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={inputCls}>
          <option value="role">Role</option>
          <option value="department">Department</option>
          <option value="office">Office</option>
          <option value="all">Everyone</option>
        </select>
      </div>
      {form.type !== 'all' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="rt-value" className="text-overline text-muted-foreground">{form.type === 'role' ? 'Role' : `${form.type} id`}</label>
          {form.type === 'role' ? (
            <select id="rt-value" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} className={inputCls}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <input id="rt-value" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder={`${form.type} id`} className={`${inputCls} min-w-[200px]`} />
          )}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="rt-prog" className="text-overline text-muted-foreground">Program</label>
        <select id="rt-prog" value={form.programId} onChange={(e) => setForm((f) => ({ ...f, programId: e.target.value }))} className={`${inputCls} min-w-[180px]`}>
          <option value="">Select…</option>
          {programs.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="rt-due" className="text-overline text-muted-foreground">Due within (days)</label>
        <input id="rt-due" type="number" min="1" value={form.dueWithinDays} onChange={(e) => setForm((f) => ({ ...f, dueWithinDays: e.target.value }))} className={`${inputCls} w-28`} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="rt-rec" className="text-overline text-muted-foreground">Recurrence</label>
        <select id="rt-rec" value={form.recurrence} onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))} className={inputCls}>
          <option value="once">Once</option>
          <option value="annual">Annual</option>
          <option value="biennial">Biennial</option>
        </select>
      </div>
      <Button type="submit" size="sm" disabled={create.isPending}><Plus className="size-3.5" aria-hidden="true" />Create</Button>
      <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
    </form>
  );
}

function MatrixRow({ row, canManage }) {
  const archive = useArchiveRequirement();
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-b border-border">
        <td className="px-4 py-2">
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-left hover:underline" aria-expanded={open}>
            <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            {row.label}
          </button>
        </td>
        <td className="px-4 py-2 text-muted-foreground text-xs">{row.appliesTo?.type === 'all' ? 'Everyone' : `${row.appliesTo?.type}: ${row.appliesTo?.value?.slice?.(-8) || row.appliesTo?.value}`}</td>
        <td className="px-4 py-2 text-muted-foreground text-xs whitespace-nowrap">{row.dueWithinDays}d · {row.recurrence}</td>
        <td className="px-4 py-2 w-44">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-20 rounded-full bg-muted overflow-hidden"><span className={`block h-full ${heatBar(row.pct)}`} style={{ width: `${row.pct ?? 0}%` }} /></span>
            <span className={`tabular-nums text-xs font-medium ${heat(row.pct)}`}>{row.pct == null ? '—' : `${row.pct}%`}</span>
          </div>
        </td>
        <td className="px-4 py-2 tabular-nums text-muted-foreground">{row.compliant}/{row.total}</td>
        <td className="px-4 py-2 tabular-nums">{row.overdue > 0 ? <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="size-3.5" aria-hidden="true" />{row.overdue}</span> : <span className="text-muted-foreground">0</span>}</td>
        <td className="px-4 py-2 text-right">
          {canManage && <Button size="sm" variant="ghost" onClick={() => archive.mutate(row.id)} aria-label={`Archive ${row.label}`}><Archive className="size-3.5" aria-hidden="true" /></Button>}
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/30">
          <td colSpan={7} className="px-4 py-3">
            {row.nonCompliant?.length ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Non-compliant ({row.overdue + row.pending}{row.nonCompliant.length < (row.overdue + row.pending) ? `, showing ${row.nonCompliant.length}` : ''})</p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {row.nonCompliant.map((n) => (
                    <li key={String(n.userId)} className="flex items-center justify-between gap-3 text-xs">
                      <span>{n.name} <span className="font-mono text-subtle-foreground">{n.empCode}</span></span>
                      <span className={n.status === 'overdue' ? 'text-destructive' : 'text-warning'}>{n.status} · due {fmtDate(n.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="text-xs text-success">Everyone matched is compliant.</p>}
          </td>
        </tr>
      )}
    </>
  );
}

export default function ComplianceMatrixPage() {
  const { can } = useRole();
  const canManage = can('manage:compliance');
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError } = useComplianceMatrix();
  const { data: programsData } = useLearningPrograms();
  const programs = programsData?.data || [];
  const rows = data?.rows || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Compliance matrix" description="Define required training per role/department and track live compliance. Status is derived from certificates — never stored." />
        {canManage && !showForm && (
          <Button size="sm" onClick={() => setShowForm(true)} className="shrink-0 mt-1"><Plus className="size-3.5" aria-hidden="true" />New requirement</Button>
        )}
      </div>

      {canManage && showForm && <NewRequirementForm programs={programs} onClose={() => setShowForm(false)} />}

      {data?.summary && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          <span>{data.summary.requirements} requirement(s)</span>·<span>{data.summary.employees} employees</span>
          {data.summary.overdueTotal > 0 && <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="size-3.5" aria-hidden="true" />{data.summary.overdueTotal} overdue</span>}
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : isError ? (
          <div className="py-10 text-center text-destructive text-sm">Could not load the compliance matrix.</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No requirements yet" description={canManage ? 'Create a required-training rule to start tracking compliance.' : 'No required-training rules defined.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Requirement</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Applies to</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Due</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Compliance</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Done</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Overdue</th>
                  <th scope="col" className="px-4 py-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => <MatrixRow key={String(row.id)} row={row} canManage={canManage} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
