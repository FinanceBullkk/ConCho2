import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldAlert, LogOut, BarChart3, Pencil, Trash2, X, RefreshCw, Download } from 'lucide-react';
import StudentProgressModal from '../components/Progress/StudentProgressModal';
import Portal from '../components/Portal';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { useTeams } from '../hooks/useTeams';
import { qk } from '../hooks/queryKeys';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { authAPI, usersAPI } from '../api/api';
import { createUserSchema, editUserSchema } from '../lib/validations';
import { DataTable } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { StatusBadge } from '../components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';
import { useDebounce } from '../hooks/useDebounce';
import { cn } from '@/lib/utils';

const ROLES    = ['Admin', 'Teacher', 'Participant'];
const STATUSES = ['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class'];
const PAGE_SIZE = 50;

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
        aria-modal="true"
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
  const [modal, setModal]               = useState(null);        // null | 'create' | userObject
  const [deleteId, setDeleteId]         = useState(null);
  const [progressModal, setProgressModal] = useState(null);      // { id, name }
  const [adminAction, setAdminAction]   = useState(null);        // { type, userId, userName }
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminActionError, setAdminActionError]     = useState('');
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [bulkAction, setBulkAction]     = useState('');

  const [searchParams, setSearchParams] = useSearchParams();

  const search       = searchParams.get('search')    || '';
  const filterRole   = searchParams.get('role')      || '';
  const filterStatus = searchParams.get('status')    || '';
  const sortBy       = searchParams.get('sortBy')    || 'lastActive';
  const sortOrder    = searchParams.get('sortOrder') || 'desc';
  const page         = Number(searchParams.get('page') || 1);

  const debouncedSearch = useDebounce(search, 300);

  const setParam = (key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  };

  useEffect(() => { document.title = 'TMS — Users'; }, []);

  const queryParams = useMemo(() => {
    const params = { page, limit: PAGE_SIZE, sortBy, sortOrder };
    if (filterRole)                params.role   = filterRole;
    if (filterStatus)              params.status = filterStatus;
    if (debouncedSearch.trim())    params.search = debouncedSearch.trim();
    return params;
  }, [page, filterRole, filterStatus, debouncedSearch, sortBy, sortOrder]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setParam('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('sortBy', col);
        next.set('sortOrder', 'asc');
        next.delete('page');
        return next;
      }, { replace: true });
    }
  };

  const { data: usersData, isLoading: loading, isError, error, refetch } = useUsers(queryParams);
  const users  = usersData?.data  || [];
  const total  = usersData?.total ?? usersData?.count ?? 0;
  const pages  = usersData?.pages ?? 1;

  // BUG #17: only clear selection on page/role/status change, not on every search keystroke
  useEffect(() => { setSelectedIds(new Set()); }, [page, filterRole, filterStatus]);

  const executeBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const n = ids.length;
    try {
      if (bulkAction === 'delete') {
        if (!window.confirm(`Delete ${n} users? This cannot be undone.`)) return;
        await Promise.all(ids.map((id) => deleteMutation.mutateAsync(id)));
        toast.success(`${n} user${n > 1 ? 's' : ''} deleted`);
      } else if (bulkAction.startsWith('status:')) {
        const status = bulkAction.replace('status:', '');
        await Promise.all(ids.map((id) => updateMutation.mutateAsync({ id, data: { status } })));
        toast.success(`${n} user${n > 1 ? 's' : ''} set to ${status}`);
      } else if (bulkAction.startsWith('role:')) {
        const role = bulkAction.replace('role:', '');
        await Promise.all(ids.map((id) => updateMutation.mutateAsync({ id, data: { role } })));
        toast.success(`${n} user${n > 1 ? 's' : ''} set to ${role}`);
      } else if (bulkAction === 'export') {
        const selected = users.filter((u) => selectedIds.has(u._id));
        downloadCSV(selected);
        toast.success(`Exported ${selected.length} user${selected.length > 1 ? 's' : ''}`);
      } else if (bulkAction === 'invite') {
        await Promise.all(ids.map((id) => usersAPI.sendInvite?.(id)));
        toast.success(`Invite queued for ${n} user${n > 1 ? 's' : ''}`);
      }
      setSelectedIds(new Set());
      setBulkAction('');
    } catch {
      toast.error('Bulk action failed — some updates may not have applied');
    }
  };

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

  // ── DataTable column definitions ────────────────────────
  const columns = useMemo(() => [
    {
      key: 'empCode', header: 'Code', sortable: true,
      render: (u) => <span className="font-mono text-primary font-medium text-xs">{u.empCode}</span>,
    },
    {
      key: 'name', header: 'Name', sortable: true,
      render: (u) => (
        <div>
          <button
            onClick={() => setProgressModal({ id: u._id, name: u.name })}
            className="font-medium text-foreground text-sm hover:text-info hover:underline transition-colors text-left"
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
      key: 'email', header: 'Email', sortable: true,
      render: (u) => u.email
        ? <span className="font-mono text-xs text-muted-foreground">{u.email}</span>
        : <span className="text-warning/70 text-xs" title="No email set — won't receive Calendar invites">—</span>,
    },
    {
      key: 'department', header: 'BU', sortable: true,
      render: (u) => <span className="text-muted-foreground text-xs">{u.department || '—'}</span>,
    },
    {
      key: 'position', header: 'Position', sortable: true,
      render: (u) => <span className="text-muted-foreground text-xs">{u.position || '—'}</span>,
    },
    {
      key: 'currentLevel', header: 'Level', sortable: true,
      render: (u) => (u.entranceLevel || u.currentLevel) ? (
        <div>
          {u.currentLevel && <div className="text-xs font-medium text-foreground">{u.currentLevel}</div>}
          {u.entranceLevel && u.entranceLevel !== u.currentLevel && (
            <div className="text-[10px] text-subtle-foreground">from {u.entranceLevel}</div>
          )}
        </div>
      ) : <span className="text-xs text-subtle-foreground">—</span>,
    },
    {
      key: 'status', header: 'Status', sortable: true,
      render: (u) => (
        <div>
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
      key: '_team', header: 'Team / Class',
      render: (u) => teamsByUser[u._id] ? (
        <div>
          <div className="text-xs font-medium text-foreground">{teamsByUser[u._id].teamName}</div>
          {teamsByUser[u._id].classCode && (
            <div className="text-[10px] text-subtle-foreground">
              {teamsByUser[u._id].classCode} — {teamsByUser[u._id].courseName}
            </div>
          )}
        </div>
      ) : <span className="text-xs text-subtle-foreground italic">—</span>,
    },
    {
      key: 'lastActive', header: 'Last Active',
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
      key: '_actions', header: 'Actions',
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
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground">User Management</h1>
          <p className="text-muted-foreground mt-1">{total} users total</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(users)} title="Export current view as CSV">
            <Download className="size-3.5 mr-1.5" />CSV
          </Button>
          {can('create:user') && (
            <Button onClick={() => setModal('create')}>+ New User</Button>
          )}
        </div>
      </div>

      {/* ── Search + Filters ────────────────────────────── */}
      <FilterBar
        search={search}
        onSearch={(v) => setParam('search', v)}
        searchPlaceholder="Search by name, code, or department…"
        filters={[
          {
            key: 'role',
            placeholder: 'All Roles',
            options: ROLES,
            value: filterRole,
            onChange: (v) => setParam('role', v),
          },
          {
            key: 'status',
            placeholder: 'All Statuses',
            options: STATUSES,
            value: filterStatus,
            onChange: (v) => setParam('status', v),
          },
        ]}
      >
        <Button variant="outline" size="sm" onClick={reload} aria-label="Refresh">
          <RefreshCw className="size-3.5 mr-1.5" />Refresh
        </Button>
      </FilterBar>

      {/* ── Bulk action toolbar ──────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-md bg-primary/10 border border-primary/20">
          <span className="text-sm text-primary font-medium">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            aria-label="Bulk action"
            className="px-3 h-8 rounded-md bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Choose action…</option>
            <option value="status:Active">Set Active</option>
            <option value="status:Inactive">Set Inactive</option>
            <option value="status:On-hold">Set On-hold</option>
            <option value="role:Admin">Set Role → Admin</option>
            <option value="role:Teacher">Set Role → Teacher</option>
            <option value="role:Participant">Set Role → Participant</option>
            <option value="export">Export selected (CSV)</option>
            <option value="invite">Send invite email</option>
            {isAdmin && <option value="delete">Delete selected</option>}
          </select>
          <Button size="sm" disabled={!bulkAction} onClick={executeBulkAction}>Apply</Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => setSelectedIds(new Set())}
            aria-label="Clear selection"
            className="text-muted-foreground"
          ><X className="size-3.5" /></Button>
        </div>
      )}

      {/* ── DataTable ───────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={users}
        rowKey="_id"
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        selectable
        selected={selectedIds}
        onSelectChange={setSelectedIds}
        isLoading={loading}
        isError={isError}
        error={error}
        onRetry={refetch}
        skeletonRows={8}
        page={page}
        totalPages={pages}
        total={total}
        onPageChange={(p) => setParam('page', p > 1 ? String(p) : '')}
        emptyTitle="No users found"
        emptyMessage="Try adjusting your search or filters."
      />

      {/* ── Delete confirm ───────────────────────────────── */}
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
