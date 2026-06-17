import { teamStatus } from './team-status';

// ── DataTable column definitions for the Teams table view ─────────────────
// Pure builder: takes the page's capability flags + row-action setters and
// returns the column config. Kept out of TeamsPage so the render functions
// (status pill, action buttons) read in isolation.
export function buildTeamColumns({ canEdit, canDelete, setProgressModal, setModal, setDeleteId }) {
  return [
    {
      key: null,
      header: 'Status',
      width: 140,
      render: (t) => {
        const status = teamStatus(t);
        const isCompleted = status === 'completed';
        return (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            isCompleted ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isCompleted ? 'bg-muted-foreground' : 'bg-success'}`} />
            {isCompleted ? 'Completed' : 'Ongoing'}
          </span>
        );
      },
    },
    {
      key: 'name',
      header: 'Team name',
      render: (t) => {
        const isCompleted = teamStatus(t) === 'completed';
        return (
          <span className={`font-semibold text-sm ${isCompleted ? 'text-muted-foreground' : 'text-foreground'}`}>
            {t.name}
          </span>
        );
      },
    },
    {
      key: null,
      header: 'Class / Course',
      render: (t) => t.classId ? (
        <div>
          <span className="font-mono text-sm text-primary">{t.classId.classCode}</span>
          <p className="text-xs text-subtle-foreground mt-0.5">{t.classId.courseName}</p>
        </div>
      ) : (
        <span className="text-xs text-warning/70">No class yet</span>
      ),
    },
    {
      key: null,
      header: 'Leader',
      render: (t) => {
        const isCompleted = teamStatus(t) === 'completed';
        return (
          <span className={`text-sm ${isCompleted ? 'text-muted-foreground' : 'text-warning'}`}>
            {t.leaderId?.name || '—'}
          </span>
        );
      },
    },
    {
      key: null,
      header: 'Qty',
      headerCls: 'text-center',
      cellCls: 'text-center',
      width: 56,
      render: (t) => (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-accent text-muted-foreground text-sm font-bold">
          {t.members?.length || 0}
        </span>
      ),
    },
    {
      key: null,
      header: 'Actions',
      headerCls: 'text-center',
      cellCls: 'text-center',
      width: 100,
      render: (t) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => setProgressModal(t._id)}
            className="p-1.5 rounded-lg text-subtle-foreground hover:text-info hover:bg-info/10 transition-all"
            title="View progress">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
          {canEdit && (
            <button onClick={() => setModal(t)}
              className="p-1.5 rounded-lg text-subtle-foreground hover:text-primary hover:bg-primary/10 transition-all"
              title="Edit">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button onClick={() => setDeleteId(t._id)}
              className="p-1.5 rounded-lg text-subtle-foreground hover:text-destructive hover:bg-destructive-tint transition-all"
              title="Delete">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      ),
    },
  ];
}
