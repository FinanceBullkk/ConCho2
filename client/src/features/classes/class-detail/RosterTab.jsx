import { useState, useMemo } from 'react';
import { Users, Search, MoreHorizontal, X as XIcon } from 'lucide-react';
import { StatusBadge } from '../../../components/StatusBadge';
import { EmptyState } from '../../../components/EmptyState';
import { Spinner } from '../../../components/Spinner';
import { EnrollmentDrawer } from '../../../components/EnrollmentDrawer';
import { useEnrollments } from '../../../hooks/useEnrollments';
import { useTeams } from '../../../hooks/useTeams';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// Tab 2 · Roster — folds EnrollmentPage logic
//   FilterBar (chips + search) + DataTable + selection bar + drawers
// ──────────────────────────────────────────────────────────
const STATUS_CHIPS = ['All', 'Active', 'On-hold', 'Dropped', 'Transferred'];

export default function RosterTab({ classId, classTeamId, canEdit }) {
  const params = useMemo(() => ({ classId }), [classId]);
  const { data: enrollments = [], isLoading } = useEnrollments(params);
  const { data: teams = [] } = useTeams();

  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch]             = useState('');
  const [selected, setSelected]         = useState(() => new Set()); // Set<enrollmentId>
  const [drawerMode, setDrawerMode]     = useState(null); // 'transfer' | 'status' | 'drop' | null

  // Filtered rows
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrollments.filter((e) => {
      if (statusFilter !== 'All' && e.status !== statusFilter) return false;
      if (!q) return true;
      const name = e.userId?.name?.toLowerCase() || '';
      const code = e.userId?.empCode?.toLowerCase() || '';
      return name.includes(q) || code.includes(q);
    });
  }, [enrollments, statusFilter, search]);

  const selectedRows = useMemo(
    () => enrollments.filter((e) => selected.has(e._id)),
    [enrollments, selected],
  );

  const allVisibleSelected = filtered.length > 0 && filtered.every((e) => selected.has(e._id));

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        filtered.forEach((e) => next.delete(e._id));
        return next;
      } else {
        const next = new Set(prev);
        filtered.forEach((e) => next.add(e._id));
        return next;
      }
    });
  };

  const clearSelection = () => setSelected(new Set());

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner size={24} /></div>;
  }

  if (enrollments.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No students yet"
        description="Add students to this class via the assigned team."
      />
    );
  }

  // Per-status counts for chip labels
  const counts = {};
  enrollments.forEach((e) => { counts[e.status] = (counts[e.status] || 0) + 1; });
  counts.All = enrollments.length;

  return (
    <div className="space-y-3">
      {/* ── FilterBar (chips + search) ─────────────────── */}
      <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
        <span className="text-overline text-subtle-foreground mr-1">Status</span>
        {STATUS_CHIPS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors duration-(--dur-fast)',
              statusFilter === s
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-background border-border text-muted-foreground hover:bg-accent',
            )}
          >
            {s}
            {counts[s] > 0 && (
              <span className={cn(
                'text-[10px] font-mono tabular-nums px-1 rounded',
                statusFilter === s ? 'bg-primary/20' : 'bg-muted',
              )}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}

        <div className="relative ml-auto min-w-[180px] max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-subtle-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full h-(--control-h) pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          />
        </div>
      </div>

      {/* ── Selection bar (sticky) ─────────────────────── */}
      {canEdit && selected.size > 0 && (
        <div className="sticky top-3 z-20 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
          <span className="font-semibold">{selected.size} selected</span>
          <span className="text-subtle-foreground">·</span>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDrawerMode('transfer')}>
            Transfer to team…
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDrawerMode('status')}>
            Change status…
          </Button>
          <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={() => setDrawerMode('drop')}>
            Drop
          </Button>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={clearSelection}>
            <XIcon className="size-3 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-muted">
                {canEdit && (
                  <th className="px-3 py-2 w-9 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      aria-label="Select all visible rows"
                      className="size-3.5 accent-primary cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-3 py-2 text-left text-overline text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left text-overline text-muted-foreground">Name · Dept</th>
                <th className="px-3 py-2 text-left text-overline text-muted-foreground">Team</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">Att %</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">Sessions</th>
                <th className="px-3 py-2 text-left text-overline text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-center text-overline text-muted-foreground w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={canEdit ? 8 : 7} className="px-3 py-8 text-center text-muted-foreground text-sm">
                  No students match the current filter.
                </td></tr>
              ) : filtered.map((e) => {
                const att = e.attendance || {};
                const total = att.total || 0;
                const rate = total > 0 ? Math.round(((att.P || 0) / total) * 100) : null;
                const isSel = selected.has(e._id);
                const rateColor =
                  rate == null ? 'text-subtle-foreground' :
                  rate >= 80   ? 'text-success' :
                  rate >= 60   ? 'text-warning' : 'text-destructive';

                return (
                  <tr key={e._id} className={cn(
                    'hover:bg-accent transition-colors',
                    isSel && 'bg-primary/[0.04]',
                  )}>
                    {canEdit && (
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleRow(e._id)}
                          aria-label={`Select ${e.userId?.name}`}
                          className="size-3.5 accent-primary cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 text-mono text-primary text-xs">{e.userId?.empCode}</td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-semibold text-foreground">{e.userId?.name}</div>
                      <div className="text-[11px] text-subtle-foreground">{e.userId?.department || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-sm text-muted-foreground">{e.teamId?.name || '—'}</td>
                    <td className={cn('px-3 py-2 text-right text-xs font-mono font-semibold tabular-nums', rateColor)}>
                      {rate != null ? `${rate}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                      {(att.P || 0)}/{total || 0}
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={e.status} size="sm" /></td>
                    <td className="px-3 py-2 text-center">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => { setSelected(new Set([e._id])); setDrawerMode('status'); }}
                          aria-label="Row actions"
                          className="p-1 rounded text-subtle-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Drawer ─────────────────────────────────────── */}
      <EnrollmentDrawer
        isOpen={!!drawerMode}
        mode={drawerMode || 'status'}
        selected={selectedRows}
        teams={teams}
        excludeTeamId={classTeamId}
        onClose={() => setDrawerMode(null)}
        onDone={() => { setDrawerMode(null); clearSelection(); }}
      />
    </div>
  );
}
