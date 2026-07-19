import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '../../context/AuthContext';
import { useOffices } from '../../hooks/useOrg';
import { useRooms } from '../rooms/useRooms';
import { useBookEnglishSession, useEnglishClasses, useEnglishSessions } from './useEnglishOperations';

function SessionForm({ classes, onClose }) {
  const { t } = useTranslation();
  const offices = useOffices();
  const mutation = useBookEnglishSession();
  const [form, setForm] = useState({
    cohortId: classes[0]?._id || '', officeId: '', roomId: '', startTime: '', endTime: '',
  });
  const rooms = useRooms(form.officeId ? { officeId: form.officeId } : {}, { enabled: Boolean(form.officeId) });
  const effectiveCohortId = form.cohortId || classes[0]?._id || '';
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    await mutation.mutateAsync({
      cohortId: effectiveCohortId,
      officeId: form.officeId,
      roomId: form.roomId || undefined,
      startTime: new Date(form.startTime).toISOString(),
      endTime: new Date(form.endTime).toISOString(),
    });
    onClose();
  };
  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.schedule.run')}</span><select required value={effectiveCohortId} onChange={set('cohortId')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground">{classes.map((run) => <option key={run._id} value={run._id}>{run.englishGroupCode} · {run.cohortCode} · {run.programName}</option>)}</select></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.schedule.office')}</span><select required value={form.officeId} onChange={(event) => setForm((value) => ({ ...value, officeId: event.target.value, roomId: '' }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground"><option value="" />{(offices.data || []).map((office) => <option key={office._id} value={office._id}>{office.code} · {office.name}</option>)}</select></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.schedule.room')}</span><select value={form.roomId} onChange={set('roomId')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground"><option value="" />{(rooms.data || []).map((room) => <option key={room._id} value={room._id}>{room.code} · {room.name}</option>)}</select></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.schedule.start')}</span><Input type="datetime-local" value={form.startTime} onChange={set('startTime')} required /></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.schedule.end')}</span><Input type="datetime-local" value={form.endTime} onChange={set('endTime')} required /></label>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t('englishOperations.schedule.cancel')}</Button><Button type="submit" disabled={mutation.isPending || !form.officeId}>{t('englishOperations.schedule.save')}</Button></div>
    </form>
  );
}

export default function SchedulePanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = ['Admin', 'Coordinator'].includes(user?.role);
  const classes = useEnglishClasses();
  const sessions = useEnglishSessions(classes.data || []);
  const [creating, setCreating] = useState(false);
  const byDay = useMemo(() => {
    const map = new Map();
    for (const session of sessions.data || []) {
      const day = new Date(session.startTime).toLocaleDateString('en-CA');
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(session);
    }
    return [...map.entries()];
  }, [sessions.data]);
  const runById = new Map((classes.data || []).map((run) => [run._id, run]));

  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button onClick={() => setCreating(true)} disabled={(classes.data || []).length === 0}><Plus className="size-4" />{t('englishOperations.schedule.add')}</Button></div>}
      {creating && <SessionForm classes={classes.data || []} onClose={() => setCreating(false)} />}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {byDay.map(([day, rows]) => <section key={day} className="rounded-lg border border-border bg-card p-3"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day}</h3><div className="space-y-2">{rows.map((session) => { const run = runById.get(session.cohortId || session.classId?._id); return <div key={session.scheduleId || session._id} className="rounded-md border border-border px-3 py-2 text-sm"><div className="font-medium text-foreground">{run?.englishGroupCode || session.classId?.classCode} · {run?.cohortCode || session.classId?.classCode}</div><div className="text-xs text-muted-foreground">{new Date(session.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–{new Date(session.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {session.office?.name || session.officeId?.name || '—'} · {session.room?.name || session.roomId?.name || '—'}</div><div className="mt-1 text-xs text-muted-foreground">Session {session.sessionNumber || '—'} · {session.enrolledLearnerCount ?? session.enrolledCount ?? 0} learners</div></div>; })}</div></section>)}
        {!sessions.isLoading && byDay.length === 0 && <p className="col-span-full rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t('englishOperations.schedule.empty')}</p>}
      </div>
    </div>
  );
}
