import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDebounce } from '../../hooks/useDebounce';
import { useDepartments } from '../../hooks/useOrg';
import { useUsers } from '../../hooks/useUsers';
import {
  useCreateAssignment, useLearningPaths, useLearningPrograms,
} from '../../hooks/useLearning';
import { LearningField, EnumSelect, controlClass, textareaClass } from './LearningField';

const TARGET_TYPES = ['program', 'path'];
const ASSIGNABLE_STATUSES = new Set(['Active', 'On-hold', 'Waiting for class']);

const blank = {
  title: '',
  description: '',
  targetType: 'program',
  programId: '',
  pathId: '',
  dueDate: '',
  userIds: [],
  departmentIds: [],
};

const asArray = (value) => (Array.isArray(value) ? value : []);

export default function AssignmentFormModal({ onClose }) {
  const { t } = useTranslation();
  const createMutation = useCreateAssignment();
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const debouncedSearch = useDebounce(userSearch, 250);

  const { data: programData } = useLearningPrograms({ status: 'active' });
  const { data: pathData } = useLearningPaths({ status: 'active' });
  const { data: departments = [] } = useDepartments({ status: 'active' });
  const { data: usersData } = useUsers({
    limit: 25,
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
  });

  const programs = programData?.data || [];
  const paths = pathData?.data || [];
  const users = (usersData?.data || []).filter((user) => ASSIGNABLE_STATUSES.has(user.status));

  const targetOptions = form.targetType === 'path' ? paths : programs;
  const targetKey = form.targetType === 'path' ? 'pathId' : 'programId';

  const selectedTargetCount = form.userIds.length + form.departmentIds.length;
  const canSubmit = useMemo(
    () => form.title.trim() && form[targetKey] && form.dueDate && selectedTargetCount > 0,
    [form, selectedTargetCount, targetKey],
  );

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const setTargetType = (targetType) => setForm((current) => ({
    ...current,
    targetType,
    programId: '',
    pathId: '',
  }));

  const toggle = (key, id) => setForm((current) => {
    const values = asArray(current[key]);
    return {
      ...current,
      [key]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
    };
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!canSubmit) {
      setError(t('learning.assignments.validation'));
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      targetType: form.targetType,
      [targetKey]: form[targetKey],
      dueDate: form.dueDate,
      userIds: form.userIds,
      departmentIds: form.departmentIds,
    };

    try {
      await createMutation.mutateAsync(payload);
      toast.success(t('learning.assignments.created'));
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl p-6 space-y-4" aria-label={t('learning.assignments.create')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-h3 text-foreground">
              {t('learning.assignments.create')}
            </DialogTitle>
          </DialogHeader>

          {error && (
            <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
          )}

          <LearningField label={t('learning.fields.title')}>
            <input aria-label={t('learning.fields.title')} value={form.title} onChange={(e) => set('title')(e.target.value)} required className={controlClass} />
          </LearningField>

          <LearningField label={t('learning.fields.description')}>
            <textarea aria-label={t('learning.fields.description')} value={form.description} onChange={(e) => set('description')(e.target.value)} className={textareaClass} />
          </LearningField>

          <div className="grid gap-4 md:grid-cols-2">
            <LearningField label={t('learning.assignments.targetType')}>
              <EnumSelect aria-label={t('learning.assignments.targetType')} value={form.targetType} onChange={setTargetType} options={TARGET_TYPES} labelFor={(v) => t(`learning.assignments.targetTypes.${v}`)} />
            </LearningField>
            <LearningField label={t(`learning.fields.${form.targetType}`)}>
              <select aria-label={t(`learning.fields.${form.targetType}`)} value={form[targetKey]} onChange={(e) => set(targetKey)(e.target.value)} required className={controlClass}>
                <option value="">{t('learning.assignments.selectTarget')}</option>
                {targetOptions.map((target) => (
                  <option key={target._id} value={target._id}>
                    {target.name || target.title} ({target.code})
                  </option>
                ))}
              </select>
            </LearningField>
          </div>

          <LearningField label={t('learning.assignments.dueDate')}>
            <input aria-label={t('learning.assignments.dueDate')} type="date" value={form.dueDate} onChange={(e) => set('dueDate')(e.target.value)} required className={controlClass} />
          </LearningField>

          <LearningField label={t('learning.assignments.departments')}>
            <div className="max-h-32 overflow-auto rounded-md border border-border bg-background p-2 space-y-1">
              {departments.map((department) => (
                <label key={department._id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={form.departmentIds.includes(department._id)}
                    onChange={() => toggle('departmentIds', department._id)}
                  />
                  <span>{department.name} ({department.code})</span>
                </label>
              ))}
              {!departments.length && <div className="text-small text-muted-foreground px-2 py-1">{t('learning.assignments.noDepartments')}</div>}
            </div>
          </LearningField>

          <LearningField label={t('learning.assignments.users')}>
            <input
              aria-label={t('learning.assignments.searchUsers')}
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder={t('learning.assignments.searchUsers')}
              className={`${controlClass} mb-2`}
            />
            <div className="max-h-36 overflow-auto rounded-md border border-border bg-background p-2 space-y-1">
              {users.map((user) => (
                <label key={user._id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={form.userIds.includes(user._id)}
                    onChange={() => toggle('userIds', user._id)}
                  />
                  <span>{user.name} ({user.empCode})</span>
                </label>
              ))}
              {!users.length && <div className="text-small text-muted-foreground px-2 py-1">{t('learning.assignments.noUsers')}</div>}
            </div>
          </LearningField>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">{t('learning.actions.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending} className="flex-1">
              {createMutation.isPending ? t('learning.actions.creating') : t('learning.actions.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
