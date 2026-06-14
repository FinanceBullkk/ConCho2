import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowUpDown, Award, Bell, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { useIssueCertificate, useNudgeCohort } from '../../hooks/useLearning';

const r = 'learning.cohortDetail';
const STATUS_TONE = { complete: 'success', in_progress: 'info', at_risk: 'destructive' };

const statusOf = (row) => (row.complete ? 'complete' : (row.attendancePercent < 50 ? 'at_risk' : 'in_progress'));
const attTone = (pct) => (pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-destructive');

function YesNo({ ok }) {
  return ok
    ? <Check className="size-4 text-success" aria-hidden="true" />
    : <X className="size-4 text-subtle-foreground" aria-hidden="true" />;
}

function SortHead({ label, active, onClick }) {
  return (
    <th className="px-2 py-2 text-left font-medium">
      <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}>
        {label}<ArrowUpDown className="size-3" aria-hidden="true" />
      </button>
    </th>
  );
}

export default function CohortRosterTab({ cohortId, rows }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(() => new Set());
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [dept, setDept] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [modal, setModal] = useState(null); // 'issue' | 'nudge'
  const [message, setMessage] = useState('');

  const issue = useIssueCertificate();
  const nudge = useNudgeCohort();

  const depts = useMemo(
    () => [...new Set(rows.map((row) => row.learner.department).filter(Boolean))].sort(),
    [rows],
  );

  const view = useMemo(() => {
    let list = rows;
    if (atRiskOnly) list = list.filter((row) => statusOf(row) === 'at_risk');
    if (dept) list = list.filter((row) => row.learner.department === dept);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === 'attendance') return (a.attendancePercent - b.attendancePercent) * dir;
      if (sort.key === 'status') return statusOf(a).localeCompare(statusOf(b)) * dir;
      return a.learner.name.localeCompare(b.learner.name) * dir;
    });
  }, [rows, atRiskOnly, dept, sort]);

  const setSortKey = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisible = view.length > 0 && view.every((row) => selected.has(row.learner.id));
  const toggleAll = () => setSelected(() => (allVisible ? new Set() : new Set(view.map((row) => row.learner.id))));

  const doIssue = async () => {
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((userId) => issue.mutateAsync({ cohortId, userId })));
    const ok = results.filter((x) => x.status === 'fulfilled').length;
    const fail = results.length - ok;
    toast.success(fail ? t(`${r}.issueModal.partial`, { ok, fail }) : t(`${r}.issueModal.done`, { ok }));
    setModal(null); setSelected(new Set());
  };

  const doNudge = async () => {
    const ids = [...selected];
    try {
      await nudge.mutateAsync({ cohortId, userIds: ids, message: message || undefined });
      toast.success(t(`${r}.nudgeModal.done`, { count: ids.length }));
    } catch { toast.error(t('common.error', 'Something went wrong')); }
    setModal(null); setSelected(new Set()); setMessage('');
  };

  if (!rows.length) {
    return (
      <Card><CardContent className="pt-6"><EmptyState title={t(`${r}.roster.empty`)} /></CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">{t(`${r}.roster.title`)}</CardTitle>
          <span className="text-xs text-subtle-foreground">{t(`${r}.roster.hintDrawer`)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={atRiskOnly ? 'default' : 'outline'} onClick={() => setAtRiskOnly((v) => !v)}>
            {t(`${r}.roster.atRiskOnly`)}
          </Button>
          <Button size="sm" variant={dept === '' ? 'default' : 'outline'} onClick={() => setDept('')}>{t(`${r}.roster.allDepartments`)}</Button>
          {depts.map((dpt) => (
            <Button key={dpt} size="sm" variant={dept === dpt ? 'default' : 'outline'} onClick={() => setDept(dpt)}>{dpt}</Button>
          ))}
        </div>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-tint/40 px-3 py-2">
            <span className="text-sm font-medium text-foreground">{t(`${r}.roster.selected`, { count: selected.size })}</span>
            <Button size="sm" variant="outline" onClick={() => setModal('issue')}><Award className="mr-1.5 size-4" aria-hidden="true" />{t(`${r}.roster.bulkIssueCert`)}</Button>
            <Button size="sm" variant="outline" onClick={() => setModal('nudge')}><Bell className="mr-1.5 size-4" aria-hidden="true" />{t(`${r}.roster.bulkNudge`)}</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t(`${r}.roster.clear`)}</Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-overline text-muted-foreground">
                <th className="px-2 py-2 text-left">
                  <input type="checkbox" aria-label={t(`${r}.roster.selectAll`)} className="size-4 accent-primary" checked={allVisible} onChange={toggleAll} />
                </th>
                <SortHead label={t(`${r}.roster.colLearner`)} active={sort.key === 'name'} onClick={() => setSortKey('name')} />
                <SortHead label={t(`${r}.roster.colAttendance`)} active={sort.key === 'attendance'} onClick={() => setSortKey('attendance')} />
                <th className="px-2 py-2 text-left font-medium">{t(`${r}.roster.colAssessment`)}</th>
                <th className="px-2 py-2 text-left font-medium">{t(`${r}.roster.colFeedback`)}</th>
                <SortHead label={t(`${r}.roster.colStatus`)} active={sort.key === 'status'} onClick={() => setSortKey('status')} />
                <th className="px-2 py-2 text-left font-medium">{t(`${r}.roster.colCert`)}</th>
              </tr>
            </thead>
            <tbody>
              {view.map((row) => {
                const status = statusOf(row);
                return (
                  <tr key={row.learner.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40" onClick={() => setDrawer(row)}>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={row.learner.name} className="size-4 accent-primary" checked={selected.has(row.learner.id)} onChange={() => toggle(row.learner.id)} />
                    </td>
                    <td className="px-2 py-2.5">
                      <p className="font-medium text-foreground">{row.learner.name}</p>
                      <p className="text-[11px] text-subtle-foreground">{row.learner.department}</p>
                    </td>
                    <td className={cn('px-2 py-2.5 font-medium tabular-nums', attTone(row.attendancePercent))}>{row.attendancePercent}%</td>
                    <td className="px-2 py-2.5">{row.assessmentRequired ? <YesNo ok={row.assessmentMet} /> : <span className="text-subtle-foreground">{t(`${r}.roster.notTaken`)}</span>}</td>
                    <td className="px-2 py-2.5">{row.feedbackRequired ? <YesNo ok={row.feedbackMet} /> : <span className="text-subtle-foreground">—</span>}</td>
                    <td className="px-2 py-2.5"><Badge variant={STATUS_TONE[status]}>{t(`${r}.status.${status}`)}</Badge></td>
                    <td className="px-2 py-2.5">{row.certificate ? <Award className="size-4 text-success" aria-hidden="true" /> : <span className="text-subtle-foreground">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>

      {/* Issue-cert confirm */}
      <Dialog open={modal === 'issue'} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(`${r}.issueModal.title`)}</DialogTitle>
            <DialogDescription>{t(`${r}.issueModal.body`, { count: selected.size })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={doIssue} disabled={issue.isPending}>{t(`${r}.issueModal.confirm`)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nudge */}
      <Dialog open={modal === 'nudge'} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(`${r}.nudgeModal.title`)}</DialogTitle>
            <DialogDescription>{t(`${r}.nudgeModal.body`, { count: selected.size })}</DialogDescription>
          </DialogHeader>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder={t(`${r}.nudgeModal.placeholder`)}
            className="min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>{t('common.cancel', 'Cancel')}</Button>
            <Button onClick={doNudge} disabled={nudge.isPending}>{t(`${r}.nudgeModal.confirm`)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Learner drawer */}
      <Dialog open={Boolean(drawer)} onOpenChange={(o) => !o && setDrawer(null)}>
        <DialogContent>
          {drawer && (
            <>
              <DialogHeader>
                <DialogTitle>{drawer.learner.name}</DialogTitle>
                <DialogDescription>{drawer.learner.empCode} · {drawer.learner.department}</DialogDescription>
              </DialogHeader>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">{t(`${r}.drawer.attendance`)}</dt><dd className={cn('font-medium tabular-nums', attTone(drawer.attendancePercent))}>{drawer.attendancePercent}%</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{t(`${r}.drawer.assessment`)}</dt><dd>{drawer.assessmentRequired ? t(`${r}.drawer.${drawer.assessmentMet ? 'met' : 'notMet'}`) : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{t(`${r}.drawer.feedback`)}</dt><dd>{drawer.feedbackRequired ? t(`${r}.drawer.${drawer.feedbackMet ? 'submitted' : 'notSubmitted'}`) : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{t(`${r}.drawer.status`)}</dt><dd><Badge variant={STATUS_TONE[statusOf(drawer)]}>{t(`${r}.status.${statusOf(drawer)}`)}</Badge></dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{t(`${r}.drawer.certificate`)}</dt><dd>{drawer.certificate?.number || t(`${r}.drawer.noCert`)}</dd></div>
              </dl>
              <DialogFooter>
                <Button asChild variant="outline"><Link to={`/people/${drawer.learner.id}`}>{t(`${r}.drawer.viewProfile`)}</Link></Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
