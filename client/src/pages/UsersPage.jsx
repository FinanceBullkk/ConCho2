import { useState, useEffect, useRef } from 'react';
import { usersAPI } from '../api/api';
import StudentProgressModal from '../components/Progress/StudentProgressModal';

const ROLES = ['Admin', 'Teacher', 'Participant'];
const STATUSES = ['Active', 'Dropped', 'Transferred', 'On-hold'];

function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user?._id;
  const [form, setForm] = useState({
    empCode: user?.empCode || '',
    name: user?.name || '',
    role: user?.role || 'Participant',
    department: user?.department || '',
    status: user?.status || 'Active',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      if (isEdit && !payload.password) delete payload.password;
      if (isEdit) await usersAPI.update(user._id, payload);
      else await usersAPI.create(payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-md mx-4 space-y-4 animate-fade-in">
        <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit User' : 'Create User'}</h2>
        {error && <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        {[
          { key: 'empCode', label: 'Employee Code', type: 'text', placeholder: 'e.g. PART007', disabled: isEdit },
          { key: 'name', label: 'Full Name', type: 'text', placeholder: 'Full name' },
          { key: 'department', label: 'Department', type: 'text', placeholder: 'e.g. Sales' },
          { key: 'password', label: isEdit ? 'New Password (leave blank to keep)' : 'Password', type: 'password', placeholder: '••••••••' },
        ].map(({ key, label, type, placeholder, disabled }) => (
          <div key={key}>
            <label className="block text-sm text-slate-300 mb-1">{label}</label>
            <input type={type} value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder}
              disabled={disabled} required={key === 'empCode' || key === 'name' || (!isEdit && key === 'password')}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-40 transition-all" />
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Role</label>
            <select value={form.role} onChange={(e) => set('role', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
              {ROLES.map((r) => <option key={r} value={r} className="bg-slate-800">{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Status</label>
            <select value={form.status} onChange={(e) => set('status', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
              {STATUSES.map((s) => <option key={s} value={s} className="bg-slate-800">{s}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

const STATUS_BADGE = {
  Active: 'bg-emerald-500/15 text-emerald-400',
  Dropped: 'bg-red-500/15 text-red-400',
  Transferred: 'bg-amber-500/15 text-amber-400',
  'On-hold': 'bg-slate-500/15 text-slate-400',
};
const ROLE_BADGE = {
  Admin: 'bg-primary-500/15 text-primary-300',
  Teacher: 'bg-purple-500/15 text-purple-300',
  Participant: 'bg-teal-500/15 text-teal-300',
};

const PAGE_SIZE = 50;

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | userObject
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [progressModal, setProgressModal] = useState(null); // { id, name }

  // UX-06: Browser tab title
  useEffect(() => { document.title = 'TMS — Users'; }, []);

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = () => {
    setLoading(true);
    const params = { page, limit: PAGE_SIZE };
    if (filterRole) params.role = filterRole;
    if (filterStatus) params.status = filterStatus;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    usersAPI.getAll(params)
      .then((r) => {
        setUsers(r.data.data);
        setTotal(r.data.total ?? r.data.count ?? 0);
        setPages(r.data.pages ?? 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filterRole, filterStatus, debouncedSearch, page]);

  const handleDelete = async (id) => {
    try { await usersAPI.delete(id); load(); } catch (err) { alert(err.response?.data?.message || 'Delete failed'); }
    setDeleteId(null);
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
        <button onClick={load} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 transition-all">↻ Refresh</button>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-white/5">
              <tr className="text-left text-slate-400 text-xs uppercase tracking-wider">
                {['Emp Code', 'Name', 'Role', 'Department', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-5 py-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 stagger">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-white/3 transition-colors">
                  <td className="px-5 py-4 font-mono text-primary-300 font-medium">{u.empCode}</td>
                  <td className="px-5 py-4 text-white font-medium">
                    <button onClick={() => setProgressModal({ id: u._id, name: u.name })} className="hover:text-teal-400 hover:underline transition-colors text-left">
                      {u.name}
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${ROLE_BADGE[u.role]}`}>{u.role}</span>
                  </td>
                  <td className="px-5 py-4 text-slate-400">{u.department || '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${STATUS_BADGE[u.status]}`}>{u.status}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => setProgressModal({ id: u._id, name: u.name })}
                        className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-teal-500/20 hover:text-teal-300 transition-all" title="View Progress">📊</button>
                      <button onClick={() => setModal(u)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-primary-500/20 hover:text-primary-300 transition-all">Edit</button>
                      <button onClick={() => setDeleteId(u._id)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-red-500/20 hover:text-red-400 transition-all">Del</button>
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
      {!loading && total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>Page {page} of {pages} · {total} total</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >← Prev</button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >Next →</button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
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
      )}

      {(modal === 'create' || (modal && modal._id)) && (
        <UserModal user={modal === 'create' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}

      {progressModal && (
        <StudentProgressModal 
          userId={progressModal.id} 
          userName={progressModal.name} 
          onClose={() => setProgressModal(null)} 
        />
      )}
    </div>
  );
}
