import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUpdateClass, useDeleteClass } from '../../../hooks/useClasses';

// ──────────────────────────────────────────────────────────
// Edit Modal (kept simple — Edit/Status/Sessions count/Delete)
// ──────────────────────────────────────────────────────────
export default function EditClassModal({ cls, onClose }) {
  const navigate = useNavigate();
  const updateMutation = useUpdateClass();
  const deleteMutation = useDeleteClass();
  const [status, setStatus] = useState(cls.status);
  const [totalSessions, setTotalSessions] = useState(cls.totalSessions);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      await updateMutation.mutateAsync({ id: cls._id, data: { status, totalSessions } });
      onClose();
    } catch (err) { setError(err.response?.data?.message || 'Update failed'); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setError('');
    try {
      await deleteMutation.mutateAsync(cls._id);
      navigate('/learning?tab=cohorts');
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
      setConfirmDelete(false);
    }
  };

  // Audit PR S (FE-010): Radix Dialog — focus-trap, ESC, ARIA.
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md p-6 space-y-4" aria-label={`Edit class ${cls.classCode}`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <Pencil className="size-4" /> Edit {cls.classCode}
            </DialogTitle>
          </DialogHeader>
          {error && <div className="px-4 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>}
          <div>
            <label htmlFor="class-status" className="block text-small text-muted-foreground mb-1">Status</label>
            <select id="class-status" value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 h-(--control-h) rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors">
              <option value="Ongoing">Ongoing</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
          <div>
            <label htmlFor="class-total-sessions" className="block text-small text-muted-foreground mb-1">Total Sessions</label>
            <input id="class-total-sessions" type="number" value={totalSessions} onChange={(e) => setTotalSessions(Number(e.target.value))} min={1}
              className="w-full px-3 h-(--control-h) rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting...' : confirmDelete ? '⚠ Confirm?' : 'Delete'}
            </Button>
            {!confirmDelete && (
              <>
                <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending} className="flex-1">
                  {updateMutation.isPending ? 'Saving...' : 'Update'}
                </Button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
