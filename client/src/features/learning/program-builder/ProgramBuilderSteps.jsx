// The five step panels of the Program builder. Each keeps the real, accessible
// form controls (native inputs / checkboxes / selects) wrapped in the shared
// LearningField helper — only the layout is the builder; the data path is the
// same LearningProgram contract the server already enforces.

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { LearningField, EnumSelect, controlClass, textareaClass } from '../LearningField';
import PrerequisiteSelector from '../PrerequisiteSelector';
import { useCustomFields } from '../../custom-fields/useCustomFields';
import { CustomFieldInput } from '../../custom-fields/custom-field-input';
import { ProfileCard } from './ProgramBuilderControls';
import {
  CATEGORIES, DELIVERY, STATUSES, FACILITATOR_VISIBILITY, DELIVERY_PROFILES,
  completionRules, neverExpires,
} from './program-form-config';

// A checkbox + label row (label wraps the input so getByLabelText resolves it).
function CheckRow({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
      <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}

function BasicsStep({ form, set }) {
  const { t } = useTranslation();
  // Org-defined custom fields for Program (Studio ▸ Custom fields). Empty = the
  // section doesn't render, so this is invisible until an admin defines fields.
  const { data: customDefs = [] } = useCustomFields({ entity: 'Program' });
  const setCustom = (key) => (val) => set('customFields')({ ...(form.customFields || {}), [key]: val });
  return (
    <div className="space-y-4">
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
      </div>

      {customDefs.length > 0 && (
        <fieldset className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-small font-medium text-muted-foreground">{t('learning.builder.customFields')}</legend>
          <div className="grid grid-cols-2 gap-4">
            {customDefs.map((f) => (
              <CustomFieldInput key={f._id} def={f} value={form.customFields?.[f.key]} onChange={setCustom(f.key)} />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

function DeliveryStep({ form, set, setNested, prerequisiteOptions }) {
  const { t } = useTranslation();
  const cap = form.capacityPolicy;
  const fp = form.facilitatorPolicy;
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-3 text-xs text-subtle-foreground">{t('learning.builder.deliveryProfileHint')}</p>
        <div className="grid grid-cols-2 gap-2.5">
          {DELIVERY_PROFILES.map((p) => (
            <ProfileCard key={p.key} profile={p} active={form.schedulingMode === p.key} onSelect={() => set('schedulingMode')(p.key)} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <LearningField label={t('learning.fields.deliveryMode')}>
          <EnumSelect value={form.deliveryMode} onChange={set('deliveryMode')} options={DELIVERY} labelFor={(v) => t(`learning.delivery.${v}`)} />
        </LearningField>
        <LearningField label={t('learning.fields.facilitatorVisibility')}>
          <EnumSelect value={fp.visibility} onChange={setNested('facilitatorPolicy', 'visibility')}
            options={FACILITATOR_VISIBILITY} labelFor={(v) => t(`learning.facilitatorVisibility.${v}`)} />
        </LearningField>
      </div>

      <fieldset className="space-y-3 rounded-md border border-border p-3">
        <legend className="px-1 text-small font-medium text-muted-foreground">{t('learning.policies.capacity')}</legend>
        <div className="grid grid-cols-2 gap-4">
          <LearningField label={t('learning.fields.maxParticipants')} hint={t('learning.fields.capacityHint')}>
            <input type="number" min={1} value={cap.maxParticipants}
              onChange={(e) => setNested('capacityPolicy', 'maxParticipants')(e.target.value)} className={controlClass} />
          </LearningField>
          <LearningField label={t('learning.fields.maxParticipantsPerSession')} hint={t('learning.fields.capacityHint')}>
            <input type="number" min={1} value={cap.maxParticipantsPerSession}
              onChange={(e) => setNested('capacityPolicy', 'maxParticipantsPerSession')(e.target.value)} className={controlClass} />
          </LearningField>
        </div>
        <CheckRow checked={fp.assignmentRequired} onChange={setNested('facilitatorPolicy', 'assignmentRequired')}>
          {t('learning.fields.assignmentRequired')}
        </CheckRow>
      </fieldset>

      <LearningField label={t('learning.fields.prerequisites')} hint={t('learning.fields.prerequisitesHint')}>
        <PrerequisiteSelector options={prerequisiteOptions} value={form.prerequisitePrograms || []} onChange={set('prerequisitePrograms')} />
      </LearningField>
    </div>
  );
}

function CompletionStep({ form, setNested }) {
  const { t } = useTranslation();
  const cp = form.completionPolicy;
  return (
    <div className="space-y-4">
      <p className="text-xs text-subtle-foreground">{t('learning.builder.completionIntro')}</p>
      <LearningField label={t('learning.fields.attendanceThreshold')}>
        <input type="number" min={0} max={100} value={cp.attendanceThresholdPercent}
          onChange={(e) => setNested('completionPolicy', 'attendanceThresholdPercent')(e.target.value)} className={controlClass} />
      </LearningField>
      <div className="space-y-2.5">
        <CheckRow checked={cp.requiresAssessment} onChange={setNested('completionPolicy', 'requiresAssessment')}>
          {t('learning.fields.requiresAssessment')}
        </CheckRow>
        <CheckRow checked={cp.requiresFeedback} onChange={setNested('completionPolicy', 'requiresFeedback')}>
          {t('learning.fields.requiresFeedback')}
        </CheckRow>
      </div>
    </div>
  );
}

function CertificateStep({ form, set, setNested }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-xs text-subtle-foreground">{t('learning.builder.certificateIntro')}</p>
      <LearningField label={t('learning.fields.certificateValidityDays')} hint={t('learning.fields.certificateValidityHint')}>
        <input type="number" min={1} max={3650} value={form.certificateValidityDays}
          onChange={(e) => set('certificateValidityDays')(e.target.value)} className={controlClass} />
      </LearningField>
      <CheckRow checked={form.recertifyPolicy.autoAssign} onChange={setNested('recertifyPolicy', 'autoAssign')}>
        {t('learning.fields.recertAutoAssign')}
      </CheckRow>
    </div>
  );
}

function ReviewStep({ form }) {
  const { t } = useTranslation();
  const rules = completionRules(form, t);
  const ruleText = rules.length ? rules.join(' · ') : t('learning.builder.enrollmentOnly');
  const validity = form.certificateValidityDays;
  const certText = neverExpires(validity)
    ? t('learning.builder.certNeverExpiresSummary')
    : t('learning.builder.certValidSummary', { n: validity });
  const cap = form.capacityPolicy?.maxParticipants;
  const rows = [
    [t('learning.builder.steps.basics'), form.name || t('learning.builder.untitled')],
    [t('learning.fields.deliveryMode'), `${t(`learning.scheduling.${form.schedulingMode}`)} · ${t(`learning.delivery.${form.deliveryMode}`)}`],
    [t('learning.builder.completesWhen'), ruleText],
    [t('learning.builder.certificate'), form.recertifyPolicy?.autoAssign ? `${certText} · ${t('learning.builder.autoRecertSummary')}` : certText],
    [t('learning.policies.capacity'), cap ? t('learning.builder.capacityLabel', { n: cap }) : t('learning.builder.unlimited')],
  ];
  return (
    <div className="space-y-2.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 border-b border-border py-2.5">
          <span className="text-sm text-subtle-foreground">{k}</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-foreground">{v}</span>
        </div>
      ))}
      <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-success/30 bg-success-tint p-3">
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg bg-success/20 text-success">
          <Check className="h-4 w-4" />
        </span>
        <span className="text-sm text-foreground">{t('learning.builder.reviewReady')}</span>
      </div>
    </div>
  );
}

const STEP_COMPONENTS = [BasicsStep, DeliveryStep, CompletionStep, CertificateStep, ReviewStep];

// Render the active step. `props` carries form + setters + prerequisiteOptions.
export function ProgramBuilderStep({ step, ...props }) {
  const Step = STEP_COMPONENTS[step] || STEP_COMPONENTS[0];
  return <Step {...props} />;
}
