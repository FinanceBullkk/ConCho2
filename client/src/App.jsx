import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PeoplePage from './pages/PeoplePage';
import ClassesPage from './pages/ClassesPage';
import SchedulesPage from './pages/SchedulesPage';
import AttendanceHubPage from './pages/AttendanceHubPage';
import DataPage from './pages/DataPage';
import BookClassPage from './pages/BookClassPage';
import SettingsPage from './pages/SettingsPage';

// Role-aware schedule view: Participant gets calendar+booking, Admin/Teacher get list CRUD
function ScheduleRouter() {
  const { user } = useAuth();
  return user?.role === 'Participant' ? <BookClassPage /> : <SchedulesPage />;
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
      <div className="glass rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4 animate-fade-in border border-red-500/30">
        <div className="text-4xl">⏱️</div>
        <h3 className="text-xl font-bold text-white">Phiên đăng nhập hết hạn</h3>
        <p className="text-sm text-slate-300">
          Vui lòng mở một tab mới để đăng nhập lại, sau đó quay lại đây và tiếp tục công việc của bạn mà không bị mất dữ liệu.
        </p>
        <div className="pt-4 flex gap-3">
          <button onClick={() => window.open('/login', '_blank')} className="flex-1 py-2.5 rounded-xl bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:bg-primary-500/30 font-semibold transition-all">Đăng nhập (Tab mới)</button>
          <button onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Đóng</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <AuthExpiredModal />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { background: '#1e293b', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' },
            success: { iconTheme: { primary: '#22c55e', secondary: '#0f172a' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#0f172a' }, duration: 5000 },
          }}
        />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected — wrapped in Layout */}
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/people" element={
              <ProtectedRoute roles={['Admin']}><PeoplePage /></ProtectedRoute>
            } />
            <Route path="/classes" element={
              <ProtectedRoute roles={['Admin']}><ClassesPage /></ProtectedRoute>
            } />
            <Route path="/schedules" element={
              <ProtectedRoute roles={['Admin', 'Teacher', 'Participant']}><ScheduleRouter /></ProtectedRoute>
            } />
            <Route path="/attendance" element={
              <ProtectedRoute roles={['Admin', 'Teacher']}><AttendanceHubPage /></ProtectedRoute>
            } />
            <Route path="/data" element={
              <ProtectedRoute roles={['Admin']}><DataPage /></ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute roles={['Admin']}><SettingsPage /></ProtectedRoute>
            } />
          </Route>

          {/* Redirect root → dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
