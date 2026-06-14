import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../context/PersonaContext';
import { useRole } from '../../hooks/useRole';
import { useMyTeam } from '../../hooks/useOrg';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, LEARNER_GROUPS, MY_TEAM_ITEM, isItemVisible, groupActivePath } from './nav-config';

// ──────────────────────────────────────────────────────────
// Sidebar — left vertical primary navigation (IA rework 2026-06-13).
// Persona picks the group-set (Admin Console vs My Learning); each labelled
// group is a collapsible section whose items are the section's tabs
// (deep links into the umbrella page's ?tab=). Role + capability filtered.
// ──────────────────────────────────────────────────────────
export default function Sidebar({ onNavigate }) {
  const { user } = useAuth();
  const { persona } = usePersona();
  const { can } = useRole();
  const location = useLocation();
  const { t } = useTranslation();
  const { data: myTeam } = useMyTeam({ enabled: Boolean(user), staleTime: 5 * 60 * 1000 });

  // Collapsed-group overrides (undefined → default open). Keyed by group id.
  const [collapsed, setCollapsed] = useState({});

  if (!user) return null;
  const role = user.role;
  const currentTab = new URLSearchParams(location.search).get('tab');

  const groups = [...(persona === 'learner' ? LEARNER_GROUPS : NAV_GROUPS)];
  if (myTeam?.count > 0) groups.push({ id: 'team', items: [MY_TEAM_ITEM] });

  return (
    <nav aria-label={t('nav.primary')} className="flex flex-col gap-3 px-2.5 py-3">
      {groups.map((group) => {
        const items = group.items.filter((it) => isItemVisible(it, role, can));
        if (items.length === 0) return null;

        const activePath = groupActivePath(items, location.pathname, currentTab);
        const collapsible = Boolean(group.labelKey);
        const open = collapsed[group.id] === undefined ? true : !collapsed[group.id];
        const showItems = !collapsible || open;

        return (
          <div key={group.id} className="space-y-0.5">
            {collapsible && (
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !(c[group.id] ?? false) }))}
                aria-expanded={open}
                className="flex w-full items-center justify-between px-3 py-1 text-overline text-subtle-foreground hover:text-muted-foreground transition-colors duration-(--dur-fast)"
              >
                <span className="select-none">{t(group.labelKey)}</span>
                <ChevronDown className={cn('size-3.5 transition-transform duration-(--dur-fast)', !open && '-rotate-90')} aria-hidden="true" />
              </button>
            )}
            {showItems && (
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = item.path === activePath;
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative flex h-[34px] items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-(--dur-fast)',
                          active
                            ? 'bg-primary/15 font-semibold text-foreground before:absolute before:-left-2.5 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary before:content-[""]'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        {Icon && <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'opacity-85')} aria-hidden="true" />}
                        <span className="truncate">{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
