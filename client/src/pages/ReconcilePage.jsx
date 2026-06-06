import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Play, Search, CheckCircle2 } from 'lucide-react';
import { reconcileAPI, cronAPI } from '../api/api';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '../components/StatusBadge';
import { Spinner } from '../components/Spinner';
import CronHealthPanel from '../components/CronHealthPanel';
import {
  getReconcileCheckMeta,
  RECONCILE_CHECK_META,
} from './reconcile-check-meta';

// ──────────────────────────────────────────────────────────
// Reconcile — Phase 4 Surface 9 §G/F (9D)
//
// Each check type maps to a severity tier; rows + summary cards
// render via StatusBadge with destructive/warning/upcoming tones.
// Sort order = severity DESC so the most-urgent drift surfaces first.
// API doesn't expose `severity` per row, so we derive it from the
// check key — equivalent in practice + zero backend churn.
// ──────────────────────────────────────────────────────────

const SEVERITY_RANK = { critical: 3, warning: 2, info: 1 };
const SEVERITY_TONE = { critical: 'danger', warning: 'warning', info: 'upcoming' };

// ──────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────

function SummaryCard({ checkKey, count, onClick, active }) {
  const { t } = useTranslation();
  const meta = getReconcileCheckMeta(checkKey);
  const Icon = meta.icon;
  const tone = count > 0 ? SEVERITY_TONE[meta.severity] : 'success';
  return (
    <button
      type="button"
      onClick={() => onClick(checkKey)}
      className={`bg-card border border-border rounded-lg p-4 text-left transition-all hover:bg-accent ${active ? 'ring-2 ring-primary/50' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        <StatusBadge tone={tone} size="sm">
          {String(count)}
        </StatusBadge>
      </div>
      <div className="mt-2 text-sm font-medium text-foreground">{t(meta.labelKey)}</div>
      <div className="mt-0.5 text-xs text-subtle-foreground leading-snug">{t(meta.descriptionKey)}</div>
    </button>
  );
}

function IssueRow({ issue }) {
  const { t } = useTranslation();
  const meta = getReconcileCheckMeta(issue.check);
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-3 py-3 px-4 border-b border-border last:border-0">
      <Icon className="size-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground">{issue.description}</div>
        {issue.detail && (
          <div className="mt-1 text-xs text-subtle-foreground font-mono">
            {JSON.stringify(issue.detail)}
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-subtle-foreground">
          {issue.refs?.scheduleId && <span>Schedule: <span className="text-muted-foreground font-mono">{String(issue.refs.scheduleId).slice(-6)}</span></span>}
          {issue.refs?.userId     && <span>User: <span className="text-muted-foreground font-mono">{String(issue.refs.userId).slice(-6)}</span></span>}
          {issue.refs?.teamId     && <span>Team: <span className="text-muted-foreground font-mono">{String(issue.refs.teamId).slice(-6)}</span></span>}
          {issue.refs?.classId    && <span>Class: <span className="text-muted-foreground font-mono">{String(issue.refs.classId).slice(-6)}</span></span>}
        </div>
      </div>
      <StatusBadge tone={SEVERITY_TONE[meta.severity]} size="sm" className="shrink-0">
        {t(meta.labelKey)}
      </StatusBadge>
    </div>
  );
}

function RunHistoryBar({ history, onSelect, selectedId }) {
  if (!history?.length) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {history.map((r) => (
        <button
          key={r._id}
          onClick={() => onSelect(r._id)}
          title={`${r.summary?.total ?? 0} issues — ${new Date(r.runAt).toLocaleString()}`}
          className={`shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-md border transition-all text-xs ${
            selectedId === r._id
              ? 'border-primary/50 bg-primary/10 text-primary'
              : 'border-border bg-muted/30 text-muted-foreground hover:bg-accent'
          }`}
        >
          <span className={`font-bold text-sm ${r.summary?.total > 0 ? 'text-warning' : 'text-success'}`}>
            {r.summary?.total ?? 0}
          </span>
          <span>{new Date(r.runAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] ${r.triggeredBy === 'scheduled' ? 'bg-muted text-muted-foreground' : 'bg-info/15 text-info'}`}>
            {r.triggeredBy === 'scheduled' ? 'auto' : 'manual'}
          </span>
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────

export default function ReconcilePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filterCheck, setFilterCheck] = useState(null); // which check to show in detail
  const [selectedReportId, setSelectedReportId] = useState(null); // null = show latest

  // Fetch history (no issues array — just summaries)
  const { data: historyData } = useQuery({
    queryKey: ['reconcile', 'history'],
    queryFn: () => reconcileAPI.getHistory().then((r) => r.data.data),
    staleTime: 60_000,
  });

  // Cron-job heartbeats — "did the nightly reconcile / reminders actually run?"
  const cronHealthQuery = useQuery({
    queryKey: ['cron', 'health'],
    queryFn: () => cronAPI.getHealth().then((r) => r.data.data),
    staleTime: 60_000,
  });

  // Fetch the selected or latest report
  const reportQuery = useQuery({
    queryKey: ['reconcile', 'report', selectedReportId ?? 'latest'],
    queryFn: () =>
      selectedReportId
        ? reconcileAPI.getById(selectedReportId).then((r) => r.data.data)
        : reconcileAPI.getLatest().then((r) => r.data.data).catch((e) => {
            if (e.response?.status === 404) return null;
            throw e;
          }),
    staleTime: 60_000,
  });

  const report = reportQuery.data;

  // Trigger a new run
  const runMutation = useMutation({
    mutationFn: () => reconcileAPI.triggerRun().then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconcile'] });
      setSelectedReportId(null); // jump to latest (which is now the new one)
      setFilterCheck(null);
    },
  });

  // Filtered + severity-sorted issues for the detail panel
  const visibleIssues = report?.issues
    ? (filterCheck ? report.issues.filter((i) => i.check === filterCheck) : report.issues)
        .slice()
        .sort((a, b) => {
          const sa = SEVERITY_RANK[getReconcileCheckMeta(a.check).severity] ?? 0;
          const sb = SEVERITY_RANK[getReconcileCheckMeta(b.check).severity] ?? 0;
          return sb - sa;
        })
    : [];

  // Summary cards ordered by severity DESC then alphabetical so critical
  // categories surface first (matches §F Reconcile spec).
  const CHECK_KEYS = Object.keys(RECONCILE_CHECK_META).sort((a, b) => {
    const sa = SEVERITY_RANK[RECONCILE_CHECK_META[a].severity] ?? 0;
    const sb = SEVERITY_RANK[RECONCILE_CHECK_META[b].severity] ?? 0;
    if (sa !== sb) return sb - sa;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-6 ">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Detect data drift between Schedule ↔ Attendance ↔ Enrollment ↔ Team
        </p>
        <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} className="self-start">
          {runMutation.isPending ? (
            <><Spinner size={16} />Running…</>
          ) : (
            <><Play className="size-3.5" aria-hidden="true" />Run reconciliation</>
          )}
        </Button>
      </div>

      {/* Cron-job health — heartbeats for the scheduled reconcile + reminders */}
      <CronHealthPanel jobs={cronHealthQuery.data?.jobs} isLoading={cronHealthQuery.isLoading} />

      {/* Run history bar */}
      {historyData?.length > 0 && (
        <div className="bg-card border border-border rounded-lg px-4 py-3 space-y-2">
          <p className="text-xs text-subtle-foreground uppercase tracking-wider">Run History</p>
          <RunHistoryBar
            history={historyData}
            onSelect={(id) => { setSelectedReportId(id); setFilterCheck(null); }}
            selectedId={selectedReportId ?? historyData[0]?._id}
          />
        </div>
      )}

      {/* No report yet */}
      {!reportQuery.isLoading && !report && (
        <div className="bg-card border border-border rounded-lg py-16 text-center space-y-3">
          <Search className="size-8 text-subtle-foreground mx-auto" aria-hidden="true" />
          <p className="text-muted-foreground">No reconciliation report yet.</p>
          <p className="text-subtle-foreground text-sm">Click <strong className="text-foreground">Run reconciliation</strong> to scan for data issues.</p>
        </div>
      )}

      {/* Loading */}
      {reportQuery.isLoading && (
        <div className="bg-card border border-border rounded-lg py-20 flex items-center justify-center">
          <Spinner size={32} />
        </div>
      )}

      {report && (
        <>
          {/* Report meta */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-subtle-foreground">
            <span>Run: <span className="text-muted-foreground">{new Date(report.runAt).toLocaleString()}</span></span>
            <span>Duration: <span className="text-muted-foreground">{report.durationMs}ms</span></span>
            <span>Triggered: <span className="text-muted-foreground">{report.triggeredBy}</span></span>
            <StatusBadge tone={report.status === 'ok' ? 'success' : 'warning'} size="sm">
              {report.status === 'ok' ? 'All clear' : `${report.summary.total} issue${report.summary.total === 1 ? '' : 's'}`}
            </StatusBadge>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {CHECK_KEYS.map((key) => (
              <SummaryCard
                key={key}
                checkKey={key}
                count={report.summary[key] ?? 0}
                onClick={(k) => setFilterCheck(prev => prev === k ? null : k)}
                active={filterCheck === key}
              />
            ))}
          </div>

          {/* Issue list */}
          {report.summary.total > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {filterCheck
                    ? `${t(getReconcileCheckMeta(filterCheck).labelKey)} — ${visibleIssues.length} issue(s)`
                    : `All issues — ${report.summary.total}`}
                </span>
                {filterCheck && (
                  <button
                    onClick={() => setFilterCheck(null)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Show all ×
                  </button>
                )}
              </div>
              <div className="divide-y divide-border">
                {visibleIssues.length === 0 && (
                  <div className="py-8 text-center text-subtle-foreground text-sm">No issues of this type</div>
                )}
                {visibleIssues.map((issue, i) => (
                  <IssueRow key={i} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {report.status === 'ok' && (
            <div className="bg-card border border-border rounded-lg py-10 text-center space-y-2">
              <CheckCircle2 className="size-8 text-success mx-auto" aria-hidden="true" />
              <p className="text-success font-medium">All clear — no data drift detected</p>
              <p className="text-subtle-foreground text-sm">Checked {Object.keys(RECONCILE_CHECK_META).length} integrity rules across all collections.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
