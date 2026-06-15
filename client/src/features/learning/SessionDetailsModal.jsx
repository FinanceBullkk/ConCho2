import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUpdateSchedule } from '../../hooks/useSchedules';
import { useCustomFields } from '../custom-fields/useCustomFields';
import { CustomFieldInput } from '../custom-fields/custom-field-input';
import { controlClass, textareaClass } from './LearningField';

// Edit a session's display metadata (topic · agenda · materials) + admin-defined
// Session custom fields. Metadata only — never affects booking/room/time.
export default function SessionDetailsModal({ schedule, onClose }) {
  const { t } = useTranslation();
  const s = 'learning.sessionDetail';
  const update = useUpdateSchedule();
  const { data: cfDefs = [] } = useCustomFields({ entity: 'Session' });
  const formFields = cfDefs.filter((f) => (f.showIn || ['form']).includes('form'));

  const [topic, setTopic] = useState(schedule.topic || '');
  const [agendaText, setAgendaText] = useState((schedule.agenda || []).join('\n'));
  const [materials, setMaterials] = useState(schedule.materials?.length ? schedule.materials : [{ label: '', url: '' }]);
  const [cfValues, setCfValues] = useState(() => schedule.customFields || {});
  const [error, setError] = useState('');

  const setMaterial = (i, key, v) => setMaterials((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await update.mutateAsync({
        id: schedule._id,
        data: {
          topic: topic.trim(),
          agenda: agendaText.split('\n').map((l) => l.trim()).filter(Boolean),
          materials: materials.filter((m) => m.label.trim() && m.url.trim()),
          ...(formFields.length ? { customFields: cfValues } : {}),
        },
      });
      toast.success(t(`${s}.detailsSaved`));
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader><DialogTitle className="text-h3 text-foreground">{t(`${s}.editDetails`)}</DialogTitle></DialogHeader>
          {error && <div className="rounded-md border border-destructive/30 bg-destructive-tint px-3 py-2 text-sm text-destructive">{error}</div>}

          <div>
            <label htmlFor="sess-topic" className="mb-1 block text-small text-muted-foreground">{t(`${s}.topic`)}</label>
            <input id="sess-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={controlClass} />
          </div>

          <div>
            <label htmlFor="sess-agenda" className="mb-1 block text-small text-muted-foreground">{t(`${s}.agenda`)} <span className="text-subtle-foreground">· {t(`${s}.onePerLine`)}</span></label>
            <textarea id="sess-agenda" value={agendaText} onChange={(e) => setAgendaText(e.target.value)} rows={4} className={textareaClass} />
          </div>

          <div className="space-y-2">
            <span className="block text-small text-muted-foreground">{t(`${s}.materials`)}</span>
            {materials.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={m.label} onChange={(e) => setMaterial(i, 'label', e.target.value)} placeholder={t(`${s}.materialLabel`)} className={controlClass} />
                <input value={m.url} onChange={(e) => setMaterial(i, 'url', e.target.value)} placeholder={t(`${s}.materialUrl`)} className={controlClass} />
                <button type="button" onClick={() => setMaterials((r) => r.filter((_, idx) => idx !== i))} aria-label={t('learning.actions.remove')} className="text-destructive hover:opacity-70"><Trash2 className="size-4" /></button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setMaterials((r) => [...r, { label: '', url: '' }])}>
              <Plus className="mr-1 size-4" aria-hidden="true" />{t(`${s}.addMaterial`)}
            </Button>
          </div>

          {formFields.length > 0 && (
            <div className="space-y-3 border-t border-border pt-3">
              {formFields.map((f) => (
                <CustomFieldInput key={f._id} def={f} value={cfValues[f.key]} onChange={(v) => setCfValues((prev) => ({ ...prev, [f.key]: v }))} />
              ))}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>{t('learning.actions.cancel')}</Button>
            <Button type="submit" disabled={update.isPending}>{update.isPending ? t('learning.actions.saving') : t('learning.actions.save')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
