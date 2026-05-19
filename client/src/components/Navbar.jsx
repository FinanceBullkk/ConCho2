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
  UserCog,
  Sun,
  Moon,
  Menu,
  X,
  Search,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import SearchPalette from './SearchPalette';

const NAV_ITEMS = {
  Admin: [
    { path: '/home',     label: 'Home',     icon: Home },
    { path: '/people',   label: 'People',   icon: Users },
    { path: '/programs', label: 'Programs', icon: BookOpen },
    { path: '/calendar', label: 'Calendar', icon: CalendarDays },
    { path: '/reports',  label: 'Reports',  icon: FileBarChart },
    { path: '/system',   label: 'System',   icon: ShieldCog },
  ],
  Teacher: [
    { path: '/home',     label: 'Home',     icon: Home },
    { path: '/calendar', label: 'Calendar', icon: CalendarDays },
    { path: '/reports',  label: 'Reports',  icon: FileBarChart },
  ],
  Participant: [
    { path: '/home',     label: 'Home',     icon: Home },
    { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  ],
};

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
  '/programs': ['/programs', '/classes', '/courses'],
  '/calendar': ['/calendar', '/operations', '/schedules', '/attendance', '/book'],
  '/reports':  ['/reports', '/data'],
  '/system':   ['/system', '/admin', '/settings', '/database'],
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { isDark, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Close on route change
  useEffect(() => setMobileOpen(false), [location.pathname]);

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

  const items = NAV_ITEMS[user.role] || [];

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
                'flex size-9 items-center justify-center rounded-xl text-sm font-bold text-primary-foreground transition-colors duration-(--dur)',
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
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-(--dur)',
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
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
              aria-label="Open search (Ctrl+K)"
              title="Search (Ctrl+K)"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-colors duration-(--dur)"
            >
              <Search className="size-3.5" aria-hidden="true" />
              <span>Search…</span>
              <kbd className="ml-2 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Ctrl K</kbd>
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Open search"
              className="sm:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-(--dur)"
            >
              <Search className="size-4" aria-hidden="true" />
            </button>
            <button
              onClick={toggle}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Light mode' : 'Dark mode'}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-(--dur)"
            >
              {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
            </button>
            <Link to="/me/settings" title="Account settings">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
              >
                <UserCog className="size-4" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Sign out"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-4" />
            </Button>

            {/* Hamburger button — mobile only */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
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
            {items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-(--dur)',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )
                }
                onClick={() => setMobileOpen(false)}
              >
                {item.icon && <item.icon className="size-4" aria-hidden="true" />}
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      {/* Global search palette — Cmd/Ctrl+K opens, "/" too (when not in an input) */}
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
