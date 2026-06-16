import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Star, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { useTrainerLoad, useUpsertTrainer, useRateTrainer } from './useTrainers';

// ──────────────────────────────────────────────────────────
// TrainerDetailPanel — A6 expanded row: qualifications + availability editors
// (one PUT), ratings (+add), and a per-trainer load summary. canDeliver +
// availability are saved together via the upsert mutation.
// ──────────────────────────────────────────────────────────

const inputCls =
  'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function Block({ title, children, action }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h4 className="text-overline text-muted-foreground">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function TrainerDetailPanel({ trainer, programs, canManage }) {
  const { t } = useTranslation();
  const userId = trainer.userId;
  const upsert = useUpsertTrainer();
  const rate = useRateTrainer();
  const { data: load } = useTrainerLoad(userId);

  const [canDeliver, setCanDeliver] = useState(trainer.canDeliver || []);
  const [availability, setAvailability] = useState(trainer.availability || []);
  const [rating, setRating] = useState({ value: 5, note: '' });

  const dirty = JSON.stringify(canDeliver) !== JSON.stringify(trainer.canDeliver || [])
    || JSON.stringify(availability) !== JSON.stringify(trainer.availability || []);

  const save = () => upsert.mutate({ userId, data: { canDeliver, availability } });
  const addSlot = () => setAvailability((a) => [...a, { weekday: 1, from: '09:00', to: '17:00' }]);
  const removeSlot = (i) => setAvailability((a) => a.filter((_, idx) => idx !== i));
  const setSlot = (i, k, v) => setAvailability((a) => a.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)));

  return (
    <div className="grid gap-5 md:grid-cols-2 px-4 py-4 bg-muted/30">
      <Block
        title={t('trainer.qualifications')}
        action={canManage && dirty && (
          <Button size="sm" variant="outline" onClick={save} disabled={upsert.isPending}>
            <Save className="size-3.5" aria-hidden="true" />{t('trainer.save')}
          </Button>
        )}
      >
        <select
          multiple className={`${inputCls} h-24 w-full`} disabled={!canManage}
          value={canDeliver}
          onChange={(e) => setCanDeliver(Array.from(e.target.selectedOptions, (o) => o.value))}
          aria-label={t('trainer.qualifications')}
        >
          {programs.map((p) => <option key={p._id} value={p._id}>{p.name || p.code}</option>)}
        </select>
      </Block>

      <Block title={`${t('trainer.load')} · ${t('trainer.next90')}`}>
        {load ? (
          <>
            <p className="text-sm tabular-nums">{t('trainer.sessionsHours', { n: load.sessionCount, hours: load.totalHours })}</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 mt-0.5 max-h-24 overflow-y-auto">
              {load.sessions.slice(0, 8).map((s) => <li key={s._id}>{fmtDateTime(s.startTime)} · {s.topic || t('trainer.session')}</li>)}
            </ul>
          </>
        ) : <Spinner size={16} />}
      </Block>

      <Block
        title={t('trainer.availability')}
        action={canManage && <Button size="sm" variant="ghost" onClick={addSlot}><Plus className="size-3.5" aria-hidden="true" />{t('trainer.addSlot')}</Button>}
      >
        {availability.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
          <ul className="space-y-1">
            {availability.map((s, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <select className={`${inputCls} w-20`} value={s.weekday} disabled={!canManage} onChange={(e) => setSlot(i, 'weekday', Number(e.target.value))} aria-label={t('trainer.weekday')}>
                  {WEEKDAYS.map((w, idx) => <option key={idx} value={idx}>{w}</option>)}
                </select>
                <input className={`${inputCls} w-24`} type="time" value={s.from} disabled={!canManage} onChange={(e) => setSlot(i, 'from', e.target.value)} aria-label={t('trainer.from')} />
                <input className={`${inputCls} w-24`} type="time" value={s.to} disabled={!canManage} onChange={(e) => setSlot(i, 'to', e.target.value)} aria-label={t('trainer.to')} />
                {canManage && <Button size="sm" variant="ghost" onClick={() => removeSlot(i)} aria-label={t('trainer.removeSlot')}><Trash2 className="size-3.5" aria-hidden="true" /></Button>}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={t('trainer.ratings')}>
        <p className="text-sm inline-flex items-center gap-1">
          {trainer.ratingCount
            ? <><Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />{trainer.ratingAvg} <span className="text-xs text-muted-foreground">({trainer.ratingCount})</span></>
            : <span className="text-muted-foreground text-xs">—</span>}
        </p>
        {canManage && (
          <form
            onSubmit={(e) => { e.preventDefault(); rate.mutate({ userId, value: Number(rating.value), note: rating.note.trim() }, { onSuccess: () => setRating({ value: 5, note: '' }) }); }}
            className="flex flex-wrap items-end gap-2 mt-1"
          >
            <select className={`${inputCls} w-16`} value={rating.value} onChange={(e) => setRating((r) => ({ ...r, value: e.target.value }))} aria-label={t('trainer.rating')}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <input className={`${inputCls} flex-1 min-w-36`} placeholder={t('trainer.ratingNote')} value={rating.note} onChange={(e) => setRating((r) => ({ ...r, note: e.target.value }))} aria-label={t('trainer.ratingNote')} />
            <Button size="sm" variant="outline" type="submit" disabled={rate.isPending}><Star className="size-3.5" aria-hidden="true" />{t('trainer.addRating')}</Button>
          </form>
        )}
      </Block>
    </div>
  );
}
