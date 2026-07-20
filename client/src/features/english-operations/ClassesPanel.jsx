import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '../../components/Spinner';
import { useAuth } from '../../context/AuthContext';
import {
  useCanonicalEnglishClass,
  useCanonicalEnglishClasses,
  useCanonicalEnglishCourses,
  useCanonicalEnglishEmployees,
  useCreateCanonicalEnglishClass,
} from './useEnglishOperations';

const nextClassCode = (classes) => {
  const largest = classes.reduce((max, row) => {
    const match = /^EL(\d+)$/i.exec(row.classCode || '');
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `EL${String(largest + 1).padStart(3, '0')}`;
};

function ClassForm({ classes, courses, employees, onClose }) {
  const { t } = useTranslation();
  const mutation = useCreateCanonicalEnglishClass();
  const [form, setForm] = useState({
    classCode: nextClassCode(classes),
    displayName: '',
    courseId: courses[0]?.id || '',
    startDate: '',
    capacity: 12,
    status: 'active',
    picEmployeeId: '',
    picLabel: '',
  });
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const effectiveCourseId = form.courseId || courses[0]?.id || '';
  const submit = async (event) => {
    event.preventDefault();
    await mutation.mutateAsync({
      classCode: form.classCode,
      displayName: form.displayName,
      courseId: effectiveCourseId,
      startDate: form.startDate,
      capacity: Number(form.capacity),
      status: form.status,
      picEmployeeId: form.picEmployeeId || null,
      picLabel: form.picEmployeeId ? null : form.picLabel,
    });
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="font-semibold text-foreground">{t('englishOperations.classes.createClassTitle')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('englishOperations.classes.createClassHint')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.classCode')}</span><Input value={form.classCode} onChange={set('classCode')} required /></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.displayName')}</span><Input value={form.displayName} onChange={set('displayName')} required /></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.course')}</span><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground" value={effectiveCourseId} onChange={set('courseId')} required>{courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} · {course.courseName}</option>)}</select></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.startDate')}</span><Input type="date" value={form.startDate} onChange={set('startDate')} required /></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.capacity')}</span><Input type="number" min="1" max="500" value={form.capacity} onChange={set('capacity')} required /></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.initialStatus')}</span><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground" value={form.status} onChange={set('status')}><option value="active">{t('englishOperations.classes.active')}</option><option value="planned">{t('englishOperations.classes.planned')}</option></select></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.picEmployee')}</span><select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground" value={form.picEmployeeId} onChange={set('picEmployeeId')}><option value="">{t('englishOperations.classes.usePicLabel')}</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.empCode} · {employee.fullName}</option>)}</select></label>
        <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.classes.picLabel')}</span><Input value={form.picLabel} onChange={set('picLabel')} disabled={Boolean(form.picEmployeeId)} required={!form.picEmployeeId} /></label>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t('englishOperations.classes.cancel')}</Button><Button type="submit" disabled={mutation.isPending || !effectiveCourseId}>{t('englishOperations.classes.saveClass')}</Button></div>
    </form>
  );
}

const percentage = (value) => value == null ? '—' : `${Math.round(value * 100)}%`;

function ClassDetail({ classId, summary }) {
  const { t } = useTranslation();
  const detail = useCanonicalEnglishClass(classId);
  if (detail.isLoading) return <div className="flex justify-center rounded-lg border border-border bg-card py-16"><Spinner size={28} /></div>;
  if (!detail.data) return null;
  const value = detail.data;
  return (
    <div className="space-y-6 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{value.classCode} · {value.displayName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('englishOperations.classes.picOwner', { pic: value.currentPic || '—' })}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{t('englishOperations.classes.classStatus', { status: value.status })}</div>
          <div>{t('englishOperations.classes.classSize', { count: summary?.activeMembers || 0, capacity: value.capacity || '—' })}</div>
        </div>
      </div>
      {(value.runs || []).map((run) => (
        <section key={run.id} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <div><h4 className="font-semibold text-foreground">{run.courseCode} · {run.courseName}</h4><p className="text-xs text-muted-foreground">{t('englishOperations.classes.runMeta', { run: run.runNumber, status: run.status })}</p></div>
            <span className="text-xs text-muted-foreground">{t('englishOperations.classes.attendanceRule', { percent: Math.round(run.attendanceThresholdRatio * 100) })}</span>
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">{t('englishOperations.classes.learner')}</th><th className="px-3 py-2">{t('englishOperations.classes.enrollmentStatus')}</th><th className="px-3 py-2">{t('englishOperations.classes.startsAtSession')}</th><th className="px-3 py-2">{t('englishOperations.classes.attendance')}</th><th className="px-3 py-2">{t('englishOperations.classes.eligibility')}</th></tr></thead>
              <tbody className="divide-y divide-border">{run.roster.map((row) => <tr key={row.enrollmentId}><td className="px-3 py-2"><div className="font-medium text-foreground">{row.fullName}</div><div className="text-xs text-muted-foreground">{row.empCode}</div></td><td className="px-3 py-2 text-muted-foreground">{row.enrollmentStatus}</td><td className="px-3 py-2 text-muted-foreground">{row.startSessionNumber}</td><td className="px-3 py-2 text-muted-foreground">{percentage(row.attendanceRatio)} <span className="text-xs">({row.presentCount}/{row.markedCount})</span></td><td className="px-3 py-2 text-muted-foreground">{row.eligibilityStatus}</td></tr>)}</tbody>
            </table>
            {run.roster.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t('englishOperations.classes.noRoster')}</p>}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function ClassesPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canManage = ['Admin', 'Coordinator'].includes(user?.role);
  const classes = useCanonicalEnglishClasses();
  const courses = useCanonicalEnglishCourses();
  const employees = useCanonicalEnglishEmployees(canManage);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const groups = useMemo(() => {
    const byPic = new Map();
    for (const item of classes.data || []) {
      const key = item.currentPic || t('englishOperations.classes.unassignedPic');
      if (!byPic.has(key)) byPic.set(key, []);
      byPic.get(key).push(item);
    }
    return [...byPic.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [classes.data, t]);
  const selected = (classes.data || []).find((row) => row.id === selectedId) || classes.data?.[0] || null;

  if (classes.isLoading || courses.isLoading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button onClick={() => setCreating(true)}><Plus className="size-4" />{t('englishOperations.classes.addClass')}</Button></div>}
      {creating && <ClassForm classes={classes.data || []} courses={(courses.data || []).filter((course) => course.isActive)} employees={employees.data || []} onClose={() => setCreating(false)} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.7fr)]">
        <div className="space-y-3">
          {groups.map(([pic, rows]) => <section key={pic} className="rounded-lg border border-border bg-card p-3"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('englishOperations.classes.picGroup', { pic })}</h3><div className="space-y-1">{rows.map((row) => <button type="button" key={row.id} onClick={() => setSelectedId(row.id)} className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected?.id === row.id ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}><span className="block font-medium">{row.classCode} · {row.displayName}</span><span className="block text-xs">{t('englishOperations.classes.classSummary', { members: row.activeMembers, runs: row.runs })}</span></button>)}</div></section>)}
          {!classes.isLoading && groups.length === 0 && <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t('englishOperations.classes.empty')}</p>}
        </div>
        <ClassDetail classId={selected?.id} summary={selected} />
      </div>
    </div>
  );
}
