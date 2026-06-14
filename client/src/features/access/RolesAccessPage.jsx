import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Minus, ShieldCheck, Info } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { useCapabilityMatrix } from './useAccess';

// Persona-aligned hues for the role column chips.
const ROLE_HUE = { Admin: 250, Coordinator: 155, Teacher: 200, Participant: 75 };

// "program.manage" → "Program", "session.assign-trainer" → "Session"
const titleize = (s) => s.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const actionOf = (cap) => titleize(cap.split('.').slice(1).join(' '));

function RoleChip({ role }) {
  const hue = ROLE_HUE[role] ?? 250;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: `oklch(0.3 0.08 ${hue})`, color: `oklch(0.82 0.14 ${hue})` }}
    >
      {role}
    </span>
  );
}

function Cell({ granted }) {
  return (
    <td className="px-3 text-center align-middle">
      {granted ? (
        <span className="inline-grid size-6 place-items-center rounded-md bg-success-tint text-success">
          <Check className="size-3.5" aria-label="granted" />
        </span>
      ) : (
        <span className="inline-grid size-6 place-items-center text-subtle-foreground">
          <Minus className="size-3.5" aria-label="not granted" />
        </span>
      )}
    </td>
  );
}

export default function RolesAccessPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useCapabilityMatrix();

  const roles = data?.roles ?? [];
  const grants = data?.grants ?? {};

  // Group capabilities by their resource prefix (the part before the first dot).
  const groups = useMemo(() => {
    const byPrefix = new Map();
    (data?.capabilities ?? []).forEach((cap) => {
      const prefix = cap.split('.')[0];
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      byPrefix.get(prefix).push(cap);
    });
    return [...byPrefix.entries()].map(([prefix, caps]) => ({ prefix, caps }));
  }, [data]);

  const has = (role, cap) => Array.isArray(grants[role]) && grants[role].includes(cap);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('access.title')}
        description={t('access.description')}
      />

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>{t('access.note')}</p>
      </div>

      {isLoading && (
        <div className="space-y-2" data-testid="access-skeleton">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />)}
        </div>
      )}

      {isError && !isLoading && (
        <EmptyState title={t('access.loadError')} description={t('access.loadErrorDesc')} />
      )}

      {!isLoading && !isError && data && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-subtle-foreground">
                  {t('access.capability')}
                </th>
                {roles.map((role) => (
                  <th key={role} className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <RoleChip role={role} />
                      <span className="tabular-nums text-[11px] text-subtle-foreground">{grants[role]?.length ?? 0}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <ResourceGroup key={group.prefix} group={group} roles={roles} has={has} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResourceGroup({ group, roles, has }) {
  return (
    <>
      <tr className="bg-surface-2/40">
        <td colSpan={roles.length + 1} className="px-4 py-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle-foreground">
            <ShieldCheck className="size-3" aria-hidden="true" />
            {titleize(group.prefix)}
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
          {roles.map((role) => <Cell key={role} granted={has(role, cap)} />)}
        </tr>
      ))}
    </>
  );
}
