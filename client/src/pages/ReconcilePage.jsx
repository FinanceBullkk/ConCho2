import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reconcileAPI } from '../api/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';

// ──────────────────────────────────────────────────────────
// Labels and styling for each check type
// ──────────────────────────────────────────────────────────
const CHECK_META = {
  missing_attendance: {
    label: 'Missing Attendance',
    icon: '📋',
    color: 'amber',
    description: 'Past sessions where not all enrolled users have been marked',
  },
  orphaned_enrollment: {
    label: 'Orphaned Enrollment',
    icon: '🔗',
    color: 'red',
    description: 'Active enrollment but the user is no longer in the team',
  },
  ghost_member: {
    label: 'Ghost Member',
    icon: '👻',
    color: 'orange',
    description: 'User is in team members but has no Active enrollment record',
  },
  empty_future_schedule: {
    label: 'Empty Future Schedule',
    icon: '📅',
    color: 'red',
    description: 'Future session with 0 enrolled users (should have been auto-deleted)',
  },
  unattached_participant: {
    label: 'Unattached Participant',
    icon: '🧩',
    color: 'slate',
    description: 'Active participant not assigned to any team or enrollment',
  },
};

const COLOR_CLASSES = {
  amber:  { badge: 'bg-warning/15 text-warning',         dot: 'bg-warning',              row: 'border-warning/20'     },
  red:    { badge: 'bg-destructive/15 text-destructive',  dot: 'bg-destructive',          row: 'border-destructive/20' },
  orange: { badge: 'bg-warning/10 text-warning',          dot: 'bg-warning/80',           row: 'border-warning/15'     },
  slate:  { badge: 'bg-muted text-muted-foreground',      dot: 'bg-muted-foreground/50',  row: 'border-border'         },
};

// ──────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────

function SummaryCard({ checkKey, count, onClick, active }) {
  const meta = CHECK_META[checkKey];
  const colors = COLOR_CLASSES[meta.color];
  return (
    <button
      onClick={() => onClick(checkKey)}
      className={`bg-card border border-border rounded-lg p-4 text-left transition-all hover:bg-accent ${active ? 'ring-2 ring-primary/50' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl">{meta.icon}</span>
        <span className={`px-2 py-0.5 rounded-md text-sm font-bold ${count > 0 ? colors.badge : 'bg-success/15 text-success'}`}>
          {count}
        </span>
      </div>
      <div className="mt-2 text-sm font-medium text-foreground">{meta.label}</div>
      <div className="mt-0.5 text-xs text-subtle-foreground leading-snug">{meta.description}</div>
    </button>
  );
}

function IssueRow({ issue }) {
  const meta = CHECK_META[issue.check];
  const colors = COLOR_CLASSES[meta.color];
  return (
    <div className={`flex items-start gap-3 py-3 px-4 border-b border-border last:border-0`}>
      <span className="text-base mt-0.5">{meta.icon}</span>
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
      <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${colors.badge}`}>
        {meta.label}
      </span>
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
  const queryClient = useQueryClient();
  const [filterCheck, setFilterCheck] = useState(null); // which check to show in detail
  const [selectedReportId, setSelectedReportId] = useState(null); // null = show latest

  // Fetch history (no issues array — just summaries)
  const { data: historyData } = useQuery({
    queryKey: ['reconcile', 'history'],
    queryFn: () => reconcileAPI.getHistory().then((r) => r.data.data),
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
    onSuccess: (newReport) => {
      queryClient.invalidateQueries({ queryKey: ['reconcile'] });
      setSelectedReportId(null); // jump to latest (which is now the new one)
      setFilterCheck(null);
    },
  });

  // Filtered issues for the detail panel
  const visibleIssues = report?.issues
    ? (filterCheck ? report.issues.filter((i) => i.check === filterCheck) : report.issues)
    : [];

  const CHECK_KEYS = Object.keys(CHECK_META);

  return (
    <div className="space-y-6 ">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm mt-1">
            Detect data drift between Schedule ↔ Attendance ↔ Enrollment ↔ Team
          </p>
        </div>
        <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} className="self-start">
          {runMutation.isPending ? (
            <><Spinner size={16} />Running…</>
          ) : (
            <>▶ Run Now</>
          )}
        </Button>
      </div>

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
        <div className="bg-card border border-border rounded-lg py-20 text-center space-y-3">
          <div className="text-4xl">🔍</div>
          <p className="text-muted-foreground">No reconciliation report yet.</p>
          <p className="text-subtle-foreground text-sm">Click <strong className="text-foreground">Run Now</strong> to scan for data issues.</p>
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
            <span className={`px-2 py-0.5 rounded-lg font-medium ${report.status === 'ok' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
              {report.status === 'ok' ? '✓ All clear' : `⚠ ${report.summary.total} issue(s)`}
            </span>
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
                    ? `${CHECK_META[filterCheck].label} — ${visibleIssues.length} issue(s)`
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
            <div className="bg-card border border-border rounded-lg py-12 text-center space-y-2">
              <div className="text-4xl">✅</div>
              <p className="text-success font-medium">All clear — no data drift detected</p>
              <p className="text-subtle-foreground text-sm">Checked {Object.keys(CHECK_META).length} integrity rules across all collections.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
