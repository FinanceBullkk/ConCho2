import { useState, useEffect, useMemo } from 'react';
import TeamProgressModal from '../components/Progress/TeamProgressModal';
import StudentProgressModal from '../components/Progress/StudentProgressModal';
import Portal from '../components/Portal';
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam } from '../hooks/useTeams';
import { useUsers } from '../hooks/useUsers';
import { useClasses } from '../hooks/useClasses';
import { useCheckEnrollmentConflicts } from '../hooks/useEnrollments';
import { useRole } from '../hooks/useRole';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';

function TeamModal({ team, participants, classes, teams, onClose, onSaved }) {
  const isEdit = !!team?._id;
  const createMutation = useCreateTeam();
  const updateMutation = useUpdateTeam();
  const checkConflicts = useCheckEnrollmentConflicts();
  const saving = createMutation.isPending || updateMutation.isPending;
  const [name, setName] = useState(team?.name || '');
  const [classId, setClassId] = useState(team?.classId?._id || team?.classId || '');
  const [leaderId, setLeaderId] = useState(team?.leaderId?._id || team?.leaderId || '');
  const [memberIds, setMemberIds] = useState(team?.members?.map((m) => m._id || m) || []);
  const [error, setError] = useState('');
  const [swapConfirm, setSwapConfirm] = useState(null);
  const [transferConfirm, setTransferConfirm] = useState(null);
  const [memberSearch, setMemberSearch] = useState('');

  // Build userId → team name map (for OTHER teams)
  const userTeamMap = {};
  for (const t of teams) {
    if (isEdit && t._id === team?._id) continue;
    const tName = t.name;
    if (t.leaderId) { const lid = t.leaderId._id || t.leaderId; userTeamMap[lid] = tName; }
    if (t.members) t.members.forEach(m => { const mid = m._id || m; userTeamMap[mid] = tName; });
  }

  // Build classId → team name map
  const takenClassMap = new Map();
  for (const t of teams) {
    const cId = t.classId?._id || t.classId;
    if (cId && (!isEdit || t._id !== team?._id)) takenClassMap.set(cId, t.name);
  }

  // Filter participants by search
  const searchLower = memberSearch.toLowerCase().trim();
  const filteredParticipants = searchLower
    ? participants.filter(p => p.name.toLowerCase().includes(searchLower) || p.empCode.toLowerCase().includes(searchLower))
    : participants;

  // Sort: selected first, then available, then taken by other teams
  const sortedParticipants = [...filteredParticipants].sort((a, b) => {
    const aSelected = memberIds.includes(a._id) ? 0 : 1;
    const bSelected = memberIds.includes(b._id) ? 0 : 1;
    if (aSelected !== bSelected) return aSelected - bSelected;
    const aTaken = (!memberIds.includes(a._id) && userTeamMap[a._id]) ? 1 : 0;
    const bTaken = (!memberIds.includes(b._id) && userTeamMap[b._id]) ? 1 : 0;
    return aTaken - bTaken;
  });

  const toggleMember = (id) => setMemberIds((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);

  const handleClassChange = (newClassId) => {
    if (newClassId && takenClassMap.has(newClassId)) {
      const cls = classes.find(c => c._id === newClassId);
      setSwapConfirm({ classId: newClassId, classCode: cls?.classCode || newClassId, takenByTeam: takenClassMap.get(newClassId) });
    } else { setClassId(newClassId); }
  };

  const handleSwapConfirm = () => { setClassId(swapConfirm.classId); setSwapConfirm(null); };

  const handleSubmit = async (e, forceSwap = false, forceTransfer = false) => {
    e?.preventDefault();
    if (!leaderId) return setError('Please select a team leader');
    const payload = { name, classId: classId || null, leaderId, members: memberIds };
    if (forceSwap || takenClassMap.has(classId)) payload.forceSwap = true;

    if (!forceTransfer) {
      try {
        const res = await checkConflicts.mutateAsync({ teamId: team?._id || 'new', memberIds });
        if (res.data?.length > 0) { setTransferConfirm({ conflicts: res.data, payload }); return; }
      } catch (err) { console.error('Failed to check conflicts', err); }
    }

    setError('');
    try {
      const finalPayload = forceTransfer ? transferConfirm.payload : payload;
      if (isEdit) await updateMutation.mutateAsync({ id: team._id, data: finalPayload });
      else await createMutation.mutateAsync(finalPayload);
      onSaved();
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.conflictTeamId) {
        setSwapConfirm({ classId, classCode: classId, takenByTeam: data.conflictTeamName });
      } else { setError(data?.message || 'Save failed'); }
    }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <form onSubmit={(e) => handleSubmit(e)} onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg p-6 w-full max-w-2xl mx-4 space-y-4 max-h-[92vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-foreground">{isEdit ? '✏️ Edit Team' : '➕ Create Team'}</h2>
        {error && <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>}

        {/* ── Top fields: 2-column layout ─────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-small text-muted-foreground mb-1">Team Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" required
              className="w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
          <div>
            <label className="block text-small text-muted-foreground mb-1">Assigned Class</label>
            <select value={classId} onChange={(e) => handleClassChange(e.target.value)}
              className="w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors">
              <option value="" className="bg-popover">— No class —</option>
              {classes.filter(c => c.status === 'Ongoing').map((c) => {
                const takenBy = takenClassMap.get(c._id);
                return (<option key={c._id} value={c._id} className="bg-popover">{c.classCode} — {c.courseName}{takenBy ? ` (⇄ ${takenBy})` : ''}</option>);
              })}
            </select>
          </div>
        </div>

        {/* ── Team Leader ─────────────────────────────── */}
        <div>
          <label className="block text-small text-muted-foreground mb-1">Team Leader</label>
          <select value={leaderId} onChange={(e) => { setLeaderId(e.target.value); if (!memberIds.includes(e.target.value)) setMemberIds((p) => [...p, e.target.value]); }}
            className="w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors">
            <option value="" className="bg-popover">Select leader…</option>
            {participants.map((p) => <option key={p._id} value={p._id} className="bg-popover">{p.name} ({p.empCode})</option>)}
          </select>
        </div>

        {/* ── Members with Search ─────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-small text-muted-foreground">Members <span className="text-subtle-foreground">({memberIds.length} selected)</span></label>
          </div>
          {/* Search box */}
          <div className="relative mb-2">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search by name or employee code..."
              className="w-full pl-10 pr-4 py-2 rounded-md bg-background border border-input text-foreground text-sm placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
            {memberSearch && (
              <button type="button" onClick={() => setMemberSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">✕</button>
            )}
          </div>
          {/* Member list */}
          <div className="bg-muted border border-border rounded-md p-2 max-h-64 overflow-y-auto space-y-0.5">
            {sortedParticipants.length === 0 && (
              <div className="text-center text-subtle-foreground text-sm py-4">No users match "{memberSearch}"</div>
            )}
            {sortedParticipants.map((p) => {
              const isSelected = memberIds.includes(p._id);
              const otherTeam = userTeamMap[p._id];
              const isInOtherTeam = !isSelected && !!otherTeam;
              const isLeader = p._id === leaderId;

              return (
                <label key={p._id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                    isSelected
                      ? 'bg-primary/10 border border-primary/20'
                      : isInOtherTeam
                        ? 'opacity-60 hover:opacity-90 cursor-pointer hover:bg-warning/5 border border-transparent'
                        : 'cursor-pointer hover:bg-accent border border-transparent'
                  }`}
                >
                  <input type="checkbox" checked={isSelected} onChange={() => toggleMember(p._id)} className="w-4 h-4 rounded accent-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm truncate ${isSelected ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{p.name}</span>
                      {isLeader && <span className="text-[10px] text-warning bg-warning/15 px-1.5 py-0.5 rounded font-semibold shrink-0">Leader</span>}
                    </div>
                    {isInOtherTeam && (
                      <div className="text-[10px] text-warning mt-0.5">
                        {isSelected ? '⚠ Will transfer from' : '🔒 Currently in'} <span className="font-semibold">{otherTeam}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-subtle-foreground font-mono shrink-0">{p.empCode}</span>
                </label>
              );
            })}
          </div>
        </div>

        {isEdit && (
          <p className="text-xs text-warning/80 bg-warning-tint border border-warning/20 rounded-md px-3 py-2">
            Saving triggers Dynamic Team Sync — future schedules update automatically.
          </p>
        )}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>

      {/* Swap confirmation dialog */}
      {swapConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => setSwapConfirm(null)}>
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm mx-4 space-y-4 " onClick={(e) => e.stopPropagation()}>
            <h3 className="text-h3 text-foreground text-center">Swap Class Assignment?</h3>
            <p className="text-sm text-muted-foreground text-center">
              <span className="font-mono text-primary">{swapConfirm.classCode}</span> is currently assigned to <strong className="text-foreground">{swapConfirm.takenByTeam}</strong>.
            </p>
            <p className="text-sm text-muted-foreground text-center">
              If you continue, <strong className="text-warning">{swapConfirm.takenByTeam}</strong> will be unassigned from this class.
            </p>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" onClick={() => setSwapConfirm(null)} className="flex-1">Cancel</Button>
              <Button type="button" onClick={handleSwapConfirm} className="flex-1 bg-warning text-foreground hover:bg-warning/90">
                Swap & Assign
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer confirmation dialog */}
      {transferConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => setTransferConfirm(null)}>
          <div className="bg-card border border-border rounded-lg p-6 max-w-md mx-4 space-y-4 " onClick={(e) => e.stopPropagation()}>
            <h3 className="text-h3 text-foreground text-center">Transfer Members?</h3>
            <p className="text-sm text-muted-foreground text-center">
              The following users are currently active in other teams. Adding them to <strong className="text-primary">{name || 'this team'}</strong> will transfer them and close their previous enrollments.
            </p>
            <div className="bg-muted border border-border rounded-md p-3 max-h-48 overflow-y-auto space-y-2 mt-2">
              {transferConfirm.conflicts.map(c => (
                <div key={c.userId} className="flex justify-between items-center text-sm">
                  <div>
                    <span className="text-foreground font-medium">{c.name}</span>
                    <span className="text-subtle-foreground text-xs ml-2">{c.empCode}</span>
                  </div>
                  <span className="text-xs text-warning bg-warning/10 px-2 py-1 rounded">
                    from {c.currentTeamName}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => setTransferConfirm(null)} className="flex-1">Cancel</Button>
              <Button type="button" onClick={() => handleSubmit(null, false, true)} className="flex-1 bg-warning text-foreground hover:bg-warning/90">
                Confirm Transfer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </Portal>
  );
}

// ── Helper: derive a team's status from its class ─────────
const teamStatus = (t) => {
  if (!t.classId) return 'no-class';
  if (t.classId.status === 'Completed') return 'completed';
  return 'active'; // Ongoing or any other status
};

// ── Team Card ─────────────────────────────────────────────
function TeamCard({ t, canEdit, canDelete, onProgress, onEdit, onDelete, onMakeLeader, onStudentProgress }) {
  const leadId = t.leaderId?._id || t.leaderId;
  const classInfo = t.classId;
  const status = teamStatus(t);
  const isCompleted = status === 'completed';

  return (
    <div className={`bg-card border border-border rounded-lg overflow-hidden transition-all ${isCompleted ? 'opacity-60 grayscale-[30%]' : ''}`}>
      {/* ── Status bar at top ── */}
      <div className={`px-4 py-2 flex items-center justify-between ${
        isCompleted
          ? 'bg-muted/30 border-b border-border'
          : 'bg-success/10 border-b border-success/10'
      }`}>
        <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${isCompleted ? 'text-muted-foreground' : 'text-success'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-muted-foreground' : 'bg-success'}`} />
          {isCompleted ? 'Đã hoàn thành' : 'Đang học'}
        </span>
        {classInfo?.classCode && (
          <span className={`font-mono text-[11px] font-bold ${isCompleted ? 'text-subtle-foreground' : 'text-success'}`}>
            {classInfo.classCode}
          </span>
        )}
        {!classInfo && (
          <span className="text-[11px] text-warning/70">Chưa có lớp</span>
        )}
      </div>

      {/* ── Card body ── */}
      <div className="p-4 space-y-3">
        {/* Team name + actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className={`font-bold text-base leading-tight truncate ${isCompleted ? 'text-muted-foreground' : 'text-foreground'}`}>
              {t.name}
            </h3>
            {classInfo?.courseName && (
              <p className="text-xs text-subtle-foreground mt-0.5 truncate">{classInfo.courseName}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onProgress(t._id)}
              className="p-1.5 rounded-lg text-subtle-foreground hover:text-info hover:bg-info/10 transition-all"
              title="Xem tiến độ"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
            {canEdit && (
              <button
                onClick={() => onEdit(t)}
                className="p-1.5 rounded-lg text-subtle-foreground hover:text-primary hover:bg-primary/10 transition-all"
                title="Chỉnh sửa"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => onDelete(t._id)}
                className="p-1.5 rounded-lg text-subtle-foreground hover:text-destructive hover:bg-destructive-tint transition-all"
                title="Xoá"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Leader */}
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isCompleted ? 'bg-muted/20' : 'bg-warning/8 border border-warning/10'}`}>
          <span className="text-base">👑</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-subtle-foreground uppercase tracking-wider leading-none mb-0.5">Team Leader</p>
            <p className={`text-sm font-semibold truncate ${isCompleted ? 'text-muted-foreground' : 'text-warning'}`}>
              {t.leaderId?.name || '— Chưa có'}
            </p>
          </div>
          {t.leaderId?.empCode && (
            <span className="text-xs text-subtle-foreground font-mono">{t.leaderId.empCode}</span>
          )}
        </div>

        {/* Members */}
        <div>
          <p className="text-[10px] text-subtle-foreground uppercase tracking-wider mb-1.5">
            Thành viên · {t.members?.length || 0} người
          </p>
          <div className="space-y-1">
            {(t.members || []).map((m) => {
              const isLeader = m._id === leadId;
              if (isLeader) return null; // Leader shown above
              return (
                <div key={m._id} className="flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-accent transition-colors group">
                  <button
                    onClick={() => onStudentProgress({ id: m._id, name: m.name })}
                    className={`text-sm flex-1 text-left truncate transition-colors hover:underline ${isCompleted ? 'text-subtle-foreground' : 'text-muted-foreground hover:text-info'}`}
                  >
                    {m.name}
                  </button>
                  <span className="text-xs text-subtle-foreground font-mono shrink-0">{m.empCode}</span>
                  {canEdit && !isCompleted && (
                    <button
                      onClick={() => onMakeLeader(t, m._id)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-subtle-foreground hover:text-warning hover:bg-warning/10 px-1.5 py-0.5 rounded transition-all shrink-0"
                      title={`Đặt ${m.name} làm Leader`}
                    >
                      ★
                    </button>
                  )}
                </div>
              );
            })}
            {(!t.members || t.members.length <= 1) && (
              <p className="text-xs text-subtle-foreground px-3 py-1">Chỉ có Leader</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const { can } = useRole();
  const canCreate = can('create:team');
  const canEdit = can('update:team');
  const canDelete = can('delete:team');
  const deleteMutation = useDeleteTeam();
  const updateMutation = useUpdateTeam();
  const [modal, setModal] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [progressModal, setProgressModal] = useState(null);
  const [studentProgressModal, setStudentProgressModal] = useState(null);

  // ── Search, Sort & Status filter ──────────────────────
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'completed' | 'all'
  const [viewMode, setViewMode] = useState('cards');

  const { data: teams = [], isLoading: loadingTeams } = useTeams();
  const { data: participantsData } = useUsers({ role: 'Participant', limit: 200 });
  const participants = participantsData?.data || [];
  const { data: classes = [] } = useClasses();

  useEffect(() => { document.title = 'TMS — Teams'; }, []);

  // ── Counts for filter pills ────────────────────────────
  const activeCount = useMemo(() => teams.filter(t => teamStatus(t) === 'active').length, [teams]);
  const completedCount = useMemo(() => teams.filter(t => teamStatus(t) === 'completed').length, [teams]);

  // ── Filter + Sort ──────────────────────────────────────
  const filteredTeams = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = teams;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(t => teamStatus(t) === statusFilter);
    }

    // Text search
    if (q) {
      result = result.filter(t => {
        const fields = [
          t.name,
          t.leaderId?.name,
          t.classId?.classCode,
          t.classId?.courseName,
          ...(t.members || []).map(m => m.name),
          ...(t.members || []).map(m => m.empCode),
        ].map(s => (s || '').toLowerCase());
        return fields.some(f => f.includes(q));
      });
    }

    // Sort
    const sorted = [...result];
    switch (sortBy) {
      case 'name-asc':  sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi')); break;
      case 'name-desc': sorted.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'vi')); break;
      case 'class':     sorted.sort((a, b) => (a.classId?.classCode || 'ZZZ').localeCompare(b.classId?.classCode || 'ZZZ')); break;
      case 'members-desc': sorted.sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0)); break;
      case 'members-asc':  sorted.sort((a, b) => (a.members?.length || 0) - (b.members?.length || 0)); break;
      default: break;
    }
    return sorted;
  }, [teams, search, sortBy, statusFilter]);

  const handleDelete = async (id) => {
    try { await deleteMutation.mutateAsync(id); } catch { /* toast shown by global onError */ }
    setDeleteId(null);
  };

  const handleMakeLeader = async (team, memberId) => {
    const memberName = team.members?.find(m => (m._id || m) === memberId)?.name || memberId;
    if (!window.confirm(`Đặt "${memberName}" làm leader của "${team.name}"?`)) return;
    try { await updateMutation.mutateAsync({ id: team._id, data: { leaderId: memberId } }); }
    catch { /* toast shown by global onError */ }
  };

  const cardProps = {
    canEdit, canDelete,
    onProgress: (id) => setProgressModal(id),
    onEdit: (t) => setModal(t),
    onDelete: (id) => setDeleteId(id),
    onMakeLeader: handleMakeLeader,
    onStudentProgress: (info) => setStudentProgressModal(info),
  };

  return (
    <div className="space-y-5 ">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground">Teams</h1>
          <p className="text-muted-foreground mt-1">
            <span className="text-success font-medium">{activeCount} đang học</span>
            {completedCount > 0 && <span className="text-subtle-foreground"> · {completedCount} đã hoàn thành</span>}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setModal('create')} className="self-start">
            + Tạo nhóm
          </Button>
        )}
      </div>

      {/* ── Toolbar ───────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg px-4 py-3 space-y-3">
        {/* Status filter pills */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'active',    label: 'Đang học',       color: 'emerald' },
            { key: 'completed', label: 'Đã hoàn thành',  color: 'slate'   },
            { key: 'all',       label: 'Tất cả',         color: 'primary' },
          ].map(({ key, label, color }) => {
            const count = key === 'active' ? activeCount : key === 'completed' ? completedCount : teams.length;
            const isActive = statusFilter === key;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  isActive
                    ? color === 'emerald'
                      ? 'bg-success/20 text-success border border-success/30'
                      : color === 'slate'
                        ? 'bg-muted text-muted-foreground border border-border'
                        : 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-subtle-foreground hover:text-foreground hover:bg-accent border border-transparent'
                }`}
              >
                {key === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-success" />}
                {key === 'completed' && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />}
                {label}
                <span className={`text-xs px-1.5 py-0.5 rounded-md ${isActive ? 'bg-accent' : 'bg-muted/30'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search + Sort + View */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên nhóm, leader, thành viên, mã lớp..."
              className="w-full pl-10 pr-8 py-2 rounded-md bg-background border border-input text-foreground text-sm placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm">✕</button>}
          </div>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className="px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground text-sm focus:outline-none shrink-0">
            <option value="name-asc" className="bg-popover">Tên A → Z</option>
            <option value="name-desc" className="bg-popover">Tên Z → A</option>
            <option value="class" className="bg-popover">Mã lớp</option>
            <option value="members-desc" className="bg-popover">Nhiều thành viên nhất</option>
            <option value="members-asc" className="bg-popover">Ít thành viên nhất</option>
          </select>

          <div className="flex rounded-md border border-border overflow-hidden shrink-0">
            <button onClick={() => setViewMode('cards')}
              className={`px-3 py-2 text-xs font-medium transition-all ${viewMode === 'cards' ? 'bg-primary/15 text-primary' : 'text-subtle-foreground hover:text-foreground hover:bg-accent'}`}>
              ▦ Cards
            </button>
            <button onClick={() => setViewMode('table')}
              className={`px-3 py-2 text-xs font-medium transition-all border-l border-border ${viewMode === 'table' ? 'bg-primary/15 text-primary' : 'text-subtle-foreground hover:text-foreground hover:bg-accent'}`}>
              ☰ Bảng
            </button>
          </div>

          {search && (
            <span className="text-xs text-muted-foreground self-center whitespace-nowrap shrink-0">
              {filteredTeams.length} / {teams.length}
            </span>
          )}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────── */}
      {loadingTeams ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size={28} />
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="bg-card border border-border rounded-lg py-16 text-center">
          <div className="text-4xl mb-4">{search ? '🔍' : statusFilter === 'completed' ? '🎓' : '👥'}</div>
          <p className="text-muted-foreground">
            {search
              ? `Không tìm thấy nhóm nào khớp với "${search}"`
              : statusFilter === 'completed'
                ? 'Chưa có nhóm nào hoàn thành'
                : 'Chưa có nhóm nào đang học'}
          </p>
          {(search || statusFilter !== 'all') && (
            <button onClick={() => { setSearch(''); setStatusFilter('all'); }}
              className="mt-3 px-4 py-2 rounded-md bg-primary/15 text-primary text-sm hover:bg-primary/30 transition-all">
              Xem tất cả
            </button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTeams.map((t) => (
            <TeamCard key={t._id} t={t} {...cardProps} />
          ))}
        </div>
      ) : (
        /* ── TABLE VIEW ───────────────────────────────────── */
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr>
                  <th className="px-4 py-3 border-b border-border text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider w-36">Trạng thái</th>
                  <th className="px-4 py-3 border-b border-border text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Tên nhóm</th>
                  <th className="px-4 py-3 border-b border-border text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Lớp / Khóa</th>
                  <th className="px-4 py-3 border-b border-border text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Leader</th>
                  <th className="px-4 py-3 border-b border-border text-center text-xs text-muted-foreground font-semibold uppercase tracking-wider">SL</th>
                  <th className="px-4 py-3 border-b border-border text-center text-xs text-muted-foreground font-semibold uppercase tracking-wider">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTeams.map((t) => {
                  const status = teamStatus(t);
                  const isCompleted = status === 'completed';
                  return (
                    <tr key={t._id} className={`transition-colors ${isCompleted ? 'opacity-60 hover:opacity-80' : 'hover:bg-muted/20'}`}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                          isCompleted
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-success/15 text-success'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-muted-foreground' : 'bg-success'}`} />
                          {isCompleted ? 'Hoàn thành' : 'Đang học'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold text-sm ${isCompleted ? 'text-muted-foreground' : 'text-foreground'}`}>{t.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        {t.classId ? (
                          <div>
                            <span className="font-mono text-sm text-primary">{t.classId.classCode}</span>
                            <p className="text-xs text-subtle-foreground mt-0.5">{t.classId.courseName}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-warning/70">Chưa có lớp</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${isCompleted ? 'text-muted-foreground' : 'text-warning'}`}>
                          {t.leaderId?.name || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-accent text-muted-foreground text-sm font-bold">
                          {t.members?.length || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setProgressModal(t._id)} className="p-1.5 rounded-lg text-subtle-foreground hover:text-info hover:bg-info/10 transition-all" title="Xem tiến độ">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                          </button>
                          {canEdit && <button onClick={() => setModal(t)} className="p-1.5 rounded-lg text-subtle-foreground hover:text-primary hover:bg-primary/10 transition-all" title="Chỉnh sửa">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>}
                          {canDelete && <button onClick={() => setDeleteId(t._id)} className="p-1.5 rounded-lg text-subtle-foreground hover:text-destructive hover:bg-destructive-tint transition-all" title="Xoá">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Delete confirm ────────────────────────────────── */}
      {deleteId && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-card border border-border rounded-lg p-6 max-w-sm mx-4 text-center space-y-4 ">
              <h3 className="text-h3 text-foreground">Xoá nhóm này?</h3>
              <p className="text-sm text-muted-foreground">Thao tác này không thể hoàn tác.</p>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Huỷ</Button>
                <Button type="button" variant="destructive" onClick={() => handleDelete(deleteId)} className="flex-1">Xoá</Button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── Modals ────────────────────────────────────────── */}
      {(modal === 'create' || (modal && modal._id)) && (
        <TeamModal team={modal === 'create' ? null : modal} participants={participants} classes={classes} teams={teams}
          onClose={() => setModal(null)} onSaved={() => setModal(null)} />
      )}
      {progressModal && <TeamProgressModal teamId={progressModal} onClose={() => setProgressModal(null)} />}
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
