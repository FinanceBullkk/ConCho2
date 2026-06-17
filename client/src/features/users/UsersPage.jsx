import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RefreshCw, Download } from 'lucide-react';
import StudentProgressModal from '../../components/Progress/StudentProgressModal';
import OrgAssignmentModal from '../../components/OrgAssignmentModal';
import Portal from '../../components/Portal';
import { DataTable } from '../../components/DataTable';
import { FilterBar } from '../../components/FilterBar';
import { StatusChips } from '../../components/StatusChips';
import { ActiveFilterChips } from '../../components/ActiveFilterChips';
import { SelectionBar } from '../../components/SelectionBar';
import { BulkDeleteConfirm } from '../../components/BulkDeleteConfirm';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useUsers, useUpdateUser, useDeleteUser } from '../../hooks/useUsers';
import { useTeams } from '../../hooks/useTeams';
import { qk } from '../../hooks/queryKeys';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../hooks/useRole';
import { useListUrlState } from '../../hooks/useListUrlState';
import { authAPI } from '../../api/api';
import UserModal from './UserModal';
import AdminActionModal from './AdminActionModal';
import { buildUserColumns } from './user-columns';
import { ROLES, STATUSES, STATUS_CHIPS, PAGE_SIZE, BULK_TYPE_CONFIRM_THRESHOLD } from './users-constants';

// ── Users page (shell) ────────────────────────────────────
// The form modal (UserModal), the table columns (user-columns) and the
// admin-action confirm modal (AdminActionModal) live in sibling files; this
// file orchestrates state, filters, bulk actions and the table.
export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser, isAdmin } = useAuth();
  const { can } = useRole();
  const deleteMutation = useDeleteUser();
  const updateMutation = useUpdateUser();

  // Modal / drawer state
  const [modal, setModal]               = useState(null);        // null | 'create' | userObject
  const [deleteId, setDeleteId]         = useState(null);
  const [progressModal, setProgressModal] = useState(null);      // { id, name }
  const [assignModal, setAssignModal]   = useState(null);        // user being assigned a manager/department
  const [adminAction, setAdminAction]   = useState(null);        // { type, userId, userName }
  const [adminActionPassword, setAdminActionPassword] = useState('');
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminActionError, setAdminActionError]     = useState('');

  // Selection survives filter changes (per §D rule 8)
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // URL state via shared hook (per §F handoff)
  const list = useListUrlState({
    defaults: { sortBy: 'lastActive', sortOrder: 'desc' },
    facets:   ['role'],
  });

  useEffect(() => { document.title = 'TMS — Users'; }, []);

  // Backend takes `role` directly as a query param (hook puts it under facets)
  const queryParams = useMemo(
    () => ({ ...list.queryParams, limit: PAGE_SIZE }),
    [list.queryParams],
  );

  const { data: usersData, isLoading: loading, isError, error, refetch } = useUsers(queryParams);
  const users  = usersData?.data  || [];
  const total  = usersData?.total ?? usersData?.count ?? 0;
  const pages  = usersData?.pages ?? 1;

  const { data: allTeams = [] } = useTeams();
  const teamsByUser = useMemo(() => {
    const map = {};
    for (const t of allTeams) {
      const cls  = t.classId;
      const info = { teamName: t.name, classCode: cls?.classCode || '', courseName: cls?.courseName || '' };
      (t.members || []).forEach(m => { map[m._id || m] = info; });
      if (t.leaderId) map[t.leaderId._id || t.leaderId] = info;
    }
    return map;
  }, [allTeams]);

  const reload = () => queryClient.invalidateQueries({ queryKey: qk.users.all });

  // ── Bulk action handlers ──────────────────────────────
  // Audit PR K (FE-008): removed `kind === 'invite'` branch — usersAPI.sendInvite
  // does not exist server-side. The branch was unreachable from the UI but
  // tempted future devs to wire up a button that would silently no-op. If
  // an invite flow is added, model it as `inviteMutation` and add the UI.
  const runBulk = async (kind, value) => {
    const ids = [...selectedIds];
    const n = ids.length;
    if (n === 0) return;
    try {
      if (kind === 'status') {
        await Promise.all(ids.map((id) => updateMutation.mutateAsync({ id, data: { status: value } })));
        toast.success(`${n} user${n > 1 ? 's' : ''} set to ${value}`);
      } else if (kind === 'role') {
        await Promise.all(ids.map((id) => updateMutation.mutateAsync({ id, data: { role: value } })));
        toast.success(`${n} user${n > 1 ? 's' : ''} set to role ${value}`);
      }
      setSelectedIds(new Set());
    } catch {
      toast.error('Bulk action failed — some updates may not have applied');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    const n = ids.length;
    setBulkDeleting(true);
    try {
      await Promise.all(ids.map((id) => deleteMutation.mutateAsync(id)));
      toast.success(`${n} user${n > 1 ? 's' : ''} deleted`);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    } catch {
      toast.error('Bulk delete failed — some users may remain.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const requestBulkDelete = () => {
    const n = selectedIds.size;
    if (n === 0) return;
    if (n > BULK_TYPE_CONFIRM_THRESHOLD) {
      setBulkDeleteOpen(true);                                            // §D rule 10
    } else if (window.confirm(`Delete ${n} user${n > 1 ? 's' : ''}? This cannot be undone.`)) {
      handleBulkDelete();
    }
  };

  // ── Export — respects current filter + selection (§D rule 11) ──
  const downloadCSV = (rows) => {
    const header = ['Code', 'Name', 'Email', 'BU', 'Position', 'Role', 'Status', 'Last Active'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      header.map(escape).join(','),
      ...rows.map((u) => [
        u.empCode, u.name, u.email || '', u.department || '', u.position || '',
        u.role, u.status, u.lastActive ? new Date(u.lastActive).toLocaleDateString('en') : '',
      ].map(escape).join(',')),
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `users-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const rows = selectedIds.size > 0
      ? users.filter((u) => selectedIds.has(u._id))
      : users;
    if (rows.length === 0) { toast.info('Nothing to export'); return; }
    downloadCSV(rows);
    toast.success(`Exported ${rows.length} user${rows.length > 1 ? 's' : ''}`);
  };

  const handleDelete = async (id) => {
    try { await deleteMutation.mutateAsync(id); } catch { /* toast shown by global onError */ }
    setDeleteId(null);
  };

  const openAdminAction = useCallback((action) => {
    setAdminAction(action);
    setAdminActionPassword('');
    setAdminActionError('');
  }, []);

  const closeAdminAction = useCallback(() => {
    setAdminAction(null);
    setAdminActionPassword('');
    setAdminActionError('');
  }, []);

  const handleAdminAction = async () => {
    if (!adminAction) return;
    const currentPassword = adminActionPassword.trim();
    if (!currentPassword) {
      setAdminActionError('Enter your admin password to confirm this action.');
      return;
    }
    setAdminActionLoading(true);
    setAdminActionError('');
    try {
      if (adminAction.type === 'force-logout') await authAPI.adminForceLogout(adminAction.userId, currentPassword);
      else if (adminAction.type === 'reset-mfa') await authAPI.mfaAdminDisable(adminAction.userId, currentPassword);
      reload();
      closeAdminAction();
    } catch (err) {
      setAdminActionError(err.response?.data?.message || 'Action failed. Please try again.');
    } finally {
      setAdminActionLoading(false);
    }
  };

  // ── Active filter chips for the row above the table ──
  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (list.facets.role) {
      chips.push({
        key: 'role',
        label: `Role: ${list.facets.role}`,
        onRemove: () => list.setFacet('role', ''),
      });
    }
    return chips;
  }, [list]);

  // ── DataTable column definitions (built in ./user-columns) ──
  const columns = useMemo(
    () => buildUserColumns({
      teamsByUser, can, currentUserId: currentUser?._id,
      setProgressModal, setModal, setAssignModal, setDeleteId, openAdminAction,
    }),
    [teamsByUser, can, currentUser?._id, openAdminAction],
  );

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground">User Management</h1>
          <p className="text-muted-foreground mt-1 tabular-nums">{total} users total</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {can('create:user') && (
            <Button onClick={() => setModal('create')}>+ New User</Button>
          )}
        </div>
      </div>

      {/* ── Search + Filters (FilterBar primitive) ─────── */}
      <FilterBar
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by name, code, email, or department…"
        filters={[
          {
            key: 'role',
            placeholder: 'All Roles',
            options: ROLES,
            value: list.facets.role,
            onChange: (v) => list.setFacet('role', v),
          },
        ]}
      >
        <Button variant="outline" size="sm" onClick={handleExport} title="Export current view as CSV">
          <Download className="size-3.5 mr-1.5" />Export
        </Button>
        <Button variant="outline" size="sm" onClick={reload} aria-label="Refresh">
          <RefreshCw className="size-3.5 mr-1.5" />Refresh
        </Button>
      </FilterBar>

      {/* ── Status chips (primary axis) + active filter chips ── */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusChips
          value={list.status}
          onChange={list.setStatus}
          options={[
            { value: '', label: 'All' },
            ...STATUS_CHIPS.map((s) => ({ value: s, label: s })),
          ]}
        />
        {activeFilterChips.length > 0 && (
          <ActiveFilterChips filters={activeFilterChips} onClearAll={list.clearAll} />
        )}
      </div>

      {/* ── Selection bar (sticky-ish, appears on ≥1 selected) ── */}
      {selectedIds.size > 0 && (
        <SelectionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" type="button">Change status…</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[180px]">
              {STATUSES.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => runBulk('status', s)}>
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" type="button">Change role…</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[180px]">
              {ROLES.map((r) => (
                <DropdownMenuItem key={r} onSelect={() => runBulk('role', r)}>
                  {r}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={handleExport}>Export selected</Button>

          {isAdmin && (
            <Button variant="destructive" size="sm" onClick={requestBulkDelete}>
              Delete
            </Button>
          )}
        </SelectionBar>
      )}

      {/* ── DataTable ───────────────────────────────────── */}
      {/* UX-02: table-fixed locks column widths to the declared `width` on
          each column definition. Without this, table-layout: auto would let
          cells stretch to fit content — so sorting by Code (putting the admin
          with a long email first) would widen the Email column and push the
          Actions column off-screen. */}
      <DataTable
        columns={columns}
        data={users}
        rowKey="_id"
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        onSort={list.setSort}
        selectable
        selected={selectedIds}
        onSelectChange={setSelectedIds}
        isLoading={loading}
        isError={isError}
        error={error}
        onRetry={refetch}
        skeletonRows={8}
        page={list.page}
        totalPages={pages}
        total={total}
        onPageChange={list.setPage}
        tableClassName="table-fixed w-full"
        emptyTitle={list.hasActiveFilters ? 'No users match your filters' : 'No users yet'}
        emptyMessage={list.hasActiveFilters
          ? 'Try clearing filters or adjusting your search.'
          : 'Create your first user with the "+ New User" button.'}
      />

      {/* ── Delete confirm (single-row) ───────────────────── */}
      {deleteId && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm mx-4 text-center space-y-4">
            <h3 className="text-h3 text-foreground">Delete this user?</h3>
            <p className="text-body text-muted-foreground">This action cannot be undone.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={() => handleDelete(deleteId)}>Delete</Button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ── Bulk delete type-confirmation (§D rule 10) ──── */}
      <BulkDeleteConfirm
        open={bulkDeleteOpen}
        count={selectedIds.size}
        entityName="user"
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        isDeleting={bulkDeleting}
      />

      {/* ── UserModal ────────────────────────────────────── */}
      {(modal === 'create' || (modal && modal._id)) && (
        <UserModal
          user={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}

      {/* ── Progress Modal ───────────────────────────────── */}
      {progressModal && (
        <StudentProgressModal
          userId={progressModal.id}
          userName={progressModal.name}
          onClose={() => setProgressModal(null)}
        />
      )}

      {/* ── Org assignment (manager + department) ─────────── */}
      {assignModal && (
        <OrgAssignmentModal
          user={assignModal}
          candidates={users}
          onClose={() => setAssignModal(null)}
        />
      )}

      {/* ── Admin action confirmation ────────────────────── */}
      {adminAction && (
        <AdminActionModal
          action={adminAction}
          password={adminActionPassword}
          error={adminActionError}
          loading={adminActionLoading}
          onPasswordChange={setAdminActionPassword}
          onConfirm={handleAdminAction}
          onCancel={closeAdminAction}
        />
      )}
    </div>
  );
}
