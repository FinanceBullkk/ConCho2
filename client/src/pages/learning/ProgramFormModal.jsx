import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateProgram, useUpdateProgram, useArchiveProgram } from '../../hooks/useLearning';
import { LearningField, EnumSelect, controlClass, textareaClass } from './LearningField';

const CATEGORIES = ['english', 'onboarding', 'compliance', 'soft_skills', 'technical', 'workshop', 'other'];
const SCHEDULING = ['leader_booking', 'admin_scheduled', 'self_enroll', 'nomination'];
const DELIVERY = ['online', 'offline', 'hybrid'];
const STATUSES = ['active', 'inactive', 'archived'];

const blank = {
  code: '', name: '', description: '', category: 'other',
  schedulingMode: 'admin_scheduled', deliveryMode: 'online',
  defaultSessionCount: 1, status: 'active',
};

// Create or edit a LearningProgram. `program` null = create mode.
export default function ProgramFormModal({ program, onClose }) {
  const { t } = useTranslation();
  const isEdit = Boolean(program);
  const createMutation = useCreateProgram();
  const updateMutation = useUpdateProgram();
  const archiveMutation = useArchiveProgram();

  const [form, setForm] = useState(() => (isEdit ? { ...blank, ...program } : blank));
  const [error, setError] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      category: form.category,
      schedulingMode: form.schedulingMode,
      deliveryMode: form.deliveryMode,
      defaultSessionCount: Number(form.defaultSessionCount) || 1,
      status: form.status,
    };
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: program._id, data: payload });
        toast.success(t('learning.programs.updated'));
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(t('learning.programs.created'));
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
      await archiveMutation.mutateAsync(program._id);
      toast.success(t('learning.programs.archived'));
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
      setConfirmArchive(false);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg p-6 space-y-4" aria-label={isEdit ? t('learning.programs.edit') : t('learning.programs.create')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-h3 text-foreground">
              {isEdit ? t('learning.programs.edit') : t('learning.programs.create')}
            </DialogTitle>
            {isEdit && (
              <DialogDescription className="text-sm text-muted-foreground">
                <span className="font-mono text-primary">{program.code}</span>
              </DialogDescription>
            )}
          </DialogHeader>

          {error && (
            <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <LearningField label={t('learning.fields.code')}>
              <input value={form.code} onChange={(e) => set('code')(e.target.value)} required className={controlClass} />
            </LearningField>
            <LearningField label={t('learning.fields.defaultSessionCount')}>
              <input type="number" min={1} max={200} value={form.defaultSessionCount}
                onChange={(e) => set('defaultSessionCount')(e.target.value)} className={controlClass} />
            </LearningField>
          </div>

          <LearningField label={t('learning.fields.name')}>
            <input value={form.name} onChange={(e) => set('name')(e.target.value)} required className={controlClass} />
          </LearningField>

          <LearningField label={t('learning.fields.description')}>
            <textarea value={form.description} onChange={(e) => set('description')(e.target.value)} className={textareaClass} />
          </LearningField>

          <div className="grid grid-cols-2 gap-4">
            <LearningField label={t('learning.fields.category')}>
              <EnumSelect value={form.category} onChange={set('category')} options={CATEGORIES} labelFor={(v) => t(`learning.category.${v}`)} />
            </LearningField>
            <LearningField label={t('learning.fields.status')}>
              <EnumSelect value={form.status} onChange={set('status')} options={STATUSES} labelFor={(v) => t(`learning.status.${v}`)} />
            </LearningField>
            <LearningField label={t('learning.fields.schedulingMode')}>
              <EnumSelect value={form.schedulingMode} onChange={set('schedulingMode')} options={SCHEDULING} labelFor={(v) => t(`learning.scheduling.${v}`)} />
            </LearningField>
            <LearningField label={t('learning.fields.deliveryMode')}>
              <EnumSelect value={form.deliveryMode} onChange={set('deliveryMode')} options={DELIVERY} labelFor={(v) => t(`learning.delivery.${v}`)} />
            </LearningField>
          </div>

          <div className="flex gap-3 pt-2">
            {isEdit && (
              <Button type="button" variant="destructive" onClick={handleArchive} disabled={archiveMutation.isPending}>
                {confirmArchive ? t('learning.programs.archiveConfirm') : t('learning.programs.archive')}
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
