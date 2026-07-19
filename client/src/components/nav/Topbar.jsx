import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Settings, Sun, Moon, Menu, Search, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../context/PersonaContext';
import { useRole } from '../../hooks/useRole';
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
import { Breadcrumbs } from '../Breadcrumbs';
import SearchPalette from '../SearchPalette';
import NotificationBell from '../../features/notifications/NotificationBell';
import { activeItemLabelKey } from './nav-config';

// Role accent — avatar chip + role label (solid tokens only, Phase 0 §02).
const ROLE_BG = {
  Admin: 'bg-primary', Coordinator: 'bg-info', Teacher: 'bg-success', Participant: 'bg-warning',
};
const ROLE_TEXT = {
  Admin: 'text-primary', Coordinator: 'text-info', Teacher: 'text-success', Participant: 'text-warning',
};

// ── Avatar dropdown ───────────────────────────────────────
// Account + sign-out only. Persona switching moved to the sidebar's persona card
// (north-star shell); System lives in the sidebar Manage group.
function AvatarMenu({ user, onLogout }) {
  const { t } = useTranslation();
  const initials = (user?.name || '?')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const roleColor = ROLE_BG[user?.role] ?? 'bg-primary';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('nav.openAccountMenu')}
          className="flex items-center gap-1.5 rounded-lg px-1 py-1 hover:bg-accent transition-colors duration-(--dur) focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn('flex size-[30px] items-center justify-center rounded-full text-[11px] font-bold text-primary-foreground', roleColor)}
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
// Topbar — slim sticky bar over the main column (north-star shell). Holds the
// workspace › page breadcrumb · global search · notifications · theme · avatar,
// plus the mobile hamburger that opens the sidebar drawer. The brand + primary
// nav live in the sidebar now.
// ──────────────────────────────────────────────────────────
export default function Topbar({ onOpenMobileNav }) {
  const { user, logout } = useAuth();
  const { persona } = usePersona();
  const { can } = useRole();
  const { isDark, toggle } = useTheme();
  const { t } = useTranslation();
  const location = useLocation();
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

  const tab = new URLSearchParams(location.search).get('tab');
  const workspaceKey = persona === 'learner'
    ? 'nav.workspace.learner'
    : persona === 'english' ? 'nav.workspace.english' : 'nav.workspace.admin';
  const pageKey = activeItemLabelKey({ role: user.role, can, pathname: location.pathname, tab, persona });

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-[52px] items-center gap-3 px-4 sm:px-5">
        {/* Left: hamburger (mobile) + breadcrumb */}
        <button
          onClick={onOpenMobileNav}
          aria-label={t('nav.openMenu')}
          className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-(--dur)"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <Breadcrumbs
          className="min-w-0"
          items={[{ label: t(workspaceKey) }, { label: t(pageKey) }]}
        />

        {/* Right: search · notifications · theme · avatar */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            aria-label={t('nav.openSearch')}
            title={t('nav.openSearch')}
            className="hidden md:flex h-[34px] w-60 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-xs text-subtle-foreground hover:border-input transition-colors duration-(--dur)"
          >
            <Search className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t('nav.searchPlaceholder')}</span>
            <kbd className="ml-auto rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono">Ctrl K</kbd>
          </button>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label={t('nav.openSearchMobile')}
            className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-(--dur)"
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
