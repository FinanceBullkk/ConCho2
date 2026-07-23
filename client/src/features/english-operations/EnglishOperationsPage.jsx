import { createElement, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Boxes, CalendarCheck2, ClipboardCheck, Plus, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '../../context/AuthContext';
import {
  useCreateManagedEnglishLearner,
  useDeleteManagedEnglishLearner,
  useEnglishOperationsOverview,
  useManagedEnglishLearners,
  useProvisionArchiveLearners,
  useUpdateManagedEnglishLearner,
} from './useEnglishOperations';
import ClassesPanel from './ClassesPanel';
import SchedulePanel from './SchedulePanel';
import AttendancePanel from './AttendancePanel';
import EvaluationPanel from './EvaluationPanel';
import ArchivePanel from './ArchivePanel';

const EMPTY_FORM = {
  empCode: '', name: '', email: '', department: '', position: '', status: 'Active',
};

function StatCard({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-2xl font-semibold text-foreground">{value ?? '—'}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

export function Overview({ data, isTeacher, onNavigate, t }) {
  const actions = [
    { id: 'attendance', icon: ClipboardCheck },
    { id: 'schedule', icon: CalendarCheck2 },
    { id: 'classes', icon: Boxes },
  ];
  // Teacher has no operational access to English Operations yet (assigned-Teacher
  // scope is planned). Show an honest notice rather than management-facing action
  // cards or operational data counts they cannot act on.
  if (isTeacher) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <h2 className="font-semibold text-foreground">{t('englishOperations.overview.teacherTitle')}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {t('englishOperations.overview.teacherPlaceholder')}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <section>
        <h2 className="font-semibold text-foreground">{t('englishOperations.overview.startHere')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('englishOperations.overview.startHereHint')}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {actions.map(({ id, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className="group rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/35 hover:bg-primary/[0.04]"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {createElement(icon, { className: 'size-5' })}
              </span>
              <span className="mt-3 block font-semibold text-foreground">{t(`englishOperations.overview.actions.${id}.title`)}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t(`englishOperations.overview.actions.${id}.description`)}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-semibold text-foreground">{t('englishOperations.overview.dataStatus')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t('englishOperations.overview.managedPeople')} value={data?.managedPeople} />
          <StatCard label={t('englishOperations.overview.linkedPeople')} value={data?.linkedPeople} />
          <StatCard label={t('englishOperations.overview.unlinkedPeople')} value={data?.unlinkedPeople} />
          <StatCard label={t('englishOperations.overview.archivePeople')} value={data?.archivePeople} />
        </div>
      </section>
    </div>
  );
}

function LearnerForm({ initial, onCancel, createMutation, updateMutation, t }) {
  const editing = Boolean(initial?._id);
  const [form, setForm] = useState(() => editing ? {
    empCode: initial.empCode,
    name: initial.name || '',
    email: initial.email || '',
    department: initial.department || '',
    position: initial.position || '',
    status: initial.status || 'Active',
  } : EMPTY_FORM);
  const mutation = editing ? updateMutation : createMutation;
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    const data = { ...form };
    if (editing) delete data.empCode;
    if (editing) await updateMutation.mutateAsync({ id: initial._id, data });
    else await createMutation.mutateAsync(data);
    onCancel();
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.learners.empCode')}</span>
          <Input value={form.empCode} onChange={set('empCode')} disabled={editing} required />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.learners.name')}</span>
          <Input value={form.name} onChange={set('name')} required />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.learners.email')}</span>
          <Input type="email" value={form.email} onChange={set('email')} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.learners.department')}</span>
          <Input value={form.department} onChange={set('department')} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.learners.position')}</span>
          <Input value={form.position} onChange={set('position')} />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.learners.status')}</span>
          <select
            value={form.status}
            onChange={set('status')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground"
          >
            {['Active', 'Inactive', 'On-hold', 'Waiting for class', 'Dropped', 'Transferred'].map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>{t('englishOperations.learners.cancel')}</Button>
        <Button type="submit" disabled={mutation.isPending}>{t('englishOperations.learners.save')}</Button>
      </div>
    </form>
  );
}

function Learners() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const query = useManagedEnglishLearners({ q: search || undefined, limit: 200 });
  const createMutation = useCreateManagedEnglishLearner();
  const updateMutation = useUpdateManagedEnglishLearner();
  const deleteMutation = useDeleteManagedEnglishLearner();
  const provisionMutation = useProvisionArchiveLearners();

  const remove = (person) => {
    if (window.confirm(t('englishOperations.learners.deleteConfirm', { name: person.name }))) {
      deleteMutation.mutate(person._id);
    }
  };
  const provision = () => {
    if (window.confirm(t('englishOperations.learners.provisionConfirm'))) provisionMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('englishOperations.learners.search')}
          className="sm:max-w-sm"
        />
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={provision} disabled={provisionMutation.isPending}>
            <RefreshCw className="size-4" /> {t('englishOperations.learners.provision')}
          </Button>
          <Button onClick={() => setEditing(EMPTY_FORM)}><Plus className="size-4" /> {t('englishOperations.learners.add')}</Button>
        </div>
      </div>

      {editing && (
        <LearnerForm
          key={editing._id || 'new'}
          initial={editing._id ? editing : null}
          onCancel={() => setEditing(null)}
          createMutation={createMutation}
          updateMutation={updateMutation}
          t={t}
        />
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              {['empCode', 'name', 'department', 'status', 'access'].map((key) => (
                <th key={key} className="px-4 py-3 font-medium">{t(`englishOperations.learners.${key}`)}</th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(query.data?.data || []).map((person) => (
              <tr key={person._id}>
                <td className="px-4 py-3 font-mono text-xs">{person.empCode}</td>
                <td className="px-4 py-3"><div className="font-medium text-foreground">{person.name}</div><div className="text-xs text-muted-foreground">{person.email || '—'}</div></td>
                <td className="px-4 py-3 text-muted-foreground">{person.department || '—'}</td>
                <td className="px-4 py-3">{person.status}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t(person.canLogin ? 'englishOperations.learners.loginEnabled' : 'englishOperations.learners.managed')}
                  {person.archiveEmployeeId ? ` · ${t('englishOperations.learners.archiveLinked')}` : ''}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {!person.canLogin && <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(person)}>{t('englishOperations.learners.edit')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(person)}>{t('englishOperations.learners.delete')}</Button>
                  </>}
                </td>
              </tr>
            ))}
            {!query.isLoading && (query.data?.data || []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{t('englishOperations.learners.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EnglishOperationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const canManageLearners = ['Admin', 'Coordinator'].includes(user?.role);
  const canReadArchive = ['Admin', 'Coordinator'].includes(user?.role);
  const canOperateCanonicalEnglish = ['Admin', 'Coordinator'].includes(user?.role);
  const requested = params.get('tab') || 'overview';
  const active = requested === 'learners' && canManageLearners
    ? 'learners'
    : requested === 'archive' && canReadArchive
      ? 'archive'
      : canOperateCanonicalEnglish && ['classes', 'schedule', 'attendance', 'evaluation'].includes(requested)
        ? requested : 'overview';
  const descriptionKey = {
    learners: 'englishOperations.learners.description',
    classes: 'englishOperations.classes.description',
    schedule: 'englishOperations.schedule.description',
    attendance: 'englishOperations.attendance.description',
    evaluation: 'englishOperations.evaluation.description',
    archive: 'englishOperations.archive.description',
  }[active] || 'englishOperations.description';
  const overview = useEnglishOperationsOverview();

  useEffect(() => {
    if (requested !== active) setParams({ tab: active }, { replace: true });
  }, [active, requested, setParams]);

  return (
    <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-6">
      <PageHeader
        title={t('englishOperations.title')}
        description={t(descriptionKey)}
      />
      {active === 'learners' && <Learners />}
      {active === 'classes' && <ClassesPanel />}
      {active === 'schedule' && <SchedulePanel />}
      {active === 'attendance' && <AttendancePanel />}
      {active === 'evaluation' && <EvaluationPanel />}
      {active === 'archive' && <ArchivePanel />}
      {active === 'overview' && (
        <Overview
          data={overview.data}
          isTeacher={user?.role === 'Teacher'}
          onNavigate={(tab) => setParams({ tab })}
          t={t}
        />
      )}
    </div>
  );
}
