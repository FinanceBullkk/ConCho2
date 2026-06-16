import { useState } from 'react';
import { toast } from 'sonner';
import { Clock, Users, Download, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import {
  useTrainingHours, useDownloadEvidencePack, useReportPresets,
  useCreateReportPreset, useDeleteReportPreset,
} from '../../hooks/useLearning';
import { saveBlob } from './report-download';

// ──────────────────────────────────────────────────────────
// TrainingHoursTab — A5 (Modernization Horizon 1)
// Audit-ready training hours per employee / department over a window, for
// labour-law minimums. Reads /api/learning/reports/training-hours (report.read).
// ──────────────────────────────────────────────────────────

const inputCls =
  'h-(--control-h) rounded-md border border-input bg-background px-3 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring';

function Kpi({ icon, label, value }) {
  const Icon = icon;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-subtle-foreground">
        <Icon className="size-4" aria-hidden="true" />{label}
      </div>
      <div className="mt-1 text-h3 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default function TrainingHoursTab() {
  const [groupBy, setGroupBy] = useState('user');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presetId, setPresetId] = useState('');

  const params = { groupBy };
  if (from) params.from = from;
  if (to) params.to = to;
  const { data, isLoading, isError } = useTrainingHours(params);

  const downloadPack = useDownloadEvidencePack();
  const { data: presets = [] } = useReportPresets();
  const createPreset = useCreateReportPreset();
  const deletePreset = useDeleteReportPreset();

  const windowFilters = () => {
    const f = {};
    if (from) f.from = from;
    if (to) f.to = to;
    return f;
  };

  const onDownloadPack = async () => {
    try {
      const res = await downloadPack.mutateAsync(windowFilters());
      saveBlob(res, 'evidence-pack.xlsx');
    } catch {
      toast.error('Could not generate the evidence pack.');
    }
  };

  const applyPreset = (id) => {
    setPresetId(id);
    const p = presets.find((x) => x._id === id);
    if (p) { setFrom(p.filters?.from || ''); setTo(p.filters?.to || ''); }
  };

  const savePreset = async () => {
    const name = presetName.trim();
    if (!name) return;
    try {
      await createPreset.mutateAsync({ name, kind: 'evidence', filters: windowFilters() });
      setPresetName('');
      toast.success('Preset saved');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not save preset');
    }
  };

  const removePreset = async () => {
    if (!presetId) return;
    await deletePreset.mutateAsync(presetId);
    setPresetId('');
  };

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-overline text-muted-foreground">Group by</span>
          <div className="flex items-center gap-1.5" role="group" aria-label="Group by">
            {[['user', 'Employee'], ['department', 'Department']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setGroupBy(id)} aria-pressed={groupBy === id}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${groupBy === id ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="th-from" className="text-overline text-muted-foreground">From</label>
          <input id="th-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="th-to" className="text-overline text-muted-foreground">To</label>
          <input id="th-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        <p className="text-xs text-subtle-foreground self-center">Defaults to the last 90 days · hours = attended sessions × duration.</p>
      </div>

      {/* Evidence pack + saved presets (A5 part 2) */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-overline text-muted-foreground">Audit evidence</span>
          <Button size="sm" onClick={onDownloadPack} disabled={downloadPack.isPending}>
            <Download className="size-3.5" aria-hidden="true" />
            {downloadPack.isPending ? 'Generating…' : 'Download evidence pack (xlsx)'}
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="th-preset" className="text-overline text-muted-foreground">Saved preset</label>
          <div className="flex items-center gap-1.5">
            <select id="th-preset" value={presetId} onChange={(e) => applyPreset(e.target.value)} className={inputCls}>
              <option value="">Select a preset…</option>
              {presets.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            {presetId && (
              <Button size="sm" variant="ghost" onClick={removePreset} aria-label="Delete preset"><Trash2 className="size-3.5" aria-hidden="true" /></Button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="th-preset-name" className="text-overline text-muted-foreground">Save current window</label>
          <div className="flex items-center gap-1.5">
            <input id="th-preset-name" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" className={`${inputCls} w-40`} />
            <Button size="sm" variant="outline" onClick={savePreset} disabled={!presetName.trim() || createPreset.isPending}>
              <Save className="size-3.5" aria-hidden="true" />Save
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {totals && (
        <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
          <Kpi icon={Users} label="Employees" value={totals.employees} />
          <Kpi icon={Clock} label="Sessions attended" value={totals.sessions} />
          <Kpi icon={Clock} label="Total hours" value={totals.hours} />
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : isError ? (
          <div className="py-10 text-center text-destructive text-sm">Could not load training hours.</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Clock} title="No data" description="No attended sessions in this window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {groupBy === 'user' ? (
                    <>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Employee</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Code</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Department</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Sessions</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Hours</th>
                    </>
                  ) : (
                    <>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Department</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Employees</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">With hours</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Sessions</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Hours</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Avg / head</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {groupBy === 'user'
                  ? rows.map((r) => (
                    <tr key={String(r.userId)} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.empCode}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.department}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.sessions}</td>
                      <td className="px-4 py-2 tabular-nums font-medium">{r.hours}</td>
                    </tr>
                  ))
                  : rows.map((r) => (
                    <tr key={r.department} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{r.department}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.employees}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.withHours}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.sessions}</td>
                      <td className="px-4 py-2 tabular-nums font-medium">{r.hours}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.avgHours}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
