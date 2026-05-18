import { useState, useEffect, useCallback } from 'react';
import { adminDbAPI } from '../api/api';

// ──────────────────────────────────────────────────────────
// Database Explorer — Admin-only data browser & editor
// ──────────────────────────────────────────────────────────

const COLLECTION_ICONS = {
  User: '👤', Team: '👥', Class: '📚', Schedule: '📅',
  Attendance: '✅', Enrollment: '📋', Evaluation: '📝',
  Counter: '🔢', Setting: '⚙️',
};

// Fields to show as badges/colored
const ID_FIELDS = ['_id', 'userId', 'teamId', 'classId', 'scheduleId', 'bookedTeamId', 'leaderId', 'enrollmentId'];
const DATE_FIELDS = ['createdAt', 'updatedAt', 'startTime', 'endTime', 'joinedAt', 'lastLogin', 'closedAt'];
const STATUS_COLORS = {
  Active: 'bg-emerald-500/20 text-emerald-400',
  Inactive: 'bg-red-500/20 text-red-400',
  Ongoing: 'bg-emerald-500/20 text-emerald-400',
  Completed: 'bg-blue-500/20 text-blue-400',
  Present: 'bg-emerald-500/20 text-emerald-400',
  P: 'bg-emerald-500/20 text-emerald-400',
  Absent: 'bg-red-500/20 text-red-400',
  A: 'bg-red-500/20 text-red-400',
  L: 'bg-amber-500/20 text-amber-400',
  EL: 'bg-blue-500/20 text-blue-400',
};

// Truncate ObjectId for display
const shortId = (id) => {
  if (!id) return '—';
  const s = typeof id === 'object' ? (id._id || id.toString()) : String(id);
  return s.length > 12 ? `…${s.slice(-6)}` : s;
};

// Format date for display
const formatDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(d); }
};

// Convert Date to "YYYY-MM-DDTHH:mm" in local tz for <input type="datetime-local">
const toLocalDateTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

// Known enum values per field — rendered as <select> in inline edit
const STATUS_ENUMS = {
  status: ['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class', 'Ongoing', 'Completed'],
  role: ['Admin', 'Leader', 'Participant'],
};

// Returns inline edit mode for a field/value pair, or null if not editable inline
const cellEditMode = (field, value) => {
  if (['_id', '__v', 'createdAt', 'updatedAt'].includes(field)) return null;
  if (Array.isArray(value)) return null;
  if (value && typeof value === 'object') return null; // populated refs
  if (DATE_FIELDS.includes(field)) return 'datetime';
  if (typeof value === 'boolean') return 'boolean';
  if (STATUS_ENUMS[field]) return 'select';
  return 'text';
};

// Format a cell value for display
const formatValue = (key, value) => {
  if (value === null || value === undefined) return <span className="text-slate-600">null</span>;
  if (typeof value === 'boolean') return <span className={value ? 'text-emerald-400' : 'text-red-400'}>{value.toString()}</span>;
  if (ID_FIELDS.includes(key)) {
    const displayId = typeof value === 'object' ? (value.name || value.classCode || value._id) : value;
    return <span className="font-mono text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">{shortId(displayId)}</span>;
  }
  if (DATE_FIELDS.includes(key)) return <span className="text-slate-400 text-xs">{formatDate(value)}</span>;
  if (STATUS_COLORS[value]) return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[value]}`}>{value}</span>;
  if (Array.isArray(value)) return <span className="text-slate-400 text-xs">[{value.length} items]</span>;
  if (typeof value === 'object') return <span className="text-slate-500 text-xs">{JSON.stringify(value).slice(0, 40)}…</span>;
  const s = String(value);
  return s.length > 50 ? <span title={s}>{s.slice(0, 50)}…</span> : s;
};

// ── Edit Modal ────────────────────────────────────────────
function EditModal({ doc, fields, collection, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const obj = {};
    fields.forEach(f => {
      if (f === '_id' || f === '__v' || f === 'createdAt') return;
      const val = doc[f];
      // For objects/arrays, stringify for editing
      if (typeof val === 'object' && val !== null) obj[f] = JSON.stringify(val);
      else obj[f] = val ?? '';
    });
    return obj;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // Parse JSON fields back
      const payload = {};
      for (const [k, v] of Object.entries(form)) {
        if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
          try { payload[k] = JSON.parse(v); continue; } catch { /* treat as string */ }
        }
        payload[k] = v;
      }
      await adminDbAPI.update(collection, doc._id, payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const editableFields = fields.filter(f => f !== '_id' && f !== '__v' && f !== 'createdAt');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-2xl mx-4 space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">✏️ Edit {collection} Document</h2>
          <span className="font-mono text-xs text-slate-500">{doc._id}</span>
        </div>
        {error && <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          {editableFields.map(field => (
            <div key={field}>
              <label className="block text-xs text-slate-400 mb-1 font-mono">{field}</label>
              {typeof form[field] === 'string' && form[field].length > 80 ? (
                <textarea
                  value={form[field]}
                  onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-y"
                />
              ) : (
                <input
                  type="text"
                  value={form[field] === null || form[field] === undefined ? '' : form[field]}
                  onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary text-white font-semibold disabled:opacity-50 transition-all">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main Explorer Component ───────────────────────────────
export default function DatabaseExplorer() {
  const [collections, setCollections] = useState([]);
  const [activeCollection, setActiveCollection] = useState(null);
  const [docs, setDocs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(30);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editingCell, setEditingCell] = useState(null); // { docId, field, value, mode }
  const [savingCell, setSavingCell] = useState(false);
  const [cellError, setCellError] = useState(null);     // { docId, field, message }
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [sortField, setSortField] = useState('-updatedAt');

  // Fetch collection list
  useEffect(() => {
    adminDbAPI.getCollections().then(res => {
      setCollections(res.data.data);
      if (res.data.data.length > 0) setActiveCollection(res.data.data[0].name);
    }).catch(console.error);
  }, []);

  // Fetch documents when collection/page/search changes
  const fetchDocs = useCallback(async () => {
    if (!activeCollection) return;
    setLoading(true);
    try {
      const res = await adminDbAPI.query(activeCollection, {
        page, limit, search, sort: sortField, includeDeleted: includeDeleted ? 'true' : 'false',
      });
      setDocs(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeCollection, page, limit, search, sortField, includeDeleted]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Reset page when switching collection or searching
  useEffect(() => { setPage(1); }, [activeCollection, search, includeDeleted]);

  const activeSchema = collections.find(c => c.name === activeCollection);
  const visibleFields = activeSchema?.fields?.filter(f => f !== '__v') || [];
  // Prioritize important columns
  const priorityFields = ['_id', 'name', 'empCode', 'classCode', 'status', 'role', 'email'];
  const orderedFields = [
    ...priorityFields.filter(f => visibleFields.includes(f)),
    ...visibleFields.filter(f => !priorityFields.includes(f)),
  ];

  const totalPages = Math.ceil(total / limit);

  const beginCellEdit = (doc, field) => {
    const mode = cellEditMode(field, doc[field]);
    if (!mode) return;
    let initial;
    if (mode === 'datetime') initial = toLocalDateTime(doc[field]);
    else if (mode === 'boolean') initial = !!doc[field];
    else initial = doc[field] === null || doc[field] === undefined ? '' : String(doc[field]);
    setEditingCell({ docId: doc._id, field, value: initial, mode });
    setCellError(null);
  };

  const cancelCellEdit = () => { setEditingCell(null); setSavingCell(false); };

  const saveCellEdit = async () => {
    if (!editingCell) return;
    const { docId, field, value, mode } = editingCell;
    const original = docs.find(d => d._id === docId)?.[field];
    let payloadValue = value;
    if (mode === 'datetime') payloadValue = value ? new Date(value).toISOString() : null;
    else if (mode === 'boolean') payloadValue = !!value;
    else if (mode === 'text') {
      if (typeof original === 'number' && value !== '' && !isNaN(Number(value))) payloadValue = Number(value);
      if (value === '') payloadValue = null;
    }
    setSavingCell(true);
    setCellError(null);
    try {
      await adminDbAPI.update(activeCollection, docId, { [field]: payloadValue });
      setDocs(prev => prev.map(d => d._id === docId ? { ...d, [field]: payloadValue } : d));
      setEditingCell(null);
    } catch (err) {
      setCellError({ docId, field, message: err.response?.data?.message || 'Update failed' });
    } finally {
      setSavingCell(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await adminDbAPI.remove(activeCollection, deleteTarget._id);
      fetchDocs();
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed');
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      {/* ── Collection tabs ──────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {collections.map(c => (
          <button
            key={c.name}
            onClick={() => setActiveCollection(c.name)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              activeCollection === c.name
                ? 'bg-primary/20 text-primary border-primary/30 shadow-sm shadow-primary/10'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border-white/5'
            }`}
          >
            <span>{COLLECTION_ICONS[c.name] || '📄'}</span>
            <span>{c.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeCollection === c.name ? 'bg-primary/30 text-primary' : 'bg-white/5 text-slate-500'
            }`}>{c.count}</span>
          </button>
        ))}
      </div>

      {/* ── Search & Controls ─────────────────────────────── */}
      <div className="glass rounded-2xl px-5 py-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search in ${activeCollection || ''}...`}
            className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-sm">✕</button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">Sort:</span>
          <select value={sortField} onChange={e => setSortField(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer">
            <option value="-updatedAt" className="bg-slate-800">Latest Updated</option>
            <option value="-createdAt" className="bg-slate-800">Latest Created</option>
            <option value="createdAt" className="bg-slate-800">Oldest First</option>
            <option value="name" className="bg-slate-800">Name A-Z</option>
          </select>
        </div>

        <label className="flex items-center gap-2 shrink-0 cursor-pointer">
          <input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)}
            className="w-4 h-4 rounded accent-primary" />
          <span className="text-xs text-slate-400">Include deleted</span>
        </label>

        <div className="text-xs text-slate-500 shrink-0">
          {total} docs
        </div>
      </div>

      {/* ── Data Table ─────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-900/95 backdrop-blur-sm px-3 py-3 border-b border-r border-white/10 text-left text-[10px] text-slate-400 font-semibold uppercase tracking-wider w-10">
                    #
                  </th>
                  {orderedFields.slice(0, 12).map(f => (
                    <th key={f} className="px-3 py-3 border-b border-white/10 text-left text-[10px] text-slate-400 font-semibold uppercase tracking-wider whitespace-nowrap">
                      {f}
                    </th>
                  ))}
                  <th className="px-3 py-3 border-b border-white/10 text-center text-[10px] text-slate-400 font-semibold uppercase tracking-wider sticky right-0 z-20 bg-slate-900/95 backdrop-blur-sm border-l">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {docs.map((doc, idx) => (
                  <tr key={doc._id} className={`hover:bg-white/[0.03] transition-colors ${doc.isDeleted ? 'opacity-50' : ''}`}>
                    <td className="sticky left-0 z-10 bg-slate-900/95 backdrop-blur-sm px-3 py-2.5 border-r border-white/5 text-slate-500 text-xs">
                      {(page - 1) * limit + idx + 1}
                    </td>
                    {orderedFields.slice(0, 12).map(f => {
                      const isEditing = editingCell?.docId === doc._id && editingCell?.field === f;
                      const mode = cellEditMode(f, doc[f]);
                      const editable = !!mode;
                      const errHere = cellError?.docId === doc._id && cellError?.field === f;
                      const onKey = (e) => {
                        if (e.key === 'Enter') { e.preventDefault(); saveCellEdit(); }
                        else if (e.key === 'Escape') { e.preventDefault(); cancelCellEdit(); }
                      };
                      if (isEditing) return (
                        <td key={f} className="px-2 py-1 bg-primary/10 border border-primary/40 min-w-[140px]">
                          {editingCell.mode === 'datetime' && (
                            <input type="datetime-local" autoFocus disabled={savingCell}
                              value={editingCell.value}
                              onChange={e => setEditingCell(c => ({ ...c, value: e.target.value }))}
                              onBlur={saveCellEdit} onKeyDown={onKey}
                              className="w-full px-2 py-1 rounded bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
                          )}
                          {editingCell.mode === 'select' && (
                            <select autoFocus disabled={savingCell}
                              value={editingCell.value}
                              onChange={e => setEditingCell(c => ({ ...c, value: e.target.value }))}
                              onBlur={saveCellEdit} onKeyDown={onKey}
                              className="w-full px-2 py-1 rounded bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                              {STATUS_ENUMS[f].map(opt => <option key={opt} value={opt} className="bg-slate-800">{opt}</option>)}
                            </select>
                          )}
                          {editingCell.mode === 'boolean' && (
                            <select autoFocus disabled={savingCell}
                              value={String(editingCell.value)}
                              onChange={e => setEditingCell(c => ({ ...c, value: e.target.value === 'true' }))}
                              onBlur={saveCellEdit} onKeyDown={onKey}
                              className="w-full px-2 py-1 rounded bg-slate-900 border border-white/10 text-white text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                              <option value="true" className="bg-slate-800">true</option>
                              <option value="false" className="bg-slate-800">false</option>
                            </select>
                          )}
                          {editingCell.mode === 'text' && (
                            <input type="text" autoFocus disabled={savingCell}
                              value={editingCell.value}
                              onChange={e => setEditingCell(c => ({ ...c, value: e.target.value }))}
                              onBlur={saveCellEdit} onKeyDown={onKey}
                              className="w-full px-2 py-1 rounded bg-slate-900 border border-white/10 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary" />
                          )}
                          {errHere && <div className="text-[10px] text-red-400 mt-0.5">{cellError.message}</div>}
                        </td>
                      );
                      return (
                        <td key={f}
                          onClick={editable ? () => beginCellEdit(doc, f) : undefined}
                          title={editable ? 'Click để sửa · Enter lưu · Esc hủy' : undefined}
                          className={`px-3 py-2.5 text-slate-300 whitespace-nowrap max-w-[200px] truncate transition-colors ${
                            editable ? 'cursor-pointer hover:bg-primary/10 hover:ring-1 hover:ring-inset hover:ring-primary/30' : ''
                          } ${errHere ? 'ring-1 ring-red-500/60 bg-red-500/10' : ''}`}>
                          {formatValue(f, doc[f])}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 bg-slate-900/95 backdrop-blur-sm px-3 py-2.5 text-center border-l border-white/5">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setEditDoc(doc)}
                          className="px-2 py-1 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-all text-xs"
                          title="Edit all fields (modal)">✏️</button>
                        <button onClick={() => setDeleteTarget(doc)}
                          className="px-2 py-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs"
                          title="Delete">🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {docs.length === 0 && (
                  <tr>
                    <td colSpan={orderedFields.length + 2} className="px-6 py-12 text-center text-slate-500">
                      {search ? `No results for "${search}"` : 'No documents found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-white/10">
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages} · {total} total
              </span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/10">
                  ← Prev
                </button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const p = start + i;
                  if (p > totalPages) return null;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${
                        p === page
                          ? 'bg-primary/20 text-primary border-primary/30'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10 border-white/10'
                      }`}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-slate-300 hover:bg-white/10 disabled:opacity-30 transition-all border border-white/10">
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Edit Modal ──────────────────────────────────────── */}
      {editDoc && (
        <EditModal
          doc={editDoc}
          fields={visibleFields}
          collection={activeCollection}
          onClose={() => setEditDoc(null)}
          onSaved={() => { setEditDoc(null); fetchDocs(); }}
        />
      )}

      {/* ── Delete Confirmation ─────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4 animate-fade-in">
            <div className="text-3xl">⚠️</div>
            <h3 className="text-lg font-bold text-white">Hard Delete?</h3>
            <p className="text-sm text-slate-400">
              This will <span className="text-red-400 font-semibold">permanently remove</span> this {activeCollection} document.
            </p>
            <p className="font-mono text-xs text-slate-500 break-all">{deleteTarget._id}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30 font-semibold transition-all">Delete Forever</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
