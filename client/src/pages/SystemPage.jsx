import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Settings, Database, RefreshCw, ShieldCheck, ScrollText, ChevronDown } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import TableSkeleton from '@/components/TableSkeleton';
import QueryError from '@/components/QueryError';
import Pagination from '@/components/Pagination';
import { useAuditLog } from '@/hooks/useAuditLog';
import { diffJson } from '@/lib/jsonDiff';
import { cn } from '@/lib/utils';
import SettingsPage from '../features/settings/SettingsPage';
import DatabaseExplorer from '../features/admin/DatabaseExplorer';
import SyncPage from '../features/sync/SyncPage';
import ReconcilePage from '../features/reconcile/ReconcilePage';

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
// AuditLogTab — Phase 4 Surface 9 §G
//   • Filter state in URL (entity · action · from · to · page) per 9H
//   • Row click → inline accordion · metadata + JSON diff (9C/P4)
//   • Manual refresh button (9F)
// ──────────────────────────────────────────────────────────

function AuditLogTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // 'tab' is owned by the umbrella SystemPage; everything else here is ours.
  const entity = searchParams.get('audit_entity') ?? '';
  const action = searchParams.get('audit_action') ?? '';
  const from   = searchParams.get('audit_from')   ?? '';
  const to     = searchParams.get('audit_to')     ?? '';
  const page   = Number(searchParams.get('audit_page') || '1') || 1;

  const setParam = (key) => (value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      if (key !== 'audit_page') next.delete('audit_page');  // reset on filter change
      return next;
    }, { replace: true });
  };

  const [expandedId, setExpandedId] = useState(null);
  const toggleRow = (id) => setExpandedId((prev) => (prev === id ? null : id));

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
          <div className="flex flex-col gap-1">
            <span className="text-overline text-muted-foreground">Entity</span>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by entity">
              {['', 'User', 'Class', 'Schedule', 'Team', 'Enrollment', 'Attendance'].map((e) => (
                <button
                  key={e || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={entity === e}
                  onClick={() => setParam('audit_entity')(e)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${entity === e ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                >
                  {e || 'All'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1 min-w-[180px]">
            <label htmlFor="audit-action" className="text-overline text-muted-foreground">Action</label>
            <input
              id="audit-action"
              type="text"
              value={action}
              onChange={(e) => setParam('audit_action')(e.target.value)}
              placeholder="e.g. user.create"
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="audit-from" className="text-overline text-muted-foreground">From</label>
            <input
              id="audit-from"
              type="date"
              value={from}
              onChange={(e) => setParam('audit_from')(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="audit-to" className="text-overline text-muted-foreground">To</label>
            <input
              id="audit-to"
              type="date"
              value={to}
              onChange={(e) => setParam('audit_to')(e.target.value)}
              className={inputCls}
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-audit'] })}
            className="ml-auto"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={8} cols={6} />
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
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-subtle-foreground text-sm">
                      No audit entries match these filters.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => {
                    const isOpen = expandedId === entry._id;
                    return (
                      <Fragment key={entry._id}>
                        <tr
                          onClick={() => toggleRow(entry._id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleRow(entry._id);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-expanded={isOpen}
                          aria-controls={`audit-detail-${entry._id}`}
                          className="border-b border-border hover:bg-accent/50 transition-colors duration-(--dur-fast) cursor-pointer focus:outline-none focus:bg-accent/50"
                        >
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
                          <td className="px-2 py-3 text-right">
                            <ChevronDown
                              className={cn('size-4 text-subtle-foreground transition-transform duration-(--dur-fast)', isOpen && 'rotate-180')}
                              aria-hidden="true"
                            />
                          </td>
                        </tr>
                        {isOpen && (
                          <tr id={`audit-detail-${entry._id}`} className="bg-muted/30">
                            <td colSpan={6} className="px-4 py-4">
                              <AuditDetail entry={entry} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
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
            onPageChange={(p) => setParam('audit_page')(p > 1 ? String(p) : '')}
            isLoading={isFetching}
          />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// AuditDetail — Phase 4 Surface 9 §G rule 4
//   Metadata + diff renderer (color-coded add/remove)
// ──────────────────────────────────────────────────────────

function AuditDetail({ entry }) {
  const diff = entry.diff;
  const before = diff?.before ?? null;
  const after  = diff?.after  ?? null;
  const hasDiff = before != null || after != null;

  const lines = hasDiff ? diffJson(before, after) : [];

  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-overline text-muted-foreground">Actor</dt>
          <dd className="text-foreground mt-0.5">
            {entry.actorId?.name ?? 'System'}
            {entry.actorEmpCode && <span className="text-subtle-foreground"> · {entry.actorEmpCode}</span>}
            <span className="block text-subtle-foreground">{entry.actorRole ?? '—'}</span>
          </dd>
        </div>
        <div>
          <dt className="text-overline text-muted-foreground">IP / Agent</dt>
          <dd className="text-foreground mt-0.5 font-mono">
            {entry.ip ?? '—'}
            {entry.userAgent && (
              <span className="block text-subtle-foreground text-[10px] truncate max-w-[28ch]" title={entry.userAgent}>
                {entry.userAgent}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-overline text-muted-foreground">Entity ID</dt>
          <dd className="text-foreground mt-0.5 font-mono break-all">{entry.entityId ?? '—'}</dd>
        </div>
        {entry.note && (
          <div className="sm:col-span-3">
            <dt className="text-overline text-muted-foreground">Note</dt>
            <dd className="text-foreground mt-0.5">{entry.note}</dd>
          </div>
        )}
      </dl>

      {hasDiff ? (
        <pre className="bg-slate-900 rounded-md p-3 text-xs font-mono leading-relaxed overflow-x-auto">
          {lines.map((l, i) => (
            <div
              key={i}
              className={cn(
                'whitespace-pre',
                l.type === 'add' && 'bg-success/15 text-success',
                l.type === 'del' && 'bg-destructive/15 text-destructive',
                l.type === 'eq'  && 'text-slate-300',
              )}
            >
              <span className="select-none mr-2 text-slate-500">
                {l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '}
              </span>
              {l.line}
            </div>
          ))}
        </pre>
      ) : (
        <p className="text-xs text-subtle-foreground italic">No diff data on this entry.</p>
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
      {/* IA Phase 03: tab strip removed — the sidebar's System group drives ?tab=. */}
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
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
