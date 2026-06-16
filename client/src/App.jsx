import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AlarmClock, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Spinner } from './components/Spinner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PersonaProvider } from './context/PersonaContext';
import { authAPI } from './api/api';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import { Button } from '@/components/ui/button';
import { PasswordStrength, scorePassword } from '@/components/PasswordStrength';

// Login is kept eager — first paint for unauthenticated users should not
// pay a chunk-fetch round-trip. Everything behind auth is lazy.
import LoginPage from './features/auth/LoginPage';

const ForgotPasswordPage = lazy(() => import('./features/auth/ForgotPasswordPage'));
const ResetPasswordPage  = lazy(() => import('./features/auth/ResetPasswordPage'));

const DashboardPage    = lazy(() => import('./features/dashboard/DashboardPage'));
const PeoplePage       = lazy(() => import('./pages/PeoplePage'));
const LearningPage     = lazy(() => import('./features/learning/LearningPage'));
const EnglishPage      = lazy(() => import('./features/english/EnglishPage'));
const ReportsPage      = lazy(() => import('./pages/ReportsPage'));
const DrillListPage    = lazy(() => import('./features/learning/DrillListPage'));
const ProgramDetailPage = lazy(() => import('./features/learning/ProgramDetailPage'));
const CohortDetailPage = lazy(() => import('./features/learning/CohortDetailPage'));
const SessionDetailPage = lazy(() => import('./features/learning/SessionDetailPage'));
const LearnerProfilePage = lazy(() => import('./features/learning/LearnerProfilePage'));
const NotificationsPage = lazy(() => import('./features/notifications/NotificationsPage'));
const SystemPage       = lazy(() => import('./pages/SystemPage'));
const CalendarPage     = lazy(() => import('./pages/CalendarPage'));
const ClassDetailPage  = lazy(() => import('./features/classes/ClassDetailPage'));
const UserSettingsPage = lazy(() => import('./features/auth/UserSettingsPage'));
const MyLearningCatalogPage = lazy(() => import('./features/learner/MyLearningCatalogPage'));
const MyProgramsPage = lazy(() => import('./features/learner/MyProgramsPage'));
const MyProgramPage  = lazy(() => import('./features/learner/MyProgramPage'));
const MyLearningPathsPage = lazy(() => import('./features/learner/MyLearningPathsPage'));
const MyAssessmentsPage = lazy(() => import('./features/learner/MyAssessmentsPage'));
const MyFeedbackPage = lazy(() => import('./features/learner/MyFeedbackPage'));
const MySessionsPage = lazy(() => import('./features/learner/MySessionsPage'));
const MyTranscriptPage = lazy(() => import('./features/learner/MyTranscriptPage'));
const TodayPage = lazy(() => import('./features/mobile/TodayPage'));
const MyTeamPage = lazy(() => import('./features/groups/MyTeamPage'));
const RolesAccessPage = lazy(() => import('./features/access/RolesAccessPage'));
const CustomFieldsPage = lazy(() => import('./features/custom-fields/CustomFieldsPage'));
const AutomationPage = lazy(() => import('./features/automation/AutomationPage'));
const SkillsPage = lazy(() => import('./features/skills/SkillsPage'));
const BrandingPage = lazy(() => import('./features/branding/BrandingPage'));
const StudioSchedulingPage = lazy(() => import('./features/scheduling/StudioSchedulingPage'));
const ComplianceMatrixPage = lazy(() => import('./features/compliance/ComplianceMatrixPage'));
const CostRoiSettingsPage = lazy(() => import('./features/settings/CostRoiSettingsPage'));
const BudgetDashboardPage = lazy(() => import('./features/finance/BudgetDashboardPage'));
const VendorsPage = lazy(() => import('./features/vendor/VendorsPage'));
const TrainersPage = lazy(() => import('./features/trainer/TrainersPage'));
const PlanningPage = lazy(() => import('./features/planning/PlanningPage'));
const MobileAttendancePage = lazy(() => import('./features/attendance/MobileAttendancePage'));

function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
      <Spinner size={28} />
    </div>
  );
}

function AuthExpiredModal() {
  const { t } = useTranslation();
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
        <h3 className="text-h2 text-foreground">{t('modals.authExpired.title')}</h3>
        <p className="text-body text-muted-foreground">
          {t('modals.authExpired.body')}
        </p>
        <div className="flex gap-3 pt-2">
          <Button
            variant="default"
            className="flex-1"
            onClick={() => window.open('/login', '_blank')}
          >
            {t('modals.authExpired.signIn')}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('modals.authExpired.dismiss')}
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
  const { t } = useTranslation();
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
      setError(t('modals.forceChange.errMismatch'));
      return;
    }
    if (newPwd.length < 10) {
      setError(t('modals.forceChange.errTooShort'));
      return;
    }
    if (newPwd === currentPwd) {
      setError(t('modals.forceChange.errSameAsCurrent'));
      return;
    }
    setLoading(true);
    try {
      await authAPI.changePassword(currentPwd, newPwd);
      await refreshUser(); // Clears mustChangePassword from context
    } catch (err) {
      setError(err.response?.data?.message || t('modals.forceChange.errGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full px-3 h-10 rounded-md bg-background border border-border text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-(--dur-fast)';

  // Phase 4 Surface 10 §D — share scorer + meter with UserSettings & Reset.
  const newPwdScore = scorePassword(newPwd);
  const meetsStrength = newPwdScore >= 2;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border w-full max-w-md rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-md bg-primary-tint mb-3">
          <KeyRound className="size-6 text-primary" aria-hidden="true" />
        </div>
        <h3 className="text-h2 text-foreground text-center">{t('modals.forceChange.title')}</h3>
        <p className="text-body text-muted-foreground text-center mt-2 mb-6">
          {t('modals.forceChange.subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-overline text-muted-foreground mb-1.5">{t('modals.forceChange.currentPwd')}</label>
            <input
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              required
              autoComplete="current-password"
              className={inputCls}
              placeholder={t('modals.forceChange.currentPwdPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-overline text-muted-foreground mb-1.5">{t('modals.forceChange.newPwd')}</label>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
              autoComplete="new-password"
              className={inputCls}
              placeholder={t('modals.forceChange.newPwdPlaceholder')}
            />
            <PasswordStrength value={newPwd} labels={t('passwordStrength', { returnObjects: true })} className="mt-2" />
          </div>
          <div>
            <label className="block text-overline text-muted-foreground mb-1.5">{t('modals.forceChange.confirmPwd')}</label>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              required
              autoComplete="new-password"
              className={inputCls}
              placeholder={t('modals.forceChange.confirmPwdPlaceholder')}
            />
          </div>

          {error && (
            <p className="text-small text-destructive bg-destructive-tint border border-destructive/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || !currentPwd || !newPwd || !confirmPwd || !meetsStrength}
            className="w-full mt-2"
          >
            {loading ? (
              <>
                <Spinner size={16} />
                {t('modals.forceChange.submitting')}
              </>
            ) : t('modals.forceChange.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}

// Routes that previously lived at top level — keep them working as deep redirects
// to the new section pages (preserves bookmarks for one release).
const LEGACY_REDIRECTS = [
  { from: '/dashboard',  to: '/home' },
  // IA-S2 renames
  { from: '/academy',    to: '/people' },
  { from: '/admin',      to: '/system' },
  { from: '/programs',   to: '/learning' },
  { from: '/classes',    to: '/learning?tab=cohorts' },
  { from: '/data',       to: '/reports?tab=hr-export' },
  { from: '/settings',   to: '/system?tab=settings' },
  // IA-S3: Schedules + Attendance + Book → unified /calendar
  { from: '/schedules',  to: '/calendar?tab=schedules' },
  { from: '/attendance', to: '/calendar?tab=attendance' },
  { from: '/operations', to: '/calendar' },
  { from: '/operations/analytics', to: '/reports?tab=analytics' },
  // English-class separation: the leader booking grid lives in /english now.
  { from: '/book',       to: '/english?tab=book' },
];

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
         <PersonaProvider>
          <AuthExpiredModal />
          <ForceChangePasswordModal />
          <Toaster position="top-right" richColors closeButton />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              {/* SEC-005: path-style is the canonical route; query-string
                  variant is kept so emails sent before the rollout (≤1h
                  in flight) still work. */}
              <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Protected — wrapped in Layout */}
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/home" element={<DashboardPage />} />
                {/* Manager dashboard — any authenticated user; self-scoped server-side */}
                <Route path="/my-team" element={<MyTeamPage />} />
                {/* Notification center — any authenticated user; self-scoped. */}
                <Route path="/notifications" element={<NotificationsPage />} />

                <Route path="/people" element={
                  <ProtectedRoute roles={['Admin', 'Coordinator']}><PeoplePage /></ProtectedRoute>
                } />
                {/* Learner 360° (admin) — usersAPI.getById is Admin-gated. */}
                <Route path="/people/:userId" element={
                  <ProtectedRoute roles={['Admin']}><LearnerProfilePage /></ProtectedRoute>
                } />
                <Route path="/learning" element={
                  <ProtectedRoute roles={['Admin', 'Coordinator', 'Teacher']}><LearningPage /></ProtectedRoute>
                } />
                <Route path="/learning/programs/:id" element={
                  <ProtectedRoute roles={['Admin', 'Coordinator', 'Teacher']}><ProgramDetailPage /></ProtectedRoute>
                } />
                <Route path="/learning/cohorts/:id" element={
                  <ProtectedRoute roles={['Admin', 'Coordinator', 'Teacher']}><CohortDetailPage /></ProtectedRoute>
                } />
                {/* Session attendance marking — Admin/Teacher (the markers). */}
                <Route path="/learning/sessions/:id" element={
                  <ProtectedRoute roles={['Admin', 'Teacher']}><SessionDetailPage /></ProtectedRoute>
                } />
                {/* English-class section — the whole team-booking world
                    (classes/teams/schedules/attendance/evaluations/booking). */}
                <Route path="/english" element={<EnglishPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/mobile-attendance" element={
                  <ProtectedRoute roles={['Admin', 'Teacher']}><MobileAttendancePage /></ProtectedRoute>
                } />
                <Route path="/reports" element={
                  <ProtectedRoute roles={['Admin', 'Teacher']}><ReportsPage /></ProtectedRoute>
                } />
                {/* Drill list — filtered learner view behind a dashboard KPI.
                    Admin-only: it reads the org-wide compliance report. */}
                <Route path="/reports/drill" element={
                  <ProtectedRoute roles={['Admin']}><DrillListPage /></ProtectedRoute>
                } />
                <Route path="/system" element={
                  <ProtectedRoute roles={['Admin']}><SystemPage /></ProtectedRoute>
                } />
                <Route path="/access" element={
                  <ProtectedRoute roles={['Admin']}><RolesAccessPage /></ProtectedRoute>
                } />
                <Route path="/custom-fields" element={
                  <ProtectedRoute roles={['Admin']}><CustomFieldsPage /></ProtectedRoute>
                } />
                <Route path="/automation" element={
                  <ProtectedRoute roles={['Admin']}><AutomationPage /></ProtectedRoute>
                } />
                <Route path="/skills" element={
                  <ProtectedRoute roles={['Admin']}><SkillsPage /></ProtectedRoute>
                } />
                <Route path="/branding" element={
                  <ProtectedRoute roles={['Admin']}><BrandingPage /></ProtectedRoute>
                } />
                <Route path="/scheduling" element={
                  <ProtectedRoute roles={['Admin']}><StudioSchedulingPage /></ProtectedRoute>
                } />
                <Route path="/compliance" element={
                  <ProtectedRoute roles={['Admin', 'Coordinator']}><ComplianceMatrixPage /></ProtectedRoute>
                } />
                <Route path="/cost-roi" element={
                  <ProtectedRoute roles={['Admin']}><CostRoiSettingsPage /></ProtectedRoute>
                } />
                <Route path="/budget" element={
                  <ProtectedRoute roles={['Admin', 'Coordinator']}><BudgetDashboardPage /></ProtectedRoute>
                } />
                <Route path="/vendors" element={
                  <ProtectedRoute roles={['Admin', 'Coordinator']}><VendorsPage /></ProtectedRoute>
                } />
                <Route path="/trainers" element={
                  <ProtectedRoute roles={['Admin', 'Coordinator']}><TrainersPage /></ProtectedRoute>
                } />
                <Route path="/planning" element={
                  <ProtectedRoute roles={['Admin', 'Coordinator']}><PlanningPage /></ProtectedRoute>
                } />

                {/* Detail pages keep their own routes for deep links */}
                <Route path="/classes/:id" element={
                  <ProtectedRoute roles={['Admin']}><ClassDetailPage /></ProtectedRoute>
                } />

                {/* Self-service learner surfaces (My Learning persona) — open to
                    every authenticated user; all reads are self-scoped server-side,
                    so staff can review their own learning too (IA Phase 02). */}
                <Route path="/me/settings" element={<UserSettingsPage />} />
                <Route path="/me/catalog" element={<MyLearningCatalogPage />} />
                {/* Cohesion P1 — learner program home (per-enrollment hub) */}
                <Route path="/me/programs" element={<MyProgramsPage />} />
                <Route path="/me/programs/:cohortId" element={<MyProgramPage />} />
                <Route path="/me/paths" element={<MyLearningPathsPage />} />
                <Route path="/me/assessments" element={<MyAssessmentsPage />} />
                <Route path="/me/feedback" element={<MyFeedbackPage />} />
                <Route path="/me/sessions" element={<MySessionsPage />} />
                <Route path="/me/transcript" element={<MyTranscriptPage />} />
                <Route path="/me/today" element={<TodayPage />} />

                {/* Legacy redirects */}
                {LEGACY_REDIRECTS.map(({ from, to }) => (
                  <Route key={from} path={from} element={<Navigate to={to} replace />} />
                ))}
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </Suspense>
         </PersonaProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
