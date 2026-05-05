import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  GraduationCap,
  CalendarCheck,
  FileBarChart,
  ShieldCog,
  CalendarPlus,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_ITEMS = {
  Admin: [
    { path: '/home', label: 'Home', icon: Home },
    { path: '/academy', label: 'Academy', icon: GraduationCap },
    { path: '/operations', label: 'Operations', icon: CalendarCheck },
    { path: '/reports', label: 'Reports', icon: FileBarChart },
    { path: '/admin', label: 'Admin', icon: ShieldCog },
  ],
  Teacher: [
    { path: '/home', label: 'Home', icon: Home },
    { path: '/operations', label: 'Operations', icon: CalendarCheck },
    { path: '/reports', label: 'Reports', icon: FileBarChart },
  ],
  Participant: [
    { path: '/home', label: 'Home', icon: Home },
    { path: '/book', label: 'Book', icon: CalendarPlus },
  ],
};

const ROLE_GRADIENTS = {
  Admin: 'from-primary-500 to-purple-500',
  Teacher: 'from-emerald-500 to-teal-400',
  Participant: 'from-amber-500 to-orange-400',
};

// Routes that "live under" each top-level nav item — used to highlight active state
// when a deeper page (e.g. /academy/classes/:id) is open.
const NAV_PARENT_ROUTES = {
  '/home': ['/home', '/dashboard'],
  '/academy': ['/academy', '/people', '/classes', '/users', '/teams', '/courses'],
  '/operations': ['/operations', '/schedules', '/attendance'],
  '/reports': ['/reports', '/data'],
  '/admin': ['/admin', '/settings', '/database'],
  '/book': ['/book'],
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const items = NAV_ITEMS[user.role] || [];

  const isActive = (path) => {
    const prefixes = NAV_PARENT_ROUTES[path] || [path];
    return prefixes.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'));
  };

  return (
    <nav className="glass sticky top-0 z-50 border-b border-white/5">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Logo */}
        <Link to="/home" className="group flex shrink-0 items-center gap-3">
          <div
            className={cn(
              'flex size-9 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-lg transition-transform group-hover:scale-110',
              ROLE_GRADIENTS[user.role]
            )}
          >
            T
          </div>
          <span className="hidden text-lg font-bold tracking-tight text-white sm:block">
            TMS<span className="text-primary-400">v2</span>
          </span>
        </Link>

        {/* Nav Links */}
        <div className="flex flex-1 items-center justify-center gap-1 overflow-x-auto">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  active
                    ? 'bg-primary/15 text-primary-foreground/90'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                )}
                style={active ? { color: 'hsl(217 91% 75%)' } : undefined}
              >
                <Icon className="size-4" />
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* User + Logout */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden flex-col items-end sm:flex">
            <span className="text-sm font-medium text-white">{user.name}</span>
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-xs font-semibold text-transparent',
                ROLE_GRADIENTS[user.role]
              )}
            >
              {user.role} · {user.empCode}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            title="Sign out"
            className="text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
