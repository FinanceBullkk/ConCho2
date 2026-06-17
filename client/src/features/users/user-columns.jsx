import { ShieldAlert, LogOut, BarChart3, Pencil, Trash2, Building2 } from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ── DataTable column definitions for the Users table ──────────────────────
// Pure builder: takes the page's data + handlers and returns the column config.
// Kept out of UsersPage so the (large) render functions read in isolation.
export function buildUserColumns({
  teamsByUser, can, currentUserId,
  setProgressModal, setModal, setAssignModal, setDeleteId, openAdminAction,
}) {
  return [
    {
      key: 'empCode', header: 'Code', sortable: true, width: 90,
      render: (u) => <span className="font-mono text-primary font-medium text-xs">{u.empCode}</span>,
    },
    {
      // UX-02: cap name width so very long Vietnamese names don't widen the
      // whole row when sort puts them at the top.
      key: 'name', header: 'Name', sortable: true, width: 220,
      render: (u) => (
        <div className="min-w-0">
          <button
            onClick={() => setProgressModal({ id: u._id, name: u.name })}
            className="font-medium text-foreground text-sm hover:text-info hover:underline transition-colors text-left truncate max-w-full"
            title={u.name}
          >
            {u.name}
          </button>
          {u.role !== 'Participant' && (
            <StatusBadge status={u.role} size="sm" className="ml-2" />
          )}
        </div>
      ),
    },
    {
      // UX-02: cap email column width to keep table layout stable when sort
      // brings users with long emails to the top — otherwise the email cell
      // expanded and pushed the ACTIONS column off-screen.
      key: 'email', header: 'Email', sortable: true, width: 200,
      render: (u) => u.email
        ? <span className="font-mono text-xs text-muted-foreground block truncate max-w-[180px]" title={u.email}>{u.email}</span>
        : <span className="text-warning/70 text-xs" title="No email set — won't receive Calendar invites">—</span>,
    },
    {
      key: 'department', header: 'BU', sortable: true, width: 110,
      render: (u) => <span className="text-muted-foreground text-xs truncate block max-w-full" title={u.department}>{u.department || '—'}</span>,
    },
    {
      key: 'position', header: 'Position', sortable: true, width: 110,
      render: (u) => <span className="text-muted-foreground text-xs truncate block max-w-full" title={u.position}>{u.position || '—'}</span>,
    },
    {
      key: 'currentLevel', header: 'Level', sortable: true, width: 130,
      render: (u) => (u.entranceLevel || u.currentLevel) ? (
        <div className="min-w-0">
          {u.currentLevel && <div className="text-xs font-medium text-foreground truncate" title={u.currentLevel}>{u.currentLevel}</div>}
          {u.entranceLevel && u.entranceLevel !== u.currentLevel && (
            <div className="text-[10px] text-subtle-foreground truncate" title={`from ${u.entranceLevel}`}>from {u.entranceLevel}</div>
          )}
        </div>
      ) : <span className="text-xs text-subtle-foreground">—</span>,
    },
    {
      key: 'status', header: 'Status', sortable: true, width: 130,
      render: (u) => (
        <div className="min-w-0">
          <StatusBadge status={u.status} size="sm" />
          {u.dropReason && (
            <div className="text-[10px] text-subtle-foreground mt-0.5 truncate max-w-[120px]" title={u.dropReason}>
              {u.dropReason}
            </div>
          )}
        </div>
      ),
    },
    {
      key: '_team', header: 'Team / Class', width: 170,
      render: (u) => teamsByUser[u._id] ? (
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground truncate" title={teamsByUser[u._id].teamName}>{teamsByUser[u._id].teamName}</div>
          {teamsByUser[u._id].classCode && (
            <div className="text-[10px] text-subtle-foreground truncate" title={`${teamsByUser[u._id].classCode} — ${teamsByUser[u._id].courseName}`}>
              {teamsByUser[u._id].classCode} — {teamsByUser[u._id].courseName}
            </div>
          )}
        </div>
      ) : <span className="text-xs text-subtle-foreground italic">—</span>,
    },
    {
      key: 'lastActive', header: 'Last Active', width: 100,
      render: (u) => u.lastActive ? (
        <div>
          <div className="text-xs text-foreground">
            {new Date(u.lastActive).toLocaleDateString('en', { day: '2-digit', month: 'short' })}
          </div>
          <div className={cn('text-[10px] font-semibold tabular-nums', u.daysSince > 30 ? 'text-destructive' : u.daysSince > 14 ? 'text-warning' : 'text-subtle-foreground')}>
            {u.daysSince}d ago{u.daysSince > 30 ? ' !' : ''}
          </div>
        </div>
      ) : <span className="text-xs text-subtle-foreground">—</span>,
    },
    {
      key: '_actions', header: 'Actions', width: 170,
      render: (u) => (
        <div className="flex gap-1 flex-wrap">
          <Button
            size="sm" variant="ghost"
            onClick={() => setProgressModal({ id: u._id, name: u.name })}
            title="View Progress"
            className="h-7 px-2 text-muted-foreground hover:text-info hover:bg-info/10"
          >
            <BarChart3 className="size-3.5" aria-hidden="true" />
          </Button>
          {can('update:user') && (
            <Button
              size="sm" variant="ghost"
              onClick={() => setModal(u)}
              title="Edit user"
              className="h-7 px-2 text-muted-foreground hover:text-primary hover:bg-primary/10"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          {can('assign:org') && (
            <Button
              size="sm" variant="ghost"
              onClick={() => setAssignModal(u)}
              title="Assign manager / department"
              className="h-7 px-2 text-muted-foreground hover:text-primary hover:bg-primary/10"
            >
              <Building2 className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          {can('delete:user') && (
            <Button
              size="sm" variant="ghost"
              onClick={() => setDeleteId(u._id)}
              title="Delete user"
              className="h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          {u._id !== currentUserId && (
            <>
              {can('force-logout:user') && (
                <Button
                  size="sm" variant="ghost"
                  onClick={() => openAdminAction({ type: 'force-logout', userId: u._id, userName: u.name })}
                  title="Force logout — invalidate all active sessions"
                  className="h-7 px-2 text-muted-foreground hover:text-warning hover:bg-warning/10"
                >
                  <LogOut className="size-3.5" aria-hidden="true" />
                </Button>
              )}
              {u.mfaEnabled && can('disable-mfa:user') && (
                <Button
                  size="sm" variant="ghost"
                  onClick={() => openAdminAction({ type: 'reset-mfa', userId: u._id, userName: u.name })}
                  title="Disable MFA — user can log in without 2FA until re-enrolled"
                  className="h-7 px-2 text-muted-foreground hover:text-warning hover:bg-warning/10"
                >
                  <ShieldAlert className="size-3.5" aria-hidden="true" />
                </Button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];
}
