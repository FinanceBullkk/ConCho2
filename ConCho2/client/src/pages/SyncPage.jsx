import { useState, useEffect } from 'react';
import { useSyncStatus, useGoogleSheetsSync } from '../hooks/useSync';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';

// ──────────────────────────────────────────────────────────
// Google Sheets Sync Page (Admin Only)
// ──────────────────────────────────────────────────────────
// Admin enters a Spreadsheet ID, clicks Sync, and sees
// a real-time report of which teams were enrolled.
// ──────────────────────────────────────────────────────────

export default function SyncPage() {
  const { data: syncStatus } = useSyncStatus();
  const configured = syncStatus?.configured ?? null;

  const syncMutation = useGoogleSheetsSync();
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('Sheet1');
  const [range, setRange] = useState('A2:D');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'TMS — Sheets Sync'; }, []);

  const handleSync = async (e) => {
    e.preventDefault();
    if (!spreadsheetId.trim()) return;
    setError('');
    setReport(null);
    try {
      const data = await syncMutation.mutateAsync({ spreadsheetId, sheetName, range });
      setReport(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Sync failed');
    }
  };

  return (
    <div className="space-y-6 ">
      <div>
        <h1 className="text-h1 text-foreground">Google Sheets Sync</h1>
        <p className="text-muted-foreground mt-1">Pull team registrations from your Master Google Sheet</p>
      </div>

      {/* Config Status */}
      <div className={`bg-card border border-border rounded-lg p-5 flex items-center gap-4 ${
        configured === false ? 'border border-warning/20' : ''
      }`}>
        <div className={`w-10 h-10 rounded-md flex items-center justify-center text-lg ${
          configured ? 'bg-success/10' : 'bg-warning/10'
        }`}>
          {configured === null ? '⏳' : configured ? '✅' : '⚠️'}
        </div>
        <div>
          <div className="font-medium text-foreground text-sm">
            {configured === null ? 'Checking...' : configured ? 'Google Sheets integration is configured' : 'Not configured yet'}
          </div>
          {!configured && configured !== null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Set <code className="bg-muted px-1 rounded">GOOGLE_SERVICE_ACCOUNT_KEY_JSON</code> (Render) or <code className="bg-muted px-1 rounded">GOOGLE_SERVICE_ACCOUNT_KEY</code> (local .env) to enable
            </p>
          )}
        </div>
      </div>

      {/* Sync Form */}
      <form onSubmit={handleSync} className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Sync Settings</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">Spreadsheet ID</label>
            <input
              type="text"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              className="w-full px-4 py-3 rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors font-mono text-sm"
              required
            />
            <p className="text-xs text-subtle-foreground mt-1">
              Find this in your Google Sheet URL: docs.google.com/spreadsheets/d/<strong className="text-muted-foreground">THIS_PART</strong>/edit
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">Sheet Name</label>
            <input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">Cell Range</label>
            <input
              type="text"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="w-full px-4 py-3 rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
          </div>

          <div className="flex items-end">
            <Button
              type="submit"
              className="w-full h-12"
              disabled={syncMutation.isPending || !spreadsheetId.trim()}
            >
              {syncMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size={16} />
                  Syncing...
                </span>
              ) : (
                '🔄 Run Sync'
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-card border border-destructive/20 rounded-lg p-5">
          <div className="flex items-center gap-3">
            <span className="text-lg">❌</span>
            <div>
              <div className="font-medium text-destructive text-sm">Sync Failed</div>
              <div className="text-xs text-muted-foreground mt-0.5">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Sync Report */}
      {report && (
        <div className="bg-card border border-border rounded-lg p-6 ">
          <h2 className="text-lg font-semibold text-foreground mb-4">📋 Sync Report</h2>

          {/* Summary Cards */}
          <div className="grid gap-3 grid-cols-3 mb-6">
            <div className="bg-muted border border-border rounded-md p-4 text-center">
              <div className="text-h1 text-foreground">{report.processed}</div>
              <div className="text-xs text-muted-foreground">Processed</div>
            </div>
            <div className="bg-muted border border-border rounded-md p-4 text-center">
              <div className="text-2xl font-bold text-success">{report.enrolled}</div>
              <div className="text-xs text-muted-foreground">Enrolled</div>
            </div>
            <div className="bg-muted border border-border rounded-md p-4 text-center">
              <div className="text-2xl font-bold text-warning">{report.skipped}</div>
              <div className="text-xs text-muted-foreground">Skipped</div>
            </div>
          </div>

          {/* Detail rows */}
          {report.details && report.details.length > 0 && (
            <div className="space-y-2 mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Details</h3>
              {report.details.map((d, i) => (
                <div key={i} className={`bg-muted border border-border rounded-lg p-3 text-sm flex items-center gap-2 ${
                  d.status === 'enrolled' ? 'border-l-2 border-success' : 'border-l-2 border-warning'
                }`}>
                  <span className="text-xs text-subtle-foreground">Row {d.row}</span>
                  <span className={d.status === 'enrolled' ? 'text-success' : 'text-warning'}>
                    {d.status === 'enrolled' ? '✅' : '⏭️'}
                  </span>
                  <span className="text-foreground">
                    {d.team || d.reason} {d.membersAdded !== undefined && `— ${d.membersAdded} members added`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Errors */}
          {report.errors && report.errors.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-destructive">Errors</h3>
              {report.errors.map((err, i) => (
                <div key={i} className="bg-muted border border-border rounded-lg p-3 text-sm border-l-2 border-destructive">
                  <span className="text-xs text-subtle-foreground">Row {err.row}: </span>
                  <span className="text-destructive">{err.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">📖 Sheet Format Guide</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="pb-2 pr-4">Column A</th>
                <th className="pb-2 pr-4">Column B</th>
                <th className="pb-2 pr-4">Column C</th>
                <th className="pb-2">Column D</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 text-muted-foreground font-medium">TeamName</td>
                <td className="py-2 pr-4 text-muted-foreground font-medium">ClassCode</td>
                <td className="py-2 pr-4 text-muted-foreground font-medium">Date</td>
                <td className="py-2 text-muted-foreground font-medium">TimeSlot</td>
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
