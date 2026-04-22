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
// No longer reads token from localStorage. The browser sends
// the HttpOnly cookie automatically with withCredentials: true.
// Nothing to do here — kept as a no-op for potential future use.
api.interceptors.request.use((config) => config);

// ── Response interceptor: Handle 401 globally ─────────────
// Skip for /auth/me — AuthContext handles that gracefully
// to avoid a hard-redirect loop on page load.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      if (!url.includes('/auth/me')) {
        // Cookie is HttpOnly so we can't clear it from JS — the server
        // will reject it on expiry. Just clear local user data and redirect.
        localStorage.removeItem('tms_user');
        window.location.href = '/login';
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
};

// ── Users ─────────────────────────────────────────────────
export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

// ── Teams ─────────────────────────────────────────────────
export const teamsAPI = {
  getAll: () => api.get('/teams'),
  getMyTeams: () => api.get('/teams/my-teams'),
  getById: (id) => api.get(`/teams/${id}`),
  create: (data) => api.post('/teams', data),
  update: (id, data) => api.put(`/teams/${id}`, data),
  delete: (id) => api.delete(`/teams/${id}`),
};

// ── Classes ───────────────────────────────────────────────
export const classesAPI = {
  getAll: (params) => api.get('/classes', { params }),
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

export default api;
