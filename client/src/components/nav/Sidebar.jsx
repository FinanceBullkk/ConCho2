import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useMyTeam } from '../../hooks/useOrg';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, MY_TEAM_ITEM, itemAccess, isRouteActive } from './nav-config';

// ──────────────────────────────────────────────────────────
// Sidebar — left vertical primary navigation (IA rework 2026-06-13).
// Role-filtered grouped nav driven by nav-config. Used on desktop (sticky left
// column) and inside MobileSidebar (drawer). `onNavigate` lets the drawer close
// itself when a link is clicked.
// ──────────────────────────────────────────────────────────
export default function Sidebar({ onNavigate }) {
  const { user } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  // Manager entry — only when the caller has direct reports (cheap, cached).
  const { data: myTeam } = useMyTeam({ enabled: Boolean(user), staleTime: 5 * 60 * 1000 });

  if (!user) return null;
  const role = user.role;

  const groups = [...NAV_GROUPS];
  if (myTeam?.count > 0) groups.push({ id: 'team', items: [MY_TEAM_ITEM] });

  return (
    <nav aria-label={t('nav.primary')} className="flex flex-col gap-5 py-4">
      {groups.map((group) => {
        const items = group.items.filter((it) => itemAccess(it, role) !== 'none');
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="space-y-1">
            {group.labelKey && (
              <div className="px-3 pb-1 text-overline text-subtle-foreground select-none">
                {t(group.labelKey)}
              </div>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const active = isRouteActive(item, location.pathname);
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-(--dur)',
                        active
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
