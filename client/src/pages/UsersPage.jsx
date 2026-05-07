import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import StudentProgressModal from '../components/Progress/StudentProgressModal';
import Portal from '../components/Portal';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { useTeams } from '../hooks/useTeams';
import { qk } from '../hooks/queryKeys';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/api';
import { createUserSchema, editUserSchema } from '../lib/validations';
import QueryError from '../components/QueryError';
import TableSkeleton from '../components/TableSkeleton';
import Pagination from '../components/Pagination';

const ROLES = ['Admin', 'Teacher', 'Participant'];
const STATUSES = ['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class'];

function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user?._id;
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
      empCode: user?.empCode || '',
      name: user?.name || '',
      email: user?.email || '',
      role: user?.role || 'Participant',
      department: user?.department || '',
      position: user?.position || '',
      status: user?.status || 'Active',
      dropReason: user?.dropReason || '',
      password: '',
    },
  });

  const currentStatus = watch('status'); // eslint-disable-line react-hooks/incompatible-library

  const onSubmit = handleSubmit(async (data) => {
    try {
      const payload = { ...data };
      // Drop blank optional fields — avoids overwriting stored values with ""
      if (isEdit && !payload.password) delete payload.password;
      if (!payload.email) delete payload.email;
      if (isEdit) await updateMutation.mutateAsync({ id: user._id, data: payload });
      else await createMutation.mutateAsync(payload);
      onSaved();
    } catch (err) {
      setError('root', { message: err.response?.data?.message || 'Save failed' });
    }
  });

  const inputCls = 'w-full px-4 py-2.5 rounded-xl bg-white/5 border text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-40 transition-all';

  return (
    <Portal>
    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()} noValidate
        className="glass rounded-2xl p-6 w-full max-w-md mx-4 space-y-4 animate-fade-in">
        <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit User' : 'Create User'}</h2>

        {errors.root && (
          <div role="alert" className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {errors.root.message}
          </div>
        )}

        {[
          { name: 'empCode', label: 'Employee Code', type: 'text', placeholder: 'e.g. 000123', disabled: isEdit },
          { name: 'name', label: 'Full Name', type: 'text', placeholder: 'Full name' },
          { name: 'email', label: 'Email (Workspace)', type: 'email', placeholder: 'name@yourdomain.com', help: 'Required for Google Calendar invites' },
          { name: 'department', label: 'BU / Department', type: 'text', placeholder: 'e.g. Sales, HR' },
          { name: 'position', label: 'Position', type: 'text', placeholder: 'e.g. DEV, QC, Designer' },
          { name: 'password', label: isEdit ? 'New Password (leave blank to keep)' : 'Password', type: 'password', placeholder: '••••••••' },
        ].map(({ name, label, type, placeholder, disabled, help }) => (
          <div key={name}>
            <label htmlFor={name} className="block text-sm text-slate-300 mb-1">{label}</label>
            <input
              id={name}
              type={type}
              placeholder={placeholder}
              disabled={disabled}
              aria-invalid={!!errors[name]}
              aria-describedby={errors[name] ? `${name}-error` : undefined}
              className={`${inputCls} ${errors[name] ? 'border-red-500/50' : 'border-white/10'}`}
              {...register(name)}
            />
            {errors[name] && (
              <p id={`${name}-error`} role="alert" className="mt-1 text-xs text-red-400">
                {errors[name].message}
              </p>
            )}
            {help && !errors[name] && <p className="text-[11px] text-slate-500 mt-1">{help}</p>}
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="role" className="block text-sm text-slate-300 mb-1">Role</label>
            <select
              id="role"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
              {...register('role')}
            >
              {ROLES.map((r) => <option key={r} value={r} className="bg-slate-800">{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="block text-sm text-slate-300 mb-1">Status</label>
            <select
              id="status"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
              {...register('status')}
            >
              {STATUSES.map((s) => <option key={s} value={s} className="bg-slate-800">{s}</option>)}
            </select>
          </div>
        </div>

        {/* Drop Reason — only show when status is Dropped/Inactive/Transferred */}
        {['Dropped', 'Inactive', 'Transferred'].includes(currentStatus) && (
          <div>
            <label htmlFor="dropReason" className="block text-sm text-slate-300 mb-1">Drop/Leave Reason</label>
            <input
              id="dropReason"
              type="text"
              placeholder="e.g. High workload, Learning goal achieved"
              className={`${inputCls} border-white/10`}
              {...register('dropReason')}
            />
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
    </Portal>
  );
}

const STATUS_BADGE = {
  Active: 'bg-emerald-500/15 text-emerald-400',
  Inactive: 'bg-slate-500/15 text-slate-400',
  Dropped: 'bg-red-500/15 text-red-400',
  Transferred: 'bg-amber-500/15 text-amber-400',
  'On-hold': 'bg-slate-500/15 text-slate-400',
  'Waiting for class': 'bg-blue-500/15 text-blue-400',
};
const ROLE_BADGE = {
  Admin: 'bg-primary-500/15 text-primary-300',
  Teacher: 'bg-purple-500/15 text-purple-300',
  Participant: 'bg-teal-500/15 text-teal-300',
};

const PAGE_SIZE = 50;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser, isAdmin } = useAuth();
  const deleteMutation = useDeleteUser();
  const [modal, setModal] = useState(null); // null | 'create' | userObject
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [page, setPage] = useState(1);
  const [progressModal, setProgressModal] = useState(null); // { id, name }
  const [sortBy, setSortBy] = useState('empCode');
  const [sortOrder, setSortOrder] = useState('asc');
  // Admin actions: force-logout and MFA reset
  const [adminAction, setAdminAction] = useState(null); // { type: 'force-logout'|'reset-mfa', userId, userName }
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminActionError, setAdminActionError] = useState('');

  // UX-06: Browser tab title
  useEffect(() => { document.title = 'TMS — Users'; }, []);

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const queryParams = useMemo(() => {
    const params = { page, limit: PAGE_SIZE, sortBy, sortOrder };
    if (filterRole) params.role = filterRole;
    if (filterStatus) params.status = filterStatus;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    return params;
  }, [page, filterRole, filterStatus, debouncedSearch, sortBy, sortOrder]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <span className="text-slate-600 ml-0.5">↕</span>;
    return <span className="text-primary-400 ml-0.5">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  const { data: usersData, isLoading: loading, isError, error, refetch } = useUsers(queryParams);
  const users = usersData?.data || [];
  const total = usersData?.total ?? usersData?.count ?? 0;
  const pages = usersData?.pages ?? 1;

  // Load team assignments for all users
  const { data: allTeams = [] } = useTeams();
  const teamsByUser = useMemo(() => {
    const map = {};
    for (const t of allTeams) {
      const cls = t.classId;
      const info = {
        teamName: t.name,
        classCode: cls?.classCode || '',
        courseName: cls?.courseName || '',
      };
      if (t.members) {
        t.members.forEach(m => {
          const uid = m._id || m;
          map[uid] = info;
        });
      }
      if (t.leaderId) {
        const lid = t.leaderId._id || t.leaderId;
        map[lid] = info;
      }
    }
    return map;
  }, [allTeams]);

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: qk.users.all });
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
      if (adminAction.type === 'force-logout') {
        await authAPI.adminForceLogout(adminAction.userId);
      } else if (adminAction.type === 'reset-mfa') {
        await authAPI.mfaAdminDisable(adminAction.userId);
      }
      reload();
      setAdminAction(null);
    } catch (err) {
      setAdminActionError(err.response?.data?.message || 'Action failed. Please try again.');
    } finally {
      setAdminActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">👤 User Management</h1>
          <p className="text-slate-400 mt-1">{total} users total</p>
        </div>
        <button onClick={() => setModal('create')}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all shadow-lg shadow-primary-500/20 self-start">
          + New User
        </button>
      </div>

      {/* Search + Filters */}
      <div className="glass rounded-2xl px-5 py-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Search by name, code, or department..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
          />
        </div>
        <select value={filterRole} onChange={(e) => { setPage(1); setFilterRole(e.target.value); }}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50">
          <option value="" className="bg-slate-800">All Roles</option>
          {ROLES.map((r) => <option key={r} value={r} className="bg-slate-800">{r}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => { setPage(1); setFilterStatus(e.target.value); }}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50">
          <option value="" className="bg-slate-800">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s} className="bg-slate-800">{s}</option>)}
        </select>
        <button onClick={reload} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 transition-all">↻ Refresh</button>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6"><TableSkeleton rows={8} cols={6} /></div>
        ) : isError ? (
          <QueryError error={error} onRetry={refetch} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-white/5">
              <tr className="text-left text-slate-400 text-xs uppercase tracking-wider">
                {[
                  { key: 'empCode', label: 'Code' },
                  { key: 'name', label: 'Name' },
                  { key: 'email', label: 'Email' },
                  { key: 'department', label: 'BU' },
                  { key: 'position', label: 'Position' },
                  { key: 'currentLevel', label: 'Level' },
                  { key: 'status', label: 'Status' },
                  { key: null, label: 'Team / Class' },
                  { key: null, label: 'Last Active' },
                  { key: null, label: 'Actions' },
                ].map((h) => (
                  <th key={h.label} className={`px-4 py-3 font-medium ${h.key ? 'cursor-pointer hover:text-white select-none transition-colors' : ''}`}
                    onClick={h.key ? () => handleSort(h.key) : undefined}>
                    {h.label}{h.key && <SortIcon col={h.key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 stagger">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3 font-mono text-primary-300 font-medium text-xs">{u.empCode}</td>
                  <td className="px-4 py-3 text-white font-medium">
                    <button onClick={() => setProgressModal({ id: u._id, name: u.name })} className="hover:text-teal-400 hover:underline transition-colors text-left text-sm">
                      {u.name}
                    </button>
                    {u.role !== 'Participant' && (
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${ROLE_BADGE[u.role]}`}>{u.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {u.email ? (
                      <span className="font-mono">{u.email}</span>
                    ) : (
                      <span className="text-amber-400/70" title="No email set — user won't receive Google Calendar invites">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{u.department || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{u.position || '—'}</td>
                  <td className="px-4 py-3">
                    {(u.entranceLevel || u.currentLevel) ? (
                      <div>
                        {u.currentLevel && <div className="text-xs text-white font-medium">{u.currentLevel}</div>}
                        {u.entranceLevel && u.entranceLevel !== u.currentLevel && (
                          <div className="text-[10px] text-slate-500">from {u.entranceLevel}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-medium ${STATUS_BADGE[u.status]}`}>{u.status}</span>
                    {u.dropReason && (
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[120px]" title={u.dropReason}>{u.dropReason}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {teamsByUser[u._id] ? (
                      <div>
                        <div className="text-xs text-white font-medium">{teamsByUser[u._id].teamName}</div>
                        {teamsByUser[u._id].classCode && (
                          <div className="text-[10px] text-slate-500">
                            {teamsByUser[u._id].classCode} — {teamsByUser[u._id].courseName}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600 italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.lastActive ? (
                      <div>
                        <div className="text-xs text-slate-300">{new Date(u.lastActive).toLocaleDateString('en', { day: '2-digit', month: 'short' })}</div>
                        <div className={`text-[10px] font-semibold ${
                          u.daysSince > 30 ? 'text-red-400' : u.daysSince > 14 ? 'text-amber-400' : 'text-slate-500'
                        }`}>
                          {u.daysSince}d ago {u.daysSince > 30 ? '⚠️' : ''}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => setProgressModal({ id: u._id, name: u.name })}
                        className="px-2 py-1 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-teal-500/20 hover:text-teal-300 transition-all" title="View Progress">📊</button>
                      <button onClick={() => setModal(u)}
                        className="px-2 py-1 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-primary-500/20 hover:text-primary-300 transition-all" title="Edit user">✏️</button>
                      <button onClick={() => setDeleteId(u._id)}
                        className="px-2 py-1 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-red-500/20 hover:text-red-400 transition-all" title="Delete user">🗑</button>
                      {/* Admin-only actions — hidden for the current user's own row */}
                      {isAdmin && u._id !== currentUser?._id && (
                        <>
                          <button
                            onClick={() => setAdminAction({ type: 'force-logout', userId: u._id, userName: u.name })}
                            className="px-2 py-1 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-amber-500/20 hover:text-amber-300 transition-all"
                            title="Force logout — invalidate all active sessions">
                            🔒
                          </button>
                          {u.mfaEnabled && (
                            <button
                              onClick={() => setAdminAction({ type: 'reset-mfa', userId: u._id, userName: u.name })}
                              className="px-2 py-1 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-orange-500/20 hover:text-orange-300 transition-all"
                              title="Disable MFA — user can log in without 2FA until they re-enroll">
                              🛡️
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && users.length === 0 && (
          <div className="py-16 text-center text-slate-500">No users found</div>
        )}
      </div>

      {/* Pager */}
      {!loading && !isError && total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>Page {page} of {pages} · {total} total</span>
          <Pagination page={page} totalPages={pages} onPageChange={setPage} isLoading={loading} />
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4 animate-fade-in">
            <div className="text-3xl">🗑️</div>
            <h3 className="text-lg font-bold text-white">Delete this user?</h3>
            <p className="text-slate-400 text-sm">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30 transition-all font-semibold">Delete</button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {(modal === 'create' || (modal && modal._id)) && (
        <UserModal user={modal === 'create' ? null : modal} onClose={() => setModal(null)} onSaved={() => setModal(null)} />
      )}

      {progressModal && (
        <StudentProgressModal
          userId={progressModal.id}
          userName={progressModal.name}
          onClose={() => setProgressModal(null)}
        />
      )}

      {/* Admin action confirmation modal */}
      {adminAction && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="glass rounded-2xl p-6 max-w-sm mx-4 space-y-4 animate-fade-in">
              <div className="text-3xl text-center">
                {adminAction.type === 'force-logout' ? '🔒' : '🛡️'}
              </div>
              <h3 className="text-lg font-bold text-white text-center">
                {adminAction.type === 'force-logout' ? 'Force Logout' : 'Disable MFA'}
              </h3>
              <p className="text-slate-400 text-sm text-center">
                {adminAction.type === 'force-logout'
                  ? <>Invalidate all active sessions for <span className="text-white font-medium">{adminAction.userName}</span>? They will need to log in again immediately.</>
                  : <>Disable 2FA for <span className="text-white font-medium">{adminAction.userName}</span>? They will be able to log in without a code until they re-enroll.</>
                }
              </p>
              {adminActionError && (
                <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                  {adminActionError}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setAdminAction(null); setAdminActionError(''); }}
                  disabled={adminActionLoading}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all disabled:opacity-50">
                  Cancel
                </button>
                <button
                  onClick={handleAdminAction}
                  disabled={adminActionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-all font-semibold disabled:opacity-50">
                  {adminActionLoading ? 'Processing…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
