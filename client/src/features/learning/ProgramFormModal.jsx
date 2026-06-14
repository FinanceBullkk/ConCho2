import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  useLearningPrograms, useCreateProgram, useUpdateProgram, useArchiveProgram,
} from '../../hooks/useLearning';
import { StepRail } from './program-builder/ProgramBuilderControls';
import { ProgramBuilderStep } from './program-builder/ProgramBuilderSteps';
import { ProgramLivePreview } from './program-builder/ProgramLivePreview';
import { initForm, buildPayload, STEP_KEYS } from './program-builder/program-form-config';

const LAST_STEP = STEP_KEYS.length - 1;

// Create or edit a LearningProgram, presented as the Program / Delivery Builder:
// a guided 5-step wizard (Basics → Delivery → Completion → Certificate → Review)
// with a live preview. `program` null = create mode. The API payload + mutations
// are unchanged from the legacy single-form modal — this is a UX upgrade only.
export default function ProgramFormModal({ program, onClose }) {
  const { t } = useTranslation();
  const isEdit = Boolean(program);
  const createMutation = useCreateProgram();
  const updateMutation = useUpdateProgram();
  const archiveMutation = useArchiveProgram();

  const [form, setForm] = useState(() => initForm(program));
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Other active programs are the prerequisite candidates (a program can't
  // require itself). Shares the ProgramsTab query key, so this is cache-served.
  const { data: programData } = useLearningPrograms({ status: 'active' });
  const prerequisiteOptions = (programData?.data || []).filter((p) => p._id !== program?._id);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));
  const setNested = (group, key) => (val) =>
    setForm((f) => ({ ...f, [group]: { ...f[group], [key]: val } }));

  // One submit handler drives the whole wizard: on non-final steps it advances
  // (so Enter / "Continue" move forward); on the final step it persists.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step < LAST_STEP) {
      if (step === 0 && (!form.code.trim() || !form.name.trim())) {
        setError(t('learning.builder.missingBasics'));
        return;
      }
      setError('');
      setStep((s) => s + 1);
      return;
    }
    if (!form.code.trim() || !form.name.trim()) {
      setError(t('learning.builder.missingBasics'));
      setStep(0);
      return;
    }
    setError('');
    const payload = buildPayload(form);
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
  const onLast = step === LAST_STEP;
  const submitLabel = saving
    ? (isEdit ? t('learning.actions.saving') : t('learning.actions.creating'))
    : (isEdit ? t('learning.actions.save') : t('learning.actions.create'));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl p-0 max-h-[88vh] overflow-y-auto" aria-label={isEdit ? t('learning.programs.edit') : t('learning.programs.create')}>
        <DialogHeader className="flex flex-row items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <DialogTitle className="text-h3 text-foreground">{t('learning.builder.title')}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {isEdit ? <span className="font-mono text-primary">{program.code}</span> : t('learning.builder.subtitle')}
            </DialogDescription>
          </div>
          {isEdit && (
            <Button type="button" variant="destructive" size="sm" onClick={handleArchive} disabled={archiveMutation.isPending}>
              {confirmArchive ? t('learning.programs.archiveConfirm') : t('learning.programs.archive')}
            </Button>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-5 p-5 md:grid-cols-[1.6fr_1fr]">
            {/* Builder column */}
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <StepRail step={step} setStep={setStep} />

              <div className="min-h-[320px] p-5">
                {error && (
                  <div className="mb-4 rounded-md border border-destructive/30 bg-destructive-tint px-4 py-2 text-sm text-destructive">{error}</div>
                )}
                <ProgramBuilderStep
                  step={step}
                  form={form}
                  set={set}
                  setNested={setNested}
                  prerequisiteOptions={prerequisiteOptions}
                />
              </div>

              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <Button type="button" variant="outline" size="sm" disabled={step === 0}
                  onClick={() => { setError(''); setStep((s) => Math.max(0, s - 1)); }}>
                  <ChevronLeft className="h-4 w-4" />
                  {t('learning.builder.back')}
                </Button>
                <span className="text-small text-subtle-foreground">
                  {t('learning.builder.stepOf', { n: step + 1, total: STEP_KEYS.length })}
                </span>
                <Button type="submit" size="sm" disabled={saving}>
                  {onLast ? (<><Check className="h-4 w-4" />{submitLabel}</>) : (<>{t('learning.builder.continue')}<ChevronRight className="h-4 w-4" /></>)}
                </Button>
              </div>
            </div>

            {/* Live preview column */}
            <ProgramLivePreview form={form} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
