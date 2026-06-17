import { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClasses } from '../../hooks/useClasses';
import { useEnrollments } from '../../hooks/useEnrollments';
import { useEvaluations, useDeleteEvaluation } from './useEvaluations';
import { DataTable } from '../../components/DataTable';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { scoreColor } from './eval-helpers';
import { buildEvalColumns } from './eval-columns';
import EvalModal from './EvalModal';

// ──────────────────────────────────────────────────────────
// EvaluationPage (shell)
// ──────────────────────────────────────────────────────────
// Admin and Teacher view + enter per-learner evaluation scores (grammar,
// vocabulary, pronunciation, fluency) for a selected class. Admin can also
// toggle "show all enrolled" to see participants not yet evaluated.
//
// The form (EvalModal), the score input (ScoreInput), the table columns
// (eval-columns) and the score helpers (eval-helpers) live in sibling files;
// this file orchestrates class selection, the merge with the roster, and stats.
// ──────────────────────────────────────────────────────────

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

  // ── Column definitions (built in ./eval-columns) ────────
  const columns = useMemo(() => buildEvalColumns({ deleteEval, setModal }), [deleteEval]);

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
          <label htmlFor="eval-class-select" className="text-sm text-muted-foreground shrink-0">Class:</label>
          <select
            id="eval-class-select"
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
