import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import TeamsPage from './pages/TeamsPage';
import ClassesPage from './pages/ClassesPage';
import SchedulesPage from './pages/SchedulesPage';
import AttendancePage from './pages/AttendancePage';
import SyncPage from './pages/SyncPage';
import BookClassPage from './pages/BookClassPage';
import AttendanceDashboardPage from './pages/AttendanceDashboardPage';
import HRExportPage from './pages/HRExportPage';

// Role-aware schedule view: Participant gets calendar+booking, others get list CRUD
function ScheduleRouter() {
  const { user } = useAuth();
  return user?.role === 'Participant' ? <BookClassPage /> : <SchedulesPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
            <Route path="/users" element={
              <ProtectedRoute roles={['Admin']}><UsersPage /></ProtectedRoute>
            } />
            <Route path="/teams" element={
              <ProtectedRoute roles={['Admin']}><TeamsPage /></ProtectedRoute>
            } />
            <Route path="/classes" element={
              <ProtectedRoute roles={['Admin', 'Teacher']}><ClassesPage /></ProtectedRoute>
            } />
            <Route path="/schedules" element={
              <ProtectedRoute roles={['Admin', 'Teacher', 'Participant']}><ScheduleRouter /></ProtectedRoute>
            } />
            <Route path="/attendance" element={
              <ProtectedRoute roles={['Admin', 'Teacher']}><AttendancePage /></ProtectedRoute>
            } />
            <Route path="/analytics" element={
              <ProtectedRoute roles={['Admin', 'Teacher']}><AttendanceDashboardPage /></ProtectedRoute>
            } />
            <Route path="/export" element={
              <ProtectedRoute roles={['Admin']}><HRExportPage /></ProtectedRoute>
            } />
            <Route path="/sync" element={
              <ProtectedRoute roles={['Admin']}><SyncPage /></ProtectedRoute>
            } />
          </Route>

          {/* Redirect root → dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
