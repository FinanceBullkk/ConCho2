import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUsers } from '../../hooks/useUsers';
import {
  useLearningEnrollments, useEnrollLearner, useWithdrawEnrollment,
} from '../../hooks/useLearning';
import { LearningField, controlClass } from './LearningField';

// Manage cohort-based enrollments for a single cohort: list current learners
// (withdraw) + add a learner (Admin enrolls anyone).
export default function EnrollLearnersModal({ cohort, onClose }) {
  const { t } = useTranslation();
  const cohortId = cohort._id;

  const { data: enrollData, isLoading } = useLearningEnrollments({ cohortId });
  const { data: usersData } = useUsers({ role: 'Participant', status: 'Active', limit: 200 });
  const enrollMutation = useEnrollLearner();
  const withdrawMutation = useWithdrawEnrollment();

  const [selectedUserId, setSelectedUserId] = useState('');
  const [error, setError] = useState('');

  const enrollments = enrollData?.data || [];
  const activeEnrollments = enrollments.filter((e) => e.status === 'Active');

  // Learners not already actively enrolled, for the add-learner select.
  const candidates = useMemo(() => {
    const taken = new Set(activeEnrollments.map((e) => e.learner?.id?.toString()));
    return (usersData?.data || []).filter((u) => !taken.has(u._id?.toString()));
  }, [usersData, activeEnrollments]);

  const handleEnroll = async (e) => {
    e.preventDefault();
    setError('');
    if (!selectedUserId) { setError(t('learning.enroll.selectLearner')); return; }
    try {
      await enrollMutation.mutateAsync({ cohortId, userId: selectedUserId });
      toast.success(t('learning.enroll.enrolled'));
      setSelectedUserId('');
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg p-6 space-y-4" aria-label={t('learning.enroll.title')}>
        <DialogHeader>
          <DialogTitle className="text-h3 text-foreground">{t('learning.enroll.title')}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <span className="font-mono text-primary">{cohort.cohortCode}</span>
            {cohort.programName ? <span className="text-subtle-foreground mx-1.5">·</span> : null}
            {cohort.programName}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
        )}

        {/* Current learners */}
        <div>
          <h4 className="text-small text-muted-foreground mb-2">{t('learning.enroll.current')}</h4>
          {isLoading ? (
            <p className="text-sm text-subtle-foreground">…</p>
          ) : activeEnrollments.length === 0 ? (
            <p className="text-sm text-subtle-foreground italic">{t('learning.enroll.none')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {activeEnrollments.map((enr) => (
                <li key={enr.id} className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{enr.learner?.name}</div>
                    <div className="text-xs text-subtle-foreground font-mono">{enr.learner?.empCode}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{t(`learning.status.${enr.status}`, enr.status)}</Badge>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => withdrawMutation.mutate(enr.id)}
                      disabled={withdrawMutation.isPending}>
                      {t('learning.enroll.withdraw')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add a learner */}
        <form onSubmit={handleEnroll} className="space-y-3 pt-2 border-t border-border">
          <LearningField label={t('learning.enroll.add')}>
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className={controlClass}>
              <option value="" className="bg-popover">{t('learning.enroll.selectLearner')}</option>
              {candidates.map((u) => (
                <option key={u._id} value={u._id} className="bg-popover">{u.name} ({u.empCode})</option>
              ))}
            </select>
          </LearningField>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">{t('learning.actions.cancel')}</Button>
            <Button type="submit" disabled={enrollMutation.isPending} className="flex-1">
              {enrollMutation.isPending ? t('learning.enroll.enrolling') : t('learning.enroll.enroll')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
