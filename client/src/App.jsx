import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
              <ProtectedRoute roles={['Admin', 'Teacher']}><SchedulesPage /></ProtectedRoute>
            } />
            <Route path="/attendance" element={
              <ProtectedRoute roles={['Admin', 'Teacher']}><AttendancePage /></ProtectedRoute>
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
