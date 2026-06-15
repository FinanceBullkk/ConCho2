import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningPrograms, useCompletionRollup } from '../../hooks/useLearning';
import { useRole } from '../../hooks/useRole';
import ProgramFormModal from './ProgramFormModal';

// Derived health from real completion rate (screenshot 04 status pill).
const STATUS = {
  onTrack: { tone: 'text-success bg-success/15', bar: 'bg-success' },
  watch: { tone: 'text-warning bg-warning/15', bar: 'bg-warning' },
  atRisk: { tone: 'text-destructive bg-destructive/15', bar: 'bg-destructive' },
};
const healthOf = (rate) => (rate == null ? null : rate >= 80 ? 'onTrack' : rate >= 60 ? 'watch' : 'atRisk');

function ProgramCard({ program, stats, onOpen, t }) {
  const rate = stats?.completionRate;
  const health = healthOf(rate);
  const s = health ? STATUS[health] : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40"
    >
      <div className="flex items-start justify-between">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary"><BookOpen className="size-4" aria-hidden="true" /></span>
        {s && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.tone}`}>{t(`learning.programs.${health}`)}</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{program.code}</span>
        <span className="rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">{t(`learning.scheduling.${program.schedulingMode}`, program.schedulingMode)}</span>
      </div>
      <div className="font-semibold text-foreground">{program.name}</div>
      <div className="text-xs text-muted-foreground">
        {t('learning.programs.cohortsEnrolled', { cohorts: stats?.cohorts ?? 0, enrolled: stats?.learners ?? 0 })}
      </div>
      {rate != null && (
        <div className="mt-auto space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('learning.programs.completionShort')}</span>
            <span className="font-semibold tabular-nums text-foreground">{Math.round(rate)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${s?.bar || 'bg-primary'}`} style={{ width: `${Math.min(100, Math.max(0, rate))}%` }} />
          </div>
        </div>
      )}
    </button>
  );
}

export default function ProgramsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useRole();
  const canManage = can('create:program');
  const { data, isLoading } = useLearningPrograms({ status: 'active' });
  const { data: rollup } = useCompletionRollup({ enabled: can('read:reports') });
  const programs = data?.data || [];
  const statsByProgram = new Map((rollup?.programs || []).map((p) => [p.key, p]));

  const [modal, setModal] = useState(null);

  const header = (
    <div className="flex items-center justify-between">
      <CardTitle>{t('learning.programs.catalog')}</CardTitle>
      {canManage && (
        <Button size="sm" onClick={() => setModal({ program: null })}>
          <Plus className="size-4 mr-1.5" aria-hidden="true" />{t('learning.programs.new')}
        </Button>
      )}
    </div>
  );

  let body;
  if (isLoading) {
    body = <TableSkeleton rows={6} cols={3} />;
  } else if (!programs.length) {
    body = (
      <Card>
        <CardHeader>{header}</CardHeader>
        <CardContent>
          <EmptyState title={t('learning.programs.empty')} description={t('learning.programs.emptyDesc')} />
        </CardContent>
      </Card>
    );
  } else {
    body = (
      <div className="space-y-4">
        {header}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {programs.map((program) => (
            <ProgramCard
              key={program._id}
              program={program}
              stats={statsByProgram.get(program._id)}
              onOpen={() => navigate(`/learning/programs/${program._id}`)}
              t={t}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {body}
      {modal && <ProgramFormModal program={modal.program} onClose={() => setModal(null)} />}
    </>
  );
}
