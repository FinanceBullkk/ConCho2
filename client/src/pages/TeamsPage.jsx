import { useState, useEffect } from 'react';
import { teamsAPI, usersAPI, classesAPI, enrollmentsAPI } from '../api/api';
import TeamProgressModal from '../components/Progress/TeamProgressModal';
import StudentProgressModal from '../components/Progress/StudentProgressModal';

function TeamModal({ team, participants, classes, teams, onClose, onSaved }) {
  const isEdit = !!team?._id;
  const [name, setName] = useState(team?.name || '');
  const [classId, setClassId] = useState(team?.classId?._id || team?.classId || '');
  const [leaderId, setLeaderId] = useState(team?.leaderId?._id || team?.leaderId || '');
  const [memberIds, setMemberIds] = useState(team?.members?.map((m) => m._id || m) || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [swapConfirm, setSwapConfirm] = useState(null);
  const [transferConfirm, setTransferConfirm] = useState(null); // { conflicts, payload }

  // Build a map: classId → team name (for OTHER teams only)
  const takenClassMap = new Map();
  for (const t of teams) {
    const cId = t.classId?._id || t.classId;
    if (cId && (!isEdit || t._id !== team?._id)) {
      takenClassMap.set(cId, t.name);
    }
  }

  const toggleMember = (id) => setMemberIds((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);

  // Handle class dropdown change — intercept if taken
  const handleClassChange = (newClassId) => {
    if (newClassId && takenClassMap.has(newClassId)) {
      const cls = classes.find(c => c._id === newClassId);
      setSwapConfirm({
        classId: newClassId,
        classCode: cls?.classCode || newClassId,
        takenByTeam: takenClassMap.get(newClassId),
      });
    } else {
      setClassId(newClassId);
    }
  };

  const handleSwapConfirm = () => {
    setClassId(swapConfirm.classId);
    setSwapConfirm(null);
  };

  const handleSubmit = async (e, forceSwap = false, forceTransfer = false) => {
    e?.preventDefault();
    if (!leaderId) return setError('Please select a team leader');

    const payload = { name, classId: classId || null, leaderId, members: memberIds };
    if (forceSwap || takenClassMap.has(classId)) payload.forceSwap = true;

    // ── Check for enrollment conflicts before saving ──
    if (!forceTransfer) {
      try {
        setSaving(true);
        const res = await enrollmentsAPI.checkConflicts({ teamId: team?._id || 'new', memberIds });
        if (res.data.data.length > 0) {
          setTransferConfirm({ conflicts: res.data.data, payload });
          setSaving(false);
          return;
        }
      } catch (err) {
        console.error('Failed to check conflicts', err);
      } finally {
        setSaving(false);
      }
    }

    setSaving(true); setError('');
    try {
      const finalPayload = forceTransfer ? transferConfirm.payload : payload;
      if (isEdit) await teamsAPI.update(team._id, finalPayload);
      else await teamsAPI.create(finalPayload);
      onSaved();
    } catch (err) {
      const data = err.response?.data;
      // If server returns 409 with conflict info, show swap dialog
      if (err.response?.status === 409 && data?.conflictTeamId) {
        setSwapConfirm({
          classId,
          classCode: classId,
          takenByTeam: data.conflictTeamName,
        });
      } else {
        setError(data?.message || 'Save failed');
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={(e) => handleSubmit(e)} onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Team' : 'Create Team'}</h2>
        {error && <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
        <div>
          <label className="block text-sm text-slate-300 mb-1">Team Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" required
            className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
        </div>
        <div>
          <label className="block text-sm text-slate-300 mb-1">Assigned Class</label>
          <select value={classId} onChange={(e) => handleClassChange(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
            <option value="" className="bg-slate-800">— No class assigned —</option>
            {classes.filter(c => c.status === 'Ongoing').map((c) => {
              const takenBy = takenClassMap.get(c._id);
              return (
                <option key={c._id} value={c._id} className="bg-slate-800">
                  {c.classCode} — {c.courseName}{takenBy ? ` (⇄ ${takenBy})` : ''}
                </option>
              );
            })}
          </select>
          {!classId && (
            <p className="mt-1.5 text-xs text-slate-400">
              This team has no assigned class. You can assign one later.
            </p>
          )}
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

      {/* Swap confirmation dialog */}
      {swapConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSwapConfirm(null)}>
          <div className="glass rounded-2xl p-6 max-w-sm mx-4 space-y-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl text-center">🔄</div>
            <h3 className="text-lg font-bold text-white text-center">Swap Class Assignment?</h3>
            <p className="text-sm text-slate-300 text-center">
              <span className="font-mono text-primary-300">{swapConfirm.classCode}</span> is currently assigned to <strong className="text-white">{swapConfirm.takenByTeam}</strong>.
            </p>
            <p className="text-sm text-slate-400 text-center">
              If you continue, <strong className="text-amber-300">{swapConfirm.takenByTeam}</strong> will be unassigned from this class.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setSwapConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={handleSwapConfirm} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-white font-semibold transition-all hover:from-amber-500 hover:to-amber-400">
                Swap & Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer confirmation dialog */}
      {transferConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setTransferConfirm(null)}>
          <div className="glass rounded-2xl p-6 max-w-md mx-4 space-y-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl text-center">⚠️</div>
            <h3 className="text-lg font-bold text-white text-center">Transfer Members?</h3>
            <p className="text-sm text-slate-300 text-center">
              The following users are currently active in other teams. Adding them to <strong className="text-primary-300">{name || 'this team'}</strong> will transfer them and close their previous enrollments.
            </p>
            <div className="glass-light rounded-xl p-3 max-h-48 overflow-y-auto space-y-2 mt-2">
              {transferConfirm.conflicts.map(c => (
                <div key={c.userId} className="flex justify-between items-center text-sm">
                  <div>
                    <span className="text-white font-medium">{c.name}</span>
                    <span className="text-slate-500 text-xs ml-2">{c.empCode}</span>
                  </div>
                  <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
                    from {c.currentTeamName}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-3">
              <button onClick={() => setTransferConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={() => handleSubmit(null, false, true)} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-white font-semibold transition-all hover:from-amber-500 hover:to-amber-400">
                Confirm Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [progressModal, setProgressModal] = useState(null);
  const [studentProgressModal, setStudentProgressModal] = useState(null); // { id, name }

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, pRes, cRes] = await Promise.all([
        teamsAPI.getAll(),
        usersAPI.getAll({ role: 'Participant', limit: 200 }),
        classesAPI.getAll(),
      ]);
      setTeams(tRes.data.data);
      setParticipants(pRes.data.data);
      setClasses(cRes.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { document.title = 'TMS — Teams'; }, []);

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
            const classInfo = t.classId; // populated object or null
            return (
              <div key={t._id} className="glass rounded-2xl p-5 hover:scale-[1.01] transition-transform">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-white">{t.name}</h3>
                      {classInfo?.classCode ? (
                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold bg-primary-500/15 text-primary-300 border border-primary-500/20">
                          📚 {classInfo.classCode}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/15">
                          ⚠ No class
                        </span>
                      )}
                    </div>
                    {classInfo?.courseName && (
                      <p className="text-xs text-slate-500 mb-1">{classInfo.courseName}</p>
                    )}
                    <p className="text-sm text-slate-400 mt-0.5">
                      Leader: <span className="text-amber-300 font-semibold">👑 {t.leaderId?.name || '— Not assigned'}</span>
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setProgressModal(t._id)} className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-teal-300 hover:bg-teal-500/10 transition-all text-xs" title="View Progress">📊</button>
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
                        <button 
                          onClick={() => setStudentProgressModal({ id: m._id, name: m.name })}
                          className="text-sm text-white flex-1 text-left hover:text-teal-400 hover:underline transition-colors"
                        >
                          {m.name}
                        </button>
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
        <TeamModal team={modal === 'create' ? null : modal} participants={participants} classes={classes} teams={teams}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}

      {progressModal && (
        <TeamProgressModal teamId={progressModal} onClose={() => setProgressModal(null)} />
      )}

      {studentProgressModal && (
        <StudentProgressModal 
          userId={studentProgressModal.id} 
          userName={studentProgressModal.name} 
          onClose={() => setStudentProgressModal(null)} 
        />
      )}
    </div>
  );
}
