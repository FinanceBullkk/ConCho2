import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from './Spinner';
import { useDepartments, useAssignUser } from '../hooks/useOrg';

// ──────────────────────────────────────────────────────────
// OrgAssignmentModal — set a user's manager + department (Wave D3).
// Saves via the org domain endpoint (PUT /api/org/users/:id/assignment),
// keeping org placement separate from the legacy user identity form.
//
// Props:
//   user        — target user { _id, name, managerId?, departmentId? }
//   candidates  — users available as managers (the loaded user list)
//   onClose     — close handler
// ──────────────────────────────────────────────────────────

const SELECT_CLS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

const idStr = (v) => (v && v._id ? v._id : v) || '';

export default function OrgAssignmentModal({ user, candidates = [], onClose }) {
  const { data: departments } = useDepartments();
  const assign = useAssignUser();

  const [managerId, setManagerId] = useState(idStr(user?.managerId));
  const [departmentId, setDepartmentId] = useState(idStr(user?.departmentId));

  const save = () => {
    assign.mutate(
      { id: user._id, managerId: managerId || null, departmentId: departmentId || null },
      { onSuccess: onClose },
    );
  };

  const managerOptions = candidates.filter((c) => String(c._id) !== String(user?._id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign manager &amp; department</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Org placement for <span className="font-medium text-foreground">{user?.name}</span>.
          </p>

          <div>
            <label htmlFor="org-manager" className="block text-small text-muted-foreground mb-1.5">Manager</label>
            <select id="org-manager" className={SELECT_CLS} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">— No manager —</option>
              {managerOptions.map((c) => (
                <option key={c._id} value={c._id}>{c.name} ({c.empCode})</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-subtle-foreground">Pick from currently loaded users; search the list first to widen the choices.</p>
          </div>

          <div>
            <label htmlFor="org-department" className="block text-small text-muted-foreground mb-1.5">Department</label>
            <select id="org-department" className={SELECT_CLS} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">— No department —</option>
              {(departments || []).map((d) => (
                <option key={d._id} value={d._id}>{d.name} ({d.code})</option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={assign.isPending}>Cancel</Button>
          <Button onClick={save} disabled={assign.isPending}>
            {assign.isPending ? <Spinner size={16} /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
