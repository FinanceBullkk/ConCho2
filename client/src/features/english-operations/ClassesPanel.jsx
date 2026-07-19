import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '../../context/AuthContext';
import {
  useCreateEnglishClass,
  useCreateEnglishProgram,
  useEnglishClasses,
  useEnglishClassRoster,
  useEnglishPrograms,
  useEnglishTeachers,
  useManagedEnglishLearners,
} from './useEnglishOperations';

const LEVEL_NAMES = [
  ['foundation', 'Foundation'], ['beginner', 'Beginner'], ['beginner_2', 'Beginner 2'],
  ['beginner_3', 'Beginner 3'], ['pre_intermediate', 'Pre-Intermediate'],
  ['pre_intermediate_1', 'Pre-Intermediate 1'], ['pre_intermediate_2', 'Pre-Intermediate 2'],
  ['pre_intermediate_3', 'Pre-Intermediate 3'], ['intermediate', 'Intermediate'],
  ['intermediate_1', 'Intermediate 1'], ['intermediate_2', 'Intermediate 2'],
  ['upper_intermediate', 'Upper-Intermediate'], ['advanced', 'Advanced'],
];
const DEFAULT_POLICY = {
  maxAbsencesAllowed: 2,
  absenceStatuses: ['A'],
  levelScale: LEVEL_NAMES.map(([code, displayName], index) => ({ code, displayName, order: index + 1 })),
};

function ProgramForm({ onClose }) {
  const { t } = useTranslation();
  const mutation = useCreateEnglishProgram();
  const [form, setForm] = useState({ code: '', name: '', defaultSessionCount: 20 });
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    await mutation.mutateAsync({
      code: form.code,
      name: form.name,
      category: 'english',
      defaultSessionCount: Number(form.defaultSessionCount),
      deliveryMode: 'offline',
      schedulingMode: 'nomination',
      completionPolicy: { attendanceThresholdPercent: 0, requiresAssessment: true, requiresFeedback: false },
      facilitatorPolicy: { assignmentRequired: true, visibility: 'all_facilitators' },
      englishPolicy: DEFAULT_POLICY,
    });
    onClose();
  };
  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.courseCode')}</span><Input value={form.code} onChange={set('code')} required /></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.courseName')}</span><Input value={form.name} onChange={set('name')} required /></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.defaultSessions')}</span><Input type="number" min="1" max="200" value={form.defaultSessionCount} onChange={set('defaultSessionCount')} required /></label>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t('englishOperations.classes.cancel')}</Button><Button type="submit" disabled={mutation.isPending}>{t('englishOperations.classes.saveProgram')}</Button></div>
    </form>
  );
}

function CheckList({ rows, selected, onChange, label }) {
  return (
    <fieldset className="max-h-40 overflow-y-auto rounded-md border border-border p-2">
      <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>
      <div className="space-y-1">
        {rows.map((row) => (
          <label key={row._id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
            <input
              type="checkbox"
              checked={selected.includes(row._id)}
              onChange={() => onChange(selected.includes(row._id)
                ? selected.filter((id) => id !== row._id)
                : [...selected, row._id])}
            />
            <span>{row.name} <span className="text-xs text-muted-foreground">· {row.empCode}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RunForm({ programs, onClose }) {
  const { t } = useTranslation();
  const mutation = useCreateEnglishClass();
  const learners = useManagedEnglishLearners({ limit: 200 });
  const teachers = useEnglishTeachers();
  const [form, setForm] = useState({
    programId: programs[0]?._id || '', cohortCode: '', englishGroupCode: '',
    startDate: '', endDate: '', englishPicDisplay: '', teacherIds: [], learnerIds: [],
  });
  const effectiveProgramId = form.programId || programs[0]?._id || '';
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    await mutation.mutateAsync({
      cohort: {
        programId: effectiveProgramId,
        cohortCode: form.cohortCode,
        englishGroupCode: form.englishGroupCode,
        englishPicDisplay: form.englishPicDisplay || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        teacherIds: form.teacherIds,
      },
      learnerIds: form.learnerIds,
    });
    onClose();
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.course')}</span><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground" value={effectiveProgramId} onChange={set('programId')} required>{programs.map((program) => <option key={program._id} value={program._id}>{program.code} · {program.name}</option>)}</select></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.runCode')}</span><Input value={form.cohortCode} onChange={set('cohortCode')} required /></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.groupCode')}</span><Input value={form.englishGroupCode} onChange={set('englishGroupCode')} required /></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.startDate')}</span><Input type="date" value={form.startDate} onChange={set('startDate')} /></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.endDate')}</span><Input type="date" value={form.endDate} onChange={set('endDate')} /></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.pic')}</span><Input value={form.englishPicDisplay} onChange={set('englishPicDisplay')} /></label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <CheckList rows={teachers.data || []} selected={form.teacherIds} onChange={(teacherIds) => setForm((value) => ({ ...value, teacherIds }))} label={t('englishOperations.classes.teachers')} />
        <CheckList rows={learners.data?.data || []} selected={form.learnerIds} onChange={(learnerIds) => setForm((value) => ({ ...value, learnerIds }))} label={t('englishOperations.classes.learners')} />
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t('englishOperations.classes.cancel')}</Button><Button type="submit" disabled={mutation.isPending || !effectiveProgramId}>{t('englishOperations.classes.saveRun')}</Button></div>
    </form>
  );
}

function RunDetail({ run }) {
  const { t } = useTranslation();
  const roster = useEnglishClassRoster(run?._id);
  if (!run) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="font-semibold text-foreground">{run.cohortCode} · {run.programName}</h3><p className="text-sm text-muted-foreground">{run.startDate || '—'} → {run.endDate || '—'} · {run.englishPicDisplay || '—'}</p></div>
        <span className="text-xs text-muted-foreground">{t('englishOperations.classes.sessions', { booked: run.bookedSessions, total: run.totalSessions })}</span>
      </div>
      <h4 className="mt-5 text-sm font-semibold text-foreground">{t('englishOperations.classes.roster')}</h4>
      <div className="mt-2 divide-y divide-border rounded-md border border-border">
        {(roster.data || []).map((enrollment) => <div key={enrollment.id} className="flex justify-between px-3 py-2 text-sm"><span>{enrollment.learner?.name} · {enrollment.learner?.empCode}</span><span className="text-muted-foreground">{enrollment.startSessionNumber ? `S${enrollment.startSessionNumber}` : enrollment.status}</span></div>)}
        {!roster.isLoading && (roster.data || []).length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('englishOperations.classes.noRoster')}</p>}
      </div>
    </div>
  );
}

export default function ClassesPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = ['Admin', 'Coordinator'].includes(user?.role);
  const programs = useEnglishPrograms();
  const classes = useEnglishClasses();
  const [form, setForm] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const groups = useMemo(() => {
    const map = new Map();
    for (const run of classes.data || []) {
      const key = run.englishGroupCode || 'UNASSIGNED';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(run);
    }
    return [...map.entries()];
  }, [classes.data]);
  const selected = (classes.data || []).find((run) => run._id === selectedId) || classes.data?.[0] || null;

  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setForm('program')}><Plus className="size-4" />{t('englishOperations.classes.addProgram')}</Button><Button onClick={() => setForm('run')} disabled={(programs.data || []).length === 0}><Plus className="size-4" />{t('englishOperations.classes.addRun')}</Button></div>}
      {form === 'program' && <ProgramForm onClose={() => setForm(null)} />}
      {form === 'run' && <RunForm programs={programs.data || []} onClose={() => setForm(null)} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.4fr)]">
        <div className="space-y-3">
          {groups.map(([groupCode, runs]) => <section key={groupCode} className="rounded-lg border border-border bg-card p-3"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{groupCode}</h3><div className="space-y-1">{runs.map((run) => <button key={run._id} onClick={() => setSelectedId(run._id)} className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected?._id === run._id ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/50 text-muted-foreground'}`}><span className="block font-medium">{run.cohortCode}</span><span className="block text-xs">{run.programName}</span></button>)}</div></section>)}
          {!classes.isLoading && groups.length === 0 && <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t('englishOperations.classes.empty')}</p>}
        </div>
        <RunDetail run={selected} />
      </div>
    </div>
  );
}
