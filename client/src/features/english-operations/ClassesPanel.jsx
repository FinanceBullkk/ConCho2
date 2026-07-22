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
  useCanonicalEnglishCourseRuns,
  useCanonicalEnglishCourses,
  useCanonicalEnglishEmployees,
  useAddCanonicalRunEnrollment,
  useLeaveCanonicalRunEnrollment,
  useTransferCanonicalRunEnrollment,
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

const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

function RosterAddForm({ run, employees, onClose }) {
  const { t } = useTranslation();
  const mutation = useAddCanonicalRunEnrollment();
  const enrolled = new Set(run.roster.map((row) => row.employeeId));
  const available = employees.filter((employee) => (
    employee.employmentStatus === 'active'
    && !employee.activeCourseRunId
    && !enrolled.has(employee.id)
  ));
  const [employeeId, setEmployeeId] = useState(available[0]?.id || '');
  const [startDate, setStartDate] = useState(today());
  const submit = async (event) => {
    event.preventDefault();
    await mutation.mutateAsync({
      courseRunId: run.id,
      data: {
        employeeId,
        startDate,
        confirmedStartSessionNumber: run.nextSessionNumber,
      },
    });
    onClose();
  };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-[1fr_180px_auto] md:items-end">
      <label className="space-y-1 text-sm text-muted-foreground">
        <span>{t('englishOperations.classes.learner')}</span>
        <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required>
          {available.map((employee) => <option key={employee.id} value={employee.id}>{employee.empCode} · {employee.fullName}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-sm text-muted-foreground">
        <span>{t('englishOperations.classes.membershipStart')}</span>
        <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
      </label>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>{t('englishOperations.classes.cancel')}</Button>
        <Button type="submit" disabled={!employeeId || mutation.isPending}>{t('englishOperations.classes.addLearnerAtSession', { session: run.nextSessionNumber })}</Button>
      </div>
    </form>
  );
}

function RosterLeaveForm({ run, learner, onClose }) {
  const { t } = useTranslation();
  const mutation = useLeaveCanonicalRunEnrollment();
  const [lastActiveDate, setLastActiveDate] = useState(today());
  const [reason, setReason] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    await mutation.mutateAsync({
      courseRunId: run.id,
      enrollmentId: learner.enrollmentId,
      data: { lastActiveDate, reason },
    });
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div>
        <h5 className="text-sm font-semibold text-foreground">{t('englishOperations.classes.leaveTitle', { learner: learner.fullName })}</h5>
        <p className="mt-1 text-xs text-muted-foreground">{t('englishOperations.classes.leaveHint')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end">
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.classes.lastActiveDate')}</span>
          <Input type="date" max={today()} value={lastActiveDate} onChange={(event) => setLastActiveDate(event.target.value)} required />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.classes.leaveReason')}</span>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required />
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t('englishOperations.classes.cancel')}</Button>
          <Button type="submit" variant="destructive" disabled={mutation.isPending}>{t('englishOperations.classes.confirmLeave')}</Button>
        </div>
      </div>
    </form>
  );
}

function RosterTransferForm({ run, learner, destinations, onClose }) {
  const { t } = useTranslation();
  const mutation = useTransferCanonicalRunEnrollment();
  const firstAvailable = destinations.find((row) => !row.capacity || row.activeMembers < row.capacity);
  const [targetCourseRunId, setTargetCourseRunId] = useState(firstAvailable?.id || '');
  const [transferDate, setTransferDate] = useState(today());
  const [capacityOverrideReason, setCapacityOverrideReason] = useState('');
  const target = destinations.find((row) => row.id === targetCourseRunId);
  const targetFull = Boolean(target?.capacity && target.activeMembers >= target.capacity);
  const submit = async (event) => {
    event.preventDefault();
    await mutation.mutateAsync({
      sourceCourseRunId: run.id,
      enrollmentId: learner.enrollmentId,
      data: {
        targetCourseRunId,
        transferDate,
        confirmedStartSessionNumber: target.transferStartSessionNumber,
        ...(targetFull ? { capacityOverrideReason: capacityOverrideReason.trim() } : {}),
      },
    });
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div>
        <h5 className="text-sm font-semibold text-foreground">{t('englishOperations.classes.transferTitle', { learner: learner.fullName })}</h5>
        <p className="mt-1 text-xs text-muted-foreground">{t('englishOperations.classes.transferHint')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_180px] md:items-end">
        <label className="min-w-0 space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.classes.transferDestination')}</span>
          <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={targetCourseRunId} onChange={(event) => { setTargetCourseRunId(event.target.value); setCapacityOverrideReason(''); }} required>
            <option value="" disabled>{t('englishOperations.classes.selectTransferDestination')}</option>
            {destinations.map((row) => {
              const full = row.capacity && row.activeMembers >= row.capacity;
              return <option key={row.id} value={row.id}>{row.classCode} · {row.courseCode} · {t('englishOperations.classes.transferOption', { session: row.transferStartSessionNumber, count: row.activeMembers, capacity: row.capacity || '—' })}{full ? ` · ${t('englishOperations.classes.full')}` : ''}</option>;
            })}
          </select>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.classes.transferDate')}</span>
          <Input type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} required />
        </label>
      </div>
      {targetFull && <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
        <p className="text-sm font-medium text-foreground">{t('englishOperations.classes.capacityOverrideWarning', { projected: target.activeMembers + 1, capacity: target.capacity })}</p>
        <p className="text-xs text-muted-foreground">{t('englishOperations.classes.capacityOverrideHint')}</p>
        <label className="block space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.classes.capacityOverrideReason')}</span>
          <textarea value={capacityOverrideReason} onChange={(event) => setCapacityOverrideReason(event.target.value)} maxLength={1000} required rows={3} className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
        </label>
      </div>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>{t('englishOperations.classes.cancel')}</Button>
        <Button type="submit" disabled={!target || (targetFull && !capacityOverrideReason.trim()) || mutation.isPending}>{t('englishOperations.classes.confirmTransfer')}</Button>
      </div>
      {destinations.length === 0 && <p className="text-xs text-muted-foreground">{t('englishOperations.classes.noTransferDestinations')}</p>}
    </form>
  );
}

function ClassDetail({ classId, summary, employees, courseRuns, classes, canManage }) {
  const { t } = useTranslation();
  const detail = useCanonicalEnglishClass(classId);
  const [addingToRun, setAddingToRun] = useState(null);
  const [leavingEnrollment, setLeavingEnrollment] = useState(null);
  const [transferringEnrollment, setTransferringEnrollment] = useState(null);
  if (detail.isLoading) return <div className="flex justify-center rounded-lg border border-border bg-card py-16"><Spinner size={28} /></div>;
  if (!detail.data) return null;
  const value = detail.data;
  return (
    <div className="min-w-0 space-y-6 rounded-lg border border-border bg-card p-4">
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
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('englishOperations.classes.attendanceRule', { percent: Math.round(run.attendanceThresholdRatio * 100) })}</span>
              {canManage && ['planned', 'active'].includes(run.status) && <Button size="sm" variant="outline" onClick={() => setAddingToRun(addingToRun === run.id ? null : run.id)}>{t('englishOperations.classes.addLearner')}</Button>}
            </div>
          </div>
          {addingToRun === run.id && <RosterAddForm run={run} employees={employees} onClose={() => setAddingToRun(null)} />}
          {leavingEnrollment?.runId === run.id && (
            <RosterLeaveForm
              run={run}
              learner={run.roster.find((row) => row.enrollmentId === leavingEnrollment.enrollmentId)}
              onClose={() => setLeavingEnrollment(null)}
            />
          )}
          {transferringEnrollment?.runId === run.id && (
            <RosterTransferForm
              run={run}
              learner={run.roster.find((row) => row.enrollmentId === transferringEnrollment.enrollmentId)}
              destinations={courseRuns.filter((row) => row.cohortId !== value.id).map((row) => {
                const targetClass = classes.find((item) => item.id === row.cohortId);
                return { ...row, capacity: targetClass?.capacity, activeMembers: targetClass?.activeMembers || 0 };
              })}
              onClose={() => setTransferringEnrollment(null)}
            />
          )}
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">{t('englishOperations.classes.learner')}</th><th className="px-3 py-2">{t('englishOperations.classes.enrollmentStatus')}</th><th className="px-3 py-2">{t('englishOperations.classes.startsAtSession')}</th><th className="px-3 py-2">{t('englishOperations.classes.attendance')}</th><th className="px-3 py-2">{t('englishOperations.classes.eligibility')}</th>{canManage && <th className="px-3 py-2 text-right">{t('englishOperations.classes.actions')}</th>}</tr></thead>
              <tbody className="divide-y divide-border">{run.roster.map((row) => <tr key={row.enrollmentId}><td className="px-3 py-2"><div className="font-medium text-foreground">{row.fullName}</div><div className="text-xs text-muted-foreground">{row.empCode}</div></td><td className="px-3 py-2 text-muted-foreground">{row.enrollmentStatus}</td><td className="px-3 py-2 text-muted-foreground">{row.startSessionNumber}</td><td className="px-3 py-2 text-muted-foreground">{percentage(row.attendanceRatio)} <span className="text-xs">({row.presentCount}/{row.markedCount})</span></td><td className="px-3 py-2 text-muted-foreground">{row.eligibilityStatus}</td>{canManage && <td className="px-3 py-2 text-right">{row.enrollmentStatus === 'active' && <div className="flex justify-end gap-1"><Button size="sm" variant="outline" onClick={() => { setLeavingEnrollment(null); setTransferringEnrollment({ runId: run.id, enrollmentId: row.enrollmentId }); }}>{t('englishOperations.classes.transferLearner')}</Button><Button size="sm" variant="ghost" onClick={() => { setTransferringEnrollment(null); setLeavingEnrollment({ runId: run.id, enrollmentId: row.enrollmentId }); }}>{t('englishOperations.classes.markLeft')}</Button></div>}</td>}</tr>)}</tbody>
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
  const courseRuns = useCanonicalEnglishCourseRuns();
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

  if (classes.isLoading || courses.isLoading || courseRuns.isLoading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button onClick={() => setCreating(true)}><Plus className="size-4" />{t('englishOperations.classes.addClass')}</Button></div>}
      {creating && <ClassForm classes={classes.data || []} courses={(courses.data || []).filter((course) => course.isActive)} employees={employees.data || []} onClose={() => setCreating(false)} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.7fr)]">
        <div className="space-y-3">
          {groups.map(([pic, rows]) => <section key={pic} className="rounded-lg border border-border bg-card p-3"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('englishOperations.classes.picGroup', { pic })}</h3><div className="space-y-1">{rows.map((row) => <button type="button" key={row.id} onClick={() => setSelectedId(row.id)} className={`w-full rounded-md px-3 py-2 text-left text-sm ${selected?.id === row.id ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}><span className="block font-medium">{row.classCode} · {row.displayName}</span><span className="block text-xs">{t('englishOperations.classes.classSummary', { members: row.activeMembers, runs: row.runs })}</span></button>)}</div></section>)}
          {!classes.isLoading && groups.length === 0 && <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t('englishOperations.classes.empty')}</p>}
        </div>
        <ClassDetail classId={selected?.id} summary={selected} employees={employees.data || []} courseRuns={courseRuns.data || []} classes={classes.data || []} canManage={canManage} />
      </div>
    </div>
  );
}
