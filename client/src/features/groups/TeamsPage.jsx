import { useState, useEffect, useMemo } from 'react';
import TeamProgressModal from '../../components/Progress/TeamProgressModal';
import StudentProgressModal from '../../components/Progress/StudentProgressModal';
import Portal from '../../components/Portal';
import { useTeams, useDeleteTeam, useUpdateTeam } from '../../hooks/useTeams';
import { useUsers } from '../../hooks/useUsers';
import { useClasses } from '../../hooks/useClasses';
import { useRole } from '../../hooks/useRole';
import { useListUrlState } from '../../hooks/useListUrlState';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { DataTable } from '../../components/DataTable';
import { FilterBar } from '../../components/FilterBar';
import { StatusChips } from '../../components/StatusChips';
import { ActiveFilterChips } from '../../components/ActiveFilterChips';
import TeamModal from './TeamModal';
import TeamCard from './TeamCard';
import { buildTeamColumns } from './team-columns';
import { teamStatus } from './team-status';

// ── Teams page (shell) ────────────────────────────────────
// The create/edit form (TeamModal), the card view (TeamCard) and the table
// columns (team-columns) live in sibling files; this file orchestrates state,
// filters, sort, the card/table toggle and the modals.
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

  // ── URL-synced filter state (Phase 3 Screen 5 §F) ─────
  // status: 'all' | 'active' | 'completed' — stored explicitly so URL is shareable.
  const list = useListUrlState({ defaults: { status: 'active' } });
  const search       = list.debouncedSearch;
  const statusFilter = list.status || 'active';
  // Write status explicitly via setParam (bypasses chip-toggle-off behavior).
  const setStatusFilter = (v) => list.setParam('status', v);

  const [sortBy, setSortBy] = useState('name-asc');
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
    if (!window.confirm(`Make "${memberName}" the leader of "${team.name}"?`)) return;
    try { await updateMutation.mutateAsync({ id: team._id, data: { leaderId: memberId } }); }
    catch { /* toast shown by global onError */ }
  };

  // teamStatus is a module-level fn — not a valid reactive dependency.
  const teamTableColumns = useMemo(
    () => buildTeamColumns({ canEdit, canDelete, setProgressModal, setModal, setDeleteId }),
    [canEdit, canDelete, setProgressModal, setModal, setDeleteId],
  );

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
            <span className="text-success font-medium">{activeCount} ongoing</span>
            {completedCount > 0 && <span className="text-subtle-foreground"> · {completedCount} completed</span>}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setModal('create')} className="self-start">
            + Create team
          </Button>
        )}
      </div>

      {/* ── Search + filters (canonical FilterBar §05) ───── */}
      <FilterBar
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by team name, leader, member, class code…"
      >
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort"
          className="h-(--control-h) px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors duration-(--dur-fast)">
          <option value="name-asc" className="bg-popover">Name A → Z</option>
          <option value="name-desc" className="bg-popover">Name Z → A</option>
          <option value="class" className="bg-popover">Class code</option>
          <option value="members-desc" className="bg-popover">Most members</option>
          <option value="members-asc" className="bg-popover">Fewest members</option>
        </select>

        <div className="flex rounded-md border border-border overflow-hidden shrink-0">
          <button type="button" onClick={() => setViewMode('cards')}
            className={`px-3 py-1.5 text-xs font-medium transition-all ${viewMode === 'cards' ? 'bg-primary/15 text-primary' : 'text-subtle-foreground hover:text-foreground hover:bg-accent'}`}>
            ▦ Cards
          </button>
          <button type="button" onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 text-xs font-medium transition-all border-l border-border ${viewMode === 'table' ? 'bg-primary/15 text-primary' : 'text-subtle-foreground hover:text-foreground hover:bg-accent'}`}>
            ☰ Table
          </button>
        </div>
      </FilterBar>

      {/* ── Status chips (primary axis) + active filter chips ── */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusChips
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'active',    label: 'Ongoing',   count: activeCount },
            { value: 'completed', label: 'Completed', count: completedCount },
            { value: 'all',       label: 'All',       count: teams.length },
          ]}
        />
        {list.search && (
          <ActiveFilterChips
            filters={[{ key: 'q', label: `Search: ${list.search}`, onRemove: () => list.setSearch('') }]}
          />
        )}
        {list.search && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {filteredTeams.length} / {teams.length}
          </span>
        )}
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
              ? `No teams match "${search}"`
              : statusFilter === 'completed'
                ? 'No completed teams yet'
                : 'No ongoing teams yet'}
          </p>
          {(search || statusFilter !== 'all') && (
            <button onClick={() => { list.clearAll(); }}
              className="mt-3 px-4 py-2 rounded-md bg-primary/15 text-primary text-sm hover:bg-primary/30 transition-all">
              View all
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
        <DataTable
          columns={teamTableColumns}
          data={filteredTeams}
          rowKey="_id"
          emptyTitle="No teams"
          emptyMessage="Try changing the filter or search."
        />
      )}

      {/* ── Delete confirm ────────────────────────────────── */}
      {deleteId && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-card border border-border rounded-lg p-6 max-w-sm mx-4 text-center space-y-4 ">
              <h3 className="text-h3 text-foreground">Delete this team?</h3>
              <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Cancel</Button>
                <Button type="button" variant="destructive" onClick={() => handleDelete(deleteId)} className="flex-1">Delete</Button>
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
