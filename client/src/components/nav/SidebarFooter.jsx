import { useTranslation } from 'react-i18next';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '@/lib/utils';

// Role accent for the avatar chip (solid tokens only — matches Topbar).
const ROLE_BG = {
  Admin: 'bg-primary', Coordinator: 'bg-info', Teacher: 'bg-success', Participant: 'bg-warning',
};

// Sidebar footer — compact signed-in user chip + sign-out, pinned to the bottom
// of the full-height sidebar (north-star shell).
export default function SidebarFooter() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  if (!user) return null;

  const initials = (user.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-t border-border px-3 py-2.5">
      <span
        className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-primary-foreground', ROLE_BG[user.role] ?? 'bg-primary')}
        aria-hidden="true"
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-foreground">{user.name}</span>
        <span className="block truncate text-[10.5px] text-subtle-foreground">{user.role} · {user.empCode}</span>
      </span>
      <button
        type="button"
        onClick={logout}
        aria-label={t('nav.signOut')}
        title={t('nav.signOut')}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
