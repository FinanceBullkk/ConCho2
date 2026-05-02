import { useState, useEffect } from 'react';
import { enrollmentsAPI, teamsAPI } from '../api/api';
import toast from 'react-hot-toast';
import Portal from '../components/Portal';

// ──────────────────────────────────────────────────────────
// Enrollment Page — Learning History by Team
// ──────────────────────────────────────────────────────────

const STATUS_COLORS = {
  Active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20',
  Completed: 'bg-primary-500/20 text-primary-300 border-primary-500/20',
  Transferred: 'bg-amber-500/20 text-amber-400 border-amber-500/20',
  Dropped: 'bg-red-500/20 text-red-400 border-red-500/20',
};

const STATUS_OPTIONS = ['Active', 'Completed', 'Dropped', 'Transferred'];

// ── Edit Enrollment Modal ─────────────────────────────────

function EditModal({ enrollment, onClose, onSaved }) {
  const [status, setStatus] = useState(enrollment.status);
  const [note, setNote] = useState(enrollment.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await enrollmentsAPI.update(enrollment._id, { status, note });
      toast.success('Enrollment updated');
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed');
    } finally { setSaving(false); }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-md mx-4 space-y-4 animate-fade-in">
        <h2 className="text-lg font-bold text-white">
          ✏️ {enrollment.userId?.name}
        </h2>
        <p className="text-sm text-slate-400">
          {enrollment.teamId?.name} · {enrollment.classId?.classCode} — {enrollment.classId?.courseName || 'No course'}
        </p>

        {error && <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        <div>
          <label className="block text-sm text-slate-300 mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
            {STATUS_OPTIONS.map(s => <option key={s} value={s} className="bg-slate-800">{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1">Note</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="Optional note..."
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all resize-none" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold disabled:opacity-50 transition-all">
            {saving ? 'Saving...' : 'Update'}
          </button>
        </div>
      </form>
    </div>
    </Portal>
  );
}

// ── Main Page ─────────────────────────────────────────────

export default function EnrollmentPage() {
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [editModal, setEditModal] = useState(null);

  // Load teams list
  useEffect(() => {
    const loadTeams = async () => {
      try {
        const res = await teamsAPI.getAll();
        setTeams(res.data.data);
        if (res.data.data.length > 0) {
          setSelectedTeam(res.data.data[0]._id);
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    loadTeams();
    document.title = 'TMS — Enrollment';
  }, []);

  // Load enrollments when team or filter changes
  useEffect(() => {
    if (!selectedTeam) return;
    const loadEnrollments = async () => {
      setLoading(true);
      try {
        const res = await enrollmentsAPI.getByTeam(selectedTeam, { status: statusFilter });
        setEnrollments(res.data.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    loadEnrollments();
  }, [selectedTeam, statusFilter]);

  const reload = () => {
    if (!selectedTeam) return;
    enrollmentsAPI.getByTeam(selectedTeam, { status: statusFilter })
      .then(res => setEnrollments(res.data.data))
      .catch(console.error);
  };

  const selectedTeamObj = teams.find(t => t._id === selectedTeam);

  // Count by status
  const activeCount = enrollments.filter(e => e.status === 'Active').length;
  const totalCount = enrollments.length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">📋 Enrollment & Learning History</h1>
          <p className="text-slate-400 mt-1">Track team membership and attendance progress</p>
        </div>
      </div>

      {/* ── Controls ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Team:</label>
          <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
            {teams.map(t => (
              <option key={t._id} value={t._id} className="bg-slate-800">
                {t.name} {t.classId?.classCode ? `(${t.classId.classCode})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Status:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
            <option value="All" className="bg-slate-800">All</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s} className="bg-slate-800">{s}</option>)}
          </select>
        </div>

        {/* Stats badges */}
        <div className="flex items-center gap-3 ml-auto">
          <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            {activeCount} Active
          </span>
          <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-white/5 text-slate-400 border border-white/10">
            {totalCount} Total
          </span>
        </div>
      </div>

      {/* ── Team Info Card ──────────────────────────────── */}
      {selectedTeamObj && (
        <div className="glass rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center text-xl">
            👥
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{selectedTeamObj.name}</h2>
            <p className="text-sm text-slate-400">
              {selectedTeamObj.classId?.classCode
                ? `${selectedTeamObj.classId.classCode} — ${selectedTeamObj.classId.courseName}`
                : 'No class assigned'}
              {' · '}
              Leader: {selectedTeamObj.leaderId?.name || 'N/A'}
            </p>
          </div>
        </div>
      )}

      {/* ── Enrollment Table ────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : enrollments.length === 0 ? (
        <div className="glass rounded-2xl py-16 text-center">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-slate-400">No enrollment records found for this team.</p>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left text-xs text-slate-400 font-semibold uppercase tracking-wider">Member</th>
                  <th className="px-4 py-3 text-left text-xs text-slate-400 font-semibold uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs text-slate-400 font-semibold uppercase tracking-wider">Course</th>
                  <th className="px-4 py-3 text-left text-xs text-slate-400 font-semibold uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-3 text-left text-xs text-slate-400 font-semibold uppercase tracking-wider">Left</th>
                  <th className="px-4 py-3 text-center text-xs text-slate-400 font-semibold uppercase tracking-wider">Attendance</th>
                  <th className="px-4 py-3 text-left text-xs text-slate-400 font-semibold uppercase tracking-wider">Transfer / Note</th>
                  <th className="px-4 py-3 text-center text-xs text-slate-400 font-semibold uppercase tracking-wider w-16">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {enrollments.map((e) => {
                  const att = e.attendance || {};
                  const totalSessions = e.classId?.totalSessions || 0;
                  const attendedSessions = att.total || 0;

                  return (
                    <tr key={e._id} className="hover:bg-white/[0.02] transition-colors">
                      {/* Member */}
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-white">{e.userId?.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{e.userId?.empCode}</div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_COLORS[e.status] || ''}`}>
                          {e.status}
                        </span>
                      </td>

                      {/* Course */}
                      <td className="px-4 py-3">
                        {e.classId ? (
                          <div>
                            <span className="text-sm text-white font-mono">{e.classId.classCode}</span>
                            <span className="text-xs text-slate-400 ml-1">— {e.classId.courseName}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">No course</span>
                        )}
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {new Date(e.joinedAt).toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>

                      {/* Left */}
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {e.leftAt
                          ? new Date(e.leftAt).toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' })
                          : <span className="text-emerald-400 text-xs font-semibold">—</span>
                        }
                      </td>

                      {/* Attendance */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-emerald-400 text-xs font-semibold" title="Present">P:{att.P || 0}</span>
                          <span className="text-red-400 text-xs font-semibold" title="Absent">A:{att.A || 0}</span>
                          <span className="text-amber-400 text-xs font-semibold" title="Late">L:{att.L || 0}</span>
                        </div>
                        {totalSessions > 0 && (
                          <div className="mt-1">
                            <div className="h-1 rounded-full bg-white/5 overflow-hidden w-20 mx-auto">
                              <div
                                className={`h-full rounded-full transition-all ${attendedSessions >= totalSessions ? 'bg-primary-400' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.min((attendedSessions / totalSessions) * 100, 100)}%` }}
                              />
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{attendedSessions}/{totalSessions} sessions</div>
                          </div>
                        )}
                      </td>

                      {/* Transfer / Note */}
                      <td className="px-4 py-3 text-sm">
                        {e.status === 'Transferred' && e.transferredTo ? (
                          <span className="text-amber-400 text-xs">
                            → {e.transferredTo.name}
                          </span>
                        ) : e.note ? (
                          <span className="text-slate-400 text-xs italic">{e.note}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Edit */}
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => setEditModal(e)}
                          className="w-7 h-7 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all text-xs flex items-center justify-center mx-auto">
                          ✏️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        {Object.entries(STATUS_COLORS).map(([status, cls]) => (
          <div key={status} className="flex items-center gap-2">
            <div className={`w-3.5 h-3.5 rounded border ${cls}`} />
            <span>{status}</span>
          </div>
        ))}
      </div>

      {/* ── Edit Modal ─────────────────────────────────── */}
      {editModal && (
        <EditModal
          enrollment={editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); reload(); }}
        />
      )}
    </div>
  );
}
