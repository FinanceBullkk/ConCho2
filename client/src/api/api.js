import axios from 'axios';

// ── Audit PR O (FE-011): 30s default timeout ─────────────
// Without a timeout, a stalled connection (Render cold start, dropped
// keep-alive, slow network) leaves the request hanging indefinitely;
// the spinner spins forever and users smash refresh. 30 seconds is
// the same ceiling we set on `exportLimiter` server-side. Per-call
// overrides (e.g. uploads) can pass `{ timeout: 60_000 }` on the
// individual axios call.
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
  // ── SECURITY FIX (SEC-03): Send HttpOnly cookies with every request ──
  // The JWT is now stored in an HttpOnly cookie set by the server.
  // withCredentials tells axios to include cookies on cross-origin requests.
  withCredentials: true,
});

// ── Request interceptor ───────────────────────────────────
// HttpOnly JWT cookie is sent automatically by the browser with
// withCredentials: true. We additionally echo the readable csrf-token
// cookie back in X-CSRF-Token on all state-changing requests so the
// server's double-submit CSRF check passes.
function getCsrfCookie() {
  return document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf-token='))
    ?.split('=')[1];
}

api.interceptors.request.use((config) => {
  const method = (config.method || '').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = getCsrfCookie();
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
});

// ── Response interceptor: 401 expired sessions + 403 CSRF refresh ─────────
// Skip /auth/me for the 401 branch — AuthContext handles that gracefully
// so we don't hard-redirect on page load.
//
// Audit PR O (FE-012): the CSRF cookie has a 24h maxAge but is also
// rotated on every login/logout. If a tab is left open across a rotation
// (or a logout in another tab) the next write hits 403 "CSRF token
// invalid or missing". Fetching /api/auth/csrf sets a fresh cookie via
// Set-Cookie; we then re-emit the original request once. The retry is
// marked with config.__csrfRetried so we never loop indefinitely.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    const config = error.config || {};

    if (status === 401) {
      const url = config.url || '';
      // Skip auth endpoints — login/me failures are handled by their own UI.
      // Only fire auth-expired for protected API calls that fail mid-session.
      if (!url.includes('/auth/')) {
        // Instead of hard-redirecting, we dispatch an event so the App can
        // show a non-intrusive "Session expired" modal without losing form data.
        localStorage.removeItem('tms_user');
        window.dispatchEvent(new Event('auth-expired'));
      }
      return Promise.reject(error);
    }

    if (status === 403 && !config.__csrfRetried) {
      // CSRF middleware returns the literal message below on mismatch
      // (see server/middleware/csrfProtection.js). Match on substring so
      // copy tweaks don't silently break the refresh path.
      const msg = error.response?.data?.message || '';
      if (msg.toLowerCase().includes('csrf')) {
        try {
          await api.get('/auth/csrf'); // Set-Cookie refreshes csrf-token
          config.__csrfRetried = true;
          // Replace the (now-stale) header with the fresh token before retry.
          const fresh = getCsrfCookie();
          if (fresh) config.headers['X-CSRF-Token'] = fresh;
          return api(config);
        } catch {
          // Surface the original 403 if the refresh itself failed (e.g.
          // server down). Don't replace it with a less-informative
          // network error — the user still needs to see the auth failure.
          return Promise.reject(error);
        }
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────
export const authAPI = {
  login: (empCode, password) => api.post('/auth/login', { empCode, password }),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    api.put('/auth/change-password', { currentPassword, newPassword }),

  // MFA / TOTP
  // mfaPendingToken is now an HttpOnly cookie — browser sends it automatically.
  mfaVerifyLogin: (code) =>
    api.post('/auth/mfa/verify', { code }),
  mfaSetup: () => api.post('/auth/mfa/setup'),
  mfaVerifySetup: (code) => api.post('/auth/mfa/verify-setup', { code }),
  mfaDisable: (code) => api.post('/auth/mfa/disable', { code }),
  mfaAdminDisable: (userId, currentPassword) =>
    api.post(`/auth/mfa/admin-disable/${userId}`, { currentPassword }),

  // Admin force-logout
  adminForceLogout: (userId, currentPassword) =>
    api.post(`/auth/admin/force-logout/${userId}`, { currentPassword }),
};

// ── Users ─────────────────────────────────────────────────
export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  getProgress: (id) => api.get(`/users/${id}/progress`),
};

// ── Access (Roles & capabilities — read-only) ─────────────
export const accessAPI = {
  getCapabilityMatrix: () => api.get('/access/capability-matrix'),
  // Editable roles + custom roles (TMS.update gap #2 — role.manage).
  listRoles: () => api.get('/access/roles'),
  createRole: (data) => api.post('/access/roles', data),
  updateRole: (key, data) => api.put(`/access/roles/${key}`, data),
  deleteRole: (key) => api.delete(`/access/roles/${key}`),
};

// ── Custom fields (Studio — admin-defined fields) ─────────
export const customFieldsAPI = {
  getAll: (params) => api.get('/custom-fields', { params }),
  create: (data) => api.post('/custom-fields', data),
  update: (id, data) => api.put(`/custom-fields/${id}`, data),
  delete: (id) => api.delete(`/custom-fields/${id}`),
};

// ── Teams ─────────────────────────────────────────────────
export const teamsAPI = {
  getAll: () => api.get('/teams'),
  getMyTeams: () => api.get('/teams/my-teams'),
  getById: (id) => api.get(`/teams/${id}`),
  create: (data) => api.post('/teams', data),
  update: (id, data) => api.put(`/teams/${id}`, data),
  delete: (id) => api.delete(`/teams/${id}`),
  getProgress: (id) => api.get(`/teams/${id}/progress`),
};

// ── Classes ───────────────────────────────────────────────
export const classesAPI = {
  getAll: (params) => api.get('/classes', { params }),
  getCourses: () => api.get('/classes/courses'),
  getById: (id) => api.get(`/classes/${id}`),
  create: (data) => api.post('/classes', data),
  update: (id, data) => api.put(`/classes/${id}`, data),
  delete: (id) => api.delete(`/classes/${id}`),
};

// ── Schedules ─────────────────────────────────────────────
export const schedulesAPI = {
  getAvailability: (params) => api.get('/schedules/availability', { params }),
  getAll: (params) => api.get('/schedules', { params }),
  getById: (id) => api.get(`/schedules/${id}`),
  create: (data) => api.post('/schedules', data),
  update: (id, data) => api.put(`/schedules/${id}`, data),
  delete: (id) => api.delete(`/schedules/${id}`),
  // Leader booking: creates a new schedule
  bookSlot: (data) => api.post('/schedules/book-slot', data),
  // Leader cancel: deletes the schedule
  cancelSlot: (scheduleId) => api.delete(`/schedules/${scheduleId}/cancel`),
  // Assign a session's trainers (internal Teacher/Admin refs + an optional
  // external trainer) — re-center Phase 3. session.assign-trainer (Admin/Coordinator).
  setTrainers: (id, data) => api.put(`/schedules/${id}/trainers`, data),
  // Waitlist (phase-04 slice B): self-join the FIFO queue of a FULL session;
  // a freed seat auto-promotes in FIFO order.
  joinWaitlist: (id) => api.post(`/schedules/${id}/waitlist`),
  leaveWaitlist: (id) => api.delete(`/schedules/${id}/waitlist`),
  myWaitlist: () => api.get('/schedules/waitlist/mine'),
  // Staff queue view (Admin/Coordinator any session; Teacher their classes).
  listWaitlist: (id) => api.get(`/schedules/${id}/waitlist`),
  // Participant: upcoming sessions for my class
  getMyClass: () => api.get('/schedules/my-class'),
  // Attendance calendar: schedules with pre-computed attendance status.
  // Accepts { mode: 'cohort' } to scope to the generic training world
  // (English-class separation).
  getAttendanceCalendar: (params) => api.get('/schedules/attendance-calendar', { params }),
};

// ── English class (team-booking world) ────────────────────
// Bounded read surface at /api/english — mode is forced to 'team' server-side.
// Mutations keep their existing APIs (teamsAPI, schedulesAPI.bookSlot,
// evaluationsAPI); only the world-scoped reads live here.
export const englishAPI = {
  getClasses: (params) => api.get('/english/classes', { params }),
  getSchedules: (params) => api.get('/english/schedules', { params }),
  getAttendanceCalendar: (params) => api.get('/english/attendance-calendar', { params }),
};

// ── Attendance ────────────────────────────────────────────
export const attendanceAPI = {
  bulkMark: (scheduleId, records) => api.post(`/attendance/${scheduleId}`, { records }),
  getBySchedule: (scheduleId) => api.get(`/attendance/schedule/${scheduleId}`),
  getByUser: (userId) => api.get(`/attendance/user/${userId}`),
  getAnalyticsByEmployee: (params) => api.get('/attendance/analytics/by-employee', { params }),
  getAnalyticsByTeam: (params) => api.get('/attendance/analytics/by-team', { params }),
  getAnalyticsByClass: (params) => api.get('/attendance/analytics/by-class', { params }),
  // Participant: personal stats
  getMyStats: () => api.get('/attendance/my-stats'),
};

// ── Evaluations ───────────────────────────────────────────
export const evaluationsAPI = {
  upsert: (data) => api.post('/evaluations', data),
  getAll: (params) => api.get('/evaluations', { params }),
  // FLOW-001: class-scoped learner roster for the Add-evaluation picker
  // (Teacher-callable, unlike the Admin-only /users search).
  getRoster: (classId) => api.get('/evaluations/roster', { params: { classId } }),
  getById: (id) => api.get(`/evaluations/${id}`),
  delete: (id) => api.delete(`/evaluations/${id}`),
};

// ── Sync ──────────────────────────────────────────────────
export const syncAPI = {
  status: () => api.get('/sync/status'),
  googleSheets: (data) => api.post('/sync/google-sheets', data),
};

// ── Global Search ─────────────────────────────────────────
export const searchAPI = {
  global: (q, limit = 5) => api.get('/search', { params: { q, limit } }),
};

// ── Export (HR) ───────────────────────────────────────────
export const exportAPI = {
  getStats: () => api.get('/export/stats'),
  // responseType: 'blob' is required to handle the binary Excel file
  downloadAttendance: (params = {}) =>
    api.get('/export/attendance', { params, responseType: 'blob' }),
  downloadEvaluations: (params = {}) =>
    api.get('/export/evaluations', { params, responseType: 'blob' }),
};

// ── Enrollments ───────────────────────────────────────────
export const enrollmentsAPI = {
  getAll: (params) => api.get('/enrollments', { params }),
  getByTeam: (teamId, params) => api.get(`/enrollments/team/${teamId}`, { params }),
  getByUser: (userId) => api.get(`/enrollments/user/${userId}`),
  update: (id, data) => api.put(`/enrollments/${id}`, data),
  transfer: (id, data) => api.post(`/enrollments/${id}/transfer`, data),
  checkConflicts: (data) => api.post('/enrollments/check-conflicts', data),
  // ── Bulk (Screen 4 Roster tab) ──
  bulkTransfer:     (data) => api.post('/enrollments/bulk-transfer', data),
  bulkUpdateStatus: (data) => api.patch('/enrollments/bulk-status', data),
};

// ── Learning Platform ─────────────────────────────────────
export const learningAPI = {
  getPrograms: (params) => api.get('/learning/programs', { params }),
  getProgram: (id) => api.get(`/learning/programs/${id}`),
  getCompletionTrend: (id) => api.get(`/learning/programs/${id}/completion-trend`),
  createProgram: (data) => api.post('/learning/programs', data),
  updateProgram: (id, data) => api.put(`/learning/programs/${id}`, data),
  archiveProgram: (id) => api.delete(`/learning/programs/${id}`),
  getCohorts: (params) => api.get('/learning/cohorts', { params }),
  getCohort: (id) => api.get(`/learning/cohorts/${id}`),
  createCohort: (data) => api.post('/learning/cohorts', data),
  updateCohort: (id, data) => api.put(`/learning/cohorts/${id}`, data),
  deleteCohort: (id) => api.delete(`/learning/cohorts/${id}`),
  getDeletedCohorts: () => api.get('/learning/cohorts/deleted'),
  restoreCohort: (id) => api.post(`/learning/cohorts/${id}/restore`),
  // Safe scheduling config (allowed slots + tz) — readable by all roles.
  getSchedulingConfig: () => api.get('/learning/sessions/config'),
  getSessions: (params) => api.get('/learning/sessions', { params }),
  // Coordinator-scheduled session create (cohort + office + time) — re-center
  // Phase 2. Books against a cohort (self_enroll/nomination), team-less.
  bookSession: (data) => api.post('/learning/sessions/book-slot', data),
  // Sequenced learning paths (ordered curriculum of programs).
  getPaths: (params) => api.get('/learning/paths', { params }),
  getPath: (id) => api.get(`/learning/paths/${id}`),
  createPath: (data) => api.post('/learning/paths', data),
  updatePath: (id, data) => api.put(`/learning/paths/${id}`, data),
  archivePath: (id) => api.delete(`/learning/paths/${id}`),
  getPathProgress: (id) => api.get(`/learning/paths/${id}/progress`),
  getAssignments: (params) => api.get('/learning/assignments', { params }),
  // Own required training + enroll-CTA suggestion (Cohesion P3, self-scoped).
  getMyAssignments: () => api.get('/learning/assignments/mine'),
  getAssignment: (id) => api.get(`/learning/assignments/${id}`),
  createAssignment: (data) => api.post('/learning/assignments', data),
  archiveAssignment: (id) => api.delete(`/learning/assignments/${id}`),
  // Cohort-based (L&D) enrollments — distinct from legacy team-based enrollmentsAPI.
  getEnrollments: (params) => api.get('/learning/enrollments', { params }),
  // Unified self read (converge Phase 2): the learner's enrollments across BOTH
  // modes (team-based group + direct cohort) in one shape, self-scoped server-side.
  getMyEnrollments: () => api.get('/learning/enrollments/mine'),
  createEnrollment: (data) => api.post('/learning/enrollments', data),
  bulkEnroll: (data) => api.post('/learning/enrollments/bulk', data),
  withdrawEnrollment: (id) => api.delete(`/learning/enrollments/${id}`),
  getFeedback: (params) => api.get('/learning/feedback', { params }),
  submitFeedback: (data) => api.post('/learning/feedback', data),
  // Per-learner completion checklist + own certificates (Cohesion P1 —
  // Participant calls are self-scoped server-side; managers may pass learnerId).
  getCompletion: (params) => api.get('/learning/completion', { params }),
  getCertificates: (params) => api.get('/learning/certificates', { params }),
  // Manually issue a certificate for a learner in a cohort (certificate.manage).
  issueCertificate: (data) => api.post('/learning/certificates', data),
  // Nudge selected cohort learners with an in-app notification (enrollment.manage).
  nudgeCohort: (cohortId, data) => api.post(`/learning/cohorts/${cohortId}/nudge`, data),
  // Cohort completion reporting + xlsx export (Admin/Teacher).
  getCompletionReport: (params) => api.get('/learning/reports/completion', { params }),
  getCompletionRollup: () => api.get('/learning/reports/completion/rollup'),
  downloadCompletionReport: (params) =>
    api.get('/learning/reports/completion/export', { params, responseType: 'blob' }),
  // Org-wide compliance reporting + xlsx export (Admin-only).
  getComplianceReport: (params) => api.get('/learning/reports/compliance', { params }),
  downloadComplianceReport: (params) =>
    api.get('/learning/reports/compliance/export', { params, responseType: 'blob' }),
  // Operational dashboard KPI bundle (Admin/Teacher; fail-soft per metric).
  getOperationalDashboard: (params) => api.get('/learning/dashboard/operational', { params }),
  // Home onboarding checklist + at-a-glance counts.
  getSetup: () => api.get('/learning/dashboard/setup'),
  // Per-department performance (Overview table + Departments cards).
  getDepartmentPerformance: (params) => api.get('/learning/dashboard/departments', { params }),
  // Executive ROI bundle + L&D cost config (Admin-only server-side).
  getExecutiveDashboard: (params) => api.get('/learning/dashboard/executive', { params }),
  getCostConfig: () => api.get('/learning/dashboard/cost-config'),
  setCostConfig: (data) => api.put('/learning/dashboard/cost-config', data),
};

// ── Generic Assessment Engine ────────────────────────────
export const assessmentAPI = {
  getAssessments: (params) => api.get('/assessment/assessments', { params }),
  getAssessment: (id) => api.get(`/assessment/assessments/${id}`),
  createAssessment: (data) => api.post('/assessment/assessments', data),
  updateAssessment: (id, data) => api.put(`/assessment/assessments/${id}`, data),
  archiveAssessment: (id) => api.delete(`/assessment/assessments/${id}`),
  getQuestionBank: (params) => api.get('/assessment/question-bank', { params }),
  createQuestionBankItem: (data) => api.post('/assessment/question-bank', data),
  archiveQuestionBankItem: (id) => api.delete(`/assessment/question-bank/${id}`),
  getAttempts: (params) => api.get('/assessment/attempts', { params }),
  // Unified assessment results for the caller (quiz attempts + instructor-scored
  // English evaluations) — one shape (rearchitecture Phase 1 convergence).
  getMyResults: () => api.get('/assessment/results/mine'),
  manualGradeAttempt: (attemptId, data) => api.put(`/assessment/attempts/${attemptId}/manual-grade`, data),
  submitAttempt: (assessmentId, data) => api.post(`/assessment/assessments/${assessmentId}/attempts`, data),
};

// ── Automation rules (no-code engine, TMS.update gap #3) ──
export const automationAPI = {
  listRules: () => api.get('/automation/rules'),
  createRule: (data) => api.post('/automation/rules', data),
  updateRule: (id, data) => api.put(`/automation/rules/${id}`, data),
  deleteRule: (id) => api.delete(`/automation/rules/${id}`),
};

// ── Skills / competency framework (TMS.update gap #4) ─────
export const skillsAPI = {
  list: () => api.get('/skills'),
  roleProfiles: () => api.get('/skills/role-profiles'),
  learner: (userId) => api.get(`/skills/learner/${userId}`),
  create: (data) => api.post('/skills', data),
  update: (id, data) => api.put(`/skills/${id}`, data),
  delete: (id) => api.delete(`/skills/${id}`),
};

// ── Branding & templates designer (TMS.update gap #5) ─────
export const brandingAPI = {
  get: () => api.get('/branding'),
  update: (data) => api.put('/branding', data),
};

// ── Dashboard Analytics ───────────────────────────────────
export const dashboardAPI = {
  getStats: (params) => api.get('/dashboard/stats', { params }),
  getFilterOptions: () => api.get('/dashboard/filter-options'),
  getAlerts: () => api.get('/dashboard/alerts'),
};

// ── Admin Database Explorer ───────────────────────────────
export const adminDbAPI = {
  getCollections: () => api.get('/admin-db/collections'),
  query: (collection, params) => api.get(`/admin-db/${collection}`, { params }),
  update: (collection, id, data) => api.put(`/admin-db/${collection}/${id}`, data),
  remove: (collection, id) => api.delete(`/admin-db/${collection}/${id}`),
};

// ── Reconciliation ───────────────────────────────────────
export const reconcileAPI = {
  triggerRun:     () => api.post('/admin/reconcile/run'),
  getLatest:      () => api.get('/admin/reconcile/latest'),
  getHistory:     () => api.get('/admin/reconcile/history'),
  getTrend:       (limit) => api.get('/admin/reconcile/trend', { params: limit ? { limit } : {} }),
  getById:        (id) => api.get(`/admin/reconcile/${id}`),
  heal:           (check, refs) => api.post('/admin/reconcile/heal', refs ? { check, refs } : { check }),
};

// ── Cron health (scheduled-job heartbeats) ───────────────
export const cronAPI = {
  getHealth:      () => api.get('/admin/cron/health'),
};

// ── Analytics time-series (real history-backed trends + funnel) ───
export const analyticsAPI = {
  getSeries:          (params) => api.get('/analytics/series', { params }),
  getFunnel:          (programId) => api.get('/analytics/funnel', { params: programId ? { programId } : {} }),
  getProgramAnalytics: (id, range) => api.get(`/analytics/program/${id}`, { params: range ? { range } : {} }),
};

// ── Org model (departments, offices, manager hierarchy, my-team) ───
export const orgAPI = {
  getDepartments:    (params) => api.get('/org/departments', { params }),
  createDepartment:  (data) => api.post('/org/departments', data),
  updateDepartment:  (id, data) => api.put(`/org/departments/${id}`, data),
  archiveDepartment: (id) => api.delete(`/org/departments/${id}`),
  getOffices:        (params) => api.get('/org/offices', { params }),
  createOffice:      (data) => api.post('/org/offices', data),
  updateOffice:      (id, data) => api.put(`/org/offices/${id}`, data),
  archiveOffice:     (id) => api.delete(`/org/offices/${id}`),
  assignUser:        (id, data) => api.put(`/org/users/${id}/assignment`, data),
  getMyTeam:         () => api.get('/org/my-team'),
};

// Rooms (re-center Phase 3) — Office-scoped physical rooms, Admin/Coordinator.
export const roomsAPI = {
  getRooms:    (params) => api.get('/rooms', { params }),
  createRoom:  (data) => api.post('/rooms', data),
  updateRoom:  (id, data) => api.put(`/rooms/${id}`, data),
  archiveRoom: (id) => api.delete(`/rooms/${id}`),
};

// In-app notification bell (Cohesion P5) — self-scoped feed over NotificationLog.
export const notificationsAPI = {
  listMine:    () => api.get('/notifications/mine'),
  markRead:    (id) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  getPreferences: () => api.get('/notifications/preferences'),
  setPreferences: (data) => api.put('/notifications/preferences', data),
};

export default api;
