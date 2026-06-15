import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Equal, ShieldCheck } from 'lucide-react';

// Compare two roles' capability grants side-by-side (screenshot 14).
// Read-only: reflects the persisted, server-enforced grants — Admin is the
// implicit superuser (holds every capability). Our grants are binary
// (Full / None); the middle indicator flags where the two roles differ.

const titleize = (s) => s.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const actionOf = (cap) => titleize(cap.split('.').slice(1).join(' '));
const grants = (role, cap) => role?.key === 'Admin' || (role?.capabilities || []).includes(cap);

function GrantBadge({ on, label }) {
  return on ? (
    <span className="inline-flex items-center rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
      {label}
    </span>
  ) : (
    <span className="text-subtle-foreground" aria-label="None">—</span>
  );
}

export default function RoleCompareView({ roles, groups }) {
  const { t } = useTranslation();
  const allCaps = useMemo(() => groups.flatMap((g) => g.caps), [groups]);

  // Default to the first two distinct roles (typically Admin vs the next role).
  const [aKey, setAKey] = useState(roles[0]?.key ?? '');
  const [bKey, setBKey] = useState(roles[1]?.key ?? roles[0]?.key ?? '');

  const roleA = roles.find((r) => r.key === aKey) ?? roles[0];
  const roleB = roles.find((r) => r.key === bKey) ?? roles[0];

  const diffCount = useMemo(
    () => allCaps.filter((cap) => grants(roleA, cap) !== grants(roleB, cap)).length,
    [allCaps, roleA, roleB],
  );

  const roleOptions = roles.map((r) => <option key={r.key} value={r.key}>{r.name || r.key}</option>);

  return (
    <div className="space-y-4" data-testid="role-compare">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[11px] font-bold uppercase tracking-wide text-subtle-foreground">{t('access.roleA')}</span>
          <select value={aKey} onChange={(e) => setAKey(e.target.value)} aria-label={t('access.roleA')}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm">{roleOptions}</select>
        </label>
        <ArrowRight className="size-4 text-subtle-foreground" aria-hidden="true" />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[11px] font-bold uppercase tracking-wide text-subtle-foreground">{t('access.roleB')}</span>
          <select value={bKey} onChange={(e) => setBKey(e.target.value)} aria-label={t('access.roleB')}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm">{roleOptions}</select>
        </label>
        <span
          data-testid="diff-count"
          className={`ml-auto rounded-full px-3 py-1 text-xs font-semibold ${diffCount === 0 ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}
        >
          {diffCount === 0 ? t('access.identical') : t('access.differences', { count: diffCount })}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-subtle-foreground">{t('access.capability')}</th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-subtle-foreground">{roleA?.name || roleA?.key}</th>
              <th className="px-3 py-3" aria-hidden="true" />
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-subtle-foreground">{roleB?.name || roleB?.key}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <CompareGroup key={group.prefix} group={group} roleA={roleA} roleB={roleB} fullLabel={t('access.full')} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareGroup({ group, roleA, roleB, fullLabel }) {
  return (
    <>
      <tr className="bg-surface-2/40">
        <td colSpan={4} className="px-4 py-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-subtle-foreground">
            <ShieldCheck className="size-3" aria-hidden="true" />{titleize(group.prefix)}
          </span>
        </td>
      </tr>
      {group.caps.map((cap) => {
        const a = grants(roleA, cap);
        const b = grants(roleB, cap);
        const differs = a !== b;
        return (
          <tr key={cap} className={`border-b border-border last:border-0 ${differs ? 'bg-warning/5' : ''}`}>
            <td className="px-4 py-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{actionOf(cap)}</span>
                <span className="font-mono text-[11px] text-subtle-foreground">{cap}</span>
              </div>
            </td>
            <td className="px-3 text-center align-middle"><GrantBadge on={a} label={fullLabel} /></td>
            <td className="px-3 text-center align-middle">
              {differs
                ? <ArrowRight className="mx-auto size-4 text-warning" aria-label="differs" />
                : <Equal className="mx-auto size-4 text-subtle-foreground" aria-label="same" />}
            </td>
            <td className="px-3 text-center align-middle"><GrantBadge on={b} label={fullLabel} /></td>
          </tr>
        );
      })}
    </>
  );
}
