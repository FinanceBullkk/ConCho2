import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Plus, Pencil, Archive, DoorOpen } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import {
  useSessionTypes,
  useCreateSessionType,
  useUpdateSessionType,
  useArchiveSessionType,
  useRoomUtilization,
} from './useScheduling';

// ──────────────────────────────────────────────────────────
// StudioSchedulingPage — Studio ▸ Scheduling (Build Plan #5)
// Route: /scheduling (Admin). Manage the session-type taxonomy + view
// room-utilization analytics. Types are metadata only; the slot/room lock
// remains the booking source of truth.
// ──────────────────────────────────────────────────────────

const inputCls =
  'h-(--control-h) rounded-md border border-input bg-background px-3 text-sm text-foreground ' +
  'placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring';

const RANGES = ['7d', '30d', '90d'];
const blankForm = { name: '', color: '#6366f1', defaultDurationMin: 60, defaultCapacity: '' };

function SessionTypesCard() {
  const { t } = useTranslation();
  const { data: types = [], isLoading } = useSessionTypes();
  const create = useCreateSessionType();
  const update = useUpdateSessionType();
  const archive = useArchiveSessionType();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);

  const reset = () => { setForm(blankForm); setEditingId(null); };

  const submit = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const payload = {
      name,
      color: form.color,
      defaultDurationMin: Number(form.defaultDurationMin) || 60,
      defaultCapacity: form.defaultCapacity === '' ? null : Number(form.defaultCapacity),
    };
    if (editingId) update.mutate({ id: editingId, data: payload }, { onSuccess: reset });
    else create.mutate(payload, { onSuccess: reset });
  };

  const startEdit = (t2) => {
    setEditingId(t2._id);
    setForm({ name: t2.name, color: t2.color || '#6366f1', defaultDurationMin: t2.defaultDurationMin || 60, defaultCapacity: t2.defaultCapacity ?? '' });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h3 font-semibold inline-flex items-center gap-2"><CalendarClock className="size-4" aria-hidden="true" />{t('scheduling.sessionTypes')}</h2>
        <span className="text-xs text-muted-foreground">{t('scheduling.metadataNote')}</span>
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="st-name" className="text-overline text-muted-foreground">{t('scheduling.name')}</label>
          <input id="st-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('scheduling.namePlaceholder')} className={`${inputCls} min-w-[160px]`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="st-color" className="text-overline text-muted-foreground">{t('scheduling.colour')}</label>
          <input id="st-color" type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="h-(--control-h) w-12 rounded-md border border-input bg-background" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="st-dur" className="text-overline text-muted-foreground">{t('scheduling.defaultMins')}</label>
          <input id="st-dur" type="number" min="1" value={form.defaultDurationMin} onChange={(e) => setForm((f) => ({ ...f, defaultDurationMin: e.target.value }))} className={`${inputCls} w-24`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="st-cap" className="text-overline text-muted-foreground">{t('scheduling.defaultCapacity')}</label>
          <input id="st-cap" type="number" min="1" value={form.defaultCapacity} onChange={(e) => setForm((f) => ({ ...f, defaultCapacity: e.target.value }))} placeholder="—" className={`${inputCls} w-28`} />
        </div>
        <Button type="submit" size="sm" disabled={create.isPending || update.isPending}>
          {editingId ? <><Pencil className="size-3.5" aria-hidden="true" />{t('scheduling.save')}</> : <><Plus className="size-3.5" aria-hidden="true" />{t('scheduling.addType')}</>}
        </Button>
        {editingId && <Button type="button" size="sm" variant="ghost" onClick={reset}>{t('scheduling.cancel')}</Button>}
      </form>

      {isLoading ? (
        <div className="py-6 flex justify-center"><Spinner size={20} /></div>
      ) : types.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t('scheduling.emptyTypesTitle')} description={t('scheduling.emptyTypesDesc')} />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="py-2 text-overline text-muted-foreground">{t('scheduling.colType')}</th>
              <th scope="col" className="py-2 text-overline text-muted-foreground">{t('scheduling.colDefaultDuration')}</th>
              <th scope="col" className="py-2 text-overline text-muted-foreground">{t('scheduling.colDefaultCapacity')}</th>
              <th scope="col" className="py-2 w-24" />
            </tr>
          </thead>
          <tbody>
            {types.map((ty) => (
              <tr key={ty._id} className="border-b border-border last:border-0">
                <td className="py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block size-3 rounded-full" style={{ background: ty.color }} aria-hidden="true" />
                    {ty.name}
                  </span>
                </td>
                <td className="py-2 tabular-nums text-muted-foreground">{t('scheduling.minutes', { n: ty.defaultDurationMin })}</td>
                <td className="py-2 tabular-nums text-muted-foreground">{ty.defaultCapacity ?? '—'}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(ty)} aria-label={t('scheduling.editAria', { name: ty.name })}><Pencil className="size-3.5" aria-hidden="true" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (editingId === ty._id) reset(); archive.mutate(ty._id); }} aria-label={t('scheduling.archiveAria', { name: ty.name })}><Archive className="size-3.5" aria-hidden="true" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function UtilizationCard() {
  const { t } = useTranslation();
  const [range, setRange] = useState('30d');
  const { data, isLoading } = useRoomUtilization({ range });
  const perRoom = data?.perRoom || [];

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3 font-semibold inline-flex items-center gap-2"><DoorOpen className="size-4" aria-hidden="true" />{t('scheduling.roomUtilization')}</h2>
        <div className="flex items-center gap-1.5" role="group" aria-label={t('scheduling.dateRange')}>
          {RANGES.map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)} aria-pressed={range === r}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${range === r ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {t(`scheduling.range${r}`)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {data ? t('scheduling.utilizationNote', { count: perRoom.length, hours: data.availableHoursPerRoom }) : ''}
      </p>

      {isLoading ? (
        <div className="py-6 flex justify-center"><Spinner size={20} /></div>
      ) : perRoom.length === 0 ? (
        <EmptyState icon={DoorOpen} title={t('scheduling.emptyRoomsTitle')} description={t('scheduling.emptyRoomsDesc')} />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="py-2 text-overline text-muted-foreground">{t('scheduling.colRoom')}</th>
              <th scope="col" className="py-2 text-overline text-muted-foreground">{t('scheduling.colOffice')}</th>
              <th scope="col" className="py-2 text-overline text-muted-foreground">{t('scheduling.colBooked')}</th>
              <th scope="col" className="py-2 text-overline text-muted-foreground">{t('scheduling.colSessions')}</th>
              <th scope="col" className="py-2 text-overline text-muted-foreground">{t('scheduling.colUtilization')}</th>
            </tr>
          </thead>
          <tbody>
            {perRoom.map((r) => (
              <tr key={String(r.roomId)} className="border-b border-border last:border-0">
                <td className="py-2">{r.roomName}</td>
                <td className="py-2 text-muted-foreground">{r.officeName || '—'}</td>
                <td className="py-2 tabular-nums">{t('scheduling.bookedHours', { n: r.bookedHours })}</td>
                <td className="py-2 tabular-nums text-muted-foreground">{r.sessions}</td>
                <td className="py-2">
                  {r.utilizationPct == null ? (
                    <span className="text-subtle-foreground">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                        <span className="block h-full bg-primary" style={{ width: `${Math.min(100, r.utilizationPct)}%` }} />
                      </span>
                      <span className="tabular-nums text-xs">{r.utilizationPct}%</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function StudioSchedulingPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t('scheduling.title')} description={t('scheduling.description')} />
      <SessionTypesCard />
      <UtilizationCard />
    </div>
  );
}
