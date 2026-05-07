import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  // ── SECURITY FIX (SEC-03): Send HttpOnly cookies with every request ──
  // The JWT is now stored in an HttpOnly cookie set by the server.
  // withCredentials tells axios to include cookies on cross-origin requests.
  withCredentials: true,
});

// ── Request interceptor ───────────────────────────────────
// No longer needed — HttpOnly cookie is sent automatically
// by the browser with withCredentials: true.

// ── Response interceptor: Handle 401 globally ─────────────
// Skip for /auth/me — AuthContext handles that gracefully
// to avoid a hard-redirect loop on page load.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      // Skip auth endpoints — login/me failures are handled by their own UI.
      // Only fire auth-expired for protected API calls that fail mid-session.
      if (!url.includes('/auth/')) {
        // Instead of hard-redirecting, we dispatch an event so the App can
        // show a non-intrusive "Session expired" modal without losing form data.
        localStorage.removeItem('tms_user');
        window.dispatchEvent(new Event('auth-expired'));
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
  mfaVerifyLogin: (mfaPendingToken, code) =>
    api.post('/auth/mfa/verify', { mfaPendingToken, code }),
  mfaSetup: () => api.post('/auth/mfa/setup'),
  mfaVerifySetup: (code) => api.post('/auth/mfa/verify-setup', { code }),
  mfaDisable: (code) => api.post('/auth/mfa/disable', { code }),
  mfaAdminDisable: (userId) => api.post(`/auth/mfa/admin-disable/${userId}`),

  // Admin force-logout
  adminForceLogout: (userId) => api.post(`/auth/admin/force-logout/${userId}`),
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
  // Participant: upcoming sessions for my class
  getMyClass: () => api.get('/schedules/my-class'),
  // Attendance calendar: schedules with pre-computed attendance status
  getAttendanceCalendar: () => api.get('/schedules/attendance-calendar'),
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
  getById: (id) => api.get(`/evaluations/${id}`),
  delete: (id) => api.delete(`/evaluations/${id}`),
};

// ── Sync ──────────────────────────────────────────────────
export const syncAPI = {
  status: () => api.get('/sync/status'),
  googleSheets: (data) => api.post('/sync/google-sheets', data),
};

// ── Export (HR) ───────────────────────────────────────────
export const exportAPI = {
  getStats: () => api.get('/export/stats'),
  // responseType: 'blob' is required to handle the binary Excel file
  downloadAttendance: (params = {}) =>
    api.get('/export/attendance', { params, responseType: 'blob' }),
};

// ── Enrollments ───────────────────────────────────────────
export const enrollmentsAPI = {
  getAll: (params) => api.get('/enrollments', { params }),
  getByTeam: (teamId, params) => api.get(`/enrollments/team/${teamId}`, { params }),
  getByUser: (userId) => api.get(`/enrollments/user/${userId}`),
  update: (id, data) => api.put(`/enrollments/${id}`, data),
  checkConflicts: (data) => api.post('/enrollments/check-conflicts', data),
};

// ── Dashboard Analytics ───────────────────────────────────
export const dashboardAPI = {
  getStats: (params) => api.get('/dashboard/stats', { params }),
  getFilterOptions: () => api.get('/dashboard/filter-options'),
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
  getById:        (id) => api.get(`/admin/reconcile/${id}`),
};

export default api;
