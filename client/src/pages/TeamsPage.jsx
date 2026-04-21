import { useState, useEffect } from 'react';
import { teamsAPI, usersAPI } from '../api/api';

function TeamModal({ team, participants, onClose, onSaved }) {
  const isEdit = !!team?._id;
  const [name, setName] = useState(team?.name || '');
  const [leaderId, setLeaderId] = useState(team?.leaderId?._id || team?.leaderId || '');
  const [memberIds, setMemberIds] = useState(team?.members?.map((m) => m._id || m) || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleMember = (id) => setMemberIds((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!leaderId) return setError('Please select a team leader');
    setSaving(true); setError('');
    try {
      const payload = { name, leaderId, members: memberIds };
      if (isEdit) await teamsAPI.update(team._id, payload);
      else await teamsAPI.create(payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Team' : 'Create Team'}</h2>
        {error && <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
        <div>
          <label className="block text-sm text-slate-300 mb-1">Team Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" required
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1">Team Leader</label>
          <select value={leaderId} onChange={(e) => { setLeaderId(e.target.value); if (!memberIds.includes(e.target.value)) setMemberIds((p) => [...p, e.target.value]); }}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
            <option value="" className="bg-slate-800">Select leader…</option>
            {participants.map((p) => <option key={p._id} value={p._id} className="bg-slate-800">{p.name} ({p.empCode})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-2">Members <span className="text-slate-500">({memberIds.length} selected)</span></label>
          <div className="glass-light rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
            {participants.map((p) => (
              <label key={p._id} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all">
                <input type="checkbox" checked={memberIds.includes(p._id)} onChange={() => toggleMember(p._id)} className="w-4 h-4 rounded accent-primary-500" />
                <span className="text-sm text-white">{p.name}</span>
                <span className="text-xs text-slate-500 ml-auto">{p.empCode}</span>
                {p._id === leaderId && <span className="text-xs text-amber-400">Leader</span>}
              </label>
            ))}
          </div>
        </div>
        {isEdit && (
          <p className="text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
            ⚡ Saving triggers Dynamic Team Sync — future schedules update automatically.
          </p>
        )}
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

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([teamsAPI.getAll(), usersAPI.getAll({ role: 'Participant' })]);
      setTeams(tRes.data.data);
      setParticipants(pRes.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    try { await teamsAPI.delete(id); load(); } catch (err) { alert(err.response?.data?.message); }
    setDeleteId(null);
  };

  // Quick-assign leader without opening the edit modal
  const handleMakeLeader = async (team, memberId) => {
    const memberName = team.members?.find(m => (m._id || m) === memberId)?.name || memberId;
    if (!window.confirm(`Promote "${memberName}" to leader of "${team.name}"?`)) return;
    try {
      await teamsAPI.update(team._id, { leaderId: memberId });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update leader');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">👥 Team Management</h1>
          <p className="text-slate-400 mt-1">{teams.length} teams · Member changes auto-sync future schedules</p>
        </div>
        <button onClick={() => setModal('create')}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all shadow-lg shadow-primary-500/20 self-start">
          + New Team
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {teams.map((t) => {
            const leadId = t.leaderId?._id || t.leaderId;
            return (
              <div key={t._id} className="glass rounded-2xl p-5 hover:scale-[1.01] transition-transform">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-white">{t.name}</h3>
                    <p className="text-sm text-slate-400 mt-0.5">
                      Leader: <span className="text-amber-300 font-semibold">👑 {t.leaderId?.name || '— Not assigned'}</span>
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setModal(t)} className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-primary-300 hover:bg-primary-500/10 transition-all text-xs">Edit</button>
                    <button onClick={() => setDeleteId(t._id)} className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs">Del</button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {(t.members || []).map((m) => {
                    const isLeader = m._id === leadId;
                    return (
                      <div key={m._id} className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${
                        isLeader ? 'bg-amber-500/10 border border-amber-500/15' : 'glass-light'
                      }`}>
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                          isLeader ? 'bg-amber-500/30 text-amber-300' : 'bg-primary-500/20 text-primary-300'
                        }`}>
                          {isLeader ? '👑' : m.empCode?.slice(-1)}
                        </div>
                        <span className="text-sm text-white flex-1">{m.name}</span>
                        <span className="text-xs text-slate-500">{m.empCode}</span>
                        {isLeader ? (
                          <span className="text-xs text-amber-400 font-semibold ml-1">Leader</span>
                        ) : (
                          <button
                            onClick={() => handleMakeLeader(t, m._id)}
                            className="ml-1 px-2 py-0.5 rounded text-[10px] text-slate-500 hover:text-amber-300 hover:bg-amber-500/10 transition-all"
                            title={`Promote ${m.name} to leader`}
                          >
                            ★ Make Leader
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-3 border-t border-white/5 text-xs text-slate-500">{t.members?.length || 0} members</div>
              </div>
            );
          })}
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4 animate-fade-in">
            <div className="text-3xl">🗑️</div>
            <h3 className="text-lg font-bold text-white">Delete this team?</h3>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30 font-semibold transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}

      {(modal === 'create' || (modal && modal._id)) && (
        <TeamModal team={modal === 'create' ? null : modal} participants={participants}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}
