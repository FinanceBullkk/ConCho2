import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('tms_token');
      localStorage.removeItem('tms_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────
export const authAPI = {
  login: (empCode, password) => api.post('/auth/login', { empCode, password }),
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
  getAll: (params) => api.get('/schedules', { params }),
  getById: (id) => api.get(`/schedules/${id}`),
  create: (data) => api.post('/schedules', data),
  update: (id, data) => api.put(`/schedules/${id}`, data),
  delete: (id) => api.delete(`/schedules/${id}`),
  bookTeam: (scheduleId, teamId) => api.post(`/schedules/${scheduleId}/book-team`, { teamId }),
  cancelTeam: (scheduleId, teamId) => api.post(`/schedules/${scheduleId}/cancel-team`, { teamId }),
};

// ── Attendance ────────────────────────────────────────────
export const attendanceAPI = {
  bulkMark: (scheduleId, records) => api.post(`/attendance/${scheduleId}`, { records }),
  getBySchedule: (scheduleId) => api.get(`/attendance/schedule/${scheduleId}`),
  getByUser: (userId) => api.get(`/attendance/user/${userId}`),
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

export default api;
