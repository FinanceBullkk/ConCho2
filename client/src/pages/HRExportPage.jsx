import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useExportStats, useDownloadAttendance, useDownloadEvaluations } from '../hooks/useExport';
import { qk } from '../hooks/queryKeys';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';

// ──────────────────────────────────────────────────────────
// HR Export Page (Admin Only)
// ──────────────────────────────────────────────────────────
// Dedicated page for downloading attendance reports as Excel.
// Shows pending/exported stats and triggers blob download.
// ──────────────────────────────────────────────────────────

export default function HRExportPage() {
  const queryClient = useQueryClient();
  const { data: stats = { pending: 0, exported: 0 }, isLoading: loading } = useExportStats();
  const downloadMutation = useDownloadAttendance();
  const evalMutation = useDownloadEvaluations();
  const [exportMsg, setExportMsg] = useState('');
  const [evalMsg, setEvalMsg] = useState('');

  useEffect(() => { document.title = 'TMS — HR Export'; }, []);

  const handleExport = async () => {
    setExportMsg('');
    try {
      const res = await downloadMutation.mutateAsync();
      const disposition = res.headers['content-disposition'];
      let filename = 'TMS_Attendance_Export.xlsx';
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportMsg(`✅ Downloaded ${filename} successfully!`);
    } catch (err) {
      const msg = err.response?.status === 404
        ? 'No pending records to export.'
        : 'Export failed. Please try again.';
      setExportMsg(`❌ ${msg}`);
    }
  };

  const handleEvalExport = async () => {
    setEvalMsg('');
    try {
      const res = await evalMutation.mutateAsync();
      const disposition = res.headers['content-disposition'];
      let filename = 'TMS_Evaluations_Export.xlsx';
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setEvalMsg(`✅ Downloaded ${filename} successfully!`);
    } catch (err) {
      const msg = err.response?.status === 404
        ? 'No evaluations to export.'
        : 'Export failed. Please try again.';
      setEvalMsg(`❌ ${msg}`);
    }
  };

  return (
    <div className="space-y-6 ">
      <div>
        <h1 className="text-h1 text-foreground">HR Export</h1>
        <p className="text-muted-foreground mt-1">Download attendance data as Excel for HR processing</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <div className="text-4xl mb-2">📋</div>
          <div className="text-3xl font-bold text-warning">{loading ? '...' : stats.pending}</div>
          <div className="text-sm text-muted-foreground mt-1">Pending Export</div>
          <div className="text-xs text-subtle-foreground mt-1">New records not yet downloaded</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-3xl font-bold text-success">{loading ? '...' : stats.exported}</div>
          <div className="text-sm text-muted-foreground mt-1">Already Exported</div>
          <div className="text-xs text-subtle-foreground mt-1">Previously downloaded records</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <div className="text-4xl mb-2">📊</div>
          <div className="text-h1 text-foreground">{loading ? '...' : stats.pending + stats.exported}</div>
          <div className="text-sm text-muted-foreground mt-1">Total Records</div>
          <div className="text-xs text-subtle-foreground mt-1">All attendance entries</div>
        </div>
      </div>

      {/* Export Action */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Download Attendance Report</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Clicking "Export" will download all <strong className="text-warning">{stats.pending}</strong> pending records as an Excel file
          and mark them as exported so they won't be included in the next export.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <Button
            onClick={handleExport}
            disabled={downloadMutation.isPending || stats.pending === 0}
          >
            {downloadMutation.isPending ? (
              <span className="flex items-center gap-2">
                <Spinner size={16} />
                Exporting...
              </span>
            ) : (
              `📥 Export ${stats.pending} Record${stats.pending !== 1 ? 's' : ''}`
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: qk.exportHr.stats })}
          >
            ↻ Refresh Stats
          </Button>
        </div>

        {exportMsg && (
          <div className={`mt-4 px-4 py-3 rounded-md text-sm ${
            exportMsg.startsWith('✅')
              ? 'bg-success/10 border border-success/20 text-success'
              : 'bg-destructive/10 border border-destructive/20 text-destructive'
          }`}>
            {exportMsg}
          </div>
        )}
      </div>

      {/* Evaluation Export */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Download Evaluation Report</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Export all evaluations (grammar, vocabulary, pronunciation, fluency scores + teacher comments)
          as Excel. Unlike attendance, evaluations are <strong className="text-foreground">re-exportable</strong> —
          they are not marked after download.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="secondary"
            onClick={handleEvalExport}
            disabled={evalMutation.isPending}
          >
            {evalMutation.isPending ? (
              <span className="flex items-center gap-2">
                <Spinner size={16} />
                Exporting...
              </span>
            ) : (
              '📥 Export Evaluations'
            )}
          </Button>
        </div>

        {evalMsg && (
          <div className={`mt-4 px-4 py-3 rounded-md text-sm ${
            evalMsg.startsWith('✅')
              ? 'bg-success/10 border border-success/20 text-success'
              : 'bg-destructive/10 border border-destructive/20 text-destructive'
          }`}>
            {evalMsg}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">📖 How It Works</h2>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-lg bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</span>
            <p>Teachers mark attendance (P/A/L/EL) for each schedule session</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-lg bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</span>
            <p>Records appear here as <strong className="text-warning">Pending</strong> until exported</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-lg bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">3</span>
            <p>Click <strong className="text-foreground">Export</strong> to download the Excel file — records are then marked <strong className="text-success">Exported</strong></p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-lg bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">4</span>
            <p>Next time you export, only new (un-exported) records are included</p>
          </div>
        </div>
      </div>
    </div>
  );
}
