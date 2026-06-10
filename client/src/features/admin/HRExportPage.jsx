import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Download, RefreshCw, ClipboardList, CheckCircle2, Clock,
  BookOpen,
} from 'lucide-react';
import { useExportStats, useDownloadAttendance, useDownloadEvaluations } from '../../hooks/useExport';
import { qk } from '../../hooks/queryKeys';
import { downloadBlob } from '@/lib/downloadBlob';
import { Button } from '@/components/ui/button';
import { KPICard } from '../../components/KPICard';
import { Spinner } from '../../components/Spinner';

// ──────────────────────────────────────────────────────────
// HR Export — Phase 4 Surface 8
//
// Visual cleanup: KPICard ×3 (Pending · Exported · Last export) ·
// Lucide icons (no emoji per Phase 0 §05) · sonner toast feedback ·
// shared downloadBlob util. No behavior change beyond differentiated
// 404 vs 5xx (per 8G).
// ──────────────────────────────────────────────────────────

// "5 days ago" / "Just now" / "Never". Server returns ISO datetime
// or null. Re-rendered alongside the page (no live ticker — admin opens
// + exports + closes, no need for setInterval drift).
function formatRelative(iso) {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'Just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days >= 14 ? 's' : ''} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days >= 60 ? 's' : ''} ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function HRExportPage() {
  const queryClient = useQueryClient();
  const { data: stats = { pending: 0, exported: 0, lastExportAt: null, lastExportCount: 0 }, isLoading: loading } = useExportStats();
  const downloadMutation = useDownloadAttendance();
  const evalMutation = useDownloadEvaluations();

  useEffect(() => { document.title = 'TMS — HR Export'; }, []);

  const handleExport = async () => {
    try {
      const res = await downloadMutation.mutateAsync();
      const filename = downloadBlob(res, 'TMS_Attendance_Export.xlsx');
      toast.success(`Downloaded ${filename}`);
      queryClient.invalidateQueries({ queryKey: qk.exportHr.stats });
    } catch (err) {
      if (err.response?.status === 404) toast.info('No pending records to export.');
      else toast.error('Export failed. Please try again.');
    }
  };

  const handleEvalExport = async () => {
    try {
      const res = await evalMutation.mutateAsync();
      const filename = downloadBlob(res, 'TMS_Evaluations_Export.xlsx');
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      if (err.response?.status === 404) toast.info('No evaluations to export.');
      else toast.error('Export failed. Please try again.');
    }
  };

  const pending  = stats.pending  ?? 0;
  const exported = stats.exported ?? 0;
  const lastSub  = stats.lastExportAt
    ? `${formatDate(stats.lastExportAt)}${stats.lastExportCount ? ` · ${stats.lastExportCount} records` : ''}`
    : 'No exports yet';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 text-foreground">HR Export</h1>
        <p className="text-muted-foreground mt-1">Download attendance data as Excel for HR processing</p>
      </div>

      {/* KPI strip ×3 — Pending · Exported · Last export */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KPICard
          label="Pending"
          value={loading ? '—' : pending}
          sub={pending > 0 ? 'New records not yet downloaded' : 'All caught up'}
          icon={ClipboardList}
          tone={pending > 0 ? 'warning' : 'neutral'}
          loading={loading}
        />
        <KPICard
          label="Exported"
          value={loading ? '—' : exported}
          sub="Previously downloaded records"
          icon={CheckCircle2}
          tone="success"
          loading={loading}
        />
        <KPICard
          label="Last export"
          value={loading ? '—' : formatRelative(stats.lastExportAt)}
          sub={lastSub}
          icon={Clock}
          tone="neutral"
          loading={loading}
        />
      </div>

      {/* Attendance export action */}
      <section className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-overline text-muted-foreground mb-3">Download attendance report</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Clicking &ldquo;Export&rdquo; will download all <strong className="text-warning tabular-nums">{pending}</strong> pending records as Excel and mark them as exported so they won&apos;t be included in the next export.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleExport} disabled={downloadMutation.isPending || pending === 0}>
            {downloadMutation.isPending ? (
              <><Spinner size={16} />Exporting…</>
            ) : (
              <><Download className="size-3.5" aria-hidden="true" />Export {pending} record{pending !== 1 ? 's' : ''}</>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: qk.exportHr.stats })}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />Refresh stats
          </Button>
        </div>
      </section>

      {/* Evaluation export action */}
      <section className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-overline text-muted-foreground mb-3">Download evaluation report</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Export all evaluations (grammar, vocabulary, pronunciation, fluency scores + teacher comments) as Excel. Unlike attendance, evaluations are <strong className="text-foreground">re-exportable</strong> — they are not marked after download.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={handleEvalExport} disabled={evalMutation.isPending}>
            {evalMutation.isPending ? (
              <><Spinner size={16} />Exporting…</>
            ) : (
              <><Download className="size-3.5" aria-hidden="true" />Export evaluations</>
            )}
          </Button>
        </div>
      </section>

      {/* How it works — kept; cleaned of emoji */}
      <section className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-overline text-muted-foreground mb-3 inline-flex items-center gap-2">
          <BookOpen className="size-3.5" aria-hidden="true" />How it works
        </h2>
        <ol className="space-y-3 text-sm text-muted-foreground list-none pl-0">
          {[
            'Teachers mark attendance (P/A/L/EL) for each schedule session.',
            <>Records appear here as <strong className="text-warning">Pending</strong> until exported.</>,
            <>Click <strong className="text-foreground">Export</strong> to download the Excel file — records are then marked <strong className="text-success">Exported</strong>.</>,
            'Next time you export, only new (un-exported) records are included.',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="size-6 rounded-md bg-primary/10 text-primary inline-flex items-center justify-center text-xs font-bold shrink-0 tabular-nums">
                {i + 1}
              </span>
              <p className="m-0">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
