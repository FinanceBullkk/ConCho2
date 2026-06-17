import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateTeam, useUpdateTeam } from '../../hooks/useTeams';
import { useCheckEnrollmentConflicts } from '../../hooks/useEnrollments';

export default function TeamModal({ team, participants, classes, teams, onClose, onSaved }) {
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

  // Audit PR R (FE-010): hand-rolled overlay replaced with Radix Dialog
  // (focus-trap, ESC, ARIA, aria-modal — all free). The nested swap +
  // transfer confirmations remain as inline conditional renders for now;
  // we'll migrate those in a follow-up so this PR is reviewable in one sit.
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto"
        aria-label={isEdit ? 'Edit team' : 'Create team'}
      >
      <form onSubmit={(e) => handleSubmit(e)} className="space-y-4">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">{isEdit ? '✏️ Edit Team' : '➕ Create Team'}</DialogTitle>
        </DialogHeader>
        {error && <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>}

        {/* ── Top fields: 2-column layout ─────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="team-name" className="block text-small text-muted-foreground mb-1">Team Name</label>
            <input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" required
              className="w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
          <div>
            <label htmlFor="team-class" className="block text-small text-muted-foreground mb-1">Assigned Class</label>
            <select id="team-class" value={classId} onChange={(e) => handleClassChange(e.target.value)}
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
          <label htmlFor="team-leader" className="block text-small text-muted-foreground mb-1">Team Leader</label>
          <select id="team-leader" value={leaderId} onChange={(e) => { setLeaderId(e.target.value); if (!memberIds.includes(e.target.value)) setMemberIds((p) => [...p, e.target.value]); }}
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => setSwapConfirm(null)} aria-hidden="true">
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={() => setTransferConfirm(null)} aria-hidden="true">
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
      </DialogContent>
    </Dialog>
  );
}
