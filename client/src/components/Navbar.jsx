import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = {
  Admin: [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/users', label: 'Users', icon: '👤' },
    { path: '/teams', label: 'Teams', icon: '👥' },
    { path: '/classes', label: 'Classes', icon: '📚' },
    { path: '/schedules', label: 'Schedules', icon: '📅' },
    { path: '/attendance', label: 'Attendance', icon: '✅' },
    { path: '/sync', label: 'Sheets Sync', icon: '📊' },
  ],
  Teacher: [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/schedules', label: 'My Schedules', icon: '📅' },
    { path: '/attendance', label: 'Attendance', icon: '✅' },
    { path: '/evaluations', label: 'Evaluations', icon: '⭐' },
  ],
  Participant: [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/schedules', label: 'My Schedule', icon: '📅' },
    { path: '/my-attendance', label: 'My Attendance', icon: '✅' },
  ],
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const items = NAV_ITEMS[user.role] || [];

  const roleColors = {
    Admin: 'from-primary-500 to-purple-500',
    Teacher: 'from-accent-green to-teal-400',
    Participant: 'from-accent-amber to-orange-400',
  };

  return (
    <nav className="glass border-b border-white/5 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${roleColors[user.role]} flex items-center justify-center text-white font-bold text-sm shadow-lg group-hover:scale-110 transition-transform`}>
              T
            </div>
            <span className="font-bold text-white text-lg tracking-tight hidden sm:block">
              TMS<span className="text-primary-400">v2</span>
            </span>
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {items.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-primary-500/20 text-primary-300'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* User Info + Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium text-white">{user.name}</span>
              <span className={`text-xs bg-gradient-to-r ${roleColors[user.role]} bg-clip-text text-transparent font-semibold`}>
                {user.role} • {user.empCode}
              </span>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg text-slate-400 hover:text-accent-red hover:bg-accent-red/10 transition-all"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
