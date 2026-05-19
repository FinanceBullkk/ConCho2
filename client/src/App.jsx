import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AlarmClock, KeyRound } from 'lucide-react';
import { Spinner } from './components/Spinner';
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border w-full max-w-sm space-y-4 rounded-lg p-6 text-center shadow-lg">
        <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-md bg-warning-tint">
          <AlarmClock className="size-6 text-warning" aria-hidden="true" />
        </div>
        <h3 className="text-h2 text-foreground">Your session has expired</h3>
        <p className="text-body text-muted-foreground">
          Open a new tab to sign in again, then come back here to continue without losing your work.
        </p>
        <div className="flex gap-3 pt-2">
          <Button
            variant="default"
            className="flex-1"
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

  const inputCls =
    'w-full px-3 h-10 rounded-md bg-background border border-border text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-(--dur-fast)';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border w-full max-w-md rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-md bg-primary-tint mb-3">
          <KeyRound className="size-6 text-primary" aria-hidden="true" />
        </div>
        <h3 className="text-h2 text-foreground text-center">Đổi mật khẩu bắt buộc</h3>
        <p className="text-body text-muted-foreground text-center mt-2 mb-6">
          Tài khoản của bạn đang dùng mật khẩu mặc định. Vui lòng đặt mật khẩu cá nhân trước khi tiếp tục.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-overline text-muted-foreground mb-1.5">Mật khẩu hiện tại</label>
            <input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              required
              autoComplete="current-password"
              className={inputCls}
              placeholder="Nhập mật khẩu hiện tại"
            />
          </div>
          <div>
            <label className="block text-overline text-muted-foreground mb-1.5">Mật khẩu mới</label>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
              autoComplete="new-password"
              className={inputCls}
              placeholder="Tối thiểu 10 ký tự"
            />
          </div>
          <div>
            <label className="block text-overline text-muted-foreground mb-1.5">Xác nhận mật khẩu mới</label>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              required
              autoComplete="new-password"
              className={inputCls}
              placeholder="Nhập lại mật khẩu mới"
            />
          </div>

          {error && (
            <p className="text-small text-destructive bg-destructive-tint border border-destructive/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || !currentPwd || !newPwd || !confirmPwd}
            className="w-full mt-2"
          >
            {loading ? (
              <>
                <Spinner size={16} />
                Đang xử lý...
              </>
            ) : 'Đổi mật khẩu & Tiếp tục'}
          </Button>
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
