import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  useLearningPrograms, useCreatePath, useUpdatePath, useArchivePath,
} from '../../hooks/useLearning';
import { LearningField, EnumSelect, controlClass, textareaClass } from './LearningField';
import PathProgramsEditor from './PathProgramsEditor';

const STATUSES = ['active', 'inactive', 'archived'];

const blank = { code: '', title: '', description: '', status: 'active', programs: [] };

// Create or edit a LearningPath. `path` null = create mode. The edit form maps
// the DTO's populated `programs` (objects) back to an ordered id array.
export default function PathFormModal({ path, onClose }) {
  const { t } = useTranslation();
  const isEdit = Boolean(path);
  const createMutation = useCreatePath();
  const updateMutation = useUpdatePath();
  const archiveMutation = useArchivePath();

  const { data: programData } = useLearningPrograms({ status: 'active' });
  const programOptions = programData?.data || [];

  const [form, setForm] = useState(() =>
    (isEdit
      ? { ...blank, ...path, programs: (path.programs || []).map((p) => p._id || p) }
      : blank));
  const [error, setError] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      title: form.title.trim(),
      description: form.description?.trim() || undefined,
      status: form.status,
      programs: form.programs || [],
    };
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: path._id, data: payload });
        toast.success(t('learning.paths.updated'));
      } else {
        await createMutation.mutateAsync({ ...payload, code: form.code.trim() });
        toast.success(t('learning.paths.created'));
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  const handleArchive = async () => {
    if (!confirmArchive) { setConfirmArchive(true); return; }
    setError('');
    try {
      await archiveMutation.mutateAsync(path._id);
      toast.success(t('learning.paths.archived'));
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
      setConfirmArchive(false);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg p-6 space-y-4" aria-label={isEdit ? t('learning.paths.edit') : t('learning.paths.create')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-h3 text-foreground">
              {isEdit ? t('learning.paths.edit') : t('learning.paths.create')}
            </DialogTitle>
            {isEdit && (
              <DialogDescription className="text-sm text-muted-foreground">
                <span className="font-mono text-primary">{path.code}</span>
              </DialogDescription>
            )}
          </DialogHeader>

          {error && (
            <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
          )}

          {!isEdit && (
            <LearningField label={t('learning.fields.code')}>
              <input value={form.code} onChange={(e) => set('code')(e.target.value)} required className={controlClass} />
            </LearningField>
          )}

          <LearningField label={t('learning.fields.title')}>
            <input value={form.title} onChange={(e) => set('title')(e.target.value)} required className={controlClass} />
          </LearningField>

          <LearningField label={t('learning.fields.description')}>
            <textarea value={form.description} onChange={(e) => set('description')(e.target.value)} className={textareaClass} />
          </LearningField>

          <LearningField label={t('learning.fields.status')}>
            <EnumSelect value={form.status} onChange={set('status')} options={STATUSES} labelFor={(v) => t(`learning.status.${v}`)} />
          </LearningField>

          <LearningField label={t('learning.paths.steps')} hint={t('learning.paths.stepsHint')}>
            <PathProgramsEditor options={programOptions} value={form.programs || []} onChange={set('programs')} />
          </LearningField>

          <div className="flex gap-3 pt-2">
            {isEdit && (
              <Button type="button" variant="destructive" onClick={handleArchive} disabled={archiveMutation.isPending}>
                {confirmArchive ? t('learning.paths.archiveConfirm') : t('learning.paths.archive')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">{t('learning.actions.cancel')}</Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? (isEdit ? t('learning.actions.saving') : t('learning.actions.creating')) : (isEdit ? t('learning.actions.save') : t('learning.actions.create'))}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
