import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AlarmClock } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { authAPI } from './api/api';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import { Button } from '@/components/ui/button';

// Login is kept eager — first paint for unauthenticated users should not
// pay a chunk-fetch round-trip. Everything behind auth is lazy.
import LoginPage from './pages/LoginPage';

const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage  = lazy(() => import('./pages/ResetPasswordPage'));

const DashboardPage    = lazy(() => import('./pages/DashboardPage'));
const AcademyPage      = lazy(() => import('./pages/AcademyPage'));
const OperationsPage   = lazy(() => import('./pages/OperationsPage'));
const ReportsPage      = lazy(() => import('./pages/ReportsPage'));
const AdminPage        = lazy(() => import('./pages/AdminPage'));
const BookClassPage    = lazy(() => import('./pages/BookClassPage'));
const ClassDetailPage  = lazy(() => import('./pages/ClassDetailPage'));
const UserSettingsPage = lazy(() => import('./pages/UserSettingsPage'));

function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AuthExpiredModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleExpired = () => setOpen(true);
    window.addEventListener('auth-expired', handleExpired);
    return () => window.removeEventListener('auth-expired', handleExpired);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass animate-fade-in mx-4 max-w-sm space-y-4 rounded-2xl border border-rose-500/30 p-6 text-center">
        <AlarmClock className="mx-auto size-10 text-rose-400" />
        <h3 className="text-xl font-bold text-white">Your session has expired</h3>
        <p className="text-sm text-slate-300">
          Open a new tab to sign in again, then come back here to continue without losing your work.
        </p>
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1 border-primary/30 bg-primary/15 text-primary hover:bg-primary/25"
            onClick={() => window.open('/login', '_blank')}
          >
            Sign in (new tab)
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Force-change-password gate (SEC-04) ──────────────────
// Shown as a non-dismissable modal when user.mustChangePassword is true
// (e.g. first login with a seed/default password). Blocks ALL navigation
// until the user sets a personal password.
function ForceChangePasswordModal() {
  const { user, refreshUser } = useAuth();
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!user?.mustChangePassword) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPwd !== confirmPwd) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    if (newPwd.length < 10) {
      setError('Mật khẩu mới phải có ít nhất 10 ký tự');
      return;
    }
    if (newPwd === currentPwd) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại');
      return;
    }
    setLoading(true);
    try {
      await authAPI.changePassword(currentPwd, newPwd);
      await refreshUser(); // Clears mustChangePassword from context
    } catch (err) {
      setError(err.response?.data?.message || 'Đổi mật khẩu thất bại. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="glass animate-fade-in mx-4 max-w-md w-full rounded-2xl border border-amber-500/40 p-8">
        <div className="text-4xl text-center mb-3">🔐</div>
        <h3 className="text-xl font-bold text-white text-center mb-1">Đổi mật khẩu bắt buộc</h3>
        <p className="text-sm text-slate-400 text-center mb-6">
          Tài khoản của bạn đang dùng mật khẩu mặc định. Vui lòng đặt mật khẩu cá nhân trước khi tiếp tục.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Mật khẩu hiện tại</label>
            <input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
              placeholder="Nhập mật khẩu hiện tại"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Mật khẩu mới</label>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
              placeholder="Tối thiểu 10 ký tự"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Xác nhận mật khẩu mới</label>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all"
              placeholder="Nhập lại mật khẩu mới"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !currentPwd || !newPwd || !confirmPwd}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20 mt-2"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang xử lý...
              </span>
            ) : 'Đổi mật khẩu & Tiếp tục'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Routes that previously lived at top level — keep them working as deep redirects
// to the new section pages (preserves bookmarks for one release).
const LEGACY_REDIRECTS = [
  { from: '/dashboard', to: '/home' },
  { from: '/people', to: '/academy?tab=users' },
  { from: '/classes', to: '/academy?tab=classes' },
  { from: '/schedules', to: '/operations?tab=schedules' },
  { from: '/attendance', to: '/operations?tab=attendance' },
  { from: '/data', to: '/reports?tab=hr-export' },
  { from: '/settings', to: '/admin?tab=settings' },
];

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AuthExpiredModal />
          <ForceChangePasswordModal />
          <Toaster position="top-right" richColors closeButton />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Protected — wrapped in Layout */}
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/home" element={<DashboardPage />} />

                <Route path="/academy" element={
                  <ProtectedRoute roles={['Admin']}><AcademyPage /></ProtectedRoute>
                } />
                <Route path="/operations" element={
                  <ProtectedRoute roles={['Admin', 'Teacher']}><OperationsPage /></ProtectedRoute>
                } />
                <Route path="/reports" element={
                  <ProtectedRoute roles={['Admin', 'Teacher']}><ReportsPage /></ProtectedRoute>
                } />
                <Route path="/admin" element={
                  <ProtectedRoute roles={['Admin']}><AdminPage /></ProtectedRoute>
                } />

                {/* Participant booking calendar */}
                <Route path="/book" element={
                  <ProtectedRoute roles={['Participant']}><BookClassPage /></ProtectedRoute>
                } />

                {/* Detail pages keep their own routes for deep links */}
                <Route path="/classes/:id" element={
                  <ProtectedRoute roles={['Admin']}><ClassDetailPage /></ProtectedRoute>
                } />

                {/* Self-service account settings — every authenticated user */}
                <Route path="/me/settings" element={<UserSettingsPage />} />

                {/* Legacy redirects */}
                {LEGACY_REDIRECTS.map(({ from, to }) => (
                  <Route key={from} path={from} element={<Navigate to={to} replace />} />
                ))}
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
