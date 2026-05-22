import { useState } from 'react';
import {
  CheckCircle2, AlertTriangle, XCircle, ClipboardList,
  RefreshCw, BookOpen, SkipForward,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSyncStatus, useGoogleSheetsSync } from '../hooks/useSync';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '../components/Spinner';
import { KPICard } from '../components/KPICard';
import { StatusBadge } from '../components/StatusBadge';

// ──────────────────────────────────────────────────────────
// Google Sheets Sync (Admin only)
// Pull team registrations from a Master Google Sheet.
// ──────────────────────────────────────────────────────────

export default function SyncPage() {
  const { data: syncStatus } = useSyncStatus();
  const configured = syncStatus?.configured ?? null;

  const syncMutation = useGoogleSheetsSync();
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('Sheet1');
  const [range, setRange] = useState('A2:D');
  const [report, setReport] = useState(null);

  const handleSync = async (e) => {
    e.preventDefault();
    if (!spreadsheetId.trim()) return;
    setReport(null);
    try {
      const data = await syncMutation.mutateAsync({ spreadsheetId, sheetName, range });
      setReport(data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sync failed. Please try again.');
    }
  };

  // Config status indicator
  const ConfigIcon = configured === null ? RefreshCw : configured ? CheckCircle2 : AlertTriangle;
  const configTone = configured ? 'success' : 'warning';

  return (
    <div className="space-y-6">
      {/* Config status */}
      <div className={`bg-card border rounded-lg p-5 flex items-center gap-4 ${
        configured === false ? 'border-warning/30' : 'border-border'
      }`}>
        <div className={`size-10 rounded-md flex items-center justify-center ${
          configured ? 'bg-success/10' : 'bg-warning/10'
        }`}>
          {configured === null
            ? <Spinner size={18} />
            : <ConfigIcon aria-hidden="true" className={`size-5 ${configured ? 'text-success' : 'text-warning'}`} strokeWidth={2} />
          }
        </div>
        <div>
          <div className="font-medium text-foreground text-sm">
            {configured === null
              ? 'Checking configuration…'
              : configured
              ? 'Google Sheets integration is configured'
              : 'Not configured yet'}
          </div>
          {!configured && configured !== null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Set <code className="bg-muted px-1 rounded">GOOGLE_SERVICE_ACCOUNT_KEY_JSON</code> (Render) or <code className="bg-muted px-1 rounded">GOOGLE_SERVICE_ACCOUNT_KEY</code> (local .env) to enable
            </p>
          )}
        </div>
        {configured !== null && (
          <div className="ml-auto">
            <StatusBadge tone={configTone} size="sm">
              {configured ? 'Active' : 'Inactive'}
            </StatusBadge>
          </div>
        )}
      </div>

      {/* Sync form */}
      <form onSubmit={handleSync} className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-overline text-muted-foreground mb-4">Sync settings</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3 space-y-1.5">
            <label className="text-overline text-muted-foreground">Spreadsheet ID</label>
            <Input
              type="text"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              required
              className="font-mono text-sm"
            />
            <p className="text-xs text-subtle-foreground">
              From your sheet URL: docs.google.com/spreadsheets/d/<strong className="text-muted-foreground">THIS_PART</strong>/edit
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-overline text-muted-foreground">Sheet name</label>
            <Input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-overline text-muted-foreground">Cell range</label>
            <Input
              type="text"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <Button
              type="submit"
              className="w-full"
              disabled={syncMutation.isPending || !spreadsheetId.trim()}
            >
              {syncMutation.isPending ? (
                <><Spinner size={16} />Syncing…</>
              ) : (
                <><RefreshCw className="size-4" aria-hidden="true" />Run sync</>
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Sync report */}
      {report && (
        <div className="bg-card border border-border rounded-lg p-6 space-y-6">
          <div className="flex items-center gap-2">
            <ClipboardList aria-hidden="true" className="size-4 text-muted-foreground" strokeWidth={2} />
            <h2 className="text-sm font-semibold text-foreground">Sync report</h2>
          </div>

          {/* KPI strip */}
          <div className="grid gap-3 grid-cols-3">
            <KPICard label="Processed" value={report.processed} icon={ClipboardList} tone="neutral" />
            <KPICard label="Enrolled"  value={report.enrolled}  icon={CheckCircle2}  tone="success" />
            <KPICard label="Skipped"   value={report.skipped}   icon={SkipForward}   tone="warning" />
          </div>

          {/* Detail rows */}
          {report.details?.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-overline text-muted-foreground">Details</h3>
              {report.details.map((d, i) => (
                <div
                  key={i}
                  className={`bg-muted border border-border rounded-lg p-3 text-sm flex items-start gap-2 ${
                    d.status === 'enrolled' ? 'border-l-2 border-success' : 'border-l-2 border-warning'
                  }`}
                >
                  {d.status === 'enrolled'
                    ? <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 mt-0.5 text-success" strokeWidth={2} />
                    : <SkipForward aria-hidden="true" className="size-4 shrink-0 mt-0.5 text-warning" strokeWidth={2} />
                  }
                  <span className="text-xs text-subtle-foreground shrink-0">Row {d.row}</span>
                  <span className="text-foreground">
                    {d.team || d.reason}{d.membersAdded !== undefined ? ` — ${d.membersAdded} members added` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Errors */}
          {report.errors?.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-overline text-destructive">Errors</h3>
              {report.errors.map((err, i) => (
                <div key={i} className="bg-muted border border-border rounded-lg p-3 text-sm border-l-2 border-destructive flex items-start gap-2">
                  <XCircle aria-hidden="true" className="size-4 shrink-0 mt-0.5 text-destructive" strokeWidth={2} />
                  <span>
                    <span className="text-xs text-subtle-foreground">Row {err.row}: </span>
                    <span className="text-destructive">{err.error}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sheet format guide */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen aria-hidden="true" className="size-4 text-muted-foreground" strokeWidth={2} />
          <h2 className="text-overline text-muted-foreground">Sheet format guide</h2>
        </div>
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
