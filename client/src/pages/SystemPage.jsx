import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings, Database, RefreshCw, ShieldCheck, ScrollText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import TableSkeleton from '@/components/TableSkeleton';
import QueryError from '@/components/QueryError';
import Pagination from '@/components/Pagination';
import { useAuditLog } from '@/hooks/useAuditLog';
import SettingsPage from './SettingsPage';
import DatabaseExplorer from './DatabaseExplorer';
import SyncPage from './SyncPage';
import ReconcilePage from './ReconcilePage';

// ──────────────────────────────────────────────────────────
// SystemPage — Phase 2 IA-S2
// Route: /system  (Admin only)
// Tabs: Settings · Database · Sync · Reconciliation · Audit Log
// Replaces /admin (old AdminPage) and merges in SyncPage.
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'settings',   label: 'Settings',        icon: Settings,   description: 'System configuration variables.' },
  { id: 'database',   label: 'Database',         icon: Database,   description: 'Browse and edit raw collection data.' },
  { id: 'sync',       label: 'Sync',             icon: RefreshCw,  description: 'Import enrollment data from Google Sheets.' },
  { id: 'reconcile',  label: 'Reconciliation',   icon: ShieldCheck, description: 'Detect data drift across Schedule, Attendance, Enrollment and Team.' },
  { id: 'audit',      label: 'Audit Log',        icon: ScrollText, description: 'Full history of create, update and delete actions performed by admins.' },
];

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/** Map audit action verb → StatusBadge tone. */
function actionTone(action) {
  if (action.includes('.create')) return 'success';
  if (action.includes('.delete') || action.includes('.remove')) return 'danger';
  if (action.includes('.update') || action.includes('.edit')) return 'info';
  return 'upcoming';
}

// ──────────────────────────────────────────────────────────
// AuditLogTab
// ──────────────────────────────────────────────────────────

function AuditLogTab() {
  const [page, setPage]     = useState(1);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom]     = useState('');
  const [to, setTo]         = useState('');

  const resetPage = (fn) => (v) => { fn(v); setPage(1); };

  const { data, isLoading, isError, error, refetch, isFetching } = useAuditLog({
    page, limit: 50, entity, action, from, to,
  });

  const entries    = data?.data  ?? [];
  const meta       = data?.meta  ?? {};
  const totalPages = meta.totalPages ?? 1;

  const inputCls =
    'h-(--control-h) rounded-md border border-input bg-background px-3 text-sm text-foreground ' +
    'placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring ' +
    'transition-colors duration-(--dur-fast)';

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-overline text-muted-foreground">Entity</label>
            <select
              value={entity}
              onChange={(e) => resetPage(setEntity)(e.target.value)}
              className={inputCls}
            >
              <option value="">All</option>
              <option value="User">User</option>
              <option value="Class">Class</option>
              <option value="Schedule">Schedule</option>
              <option value="Team">Team</option>
              <option value="Enrollment">Enrollment</option>
              <option value="Attendance">Attendance</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-overline text-muted-foreground">Action</label>
            <input
              type="text"
              value={action}
              onChange={(e) => resetPage(setAction)(e.target.value)}
              placeholder="e.g. user.create"
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-overline text-muted-foreground">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => resetPage(setFrom)(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-overline text-muted-foreground">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => resetPage(setTo)(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={8} cols={5} />
          </div>
        ) : isError ? (
          <QueryError error={error} onRetry={refetch} />
        ) : (
          <div className={`overflow-x-auto transition-opacity duration-(--dur) ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-overline text-muted-foreground whitespace-nowrap">Time</th>
                  <th className="text-left px-4 py-3 text-overline text-muted-foreground whitespace-nowrap">Actor</th>
                  <th className="text-left px-4 py-3 text-overline text-muted-foreground whitespace-nowrap">Action</th>
                  <th className="text-left px-4 py-3 text-overline text-muted-foreground whitespace-nowrap">Entity</th>
                  <th className="text-left px-4 py-3 text-overline text-muted-foreground whitespace-nowrap">Entity ID</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-subtle-foreground text-sm">
                      No audit entries found.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr key={entry._id} className="border-b border-border hover:bg-accent/50 transition-colors duration-(--dur-fast)">
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">
                        {fmtDate(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-foreground">{entry.actorId?.name ?? 'System'}</span>
                        {entry.actorId?.empCode && (
                          <span className="block text-xs text-subtle-foreground">{entry.actorId.empCode}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge tone={actionTone(entry.action)} size="sm">
                          {entry.action}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-foreground whitespace-nowrap">
                        {entry.entity}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-mono text-subtle-foreground">
                          {entry.entityId ? `${String(entry.entityId).slice(0, 8)}…` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            isLoading={isFetching}
          />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// SystemPage
// ──────────────────────────────────────────────────────────

export default function SystemPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'settings';
  const current   = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="System" description={current.description} />
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-2">
                <Icon className="size-4" aria-hidden="true" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="settings" hidden={activeTab !== 'settings'}>
          {activeTab === 'settings' && <SettingsPage />}
        </TabsContent>
        <TabsContent value="database" hidden={activeTab !== 'database'}>
          {activeTab === 'database' && <DatabaseExplorer />}
        </TabsContent>
        <TabsContent value="sync" hidden={activeTab !== 'sync'}>
          {activeTab === 'sync' && <SyncPage />}
        </TabsContent>
        <TabsContent value="reconcile" hidden={activeTab !== 'reconcile'}>
          {activeTab === 'reconcile' && <ReconcilePage />}
        </TabsContent>
        <TabsContent value="audit" hidden={activeTab !== 'audit'}>
          {activeTab === 'audit' && <AuditLogTab />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
