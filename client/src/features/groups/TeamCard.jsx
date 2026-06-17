import { teamStatus } from './team-status';

// ── Team Card ─────────────────────────────────────────────
export default function TeamCard({ t, canEdit, canDelete, onProgress, onEdit, onDelete, onMakeLeader, onStudentProgress }) {
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
          {isCompleted ? 'Completed' : 'Ongoing'}
        </span>
        {classInfo?.classCode && (
          <span className={`font-mono text-[11px] font-bold ${isCompleted ? 'text-subtle-foreground' : 'text-success'}`}>
            {classInfo.classCode}
          </span>
        )}
        {!classInfo && (
          <span className="text-[11px] text-warning/70">No class yet</span>
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
              title="View progress"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
            {canEdit && (
              <button
                onClick={() => onEdit(t)}
                className="p-1.5 rounded-lg text-subtle-foreground hover:text-primary hover:bg-primary/10 transition-all"
                title="Edit"
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
                title="Delete"
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
              {t.leaderId?.name || '— None yet'}
            </p>
          </div>
          {t.leaderId?.empCode && (
            <span className="text-xs text-subtle-foreground font-mono">{t.leaderId.empCode}</span>
          )}
        </div>

        {/* Members */}
        <div>
          <p className="text-[10px] text-subtle-foreground uppercase tracking-wider mb-1.5">
            Members · {t.members?.length || 0}
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
                      title={`Make ${m.name} the Leader`}
                    >
                      ★
                    </button>
                  )}
                </div>
              );
            })}
            {(!t.members || t.members.length <= 1) && (
              <p className="text-xs text-subtle-foreground px-3 py-1">Leader only</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
