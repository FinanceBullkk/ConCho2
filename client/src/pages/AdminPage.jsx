import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings, Database, ShieldCheck, ScrollText } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import SettingsPage from './SettingsPage';
import DatabaseExplorer from './DatabaseExplorer';
import ReconcilePage from './ReconcilePage';
import TableSkeleton from '@/components/TableSkeleton';
import QueryError from '@/components/QueryError';
import Pagination from '@/components/Pagination';
import { useAuditLog } from '@/hooks/useAuditLog';

// ──────────────────────────────────────────────────────────
// Admin — power-user section: settings + raw DB access + reconciliation.
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'settings',   label: 'Settings',       icon: Settings,    description: 'System configuration variables.' },
  { id: 'database',   label: 'Database',        icon: Database,    description: 'Browse and edit raw collection data.' },
  { id: 'reconcile',  label: 'Reconciliation',  icon: ShieldCheck, description: 'Detect data drift across Schedule, Attendance, Enrollment and Team.' },
  { id: 'audit',      label: 'Audit Log',       icon: ScrollText,  description: 'Full history of create, update and delete actions performed by admins.' },
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

function ActionBadge({ action }) {
  const color = action.includes('.create')
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : action.includes('.delete') || action.includes('.remove')
    ? 'bg-red-500/10 text-red-400 border-red-500/20'
    : action.includes('.update') || action.includes('.edit')
    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    : 'bg-white/5 text-slate-400 border-white/10';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md border font-mono text-xs ${color}`}>
      {action}
    </span>
  );
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

  // Reset to page 1 whenever a filter changes
  const handleEntity = (v) => { setEntity(v); setPage(1); };
  const handleAction = (v) => { setAction(v); setPage(1); };
  const handleFrom   = (v) => { setFrom(v);   setPage(1); };
  const handleTo     = (v) => { setTo(v);     setPage(1); };

  const { data, isLoading, isError, error, refetch, isFetching } = useAuditLog({
    page, limit: 50, entity, action, from, to,
  });

  const entries    = data?.data ?? [];
  const meta       = data?.meta ?? {};
  const totalPages = meta.totalPages ?? 1;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Entity filter */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs text-slate-400 font-medium">Entity</label>
            <select
              value={entity}
              onChange={(e) => handleEntity(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
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

          {/* Action filter */}
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-xs text-slate-400 font-medium">Action</label>
            <input
              type="text"
              value={action}
              onChange={(e) => handleAction(e.target.value)}
              placeholder="e.g. user.create"
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* From date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => handleFrom(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* To date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => handleTo(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <TableSkeleton rows={8} cols={5} />
          </div>
        ) : isError ? (
          <QueryError error={error} onRetry={refetch} />
        ) : (
          <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Actor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Entity</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Entity ID</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500 text-sm">
                      No audit entries found.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr key={entry._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {fmtDate(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-slate-200">{entry.actorId?.name ?? 'System'}</span>
                        {entry.actorId?.empCode && (
                          <span className="block text-xs text-slate-500">{entry.actorId.empCode}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ActionBadge action={entry.action} />
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                        {entry.entity}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-slate-500 font-mono">
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

      {/* Pagination */}
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
// AdminPage
// ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'settings';
  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Admin" description={current.description} />
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-2">
                <Icon className="size-4" />
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
