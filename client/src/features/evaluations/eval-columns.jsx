import { ScoreCell, AvgCell } from './eval-helpers';

// ── DataTable column definitions for the evaluations table ─────────────────
// Pure builder: takes the delete mutation + the modal setter and returns the
// column config (learner, level, the four scores, average, comment, actions).
export function buildEvalColumns({ deleteEval, setModal }) {
  return [
    {
      key: null,
      header: 'Learner',
      render: (row) => (
        <div>
          <div className="font-semibold text-foreground">{row.userId?.name ?? '—'}</div>
          <div className="text-xs text-subtle-foreground">
            {row.userId?.empCode}
            {row.userId?.department ? ` · ${row.userId.department}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'level',
      header: 'Level',
      render: (row) =>
        row._hasEval === false ? (
          <span className="text-subtle-foreground italic text-xs">Not evaluated</span>
        ) : (
          <span className="text-sm text-foreground">{row.level || <span className="text-subtle-foreground">—</span>}</span>
        ),
    },
    {
      key: null,
      header: 'Grammar',
      headerCls: 'text-center',
      cellCls: 'text-center',
      render: (row) =>
        row._hasEval === false ? (
          <span className="text-subtle-foreground">—</span>
        ) : (
          <ScoreCell score={row.grammarScore} />
        ),
    },
    {
      key: null,
      header: 'Vocab',
      headerCls: 'text-center',
      cellCls: 'text-center',
      render: (row) =>
        row._hasEval === false ? (
          <span className="text-subtle-foreground">—</span>
        ) : (
          <ScoreCell score={row.vocabularyScore} />
        ),
    },
    {
      key: null,
      header: 'Pronunciation',
      headerCls: 'text-center',
      cellCls: 'text-center',
      className: 'hidden sm:table-cell',
      render: (row) =>
        row._hasEval === false ? (
          <span className="text-subtle-foreground">—</span>
        ) : (
          <ScoreCell score={row.pronunciationScore} />
        ),
    },
    {
      key: null,
      header: 'Fluency',
      headerCls: 'text-center',
      cellCls: 'text-center',
      className: 'hidden sm:table-cell',
      render: (row) =>
        row._hasEval === false ? (
          <span className="text-subtle-foreground">—</span>
        ) : (
          <ScoreCell score={row.fluencyScore} />
        ),
    },
    {
      key: null,
      header: 'Avg',
      headerCls: 'text-center',
      cellCls: 'text-center',
      render: (row) =>
        row._hasEval === false ? (
          <span className="text-subtle-foreground">—</span>
        ) : (
          <AvgCell
            g={row.grammarScore}
            v={row.vocabularyScore}
            p={row.pronunciationScore}
            f={row.fluencyScore}
          />
        ),
    },
    {
      key: 'teacherComment',
      header: 'Comment',
      className: 'hidden lg:table-cell',
      render: (row) => (
        <span className="text-xs text-muted-foreground line-clamp-2 max-w-xs">
          {row.teacherComment || <span className="text-subtle-foreground">—</span>}
        </span>
      ),
    },
    {
      key: null,
      header: '',
      headerCls: 'text-right',
      cellCls: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() =>
              setModal(
                row._hasEval === false
                  ? { eval: null, user: row.userId }
                  : { eval: row, user: row.userId }
              )
            }
            className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors"
          >
            {row._hasEval === false ? 'Grade' : 'Edit'}
          </button>
          {row._id && !String(row._id).startsWith('__no-eval__') && (
            <button
              onClick={() => {
                if (window.confirm('Delete this evaluation?')) deleteEval.mutate(row._id);
              }}
              className="text-xs px-2.5 py-1 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];
}
