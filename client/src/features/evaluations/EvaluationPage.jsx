import { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClasses } from '../../hooks/useClasses';
import { useEnrollments } from '../../hooks/useEnrollments';
import { useEvaluations, useUpsertEvaluation, useDeleteEvaluation } from './useEvaluations';
import { useUsers } from '../../hooks/useUsers';
import { useDebounce } from '../../hooks/useDebounce';
import { DataTable } from '../../components/DataTable';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';

// ──────────────────────────────────────────────────────────
// EvaluationPage
// ──────────────────────────────────────────────────────────
// Allows Admin and Teacher to view and enter per-learner
// evaluation scores (grammar, vocabulary, pronunciation,
// fluency) for a selected class.
//
// Admin:   can also toggle "show all enrolled" to see
//          participants who haven't been evaluated yet.
// Teacher: sees existing evaluations + can add/edit.
// ──────────────────────────────────────────────────────────

// ── Score helpers ─────────────────────────────────────────

const scoreColor = (s) => {
  if (s == null || s === '') return 'text-subtle-foreground';
  const n = Number(s);
  if (n >= 8) return 'text-success';
  if (n >= 6) return 'text-warning';
  if (n > 0)  return 'text-destructive';
  return 'text-subtle-foreground';
};

function ScoreCell({ score }) {
  if (score == null || score === '' || Number(score) === 0) {
    return <span className="text-subtle-foreground">—</span>;
  }
  return (
    <span className={`font-semibold tabular-nums ${scoreColor(score)}`}>
      {score}
    </span>
  );
}

function AvgCell({ g, v, p, f }) {
  const vals = [g, v, p, f];
  if (vals.every((x) => x == null || x === '' || Number(x) === 0)) {
    return <span className="text-subtle-foreground">—</span>;
  }
  const avg = vals.reduce((acc, x) => acc + (Number(x) || 0), 0) / 4;
  return (
    <span className={`font-bold tabular-nums ${scoreColor(avg)}`}>
      {avg.toFixed(1)}
    </span>
  );
}

// ── Shared input class ────────────────────────────────────
const INPUT_CLS =
  'w-full px-3 h-9 rounded-md bg-background border border-input text-foreground ' +
  'placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring ' +
  'transition-colors text-sm';

// ── EvalModal ─────────────────────────────────────────────

function EvalModal({ classId, existingEval, preselectedUser, onClose }) {
  const isEdit = !!existingEval?._id;

  const [form, setForm] = useState({
    level:              existingEval?.level             ?? '',
    grammarScore:       existingEval?.grammarScore      ?? '',
    vocabularyScore:    existingEval?.vocabularyScore   ?? '',
    pronunciationScore: existingEval?.pronunciationScore ?? '',
    fluencyScore:       existingEval?.fluencyScore      ?? '',
    teacherComment:     existingEval?.teacherComment    ?? '',
  });

  // User selection (only for new evaluations without a pre-selected user)
  const resolvedPreset =
    preselectedUser ||
    (existingEval?.userId && typeof existingEval.userId === 'object'
      ? existingEval.userId
      : null);
  const [selectedUser, setSelectedUser] = useState(resolvedPreset);
  const [userSearch, setUserSearch] = useState('');
  const debouncedSearch = useDebounce(userSearch, 300);

  const { data: searchRaw } = useUsers(
    { search: debouncedSearch, limit: 10 },
    { enabled: !isEdit && !selectedUser && debouncedSearch.length >= 2 }
  );
  const searchResults = Array.isArray(searchRaw)
    ? searchRaw
    : searchRaw?.data ?? [];

  const upsert = useUpsertEvaluation();

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const uid =
      selectedUser?._id ||
      existingEval?.userId?._id ||
      existingEval?.userId;
    if (!uid) return;

    await upsert.mutateAsync({
      classId,
      userId: uid,
      level:              form.level,
      grammarScore:       form.grammarScore       === '' ? 0 : Number(form.grammarScore),
      vocabularyScore:    form.vocabularyScore    === '' ? 0 : Number(form.vocabularyScore),
      pronunciationScore: form.pronunciationScore === '' ? 0 : Number(form.pronunciationScore),
      fluencyScore:       form.fluencyScore       === '' ? 0 : Number(form.fluencyScore),
      teacherComment:     form.teacherComment,
    });
    onClose();
  };

  const ScoreInput = ({ label, fieldKey }) => (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">
        {label} <span className="text-subtle-foreground">(0–10)</span>
      </label>
      <input
        type="number"
        min={0}
        max={10}
        step={0.5}
        value={form[fieldKey]}
        onChange={(e) => set(fieldKey, e.target.value)}
        className={INPUT_CLS}
        placeholder="0"
      />
    </div>
  );

  // Audit PR S (FE-010): Radix Dialog — focus-trap, ESC, ARIA + a
  // built-in close button (showCloseButton default true) replaces the
  // hand-rolled X svg button in the header.
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-lg p-0 gap-0"
        aria-label={isEdit ? 'Edit evaluation' : 'Add evaluation'}
      >
        {/* Header */}
        <DialogHeader className="p-5 border-b border-border">
          <DialogTitle className="text-base font-semibold text-foreground">
            {isEdit ? 'Edit evaluation' : 'Add evaluation'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* User */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Learner</label>
            {selectedUser ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted border border-border">
                <div>
                  <span className="text-sm font-medium text-foreground">{selectedUser.name}</span>
                  {selectedUser.empCode && (
                    <span className="text-xs text-subtle-foreground ml-2">{selectedUser.empCode}</span>
                  )}
                </div>
                {!isEdit && (
                  <button
                    type="button"
                    onClick={() => setSelectedUser(null)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Change
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or employee code..."
                  className={INPUT_CLS}
                  autoFocus
                />
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((u) => (
                      <button
                        key={u._id}
                        type="button"
                        onClick={() => { setSelectedUser(u); setUserSearch(''); }}
                        className="w-full text-left px-3 py-2 hover:bg-accent transition-colors text-sm"
                      >
                        <span className="font-medium text-foreground">{u.name}</span>
                        {u.empCode && (
                          <span className="text-xs text-subtle-foreground ml-2">{u.empCode}</span>
                        )}
                        {u.department && (
                          <span className="text-xs text-subtle-foreground ml-1">· {u.department}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {debouncedSearch.length >= 2 && searchResults.length === 0 && (
                  <p className="mt-1 text-xs text-subtle-foreground">No learners found.</p>
                )}
              </div>
            )}
          </div>

          {/* Level */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Level</label>
            <input
              type="text"
              maxLength={120}
              value={form.level}
              onChange={(e) => set('level', e.target.value)}
              placeholder="e.g. A2, B1, Intermediate..."
              className={INPUT_CLS}
            />
          </div>

          {/* Scores 2×2 grid */}
          <div className="grid grid-cols-2 gap-3">
            <ScoreInput label="Grammar"      fieldKey="grammarScore" />
            <ScoreInput label="Vocabulary"   fieldKey="vocabularyScore" />
            <ScoreInput label="Pronunciation" fieldKey="pronunciationScore" />
            <ScoreInput label="Fluency"      fieldKey="fluencyScore" />
          </div>

          {/* Comment */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Teacher comment</label>
            <textarea
              rows={3}
              maxLength={2000}
              value={form.teacherComment}
              onChange={(e) => set('teacherComment', e.target.value)}
              placeholder="Comments, strengths/weaknesses, advice..."
              className="w-full px-3 py-2 rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors text-sm resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={upsert.isPending || (!isEdit && !selectedUser)}
            >
              {upsert.isPending ? (
                <><Spinner size={14} className="mr-1" /> Saving...</>
              ) : (
                'Save evaluation'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────

export default function EvaluationPage() {
  const { isAdmin } = useAuth();
  const [selectedClass, setSelectedClass] = useState('');
  const [modal, setModal] = useState(null); // null | { eval?, user? }
  const [showAll, setShowAll] = useState(false);

  const { data: classes = [] } = useClasses();

  const { data: enrollments = [] } = useEnrollments(
    { classId: selectedClass },
    { enabled: isAdmin && showAll && !!selectedClass }
  );

  const { data: evaluations = [], isLoading: loadingEvals } = useEvaluations(
    { classId: selectedClass },
    { enabled: !!selectedClass }
  );

  const deleteEval = useDeleteEvaluation();

  // Build evaluation lookup by userId
  const evalMap = useMemo(() => {
    const map = {};
    evaluations.forEach((e) => {
      const uid = e.userId?._id || e.userId;
      if (uid) map[uid] = e;
    });
    return map;
  }, [evaluations]);

  // Merge with roster when Admin requests "show all"
  const tableData = useMemo(() => {
    if (!selectedClass) return [];

    if (isAdmin && showAll && enrollments.length > 0) {
      return enrollments.map((enr) => {
        const uid = enr.userId?._id || enr.userId;
        const ev = evalMap[uid];
        if (ev) return { ...ev, _hasEval: true };
        return {
          _id:    `__no-eval__${uid}`,
          userId: enr.userId,
          _hasEval: false,
        };
      });
    }

    return evaluations;
  }, [evaluations, enrollments, evalMap, selectedClass, isAdmin, showAll]);

  // ── Column definitions ──────────────────────────────────
  const columns = useMemo(
    () => [
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
    ],
    [deleteEval]
  );

  // ── Class summary stats ─────────────────────────────────
  const classStats = useMemo(() => {
    if (!evaluations.length) return null;
    const avgs = evaluations.map(
      (e) =>
        ((e.grammarScore || 0) +
          (e.vocabularyScore || 0) +
          (e.pronunciationScore || 0) +
          (e.fluencyScore || 0)) /
        4
    );
    const classAvg  = avgs.reduce((a, b) => a + b, 0) / avgs.length;
    const best      = Math.max(...avgs);
    const passCount = avgs.filter((s) => s >= 6).length;
    return { classAvg, best, passCount, total: evaluations.length };
  }, [evaluations]);

  const selectedClassData = classes.find((c) => c._id === selectedClass);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Learner Evaluations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enter and track grammar, vocabulary, pronunciation, and fluency scores
          </p>
        </div>
        {selectedClass && (
          <Button onClick={() => setModal({ eval: null, user: null })} className="shrink-0">
            + Add evaluation
          </Button>
        )}
      </div>

      {/* Class selector card */}
      <div className="flex flex-wrap items-center gap-4 bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground shrink-0">Class:</label>
          <select
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value);
              setShowAll(false);
            }}
            className="px-3 py-2 rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          >
            <option value="">— Select a class —</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.classCode} — {c.courseName}
              </option>
            ))}
          </select>
        </div>

        {selectedClassData && (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              selectedClassData.status === 'Completed'
                ? 'bg-info/15 text-info'
                : 'bg-success/15 text-success'
            }`}
          >
            {selectedClassData.status}
          </span>
        )}

        {isAdmin && selectedClass && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="rounded"
            />
            Show all enrolled learners
          </label>
        )}
      </div>

      {/* Content */}
      {!selectedClass ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-lg border border-border bg-muted/20">
          <div className="text-5xl mb-4 opacity-25">📋</div>
          <p className="text-muted-foreground font-medium">Select a class to view evaluations</p>
          <p className="text-subtle-foreground text-sm mt-1">
            Score data appears after you select a class above
          </p>
        </div>
      ) : loadingEvals ? (
        <div className="flex justify-center py-20">
          <Spinner size={32} />
        </div>
      ) : (
        <>
          {/* Stats strip */}
          {classStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'Evaluated',
                  value: classStats.total,
                  colorCls: 'text-primary',
                },
                {
                  label: 'Class avg',
                  value: classStats.classAvg.toFixed(1),
                  colorCls: scoreColor(classStats.classAvg),
                },
                {
                  label: 'Highest score',
                  value: classStats.best.toFixed(1),
                  colorCls: 'text-success',
                },
                {
                  label: 'Passed (≥ 6)',
                  value: `${classStats.passCount}/${classStats.total}`,
                  colorCls: 'text-info',
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="bg-card border border-border rounded-md p-4 text-center"
                >
                  <div className={`text-2xl font-bold ${card.colorCls}`}>{card.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
                </div>
              ))}
            </div>
          )}

          <DataTable
            columns={columns}
            data={tableData}
            rowKey="_id"
            emptyTitle="No evaluations yet"
            emptyMessage="Click '+ Add evaluation' to start entering scores for learners."
          />
        </>
      )}

      {/* Modal */}
      {modal && (
        <EvalModal
          classId={selectedClass}
          existingEval={modal.eval}
          preselectedUser={modal.user}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
