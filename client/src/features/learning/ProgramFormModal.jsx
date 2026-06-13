import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  useLearningPrograms, useCreateProgram, useUpdateProgram, useArchiveProgram,
} from '../../hooks/useLearning';
import { LearningField, EnumSelect, controlClass, textareaClass } from './LearningField';
import PrerequisiteSelector from './PrerequisiteSelector';

const CATEGORIES = ['english', 'onboarding', 'compliance', 'soft_skills', 'technical', 'workshop', 'other'];
const SCHEDULING = ['leader_booking', 'admin_scheduled', 'self_enroll', 'nomination'];
const DELIVERY = ['online', 'offline', 'hybrid'];
const STATUSES = ['active', 'inactive', 'archived'];
const FACILITATOR_VISIBILITY = ['all_facilitators', 'assigned_only'];

const blank = {
  code: '', name: '', description: '', category: 'other',
  schedulingMode: 'admin_scheduled', deliveryMode: 'online',
  defaultSessionCount: 1, status: 'active', prerequisitePrograms: [],
  // Program policies (all enforced server-side). Empty number = "no value":
  // certificateValidityDays '' → never expires; capacity '' → unlimited.
  completionPolicy: { attendanceThresholdPercent: 0, requiresAssessment: false, requiresFeedback: false },
  certificateValidityDays: '',
  capacityPolicy: { maxParticipants: '', maxParticipantsPerSession: '' },
  facilitatorPolicy: { assignmentRequired: false, visibility: 'all_facilitators' },
  recertifyPolicy: { autoAssign: false },
};

// Edit mode: merge the program's persisted policies over the blank defaults,
// normalising server nulls → '' so the number inputs stay controlled.
const initForm = (program) => {
  if (!program) return blank;
  return {
    ...blank,
    ...program,
    completionPolicy: { ...blank.completionPolicy, ...(program.completionPolicy || {}) },
    capacityPolicy: {
      maxParticipants: program.capacityPolicy?.maxParticipants ?? '',
      maxParticipantsPerSession: program.capacityPolicy?.maxParticipantsPerSession ?? '',
    },
    facilitatorPolicy: { ...blank.facilitatorPolicy, ...(program.facilitatorPolicy || {}) },
    recertifyPolicy: { ...blank.recertifyPolicy, ...(program.recertifyPolicy || {}) },
    certificateValidityDays: program.certificateValidityDays ?? '',
  };
};

// '' → null (no limit / never expires); else a finite Number, or null if invalid.
const numOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Create or edit a LearningProgram. `program` null = create mode.
export default function ProgramFormModal({ program, onClose }) {
  const { t } = useTranslation();
  const isEdit = Boolean(program);
  const createMutation = useCreateProgram();
  const updateMutation = useUpdateProgram();
  const archiveMutation = useArchiveProgram();

  const [form, setForm] = useState(() => initForm(program));
  const [error, setError] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Other active programs are the prerequisite candidates (a program can't
  // require itself). Shares the ProgramsTab query key, so this is cache-served.
  const { data: programData } = useLearningPrograms({ status: 'active' });
  const prerequisiteOptions = (programData?.data || []).filter((p) => p._id !== program?._id);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
  const setNested = (group, key) => (val) =>
    setForm((f) => ({ ...f, [group]: { ...f[group], [key]: val } }));

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
      prerequisitePrograms: form.prerequisitePrograms || [],
      completionPolicy: {
        attendanceThresholdPercent: Number(form.completionPolicy.attendanceThresholdPercent) || 0,
        requiresAssessment: Boolean(form.completionPolicy.requiresAssessment),
        requiresFeedback: Boolean(form.completionPolicy.requiresFeedback),
      },
      certificateValidityDays: numOrNull(form.certificateValidityDays),
      capacityPolicy: {
        maxParticipants: numOrNull(form.capacityPolicy.maxParticipants),
        maxParticipantsPerSession: numOrNull(form.capacityPolicy.maxParticipantsPerSession),
      },
      facilitatorPolicy: {
        assignmentRequired: Boolean(form.facilitatorPolicy.assignmentRequired),
        visibility: form.facilitatorPolicy.visibility,
      },
      recertifyPolicy: {
        autoAssign: Boolean(form.recertifyPolicy.autoAssign),
      },
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
  const cp = form.completionPolicy;
  const cap = form.capacityPolicy;
  const fp = form.facilitatorPolicy;
  const rp = form.recertifyPolicy;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto" aria-label={isEdit ? t('learning.programs.edit') : t('learning.programs.create')}>
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

          <LearningField label={t('learning.fields.prerequisites')} hint={t('learning.fields.prerequisitesHint')}>
            <PrerequisiteSelector
              options={prerequisiteOptions}
              value={form.prerequisitePrograms || []}
              onChange={set('prerequisitePrograms')}
            />
          </LearningField>

          {/* ── Policies (all enforced server-side) ───────────────── */}
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 text-small font-medium text-muted-foreground">{t('learning.policies.title')}</legend>

            {/* Completion */}
            <div className="grid grid-cols-2 gap-4">
              <LearningField label={t('learning.fields.attendanceThreshold')}>
                <input type="number" min={0} max={100} value={cp.attendanceThresholdPercent}
                  onChange={(e) => setNested('completionPolicy', 'attendanceThresholdPercent')(e.target.value)}
                  className={controlClass} />
              </LearningField>
              <LearningField label={t('learning.fields.certificateValidityDays')} hint={t('learning.fields.certificateValidityHint')}>
                <input type="number" min={1} max={3650} value={form.certificateValidityDays}
                  onChange={(e) => set('certificateValidityDays')(e.target.value)}
                  className={controlClass} />
              </LearningField>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={Boolean(cp.requiresAssessment)}
                  onChange={(e) => setNested('completionPolicy', 'requiresAssessment')(e.target.checked)} />
                {t('learning.fields.requiresAssessment')}
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={Boolean(cp.requiresFeedback)}
                  onChange={(e) => setNested('completionPolicy', 'requiresFeedback')(e.target.checked)} />
                {t('learning.fields.requiresFeedback')}
              </label>
            </div>

            {/* Capacity */}
            <div className="grid grid-cols-2 gap-4">
              <LearningField label={t('learning.fields.maxParticipants')} hint={t('learning.fields.capacityHint')}>
                <input type="number" min={1} value={cap.maxParticipants}
                  onChange={(e) => setNested('capacityPolicy', 'maxParticipants')(e.target.value)}
                  className={controlClass} />
              </LearningField>
              <LearningField label={t('learning.fields.maxParticipantsPerSession')} hint={t('learning.fields.capacityHint')}>
                <input type="number" min={1} value={cap.maxParticipantsPerSession}
                  onChange={(e) => setNested('capacityPolicy', 'maxParticipantsPerSession')(e.target.value)}
                  className={controlClass} />
              </LearningField>
            </div>

            {/* Facilitator */}
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={Boolean(fp.assignmentRequired)}
                onChange={(e) => setNested('facilitatorPolicy', 'assignmentRequired')(e.target.checked)} />
              {t('learning.fields.assignmentRequired')}
            </label>
            <LearningField label={t('learning.fields.facilitatorVisibility')}>
              <EnumSelect value={fp.visibility} onChange={setNested('facilitatorPolicy', 'visibility')}
                options={FACILITATOR_VISIBILITY} labelFor={(v) => t(`learning.facilitatorVisibility.${v}`)} />
            </LearningField>

            {/* Recertification */}
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={Boolean(rp.autoAssign)}
                onChange={(e) => setNested('recertifyPolicy', 'autoAssign')(e.target.checked)} />
              {t('learning.fields.recertAutoAssign')}
            </label>
          </fieldset>

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
