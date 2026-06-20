import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { useUpsertEvaluation, useEvaluationRoster } from './useEvaluations';
import ScoreInput from './ScoreInput';
import { INPUT_CLS } from './eval-helpers';

// ── EvalModal ─────────────────────────────────────────────
export default function EvalModal({ classId, existingEval, preselectedUser, onClose }) {
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
  const searchInputRef = useRef(null);

  // Replaces the autoFocus attribute (jsx-a11y/no-autofocus): focus the learner
  // search input whenever it is rendered (i.e. when no learner is selected yet),
  // matching the prior autoFocus-on-mount behaviour.
  useEffect(() => {
    if (!selectedUser) searchInputRef.current?.focus();
  }, [selectedUser]);

  // FLOW-001: the learner picker now reads the class-scoped roster (Teacher-
  // callable) instead of the Admin-only org-wide /api/users search — that 403'd
  // for teachers and left them unable to add any evaluation. Filter the roster
  // client-side so the search UX is unchanged; an empty query shows the full
  // class roster.
  const { data: roster = [], isLoading: loadingRoster } = useEvaluationRoster(classId, {
    enabled: !isEdit && !selectedUser && !!classId,
  });
  const q = userSearch.trim().toLowerCase();
  const searchResults = q
    ? roster.filter((u) =>
        `${u.name || ''} ${u.empCode || ''} ${u.department || ''}`.toLowerCase().includes(q))
    : roster;

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
            <label htmlFor="eval-learner-search" className="block text-xs text-muted-foreground mb-1">Learner</label>
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
                  ref={searchInputRef}
                  id="eval-learner-search"
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or employee code..."
                  className={INPUT_CLS}
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
                {!loadingRoster && searchResults.length === 0 && (
                  <p className="mt-1 text-xs text-subtle-foreground">
                    {roster.length === 0 ? 'No enrolled learners in this class.' : 'No learners match your search.'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Level */}
          <div>
            <label htmlFor="eval-level" className="block text-xs text-muted-foreground mb-1">Level</label>
            <input
              id="eval-level"
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
            <ScoreInput id="eval-grammar"       label="Grammar"       value={form.grammarScore}       onChange={(e) => set('grammarScore', e.target.value)} />
            <ScoreInput id="eval-vocabulary"    label="Vocabulary"    value={form.vocabularyScore}    onChange={(e) => set('vocabularyScore', e.target.value)} />
            <ScoreInput id="eval-pronunciation" label="Pronunciation" value={form.pronunciationScore} onChange={(e) => set('pronunciationScore', e.target.value)} />
            <ScoreInput id="eval-fluency"       label="Fluency"       value={form.fluencyScore}       onChange={(e) => set('fluencyScore', e.target.value)} />
          </div>

          {/* Comment */}
          <div>
            <label htmlFor="eval-comment" className="block text-xs text-muted-foreground mb-1">Teacher comment</label>
            <textarea
              id="eval-comment"
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
