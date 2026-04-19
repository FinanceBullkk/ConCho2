import { useState, useEffect } from 'react';
import { classesAPI } from '../api/api';

const STATUSES = ['Ongoing', 'Completed'];

function ClassModal({ cls, onClose, onSaved }) {
  const isEdit = !!cls?._id;
  const [form, setForm] = useState({ classCode: cls?.classCode || '', courseName: cls?.courseName || '', status: cls?.status || 'Ongoing' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      if (isEdit) await classesAPI.update(cls._id, form);
      else await classesAPI.create(form);
      onSaved();
    } catch (err) { setError(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-md mx-4 space-y-4 animate-fade-in">
        <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Class' : 'Create Class'}</h2>
        {error && <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
        {[{ key: 'classCode', label: 'Class Code', placeholder: 'e.g. ENG-B1-2026', disabled: isEdit },
          { key: 'courseName', label: 'Course Name', placeholder: 'e.g. Business English Intermediate' }
        ].map(({ key, label, placeholder, disabled }) => (
          <div key={key}>
            <label className="block text-sm text-slate-300 mb-1">{label}</label>
            <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder} required disabled={disabled}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-40 transition-all" />
          </div>
        ))}
        <div>
          <label className="block text-sm text-slate-300 mb-1">Status</label>
          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
            {STATUSES.map((s) => <option key={s} value={s} className="bg-slate-800">{s}</option>)}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold disabled:opacity-50 transition-all">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState('');
  const [deleteId, setDeleteId] = useState(null);

  const load = () => {
    setLoading(true);
    classesAPI.getAll(filter ? { status: filter } : {})
      .then((r) => setClasses(r.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const handleDelete = async (id) => {
    try { await classesAPI.delete(id); load(); } catch (err) { alert(err.response?.data?.message); }
    setDeleteId(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">📚 Class Management</h1>
          <p className="text-slate-400 mt-1">{classes.length} classes</p>
        </div>
        <button onClick={() => setModal('create')}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all shadow-lg shadow-primary-500/20 self-start">
          + New Class
        </button>
      </div>

      <div className="glass rounded-2xl px-5 py-4 flex gap-3">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50">
          <option value="" className="bg-slate-800">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s} className="bg-slate-800">{s}</option>)}
        </select>
        <button onClick={load} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 transition-all">↻</button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-white/5">
              <tr className="text-left text-slate-400 text-xs uppercase tracking-wider">
                {['Code', 'Course Name', 'Status', 'Actions'].map((h) => <th key={h} className="px-5 py-4 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 stagger">
              {classes.map((c) => (
                <tr key={c._id} className="hover:bg-white/3 transition-colors">
                  <td className="px-5 py-4 font-mono text-primary-300 font-medium">{c.classCode}</td>
                  <td className="px-5 py-4 text-white font-medium">{c.courseName}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${c.status === 'Ongoing' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'}`}>{c.status}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => setModal(c)} className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-primary-500/20 hover:text-primary-300 transition-all">Edit</button>
                      <button onClick={() => setDeleteId(c._id)} className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-red-500/20 hover:text-red-400 transition-all">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && classes.length === 0 && <div className="py-16 text-center text-slate-500">No classes found</div>}
      </div>

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4 animate-fade-in">
            <div className="text-3xl">🗑️</div>
            <h3 className="text-lg font-bold text-white">Delete this class?</h3>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30 font-semibold transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}
      {(modal === 'create' || (modal && modal._id)) && (
        <ClassModal cls={modal === 'create' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}
