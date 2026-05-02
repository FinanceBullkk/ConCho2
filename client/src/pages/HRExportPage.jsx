import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { exportAPI } from '../api/api';
import { useExportStats } from '../hooks/useExport';
import { qk } from '../hooks/queryKeys';

// ──────────────────────────────────────────────────────────
// HR Export Page (Admin Only)
// ──────────────────────────────────────────────────────────
// Dedicated page for downloading attendance reports as Excel.
// Shows pending/exported stats and triggers blob download.
// ──────────────────────────────────────────────────────────

export default function HRExportPage() {
  const queryClient = useQueryClient();
  const { data: stats = { pending: 0, exported: 0 }, isLoading: loading } = useExportStats();
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  useEffect(() => { document.title = 'TMS — HR Export'; }, []);

  const handleExport = async () => {
    setIsExporting(true);
    setExportMsg('');
    try {
      const res = await exportAPI.downloadAttendance();
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
      queryClient.invalidateQueries({ queryKey: qk.exportHr.stats });
    } catch (err) {
      const msg = err.response?.status === 404
        ? 'No pending records to export.'
        : 'Export failed. Please try again.';
      setExportMsg(`❌ ${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">📤 HR Export</h1>
        <p className="text-slate-400 mt-1">Download attendance data as Excel for HR processing</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass rounded-2xl p-6 text-center">
          <div className="text-4xl mb-2">📋</div>
          <div className="text-3xl font-bold text-accent-amber">{loading ? '...' : stats.pending}</div>
          <div className="text-sm text-slate-400 mt-1">Pending Export</div>
          <div className="text-xs text-slate-500 mt-1">New records not yet downloaded</div>
        </div>
        <div className="glass rounded-2xl p-6 text-center">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-3xl font-bold text-accent-green">{loading ? '...' : stats.exported}</div>
          <div className="text-sm text-slate-400 mt-1">Already Exported</div>
          <div className="text-xs text-slate-500 mt-1">Previously downloaded records</div>
        </div>
        <div className="glass rounded-2xl p-6 text-center">
          <div className="text-4xl mb-2">📊</div>
          <div className="text-3xl font-bold text-white">{loading ? '...' : stats.pending + stats.exported}</div>
          <div className="text-sm text-slate-400 mt-1">Total Records</div>
          <div className="text-xs text-slate-500 mt-1">All attendance entries</div>
        </div>
      </div>

      {/* Export Action */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Download Attendance Report</h2>
        <p className="text-sm text-slate-400 mb-5">
          Clicking "Export" will download all <strong className="text-accent-amber">{stats.pending}</strong> pending records as an Excel file 
          and mark them as exported so they won't be included in the next export.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={handleExport}
            disabled={isExporting || stats.pending === 0}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-500/20"
          >
            {isExporting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Exporting...
              </span>
            ) : (
              `📥 Export ${stats.pending} Record${stats.pending !== 1 ? 's' : ''}`
            )}
          </button>

          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: qk.exportHr.stats })}
            className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 transition-all"
          >
            ↻ Refresh Stats
          </button>
        </div>

        {exportMsg && (
          <div className={`mt-4 px-4 py-3 rounded-xl text-sm animate-fade-in ${
            exportMsg.startsWith('✅')
              ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green'
              : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'
          }`}>
            {exportMsg}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">📖 How It Works</h2>
        <div className="space-y-3 text-sm text-slate-400">
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-lg bg-primary-500/20 text-primary-300 flex items-center justify-center text-xs font-bold shrink-0">1</span>
            <p>Teachers mark attendance (P/A/L/EL) for each schedule session</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-lg bg-primary-500/20 text-primary-300 flex items-center justify-center text-xs font-bold shrink-0">2</span>
            <p>Records appear here as <strong className="text-accent-amber">Pending</strong> until exported</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-lg bg-primary-500/20 text-primary-300 flex items-center justify-center text-xs font-bold shrink-0">3</span>
            <p>Click <strong className="text-white">Export</strong> to download the Excel file — records are then marked <strong className="text-accent-green">Exported</strong></p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-lg bg-primary-500/20 text-primary-300 flex items-center justify-center text-xs font-bold shrink-0">4</span>
            <p>Next time you export, only new (un-exported) records are included</p>
          </div>
        </div>
      </div>
    </div>
  );
}
