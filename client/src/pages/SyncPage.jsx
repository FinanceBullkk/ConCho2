import { useState, useEffect } from 'react';
import { syncAPI } from '../api/api';

// ──────────────────────────────────────────────────────────
// Google Sheets Sync Page (Admin Only)
// ──────────────────────────────────────────────────────────
// Admin enters a Spreadsheet ID, clicks Sync, and sees
// a real-time report of which teams were enrolled.
// ──────────────────────────────────────────────────────────

export default function SyncPage() {
  const [configured, setConfigured] = useState(null);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('Sheet1');
  const [range, setRange] = useState('A2:D');
  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    syncAPI.status()
      .then((res) => setConfigured(res.data.data.configured))
      .catch(() => setConfigured(false));
  }, []);

  const handleSync = async (e) => {
    e.preventDefault();
    if (!spreadsheetId.trim()) return;
    setSyncing(true);
    setError('');
    setReport(null);
    try {
      const res = await syncAPI.googleSheets({ spreadsheetId, sheetName, range });
      setReport(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">📊 Google Sheets Sync</h1>
        <p className="text-slate-400 mt-1">Pull team registrations from your Master Google Sheet</p>
      </div>

      {/* Config Status */}
      <div className={`glass rounded-2xl p-5 flex items-center gap-4 ${
        configured === false ? 'border border-accent-amber/20' : ''
      }`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
          configured ? 'bg-accent-green/10' : 'bg-accent-amber/10'
        }`}>
          {configured === null ? '⏳' : configured ? '✅' : '⚠️'}
        </div>
        <div>
          <div className="font-medium text-white text-sm">
            {configured === null ? 'Checking...' : configured ? 'Google Sheets integration is configured' : 'Not configured yet'}
          </div>
          {!configured && configured !== null && (
            <p className="text-xs text-slate-400 mt-0.5">
              Set <code className="bg-white/5 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_KEY</code> in <code className="bg-white/5 px-1 rounded">.env</code> to enable
            </p>
          )}
        </div>
      </div>

      {/* Sync Form */}
      <form onSubmit={handleSync} className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Sync Settings</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Spreadsheet ID</label>
            <input
              type="text"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              className="w-full px-4 py-3 rounded-xl bg-surface-lighter/60 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all font-mono text-sm"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Find this in your Google Sheet URL: docs.google.com/spreadsheets/d/<strong className="text-slate-400">THIS_PART</strong>/edit
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Sheet Name</label>
            <input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-lighter/60 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Cell Range</label>
            <input
              type="text"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-surface-lighter/60 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={syncing || !spreadsheetId.trim()}
              className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all disabled:opacity-50 shadow-lg shadow-primary-500/20"
            >
              {syncing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Syncing...
                </span>
              ) : (
                '🔄 Run Sync'
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="glass rounded-2xl p-5 border border-accent-red/20 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="text-lg">❌</span>
            <div>
              <div className="font-medium text-accent-red text-sm">Sync Failed</div>
              <div className="text-xs text-slate-400 mt-0.5">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Sync Report */}
      {report && (
        <div className="glass rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-white mb-4">📋 Sync Report</h2>

          {/* Summary Cards */}
          <div className="grid gap-3 grid-cols-3 mb-6">
            <div className="glass-light rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{report.processed}</div>
              <div className="text-xs text-slate-400">Processed</div>
            </div>
            <div className="glass-light rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-accent-green">{report.enrolled}</div>
              <div className="text-xs text-slate-400">Enrolled</div>
            </div>
            <div className="glass-light rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-accent-amber">{report.skipped}</div>
              <div className="text-xs text-slate-400">Skipped</div>
            </div>
          </div>

          {/* Detail rows */}
          {report.details && report.details.length > 0 && (
            <div className="space-y-2 mb-4">
              <h3 className="text-sm font-medium text-slate-300">Details</h3>
              {report.details.map((d, i) => (
                <div key={i} className={`glass-light rounded-lg p-3 text-sm flex items-center gap-2 ${
                  d.status === 'enrolled' ? 'border-l-2 border-accent-green' : 'border-l-2 border-accent-amber'
                }`}>
                  <span className="text-xs text-slate-500">Row {d.row}</span>
                  <span className={d.status === 'enrolled' ? 'text-accent-green' : 'text-accent-amber'}>
                    {d.status === 'enrolled' ? '✅' : '⏭️'}
                  </span>
                  <span className="text-white">
                    {d.team || d.reason} {d.membersAdded !== undefined && `— ${d.membersAdded} members added`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Errors */}
          {report.errors && report.errors.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-accent-red">Errors</h3>
              {report.errors.map((err, i) => (
                <div key={i} className="glass-light rounded-lg p-3 text-sm border-l-2 border-accent-red">
                  <span className="text-xs text-slate-500">Row {err.row}: </span>
                  <span className="text-accent-red">{err.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">📖 Sheet Format Guide</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/5">
                <th className="pb-2 pr-4">Column A</th>
                <th className="pb-2 pr-4">Column B</th>
                <th className="pb-2 pr-4">Column C</th>
                <th className="pb-2">Column D</th>
              </tr>
            </thead>
            <tbody className="text-white">
              <tr className="border-b border-white/5">
                <td className="py-2 pr-4 text-slate-300 font-medium">TeamName</td>
                <td className="py-2 pr-4 text-slate-300 font-medium">ClassCode</td>
                <td className="py-2 pr-4 text-slate-300 font-medium">Date</td>
                <td className="py-2 text-slate-300 font-medium">TimeSlot</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">Sales Team Alpha</td>
                <td className="py-2 pr-4 font-mono text-xs">ENG-B1-2026</td>
                <td className="py-2 pr-4 font-mono text-xs">2026-04-21</td>
                <td className="py-2 font-mono text-xs">09:00-10:30</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
