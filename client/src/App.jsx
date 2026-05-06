import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AlarmClock } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import { Button } from '@/components/ui/button';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AcademyPage from './pages/AcademyPage';
import OperationsPage from './pages/OperationsPage';
import ReportsPage from './pages/ReportsPage';
import AdminPage from './pages/AdminPage';
import BookClassPage from './pages/BookClassPage';
import ClassDetailPage from './pages/ClassDetailPage';
import UserSettingsPage from './pages/UserSettingsPage';

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
            className="flex-1 border-primary-500/30 bg-primary-500/15 text-primary-300 hover:bg-primary-500/25"
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
          <Toaster position="top-right" richColors closeButton />
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

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
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
