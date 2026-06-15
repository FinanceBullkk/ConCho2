import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ShieldCheck, Info, Plus, Trash2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole } from './useAccess';
import RoleCompareView from './RoleCompareView';

// Persona-aligned hues for the role column chips.
const ROLE_HUE = { Admin: 250, Coordinator: 155, Teacher: 200, Participant: 75 };
const titleize = (s) => s.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const actionOf = (cap) => titleize(cap.split('.').slice(1).join(' '));
const hueFor = (key) => ROLE_HUE[key] ?? ([...key].reduce((a, c) => a + c.charCodeAt(0), 0) % 360);

function RoleChip({ role }) {
  const hue = hueFor(role.key);
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: `oklch(0.3 0.08 ${hue})`, color: `oklch(0.82 0.14 ${hue})` }}>
      {role.name || role.key}
    </span>
  );
}

export default function RolesAccessPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useRoles();
  const update = useUpdateRole();
  const create = useCreateRole();
  const remove = useDeleteRole();

  const [edits, setEdits] = useState(() => new Map()); // roleKey → Set<cap>
  const [newRole, setNewRole] = useState(null); // { key, name } | null
  const [view, setView] = useState('matrix'); // 'matrix' | 'compare'

  const roles = data?.roles ?? [];
  const groups = useMemo(() => {
    const byPrefix = new Map();
    (data?.capabilities ?? []).forEach((cap) => {
      const prefix = cap.split('.')[0];
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      byPrefix.get(prefix).push(cap);
    });
    return [...byPrefix.entries()].map(([prefix, caps]) => ({ prefix, caps }));
  }, [data]);

  const effective = (role) => edits.get(role.key) ?? new Set(role.capabilities || []);
  const has = (role, cap) => (role.key === 'Admin' ? true : effective(role).has(cap));
  const dirty = edits.size > 0;

  const toggle = (role, cap) => {
    if (role.key === 'Admin') return; // superuser, locked
    setEdits((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(role.key) ?? (role.capabilities || []));
      if (set.has(cap)) set.delete(cap); else set.add(cap);
      next.set(role.key, set);
      return next;
    });
  };

  const save = async () => {
    try {
      await Promise.all([...edits.entries()].map(([key, set]) => update.mutateAsync({ key, capabilities: [...set] })));
      toast.success(t('access.saved'));
      setEdits(new Map());
    } catch (e) {
      toast.error(e.response?.data?.message || t('access.saveError'));
    }
  };

  const createRole = async (e) => {
    e.preventDefault();
    try {
      await create.mutateAsync({ key: newRole.key.trim(), name: newRole.name.trim(), capabilities: [] });
      toast.success(t('access.saved'));
      setNewRole(null);
    } catch (e2) {
      toast.error(e2.response?.data?.message || t('access.createError'));
    }
  };

  const deleteRole = async (role) => {
    try {
      await remove.mutateAsync(role.key);
      setEdits((prev) => { const n = new Map(prev); n.delete(role.key); return n; });
      toast.success(t('access.deleted'));
    } catch (e) {
      toast.error(e.response?.data?.message || t('access.saveError'));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('access.title')}
        description={t('access.description')}
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label={t('access.viewMode')}>
              {['matrix', 'compare'].map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                    view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`access.${v}`)}
                </button>
              ))}
            </div>
            {view === 'matrix' && (
              <>
                <Button size="sm" variant="outline" onClick={() => setNewRole({ key: '', name: '' })}>
                  <Plus className="mr-1.5 size-4" aria-hidden="true" />{t('access.newRole')}
                </Button>
                {dirty && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEdits(new Map())}>{t('access.discard')}</Button>
                    <Button size="sm" onClick={save} disabled={update.isPending}>{update.isPending ? t('access.saving') : t('access.save')}</Button>
                  </>
                )}
              </>
            )}
          </div>
        }
      />

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>{view === 'compare' ? t('access.compareNote') : t('access.note')}{view === 'matrix' && dirty && <span className="ml-2 font-medium text-warning">· {t('access.unsaved')}</span>}</p>
      </div>

      {isLoading && (
        <div className="space-y-2" data-testid="access-skeleton">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />)}
        </div>
      )}
      {isError && !isLoading && <EmptyState title={t('access.loadError')} description={t('access.loadErrorDesc')} />}

      {!isLoading && !isError && data && view === 'compare' && (
        <RoleCompareView roles={roles} groups={groups} />
      )}

      {!isLoading && !isError && data && view === 'matrix' && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-subtle-foreground">{t('access.capability')}</th>
                {roles.map((role) => (
                  <th key={role.key} className="px-3 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <RoleChip role={role} />
                        {role.key === 'Admin' && <Lock className="size-3 text-subtle-foreground" aria-label={t('access.adminLocked')} />}
                        {!role.system && (
                          <button type="button" aria-label={`${t('access.deleteRole')} ${role.name}`} onClick={() => deleteRole(role)} className="text-destructive hover:opacity-70">
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-subtle-foreground">
                        {role.system ? t('access.systemRole') : t('access.customRole')} · {effective(role).size}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <ResourceGroup key={group.prefix} group={group} roles={roles} has={has} toggle={toggle} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(newRole)} onOpenChange={(o) => !o && setNewRole(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('access.newRole')}</DialogTitle></DialogHeader>
          {newRole && (
            <form onSubmit={createRole} className="space-y-3">
              <div>
                <label htmlFor="role-key" className="mb-1 block text-small text-muted-foreground">{t('access.roleKey')}</label>
                <input id="role-key" className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm" value={newRole.key}
                  onChange={(e) => setNewRole((r) => ({ ...r, key: e.target.value }))} required />
              </div>
              <div>
                <label htmlFor="role-name" className="mb-1 block text-small text-muted-foreground">{t('access.roleName')}</label>
                <input id="role-name" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={newRole.name}
                  onChange={(e) => setNewRole((r) => ({ ...r, name: e.target.value }))} required />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setNewRole(null)}>{t('common.cancel', 'Cancel')}</Button>
                <Button type="submit" disabled={create.isPending || !newRole.key.trim() || !newRole.name.trim()}>
                  {create.isPending ? t('access.creating') : t('access.create')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResourceGroup({ group, roles, has, toggle }) {
  return (
    <>
      <tr className="bg-surface-2/40">
        <td colSpan={roles.length + 1} className="px-4 py-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle-foreground">
            <ShieldCheck className="size-3" aria-hidden="true" />{titleize(group.prefix)}
          </span>
        </td>
      </tr>
      {group.caps.map((cap) => (
        <tr key={cap} className="border-b border-border last:border-0 hover:bg-accent/40">
          <td className="px-4 py-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{actionOf(cap)}</span>
              <span className="font-mono text-[11px] text-subtle-foreground">{cap}</span>
            </div>
          </td>
          {roles.map((role) => (
            <td key={role.key} className="px-3 text-center align-middle">
              <input
                type="checkbox"
                className="size-4 accent-primary disabled:opacity-60"
                checked={has(role, cap)}
                disabled={role.key === 'Admin'}
                aria-label={`${role.name} ${cap}`}
                onChange={() => toggle(role, cap)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
