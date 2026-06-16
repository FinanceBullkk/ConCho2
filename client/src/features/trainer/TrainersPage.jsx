import { useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { UserCog, ChevronDown, Archive, Star } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import { useRole } from '@/hooks/useRole';
import { useLearningPrograms } from '../../hooks/useLearning';
import { useTrainers, useArchiveTrainer } from './useTrainers';
import TrainerDetailPanel from './TrainerDetailPanel';

// ──────────────────────────────────────────────────────────
// TrainersPage — A6 (Modernization Horizon 2)
// Qualification matrix (who can teach what) + availability, per-trainer load,
// and ratings. Booking only offers qualified + free trainers; a trainer can't
// be double-booked (409, enforced at the assign chokepoint). Gated by
// session.assign-trainer (Admin / Coordinator).
// ──────────────────────────────────────────────────────────

const inputCls =
  'h-(--control-h) rounded-md border border-input bg-background px-3 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring';

function RowStars({ avg, count }) {
  if (!count) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
      <span className="text-sm">{avg}</span>
      <span className="text-xs text-muted-foreground">({count})</span>
    </span>
  );
}

export default function TrainersPage() {
  const { t } = useTranslation();
  const { can } = useRole();
  const canManage = can('assign:trainer');

  const [statusFilter, setStatusFilter] = useState('with-profile'); // with-profile | all
  const [expanded, setExpanded] = useState(null);

  // includeCandidates surfaces Teacher/Admin users that have no profile yet, so
  // an admin can set one up. 'with-profile' hides those client-side.
  const { data: trainers = [], isLoading } = useTrainers({ includeCandidates: true });
  const archive = useArchiveTrainer();
  const { data: programsData } = useLearningPrograms();
  const programs = programsData?.data || [];

  const rows = statusFilter === 'with-profile' ? trainers.filter((tr) => tr.hasProfile) : trainers;

  return (
    <div className="space-y-4">
      <PageHeader title={t('trainer.title')} description={t('trainer.description')} />

      <div className="flex flex-wrap items-center gap-2">
        <select className={`${inputCls} h-8`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label={t('trainer.show')}>
          <option value="with-profile">{t('trainer.showProfiles')}</option>
          <option value="all">{t('trainer.showAll')}</option>
        </select>
        <span className="text-xs text-muted-foreground">{t('trainer.countLabel', { n: rows.length })}</span>
      </div>

      <section className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="py-10 flex justify-center"><Spinner size={22} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={UserCog} title={t('trainer.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-4 py-2 w-8" />
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">{t('trainer.name')}</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">{t('trainer.role')}</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground text-right">{t('trainer.qualifies')}</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">{t('trainer.rating')}</th>
                  <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">{t('trainer.status')}</th>
                  <th scope="col" className="px-4 py-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {rows.map((tr) => {
                  const open = expanded === tr.userId;
                  return (
                    <Fragment key={tr.userId}>
                      <tr className="border-b border-border last:border-0">
                        <td className="px-4 py-2">
                          <button type="button" onClick={() => setExpanded(open ? null : tr.userId)} aria-label={open ? t('trainer.collapse') : t('trainer.expand')} aria-expanded={open}>
                            <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                          </button>
                        </td>
                        <td className="px-4 py-2">
                          <span className="font-medium">{tr.name}</span>
                          {tr.department && <span className="ml-2 text-xs text-muted-foreground">{tr.department}</span>}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{tr.role}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{tr.canDeliver.length}</td>
                        <td className="px-4 py-2"><RowStars avg={tr.ratingAvg} count={tr.ratingCount} /></td>
                        <td className="px-4 py-2">
                          {!tr.hasProfile
                            ? <span className="text-xs text-muted-foreground">{t('trainer.noProfile')}</span>
                            : tr.status === 'archived'
                              ? <span className="text-xs text-muted-foreground">{t('trainer.statusArchived')}</span>
                              : <span className="text-xs text-success">{t('trainer.statusActive')}</span>}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {canManage && tr.hasProfile && tr.status !== 'archived' && (
                            <Button size="sm" variant="ghost" onClick={() => archive.mutate(tr.userId)} aria-label={t('trainer.archive')}>
                              <Archive className="size-3.5" aria-hidden="true" />
                            </Button>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <TrainerDetailPanel trainer={tr} programs={programs} canManage={canManage} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
