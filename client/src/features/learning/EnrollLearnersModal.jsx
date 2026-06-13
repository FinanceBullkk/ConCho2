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
  useLearningEnrollments, useBulkEnrollLearners, useWithdrawEnrollment,
} from '../../hooks/useLearning';
import { LearningField, controlClass } from './LearningField';

// Manage cohort-based enrollments for a single cohort: list current learners
// (withdraw) + bulk-add many learners at once (Admin enrolls anyone — Phase 3
// bulk enrollment; selecting a single learner is just a batch of one).
export default function EnrollLearnersModal({ cohort, onClose }) {
  const { t } = useTranslation();
  const cohortId = cohort._id;

  const { data: enrollData, isLoading } = useLearningEnrollments({ cohortId });
  const { data: usersData } = useUsers({ role: 'Participant', status: 'Active', limit: 200 });
  const bulkMutation = useBulkEnrollLearners();
  const withdrawMutation = useWithdrawEnrollment();

  const [selectedIds, setSelectedIds] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const enrollments = enrollData?.data || [];
  const activeEnrollments = enrollments.filter((e) => e.status === 'Active');

  // Learners not already actively enrolled, for the add-learner picker.
  const candidates = useMemo(() => {
    const taken = new Set(activeEnrollments.map((e) => e.learner?.id?.toString()));
    return (usersData?.data || []).filter((u) => !taken.has(u._id?.toString()));
  }, [usersData, activeEnrollments]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((u) =>
      `${u.name} ${u.empCode}`.toLowerCase().includes(q));
  }, [candidates, filter]);

  const allFilteredSelected = filtered.length > 0
    && filtered.every((u) => selectedIds.includes(u._id));

  const toggle = (id) =>
    setSelectedIds((prev) =>
      (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAll = () =>
    setSelectedIds((prev) => (allFilteredSelected
      ? prev.filter((id) => !filtered.some((u) => u._id === id))
      : [...new Set([...prev, ...filtered.map((u) => u._id)])]));

  const handleBulkEnroll = async (e) => {
    e.preventDefault();
    setError('');
    if (selectedIds.length === 0) { setError(t('learning.enroll.selectLearner')); return; }
    try {
      const res = await bulkMutation.mutateAsync({ cohortId, userIds: selectedIds });
      const skipped = res?.skipped?.length || 0;
      if (skipped > 0) {
        toast.success(t('learning.enroll.bulkSkipped', {
          enrolled: res.enrolledCount, skipped,
        }));
      } else {
        toast.success(t('learning.enroll.bulkEnrolled', { count: res.enrolledCount }));
      }
      setSelectedIds([]);
      setFilter('');
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
            <ul className="divide-y divide-border rounded-md border border-border max-h-40 overflow-y-auto">
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

        {/* Bulk add learners */}
        <form onSubmit={handleBulkEnroll} className="space-y-3 pt-2 border-t border-border">
          <LearningField label={t('learning.enroll.addMany')}>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('learning.enroll.search')}
              className={controlClass}
            />
          </LearningField>

          {candidates.length === 0 ? (
            <p className="text-sm text-subtle-foreground italic">{t('learning.enroll.noCandidates')}</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} />
                  {t('learning.enroll.selectAll', { count: filtered.length })}
                </label>
                <span>{t('learning.enroll.selectedCount', { count: selectedIds.length })}</span>
              </div>
              <ul className="divide-y divide-border rounded-md border border-border max-h-48 overflow-y-auto">
                {filtered.map((u) => (
                  <li key={u._id}>
                    <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(u._id)}
                        onChange={() => toggle(u._id)}
                      />
                      <span className="font-medium text-foreground truncate">{u.name}</span>
                      <span className="text-xs text-subtle-foreground font-mono ml-auto">{u.empCode}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">{t('learning.actions.cancel')}</Button>
            <Button type="submit" disabled={bulkMutation.isPending || selectedIds.length === 0} className="flex-1">
              {bulkMutation.isPending
                ? t('learning.enroll.enrolling')
                : t('learning.enroll.enrollSelected', { count: selectedIds.length })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
