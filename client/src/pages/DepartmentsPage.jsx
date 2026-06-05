import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          aria-label={t('org.departments.name')}
          className={INPUT_CLS}
          placeholder={t('org.departments.namePlaceholder')}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          aria-label={t('org.departments.code')}
          className={INPUT_CLS}
          placeholder={t('org.departments.codePlaceholder')}
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        />
        <input
          aria-label={t('org.departments.description')}
          className={INPUT_CLS}
          placeholder={t('org.departments.descriptionPlaceholder')}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <Button type="submit" disabled={create.isPending || !form.name.trim() || !form.code.trim()} className="self-start">
        {create.isPending ? <Spinner size={16} /> : t('org.departments.add')}
      </Button>
    </form>
  );
}

export default function DepartmentsPage() {
  const { t } = useTranslation();
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
          {t('org.departments.empty')}{canManage ? t('org.departments.emptyAdmin') : ''}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-subtle-foreground uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">{t('org.departments.colDepartment')}</th>
                <th className="px-4 py-3 font-medium">{t('org.departments.colCode')}</th>
                <th className="px-4 py-3 font-medium">{t('org.departments.colDescription')}</th>
                {canManage && <th className="px-4 py-3 font-medium text-right">{t('org.departments.colActions')}</th>}
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
                        aria-label={t('org.departments.archiveLabel', { name: d.name })}
                        disabled={archive.isPending}
                        onClick={() => {
                          if (window.confirm(t('org.departments.archiveConfirm', { name: d.name }))) archive.mutate(d._id);
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
