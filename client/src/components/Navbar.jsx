import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  Users,
  BookOpen,
  CalendarDays,
  FileBarChart,
  ShieldCog,
  LogOut,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
  Search,
  ChevronDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import SearchPalette from './SearchPalette';

// Phase 2 IA-S4 — single nav, permission-gated per item.
// access 'full' → clickable link
// access 'read' → clickable (page enforces read-only)
// access 'none' → disabled span + tooltip
const NAV_ITEMS = [
  {
    path: '/home',
    labelKey: 'nav.home',
    icon: Home,
    access: { Admin: 'full', Teacher: 'full', Participant: 'full' },
  },
  {
    path: '/people',
    labelKey: 'nav.people',
    icon: Users,
    access: { Admin: 'full', Teacher: 'none', Participant: 'none' },
    disabledTitleKey: 'nav.adminOnly',
  },
  {
    path: '/learning',
    labelKey: 'nav.learning',
    icon: BookOpen,
    access: { Admin: 'full', Teacher: 'read', Participant: 'none' },
    disabledTitleKey: 'nav.adminOnly',
  },
  {
    path: '/calendar',
    labelKey: 'nav.calendar',
    icon: CalendarDays,
    access: { Admin: 'full', Teacher: 'full', Participant: 'full' },
  },
  {
    path: '/reports',
    labelKey: 'nav.reports',
    icon: FileBarChart,
    access: { Admin: 'full', Teacher: 'full', Participant: 'none' },
    disabledTitleKey: 'nav.participantUnavailable',
  },
];

// Role accent color — used for the logo chip and the role label.
// Solid tokens only (no gradients per Phase 0 §02).
const ROLE_BG = {
  Admin:       'bg-primary',
  Teacher:     'bg-success',
  Participant: 'bg-warning',
};
const ROLE_TEXT = {
  Admin:       'text-primary',
  Teacher:     'text-success',
  Participant: 'text-warning',
};

// Routes that "live under" each top-level nav item — used to highlight active state
// when a deeper page (e.g. /classes/:id) is open.
const NAV_PARENT_ROUTES = {
  '/home':     ['/home', '/dashboard'],
  '/people':   ['/people', '/users', '/teams'],
  '/learning': ['/learning', '/programs', '/classes', '/courses'],
  '/calendar': ['/calendar', '/operations', '/schedules', '/attendance', '/book'],
  '/reports':  ['/reports', '/data'],
  '/system':   ['/system', '/admin', '/settings', '/database'],
};

// ── Avatar dropdown ───────────────────────────────────────
function AvatarMenu({ user, onLogout }) {
  const { t } = useTranslation();

  const initials = (user?.name || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const roleColor = ROLE_BG[user?.role] ?? 'bg-primary';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('nav.openAccountMenu')}
          className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-accent transition-colors duration-(--dur) focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* Avatar chip */}
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-md text-[11px] font-bold text-primary-foreground',
              roleColor,
            )}
            aria-hidden="true"
          >
            {initials}
          </span>
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        {/* User info */}
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

        {user?.role === 'Admin' && (
          <DropdownMenuItem asChild>
            <Link to="/system" className="flex items-center gap-2 cursor-pointer">
              <ShieldCog className="size-4 text-muted-foreground" aria-hidden="true" />
              {t('nav.system')}
            </Link>
          </DropdownMenuItem>
        )}

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

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { isDark, toggle } = useTheme();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Close on route change
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setMobileOpen(false), [location.pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Global keyboard shortcut: Cmd/Ctrl+K opens the search palette.
  // We listen at document level so the shortcut works regardless of focus.
  //
  // BUG #14 fix: previously the shortcut fired even when a modal dialog
  // was open (UserModal / EditModal / etc.), stealing focus and discarding
  // in-progress form input. We now bail when any aria-modal dialog is
  // mounted UNLESS that modal is the SearchPalette itself (so Cmd+K can
  // still close it). Similarly "/" is suppressed inside form controls
  // including <select> and ARIA combobox/textbox/searchbox widgets.
  useEffect(() => {
    const isAnotherModalOpen = () => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      for (const d of dialogs) {
        // SearchPalette has aria-label="Global search" — allow Cmd+K to close it.
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

  // Filter the flat NAV_ITEMS array using each item's per-role access map
  // (set up in commit a5770e8e). `access: 'full'|'read'` → visible link,
  // `'none'` → render disabled span with tooltip so the user knows the
  // feature exists but is restricted (Phase 2 IA).
  const items = NAV_ITEMS.map((item) => ({
    ...item,
    accessLevel: item.access?.[user.role] ?? 'none',
  }));

  const isActive = (path) => {
    const prefixes = NAV_PARENT_ROUTES[path] || [path];
    return prefixes.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'));
  };

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Main nav row */}
        <nav className="flex h-16 items-center justify-between gap-4" aria-label="Main navigation">
          {/* Logo */}
          <Link to="/home" className="group flex shrink-0 items-center gap-3">
            <div
              className={cn(
                'flex size-9 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground transition-colors duration-(--dur)',
                ROLE_BG[user.role] ?? 'bg-primary'
              )}
            >
              T
            </div>
            <span className="hidden text-lg font-bold tracking-tight text-foreground sm:block">
              TMS<span className="text-primary">v2</span>
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex flex-1 items-center justify-center gap-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              const disabled = item.accessLevel === 'none';
              const label = t(item.labelKey);
              const disabledTitle = item.disabledTitleKey
                ? t(item.disabledTitleKey)
                : t('nav.unavailableForRole', { label });
              const baseCls = 'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-(--dur)';
              if (disabled) {
                return (
                  <span
                    key={item.path}
                    aria-disabled="true"
                    title={disabledTitle}
                    className={cn(baseCls, 'text-subtle-foreground/60 cursor-not-allowed')}
                  >
                    <Icon className="size-4" />
                    <span>{label}</span>
                  </span>
                );
              }
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    baseCls,
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>

          {/* User + Actions */}
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
            <button
              onClick={toggle}
              aria-label={isDark ? t('nav.switchLight') : t('nav.switchDark')}
              title={isDark ? t('nav.lightMode') : t('nav.darkMode')}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-(--dur)"
            >
              {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
            </button>
            <AvatarMenu user={user} onLogout={logout} />

            {/* Hamburger button — mobile only */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-(--dur)"
            >
              {mobileOpen ? (
                <X className="size-5" aria-hidden="true" />
              ) : (
                <Menu className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </nav>

        {/* Mobile nav panel */}
        {mobileOpen && (
          <nav
            id="mobile-nav"
            aria-label="Mobile navigation"
            className="md:hidden border-t border-border py-3 space-y-1"
          >
            {items.map((item) => {
              const label = t(item.labelKey);
              const disabledTitle = item.disabledTitleKey
                ? t(item.disabledTitleKey)
                : t('nav.unavailableForRole', { label });
              const baseCls = 'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-(--dur)';
              if (item.accessLevel === 'none') {
                return (
                  <span
                    key={item.path}
                    aria-disabled="true"
                    title={disabledTitle}
                    className={cn(baseCls, 'text-subtle-foreground/60 cursor-not-allowed')}
                  >
                    {item.icon && <item.icon className="size-4" aria-hidden="true" />}
                    {label}
                  </span>
                );
              }
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      baseCls,
                      isActive
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  {item.icon && <item.icon className="size-4" aria-hidden="true" />}
                  {label}
                </NavLink>
              );
            })}
          </nav>
        )}
      </div>

      {/* Global search palette — Cmd/Ctrl+K opens, "/" too (when not in an input) */}
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
