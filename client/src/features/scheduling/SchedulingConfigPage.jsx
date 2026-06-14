import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Trash2, Info, TriangleAlert, Clock } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/Spinner';
import { cn } from '@/lib/utils';
import { useSettings, useUpdateSettings } from '../settings/useSettings';
import { useSchedulingConfig } from '../../hooks/useSchedulingConfig';
import {
  cleanSlot, parseHHMM, toHHMM, slotDurationMinutes, formatDuration,
  validateSlots, SLOT_ERROR,
} from './slot-time-utils';

// ──────────────────────────────────────────────────────────
// SchedulingConfigPage — Studio ▸ Scheduling (Configure group)
//
// A business-friendly editor for `ALLOWED_TIME_SLOTS`: the VN wall-clock windows
// a team leader may book a session into. Replaces hand-editing raw JSON in
// System ▸ Settings. Reads/writes the SAME whitelisted, policy-validated,
// audited `/api/settings` key (no new backend) and mirrors the server's
// same-day / no-overlap rules client-side for instant feedback. An empty list
// is allowed and clearly flagged as "booking disabled" (fail-closed).
// ──────────────────────────────────────────────────────────

const SLOTS_KEY = 'ALLOWED_TIME_SLOTS';
const ctrl =
  'px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-ring';

// A sensible new window: start where the last slot ends, span one hour, clamped
// to the same day. Pure (no clock) — deterministic for tests.
function nextSlot(rows) {
  const last = rows[rows.length - 1];
  let sh = 9;
  let sm = 0;
  if (last) { sh = Math.min(last.eh, 22); sm = last.em; }
  let eh = sh + 1;
  let em = sm;
  if (eh > 23) { eh = 23; em = 59; }
  return { sh, sm, eh, em };
}

export default function SchedulingConfigPage() {
  const { t } = useTranslation();
  const settingsQuery = useSettings();
  const updateMutation = useUpdateSettings();
  const { data: serverConfig } = useSchedulingConfig();

  // The persisted slot set (clean shape), used as the dirty-tracking baseline.
  const baseline = useMemo(() => {
    const setting = (settingsQuery.data || []).find((s) => s.key === SLOTS_KEY);
    const raw = Array.isArray(setting?.value) ? setting.value : [];
    return raw
      .filter((s) => s && typeof s === 'object')
      .map(cleanSlot);
  }, [settingsQuery.data]);

  // Hydrate the editor from the persisted set, re-syncing whenever it changes
  // (initial load, or refetch after a save). `baseline` is memoized on the
  // settings data, so this only re-runs when the data actually changes — the
  // React-endorsed "adjust state during render" pattern (no effect needed).
  const [rows, setRows] = useState(baseline);
  const [syncedFrom, setSyncedFrom] = useState(baseline);
  if (syncedFrom !== baseline) {
    setSyncedFrom(baseline);
    setRows(baseline);
  }

  const { perRow, ok } = useMemo(() => validateSlots(rows), [rows]);
  const dirty = useMemo(
    () => JSON.stringify(rows) !== JSON.stringify(baseline),
    [rows, baseline],
  );
  const canSave = dirty && ok && !updateMutation.isPending;
  const weeklyLimit = serverConfig?.weeklyTeamLimit;
  const timezone = serverConfig?.timezone || 'Asia/Ho_Chi_Minh';

  const setStart = (i) => (e) => {
    const p = parseHHMM(e.target.value);
    if (!p) return;
    setRows((r) => r.map((s, idx) => (idx === i ? { ...s, sh: p.h, sm: p.m } : s)));
  };
  const setEnd = (i) => (e) => {
    const p = parseHHMM(e.target.value);
    if (!p) return;
    setRows((r) => r.map((s, idx) => (idx === i ? { ...s, eh: p.h, em: p.m } : s)));
  };
  const addRow = () => setRows((r) => [...r, nextSlot(r)]);
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));
  const reset = () => setRows(baseline);

  const errorText = (code) =>
    code === SLOT_ERROR.OVERLAP ? t('scheduling.errOverlap') : t('scheduling.errRange');

  const handleSave = async () => {
    if (!ok) return;
    try {
      await updateMutation.mutateAsync([{ key: SLOTS_KEY, value: rows.map(cleanSlot) }]);
      toast.success(t('scheduling.saved'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('scheduling.saveFailed'));
    }
  };

  if (settingsQuery.isLoading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t('scheduling.title')} description={t('scheduling.description')} />

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>{t('scheduling.note', { timezone })}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* Editor */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-foreground">
              {t('scheduling.windows')}{' '}
              <span className="text-subtle-foreground">· {rows.length}</span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" />
              {t('scheduling.addWindow')}
            </Button>
          </div>

          {rows.length === 0 ? (
            <div className="flex items-start gap-2.5 px-4 py-5 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-muted-foreground">{t('scheduling.emptyWarn')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((slot, i) => {
                const err = perRow[i];
                const dur = slotDurationMinutes(slot);
                return (
                  <li key={i} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary-tint text-primary">
                        <Clock className="size-4" aria-hidden="true" />
                      </span>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <span className="text-subtle-foreground">{t('scheduling.from')}</span>
                        <input
                          type="time" aria-label={t('scheduling.startAria', { n: i + 1 })}
                          className={cn(ctrl, err && 'border-destructive')}
                          value={toHHMM(slot.sh, slot.sm)} onChange={setStart(i)}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <span className="text-subtle-foreground">{t('scheduling.to')}</span>
                        <input
                          type="time" aria-label={t('scheduling.endAria', { n: i + 1 })}
                          className={cn(ctrl, err && 'border-destructive')}
                          value={toHHMM(slot.eh, slot.em)} onChange={setEnd(i)}
                        />
                      </label>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                        {formatDuration(dur)}
                      </span>
                      <Button
                        type="button" variant="ghost" size="sm" className="ml-auto"
                        aria-label={t('scheduling.removeAria', { n: i + 1 })}
                        onClick={() => removeRow(i)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                    {err && (
                      <p className="mt-1.5 pl-10 text-xs text-destructive">{errorText(err)}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Save bar */}
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            {dirty ? (
              <span
                role="status"
                className="inline-flex items-center gap-2 rounded-md border border-warning/30 bg-warning-tint px-2.5 py-1 text-xs font-medium text-warning"
              >
                <TriangleAlert className="size-3.5" aria-hidden="true" />
                {t('scheduling.unsaved')}
              </span>
            ) : (
              <span className="text-xs text-subtle-foreground">{t('scheduling.allSaved')}</span>
            )}
            <div className="flex items-center gap-2">
              {dirty && (
                <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={updateMutation.isPending}>
                  {t('scheduling.reset')}
                </Button>
              )}
              <Button type="button" size="sm" onClick={handleSave} disabled={!canSave}>
                {updateMutation.isPending ? <><Spinner size={14} />{t('scheduling.saving')}</> : t('scheduling.save')}
              </Button>
            </div>
          </div>
        </div>

        {/* Context panel */}
        <aside className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground">
            {t('scheduling.rulesTitle')}
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t('scheduling.timezone')}</dt>
              <dd className="font-medium text-foreground">{timezone}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t('scheduling.weeklyLimit')}</dt>
              <dd className="font-medium text-foreground tabular-nums">
                {weeklyLimit != null ? t('scheduling.perWeek', { count: weeklyLimit }) : '—'}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-subtle-foreground">{t('scheduling.weeklyLimitNote')}</p>
        </aside>
      </div>
    </div>
  );
}
