import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Settings, Sun, Moon, Menu, Search, ChevronDown, ArrowLeftRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../context/PersonaContext';
import { useTheme } from '../../hooks/useTheme';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import SearchPalette from '../SearchPalette';
import NotificationBell from '../../features/notifications/NotificationBell';

// Role accent — logo chip + role label (solid tokens only, Phase 0 §02).
const ROLE_BG = {
  Admin: 'bg-primary', Coordinator: 'bg-info', Teacher: 'bg-success', Participant: 'bg-warning',
};
const ROLE_TEXT = {
  Admin: 'text-primary', Coordinator: 'text-info', Teacher: 'text-success', Participant: 'text-warning',
};

// ── Avatar dropdown ───────────────────────────────────────
// System moved to the sidebar (Manage group) in the IA rework, so it's no
// longer duplicated here — this menu is account + sign-out only.
function AvatarMenu({ user, onLogout }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { persona, setPersona, canSwitch } = usePersona();
  const initials = (user?.name || '?')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const roleColor = ROLE_BG[user?.role] ?? 'bg-primary';

  const switchPersona = () => {
    if (persona === 'admin') { setPersona('learner'); navigate('/me/programs'); }
    else { setPersona('admin'); navigate('/home'); }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('nav.openAccountMenu')}
          className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-accent transition-colors duration-(--dur) focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn('flex size-7 items-center justify-center rounded-md text-[11px] font-bold text-primary-foreground', roleColor)}
            aria-hidden="true"
          >
            {initials}
          </span>
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="flex flex-col gap-0.5 pb-2">
          <span className="text-sm font-semibold text-foreground">{user?.name}</span>
          <span className={cn('text-xs font-medium', ROLE_TEXT[user?.role] ?? 'text-primary')}>
            {user?.role} · {user?.empCode}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {canSwitch && (
          <DropdownMenuItem onClick={switchPersona} className="flex items-center gap-2 cursor-pointer">
            <ArrowLeftRight className="size-4 text-muted-foreground" aria-hidden="true" />
            {persona === 'admin' ? t('nav.switchToLearner') : t('nav.switchToAdmin')}
          </DropdownMenuItem>
        )}

        <DropdownMenuItem asChild>
          <Link to="/me/settings" className="flex items-center gap-2 cursor-pointer">
            <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
            {t('nav.accountSettings')}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onLogout}
          className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <LogOut className="size-4" aria-hidden="true" />
          {t('nav.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ──────────────────────────────────────────────────────────
// Topbar — slim global bar (IA rework 2026-06-13). Primary nav lives in the
// left Sidebar now; this bar holds logo · global search · notifications ·
// theme · avatar, plus the mobile hamburger that opens the sidebar drawer.
// ──────────────────────────────────────────────────────────
export default function Topbar({ onOpenMobileNav }) {
  const { user, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  // Global shortcut: Cmd/Ctrl+K (and "/" outside inputs) opens the search
  // palette. Bail when another modal dialog is open so we don't steal focus
  // from in-progress form input (BUG #14) — except the SearchPalette itself.
  useEffect(() => {
    const isAnotherModalOpen = () => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      for (const d of dialogs) {
        if (d.getAttribute('aria-label') === 'Global search') continue;
        return true;
      }
      return false;
    };
    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      const role = (el.getAttribute && el.getAttribute('role')) || '';
      return ['combobox', 'textbox', 'searchbox', 'spinbutton'].includes(role);
    };
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        if (isAnotherModalOpen()) return;
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === '/' && !mod) {
        if (isAnotherModalOpen()) return;
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left: hamburger (mobile) + logo */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenMobileNav}
            aria-label={t('nav.openMenu')}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-(--dur)"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <Link to="/home" className="group flex shrink-0 items-center gap-3">
            <div
              className={cn(
                'flex size-9 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground transition-colors duration-(--dur)',
                ROLE_BG[user.role] ?? 'bg-primary',
              )}
            >
              T
            </div>
            <span className="hidden text-lg font-bold tracking-tight text-foreground sm:block">
              TMS<span className="text-primary">v2</span>
            </span>
          </Link>
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden flex-col items-end sm:flex">
            <span className="text-sm font-medium text-foreground">{user.name}</span>
            <span className={cn('text-xs font-semibold', ROLE_TEXT[user.role] ?? 'text-primary')}>
              {user.role} · {user.empCode}
            </span>
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label={t('nav.openSearch')}
            title={t('nav.openSearch')}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-colors duration-(--dur)"
          >
            <Search className="size-3.5" aria-hidden="true" />
            <span>{t('nav.searchPlaceholder')}</span>
            <kbd className="ml-2 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Ctrl K</kbd>
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label={t('nav.openSearchMobile')}
            className="sm:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-(--dur)"
          >
            <Search className="size-4" aria-hidden="true" />
          </button>
          <NotificationBell />
          <button
            onClick={toggle}
            aria-label={isDark ? t('nav.switchLight') : t('nav.switchDark')}
            title={isDark ? t('nav.lightMode') : t('nav.darkMode')}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-(--dur)"
          >
            {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
          </button>
          <AvatarMenu user={user} onLogout={logout} />
        </div>
      </div>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
