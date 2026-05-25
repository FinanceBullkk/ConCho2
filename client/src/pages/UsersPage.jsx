import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldAlert, LogOut, BarChart3, Pencil, Trash2, RefreshCw, Download } from 'lucide-react';
import StudentProgressModal from '../components/Progress/StudentProgressModal';
import Portal from '../components/Portal';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { useTeams } from '../hooks/useTeams';
import { qk } from '../hooks/queryKeys';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { useListUrlState } from '../hooks/useListUrlState';
import { authAPI } from '../api/api';
import { createUserSchema, editUserSchema } from '../lib/validations';
import { DataTable } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { StatusBadge } from '../components/StatusBadge';
import { StatusChips } from '../components/StatusChips';
import { ActiveFilterChips } from '../components/ActiveFilterChips';
import { SelectionBar } from '../components/SelectionBar';
import { BulkDeleteConfirm } from '../components/BulkDeleteConfirm';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '../components/Spinner';
import { cn } from '@/lib/utils';

// Per Screen 5 §E (Users variant):
//   facets: status · role · BU · level    bulk: change status · change role · export · delete
const ROLES         = ['Admin', 'Teacher', 'Participant'];
const STATUSES      = ['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class'];
const STATUS_CHIPS  = ['Active', 'Inactive', 'On-hold'];   // primary axis per design
const PAGE_SIZE     = 50;
const BULK_TYPE_CONFIRM_THRESHOLD = 5;   // §D rule 10

// ── Shared input class for UserModal ──────────────────────
const INPUT_CLS =
  'w-full px-3 h-(--control-h) rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40 transition-colors duration-(--dur-fast)';

// ── UserModal ─────────────────────────────────────────────

function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user?._id;
  const { user: currentUser } = useAuth();
  const isSelf = isEdit && user?._id === currentUser?._id;
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const saving = createMutation.isPending || updateMutation.isPending;

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(isEdit ? editUserSchema : createUserSchema),
    defaultValues: {
      empCode:         user?.empCode || '',
      name:            user?.name || '',
      email:           user?.email || '',
      role:            user?.role || 'Participant',
      department:      user?.department || '',
      position:        user?.position || '',
      status:          user?.status || 'Active',
      dropReason:      user?.dropReason || '',
      password:        '',
      currentPassword: '',
    },
  });

  const watchedPassword = watch('password');
  const watchedRole     = watch('role');
  const currentStatus   = watch('status');

  const needsReauth = isEdit && !isSelf && (
    !!watchedPassword || watchedRole !== (user?.role || 'Participant')
  );

  const onSubmit = handleSubmit(async (data) => {
    try {
      const payload = { ...data };
      if (isEdit && !payload.password)        delete payload.password;
      if (!payload.email)                     delete payload.email;
      if (!payload.currentPassword)           delete payload.currentPassword;
      if (isEdit) await updateMutation.mutateAsync({ id: user._id, data: payload });
      else        await createMutation.mutateAsync(payload);
      onSaved();
    } catch (err) {
      const serverMsg = err.response?.data?.message || 'Save failed';
      if (err.response?.data?.requiresReauth) {
        setError('currentPassword', { message: 'Enter your admin password to confirm this change' });
      } else {
        setError('root', { message: serverMsg });
      }
    }
  });

  const SELECT_CLS =
    'w-full px-3 h-(--control-h) rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors duration-(--dur-fast)';

  return (
    <Portal>
    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()} noValidate
        className="bg-card border border-border rounded-lg w-full max-w-md flex flex-col max-h-[92vh]"
        aria-label={isEdit ? 'Edit user' : 'Create user'}
      >
        {/* ── Sticky header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <h2 className="text-h3 text-foreground">{isEdit ? 'Edit User' : 'Create User'}</h2>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {errors.root && (
            <div role="alert" className="px-3 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">
              {errors.root.message}
            </div>
          )}

          {[
            { name: 'empCode',  label: 'Employee Code',                           type: 'text',     placeholder: 'e.g. 000123',           disabled: isEdit },
            { name: 'name',     label: 'Full Name',                                type: 'text',     placeholder: 'Full name' },
            { name: 'email',    label: 'Email (Workspace)',                        type: 'email',    placeholder: 'name@yourdomain.com',   help: 'Required for Google Calendar invites' },
            { name: 'department', label: 'BU / Department',                       type: 'text',     placeholder: 'e.g. Sales, HR' },
            { name: 'position', label: 'Position',                                 type: 'text',     placeholder: 'e.g. DEV, QC, Designer' },
            { name: 'password', label: isEdit ? 'New Password (leave blank to keep)' : 'Password', type: 'password', placeholder: '••••••••' },
          ].map(({ name, label, type, placeholder, disabled, help }) => (
            <div key={name}>
              <label htmlFor={name} className="block text-small text-muted-foreground mb-1.5">{label}</label>
              <input
                id={name}
                type={type}
                placeholder={placeholder}
                disabled={disabled}
                aria-invalid={!!errors[name]}
                aria-describedby={errors[name] ? `${name}-error` : undefined}
                className={cn(INPUT_CLS, errors[name] ? 'border-destructive' : 'border-input')}
                {...register(name)}
              />
              {errors[name] && (
                <p id={`${name}-error`} role="alert" className="mt-1 text-xs text-destructive">{errors[name].message}</p>
              )}
              {help && !errors[name] && <p className="text-[11px] text-subtle-foreground mt-1">{help}</p>}
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="role" className="block text-small text-muted-foreground mb-1.5">Role</label>
              <select id="role" className={SELECT_CLS} {...register('role')}>
                {ROLES.map((r) => <option key={r} value={r} className="bg-popover">{r}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="status" className="block text-small text-muted-foreground mb-1.5">Status</label>
              <select id="status" className={SELECT_CLS} {...register('status')}>
                {STATUSES.map((s) => <option key={s} value={s} className="bg-popover">{s}</option>)}
              </select>
            </div>
          </div>

          {/* Re-auth confirmation */}
          {needsReauth && (
            <div className="rounded-md border border-warning/30 bg-warning-tint p-3 space-y-2">
              <p className="text-xs text-warning flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                </svg>
                Confirm your identity to change another user&apos;s password or role
              </p>
              <div>
                <label htmlFor="currentPassword" className="block text-small text-muted-foreground mb-1.5">Your admin password</label>
                <input
                  id="currentPassword"
                  type="password"
                  placeholder="Enter your own password"
                  aria-invalid={!!errors.currentPassword}
                  className={cn(INPUT_CLS, errors.currentPassword ? 'border-warning' : 'border-warning/40')}
                  {...register('currentPassword')}
                />
                {errors.currentPassword && (
                  <p role="alert" className="mt-1 text-xs text-warning">{errors.currentPassword.message}</p>
                )}
              </div>
            </div>
          )}

          {/* Drop Reason */}
          {['Dropped', 'Inactive', 'Transferred'].includes(currentStatus) && (
            <div>
              <label htmlFor="dropReason" className="block text-small text-muted-foreground mb-1.5">Drop / Leave Reason</label>
              <input
                id="dropReason"
                type="text"
                placeholder="e.g. High workload, Learning goal achieved"
                className={cn(INPUT_CLS, 'border-input')}
                {...register('dropReason')}
              />
            </div>
          )}
        </div>

        {/* ── Sticky footer ── */}
        <div className="px-6 pb-6 pt-4 border-t border-border shrink-0 flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? <><Spinner size={14} />Saving…</> : isEdit ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </div>
    </Portal>
  );
}

// ── Main page ─────────────────────────────────────────────

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
  const [adminAction, setAdminAction]   = useState(null);        // { type, userId, userName }
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

  const handleAdminAction = async () => {
    if (!adminAction) return;
    setAdminActionLoading(true);
    setAdminActionError('');
    try {
      if (adminAction.type === 'force-logout') await authAPI.adminForceLogout(adminAction.userId);
      else if (adminAction.type === 'reset-mfa') await authAPI.mfaAdminDisable(adminAction.userId);
      reload();
      setAdminAction(null);
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

  // ── DataTable column definitions ────────────────────────
  const columns = useMemo(() => [
    {
      key: 'empCode', header: 'Code', sortable: true, width: 90,
      render: (u) => <span className="font-mono text-primary font-medium text-xs">{u.empCode}</span>,
    },
    {
      // UX-02: cap name width so very long Vietnamese names don't widen the
      // whole row when sort puts them at the top.
      key: 'name', header: 'Name', sortable: true, width: 220,
      render: (u) => (
        <div className="min-w-0">
          <button
            onClick={() => setProgressModal({ id: u._id, name: u.name })}
            className="font-medium text-foreground text-sm hover:text-info hover:underline transition-colors text-left truncate max-w-full"
            title={u.name}
          >
            {u.name}
          </button>
          {u.role !== 'Participant' && (
            <StatusBadge status={u.role} size="sm" className="ml-2" />
          )}
        </div>
      ),
    },
    {
      // UX-02: cap email column width to keep table layout stable when sort
      // brings users with long emails to the top — otherwise the email cell
      // expanded and pushed the ACTIONS column off-screen.
      key: 'email', header: 'Email', sortable: true, width: 200,
      render: (u) => u.email
        ? <span className="font-mono text-xs text-muted-foreground block truncate max-w-[180px]" title={u.email}>{u.email}</span>
        : <span className="text-warning/70 text-xs" title="No email set — won't receive Calendar invites">—</span>,
    },
    {
      key: 'department', header: 'BU', sortable: true, width: 110,
      render: (u) => <span className="text-muted-foreground text-xs truncate block max-w-full" title={u.department}>{u.department || '—'}</span>,
    },
    {
      key: 'position', header: 'Position', sortable: true, width: 110,
      render: (u) => <span className="text-muted-foreground text-xs truncate block max-w-full" title={u.position}>{u.position || '—'}</span>,
    },
    {
      key: 'currentLevel', header: 'Level', sortable: true, width: 130,
      render: (u) => (u.entranceLevel || u.currentLevel) ? (
        <div className="min-w-0">
          {u.currentLevel && <div className="text-xs font-medium text-foreground truncate" title={u.currentLevel}>{u.currentLevel}</div>}
          {u.entranceLevel && u.entranceLevel !== u.currentLevel && (
            <div className="text-[10px] text-subtle-foreground truncate" title={`from ${u.entranceLevel}`}>from {u.entranceLevel}</div>
          )}
        </div>
      ) : <span className="text-xs text-subtle-foreground">—</span>,
    },
    {
      key: 'status', header: 'Status', sortable: true, width: 130,
      render: (u) => (
        <div className="min-w-0">
          <StatusBadge status={u.status} size="sm" />
          {u.dropReason && (
            <div className="text-[10px] text-subtle-foreground mt-0.5 truncate max-w-[120px]" title={u.dropReason}>
              {u.dropReason}
            </div>
          )}
        </div>
      ),
    },
    {
      key: '_team', header: 'Team / Class', width: 170,
      render: (u) => teamsByUser[u._id] ? (
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground truncate" title={teamsByUser[u._id].teamName}>{teamsByUser[u._id].teamName}</div>
          {teamsByUser[u._id].classCode && (
            <div className="text-[10px] text-subtle-foreground truncate" title={`${teamsByUser[u._id].classCode} — ${teamsByUser[u._id].courseName}`}>
              {teamsByUser[u._id].classCode} — {teamsByUser[u._id].courseName}
            </div>
          )}
        </div>
      ) : <span className="text-xs text-subtle-foreground italic">—</span>,
    },
    {
      key: 'lastActive', header: 'Last Active', width: 100,
      render: (u) => u.lastActive ? (
        <div>
          <div className="text-xs text-foreground">
            {new Date(u.lastActive).toLocaleDateString('en', { day: '2-digit', month: 'short' })}
          </div>
          <div className={cn('text-[10px] font-semibold tabular-nums', u.daysSince > 30 ? 'text-destructive' : u.daysSince > 14 ? 'text-warning' : 'text-subtle-foreground')}>
            {u.daysSince}d ago{u.daysSince > 30 ? ' !' : ''}
          </div>
        </div>
      ) : <span className="text-xs text-subtle-foreground">—</span>,
    },
    {
      key: '_actions', header: 'Actions', width: 170,
      render: (u) => (
        <div className="flex gap-1 flex-wrap">
          <Button
            size="sm" variant="ghost"
            onClick={() => setProgressModal({ id: u._id, name: u.name })}
            title="View Progress"
            className="h-7 px-2 text-muted-foreground hover:text-info hover:bg-info/10"
          >
            <BarChart3 className="size-3.5" aria-hidden="true" />
          </Button>
          {can('update:user') && (
            <Button
              size="sm" variant="ghost"
              onClick={() => setModal(u)}
              title="Edit user"
              className="h-7 px-2 text-muted-foreground hover:text-primary hover:bg-primary/10"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          {can('delete:user') && (
            <Button
              size="sm" variant="ghost"
              onClick={() => setDeleteId(u._id)}
              title="Delete user"
              className="h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          {u._id !== currentUser?._id && (
            <>
              {can('force-logout:user') && (
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setAdminAction({ type: 'force-logout', userId: u._id, userName: u.name })}
                  title="Force logout — invalidate all active sessions"
                  className="h-7 px-2 text-muted-foreground hover:text-warning hover:bg-warning/10"
                >
                  <LogOut className="size-3.5" aria-hidden="true" />
                </Button>
              )}
              {u.mfaEnabled && can('disable-mfa:user') && (
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setAdminAction({ type: 'reset-mfa', userId: u._id, userName: u.name })}
                  title="Disable MFA — user can log in without 2FA until re-enrolled"
                  className="h-7 px-2 text-muted-foreground hover:text-warning hover:bg-warning/10"
                >
                  <ShieldAlert className="size-3.5" aria-hidden="true" />
                </Button>
              )}
            </>
          )}
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [teamsByUser, can, currentUser?._id]);

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

      {/* ── Admin action confirmation ────────────────────── */}
      {adminAction && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm mx-4 space-y-4">
            <div className="flex items-center justify-center size-10 mx-auto rounded-md bg-warning-tint">
              {adminAction.type === 'force-logout'
                ? <LogOut className="size-5 text-warning" aria-hidden="true" />
                : <ShieldAlert className="size-5 text-warning" aria-hidden="true" />
              }
            </div>
            <h3 className="text-h3 text-foreground text-center">
              {adminAction.type === 'force-logout' ? 'Force Logout' : 'Disable MFA'}
            </h3>
            <p className="text-body text-muted-foreground text-center">
              {adminAction.type === 'force-logout'
                ? <>Invalidate all active sessions for <span className="text-foreground font-medium">{adminAction.userName}</span>? They will need to log in again immediately.</>
                : <>Disable 2FA for <span className="text-foreground font-medium">{adminAction.userName}</span>? They can log in without a code until they re-enroll.</>
              }
            </p>
            {adminActionError && (
              <div className="px-3 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm text-center">
                {adminActionError}
              </div>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline" className="flex-1"
                onClick={() => { setAdminAction(null); setAdminActionError(''); }}
                disabled={adminActionLoading}
              >Cancel</Button>
              <Button
                variant="default" className="flex-1 bg-warning text-warning-foreground hover:bg-warning/90"
                onClick={handleAdminAction}
                disabled={adminActionLoading}
              >
                {adminActionLoading ? <><Spinner size={14} />Processing…</> : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
