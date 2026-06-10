import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUsers } from '../../hooks/useUsers';
import { useSetTrainers } from '../../hooks/useLearning';
import { useRole } from '../../hooks/useRole';
import { LearningField, controlClass } from './LearningField';

// ──────────────────────────────────────────────────────────
// AssignTrainersModal — assign a session's trainers (re-center Phase 3, DELTA B)
//
// One mutation (PUT /api/schedules/:id/trainers) sets both:
//   • internal trainers — Teacher/Admin User refs that join the attendance /
//     visibility UNION (a named trainer can mark THIS session even when not the
//     cohort teacher). Picking from the user list needs `read:users` (Admin);
//     a Coordinator sees the current internal trainers read-only.
//   • an external trainer — a lightweight {name, email?, phone?, org?} record
//     with no login; an email earns a calendar invite, nothing more.
//
// Props:
//   session — session DTO { scheduleId, sessionInstructors[], externalTrainer }
//   onClose — close handler
// ──────────────────────────────────────────────────────────

// Backend caps internalIds at 3 (schemas/schedule.js setTrainersBody).
const MAX_INTERNAL = 3;

export default function AssignTrainersModal({ session, onClose }) {
  const { t } = useTranslation();
  const { can } = useRole();
  // Internal-trainer picking lists /api/users (Admin-only). A Coordinator keeps
  // the existing internal trainers but cannot add/remove them yet (same limit as
  // the enroll modal — resolved when a coordinator-safe user picker ships).
  const canListUsers = can('read:users');
  const setTrainers = useSetTrainers();

  // Current internal trainers come straight from the session DTO ({_id, empCode, name}).
  const [internal, setInternal] = useState(() =>
    (session.sessionInstructors || []).map((tr) => ({ _id: tr._id, name: tr.name, empCode: tr.empCode })),
  );

  const ext0 = session.externalTrainer || null;
  const [hasExternal, setHasExternal] = useState(Boolean(ext0));
  const [ext, setExt] = useState({
    name: ext0?.name || '', email: ext0?.email || '', phone: ext0?.phone || '', org: ext0?.org || '',
  });
  const [error, setError] = useState('');

  // Active Teacher pool for the picker (Admin-only fetch — skipped otherwise).
  const { data: usersData } = useUsers(
    { role: 'Teacher', status: 'Active', limit: 200 },
    { enabled: canListUsers },
  );
  const allUsers = usersData?.data || [];
  const chosenIds = new Set(internal.map((tr) => tr._id));
  const teacherPool = allUsers.filter((u) => !chosenIds.has(u._id));

  const addInternal = (id) => {
    if (!id) return;
    const u = allUsers.find((x) => x._id === id);
    if (!u) return;
    if (internal.length >= MAX_INTERNAL) {
      setError(t('learning.trainers.maxInternal', { max: MAX_INTERNAL }));
      return;
    }
    setError('');
    setInternal((prev) => [...prev, { _id: u._id, name: u.name, empCode: u.empCode }]);
  };
  const removeInternal = (id) => setInternal((prev) => prev.filter((tr) => tr._id !== id));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (hasExternal && !ext.name.trim()) {
      setError(t('learning.trainers.errorExtName'));
      return;
    }

    // Always send both shapes (the backend requires at least one present):
    // internalIds is the full desired set; externalTrainer is the record or null.
    const payload = {
      internalIds: internal.map((tr) => tr._id),
      externalTrainer: hasExternal
        ? {
            name: ext.name.trim(),
            email: ext.email.trim() || null,
            phone: ext.phone.trim() || null,
            org: ext.org.trim() || null,
          }
        : null,
    };

    try {
      await setTrainers.mutateAsync({ id: session.scheduleId, data: payload });
      toast.success(t('learning.trainers.saved'));
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md p-6 space-y-4" aria-label={t('learning.trainers.title')}>
        <DialogHeader>
          <DialogTitle className="text-h3 text-foreground">{t('learning.trainers.title')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('learning.trainers.desc')}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {/* Internal trainers — chips + (Admin) an add picker */}
          <LearningField
            label={t('learning.trainers.internal')}
            hint={canListUsers ? t('learning.trainers.internalHint', { max: MAX_INTERNAL }) : t('learning.trainers.internalAdminOnly')}
          >
            {internal.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {internal.map((tr) => (
                  <Badge key={tr._id} variant="secondary" className="gap-1">
                    {tr.name}
                    {canListUsers && (
                      <button
                        type="button"
                        onClick={() => removeInternal(tr._id)}
                        aria-label={t('learning.trainers.remove', { name: tr.name })}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-subtle-foreground mb-2">{t('learning.trainers.noInternal')}</p>
            )}
            {canListUsers && (
              <select
                aria-label={t('learning.trainers.addInternal')}
                value=""
                onChange={(e) => addInternal(e.target.value)}
                className={controlClass}
                disabled={internal.length >= MAX_INTERNAL}
              >
                <option value="" className="bg-popover">{t('learning.trainers.addInternal')}</option>
                {teacherPool.map((u) => (
                  <option key={u._id} value={u._id} className="bg-popover">{u.name} ({u.empCode})</option>
                ))}
              </select>
            )}
          </LearningField>

          {/* External trainer — invite + display only */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={hasExternal}
                onChange={(e) => setHasExternal(e.target.checked)}
                aria-label={t('learning.trainers.addExternal')}
              />
              {t('learning.trainers.addExternal')}
            </label>
            {hasExternal && (
              <div className="space-y-3">
                <LearningField label={t('learning.trainers.extName')}>
                  <input
                    aria-label={t('learning.trainers.extName')}
                    value={ext.name}
                    onChange={(e) => setExt({ ...ext, name: e.target.value })}
                    className={controlClass}
                  />
                </LearningField>
                <LearningField label={t('learning.trainers.extEmail')} hint={t('learning.trainers.extEmailHint')}>
                  <input
                    aria-label={t('learning.trainers.extEmail')}
                    type="email"
                    value={ext.email}
                    onChange={(e) => setExt({ ...ext, email: e.target.value })}
                    className={controlClass}
                  />
                </LearningField>
                <div className="grid grid-cols-2 gap-3">
                  <LearningField label={t('learning.trainers.extPhone')}>
                    <input
                      aria-label={t('learning.trainers.extPhone')}
                      value={ext.phone}
                      onChange={(e) => setExt({ ...ext, phone: e.target.value })}
                      className={controlClass}
                    />
                  </LearningField>
                  <LearningField label={t('learning.trainers.extOrg')}>
                    <input
                      aria-label={t('learning.trainers.extOrg')}
                      value={ext.org}
                      onChange={(e) => setExt({ ...ext, org: e.target.value })}
                      className={controlClass}
                    />
                  </LearningField>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">{t('learning.actions.cancel')}</Button>
            <Button type="submit" disabled={setTrainers.isPending} className="flex-1">
              {setTrainers.isPending ? t('learning.trainers.saving') : t('learning.trainers.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
