import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useOffices } from '../../hooks/useOrg';
import { useBookSession } from '../../hooks/useLearning';
import { useSchedulingConfig, DEFAULT_UTC_OFFSET_MINUTES } from '../../hooks/useSchedulingConfig';
import { slotToUtcRange } from '../../lib/scheduling-slots';
import { LearningField, controlClass } from './LearningField';

// ──────────────────────────────────────────────────────────
// CreateSessionModal — coordinator-scheduled offline session (re-center Phase 2)
//
// The primary coordinator create flow: open a session for a cohort-mode program
// (self_enroll / nomination) at a physical Office + a configured time slot. The
// roster is NOT a team — learners self-enrol (/me/catalog) or the coordinator
// assigns them; the cohort's active enrollments are snapshotted server-side.
//
// Props:
//   cohort   — target cohort { _id, cohortCode, programName, program? }
//   onClose  — close handler
// ──────────────────────────────────────────────────────────

// Local YYYY-MM-DD for a Date (the grid/audience runs in VN local == VN day).
const todayLocalISO = () => {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

export default function CreateSessionModal({ cohort, onClose }) {
  const { t } = useTranslation();
  const { data: offices } = useOffices();
  const { data: config } = useSchedulingConfig();
  const book = useBookSession();

  const slots = config?.slots || [];
  const offsetMinutes = config?.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES;

  const [officeId, setOfficeId] = useState('');
  const [date, setDate] = useState(todayLocalISO());
  const [slotId, setSlotId] = useState('');
  const [error, setError] = useState('');

  // Cheap derive (a handful of configured slots) — no memo needed; `slots` is a
  // fresh array each render so memoizing on it would churn anyway.
  const selectedSlot = slots.find((s) => s.id === slotId) || null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!officeId) { setError(t('learning.session.errorOffice')); return; }
    if (!date) { setError(t('learning.session.errorDate')); return; }
    if (!selectedSlot) { setError(t('learning.session.errorSlot')); return; }

    // Build an exact UTC range from the picked VN day + slot (no hour+1 drift).
    const [y, m, d] = date.split('-').map(Number);
    const dayLocal = new Date(y, m - 1, d);
    const { startISO, endISO } = slotToUtcRange(dayLocal, selectedSlot, offsetMinutes);

    try {
      await book.mutateAsync({
        cohortId: cohort._id,
        officeId,
        startTime: startISO,
        endTime: endISO,
      });
      toast.success(t('learning.session.created'));
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md p-6 space-y-4" aria-label={t('learning.session.title')}>
        <DialogHeader>
          <DialogTitle className="text-h3 text-foreground">{t('learning.session.title')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <span className="font-mono text-primary">{cohort.cohortCode}</span>
            {cohort.programName ? <span className="text-subtle-foreground mx-1.5">·</span> : null}
            {cohort.programName}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <LearningField label={t('learning.session.office')}>
            <select aria-label={t('learning.session.office')} value={officeId} onChange={(e) => setOfficeId(e.target.value)} className={controlClass}>
              <option value="" className="bg-popover">{t('learning.session.selectOffice')}</option>
              {(offices || []).map((o) => (
                <option key={o._id} value={o._id} className="bg-popover">{o.name} ({o.code})</option>
              ))}
            </select>
          </LearningField>

          <LearningField label={t('learning.session.date')}>
            <input
              aria-label={t('learning.session.date')}
              type="date"
              value={date}
              min={todayLocalISO()}
              onChange={(e) => setDate(e.target.value)}
              className={controlClass}
            />
          </LearningField>

          <LearningField
            label={t('learning.session.slot')}
            hint={slots.length === 0 ? t('learning.session.noSlots') : undefined}
          >
            <select aria-label={t('learning.session.slot')} value={slotId} onChange={(e) => setSlotId(e.target.value)} className={controlClass} disabled={slots.length === 0}>
              <option value="" className="bg-popover">{t('learning.session.selectSlot')}</option>
              {slots.map((s) => (
                <option key={s.id} value={s.id} className="bg-popover">{s.label}</option>
              ))}
            </select>
          </LearningField>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">{t('learning.actions.cancel')}</Button>
            <Button type="submit" disabled={book.isPending || slots.length === 0} className="flex-1">
              {book.isPending ? t('learning.session.creating') : t('learning.session.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
