import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSubmitFeedback } from '../../hooks/useLearning';
import { LearningField, controlClass, textareaClass } from './LearningField';

const blank = { rating: 5, contentRating: 5, instructorRating: 5, comment: '' };

export default function FeedbackFormModal({ cohort, existing, onClose }) {
  const submit = useSubmitFeedback();
  const [form, setForm] = useState(() => ({ ...blank, ...(existing || {}) }));
  const [error, setError] = useState('');

  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await submit.mutateAsync({
        cohortId: cohort.id,
        rating: Number(form.rating),
        contentRating: Number(form.contentRating),
        instructorRating: Number(form.instructorRating),
        comment: form.comment?.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Feedback submit failed');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg p-6" aria-label="Submit feedback">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-h3 text-foreground">Submit feedback</DialogTitle>
            <DialogDescription>
              {cohort.code} · {cohort.name || 'Cohort'}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <RatingField label="Overall" value={form.rating} onChange={set('rating')} />
            <RatingField label="Content" value={form.contentRating} onChange={set('contentRating')} />
            <RatingField label="Instructor" value={form.instructorRating} onChange={set('instructorRating')} />
          </div>

          <LearningField label="Comment">
            <textarea value={form.comment || ''} onChange={(e) => set('comment')(e.target.value)} className={textareaClass} />
          </LearningField>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RatingField({ label, value, onChange }) {
  return (
    <LearningField label={label}>
      <select value={value ?? 5} onChange={(e) => onChange(e.target.value)} className={controlClass}>
        {[5, 4, 3, 2, 1].map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </LearningField>
  );
}
