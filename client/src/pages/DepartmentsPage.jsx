import { useState } from 'react';
import { Building2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';
import { useRole } from '../hooks/useRole';
import { useDepartments, useCreateDepartment, useArchiveDepartment } from '../hooks/useOrg';

// ──────────────────────────────────────────────────────────
// DepartmentsPage — People → Departments tab (Wave D3).
// Admin-managed structured org units (replaces free-text department).
// ──────────────────────────────────────────────────────────

const INPUT_CLS =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

function CreateDepartmentForm() {
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const create = useCreateDepartment();

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return;
    create.mutate(form, { onSuccess: () => setForm({ name: '', code: '', description: '' }) });
  };

  return (
    <form onSubmit={submit} className="bg-card border border-border rounded-lg p-4 grid gap-3 sm:grid-cols-[1fr_auto]">
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          aria-label="Department name"
          className={INPUT_CLS}
          placeholder="Name (e.g. Engineering)"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          aria-label="Department code"
          className={INPUT_CLS}
          placeholder="Code (e.g. ENG)"
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        />
        <input
          aria-label="Department description"
          className={INPUT_CLS}
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <Button type="submit" disabled={create.isPending || !form.name.trim() || !form.code.trim()} className="self-start">
        {create.isPending ? <Spinner size={16} /> : 'Add department'}
      </Button>
    </form>
  );
}

export default function DepartmentsPage() {
  const { can } = useRole();
  const { data: departments, isLoading } = useDepartments();
  const archive = useArchiveDepartment();
  const canManage = can('manage:department');

  return (
    <div className="space-y-4">
      {canManage && <CreateDepartmentForm />}

      {isLoading ? (
        <div className="bg-card border border-border rounded-lg py-16 flex items-center justify-center">
          <Spinner size={28} />
        </div>
      ) : !departments?.length ? (
        <div className="bg-card border border-border rounded-lg py-12 text-center text-subtle-foreground text-sm">
          No departments yet.{canManage ? ' Add one above.' : ''}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-subtle-foreground uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Description</th>
                {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {departments.map((d) => (
                <tr key={d._id} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                      {d.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.code}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.description || '—'}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Archive ${d.name}`}
                        disabled={archive.isPending}
                        onClick={() => {
                          if (window.confirm(`Archive department "${d.name}"?`)) archive.mutate(d._id);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
