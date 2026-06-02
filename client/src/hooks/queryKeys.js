// Centralized query key factory — keep all keys here so invalidation is consistent.
export const qk = {
  auth: {
    me: ['auth', 'me'],
  },
  users: {
    all: ['users'],
    list: (params) => ['users', 'list', params],
    detail: (id) => ['users', 'detail', id],
    progress: (id) => ['users', 'progress', id],
  },
  teams: {
    all: ['teams'],
    list: ['teams', 'list'],
    mine: ['teams', 'mine'],
    detail: (id) => ['teams', 'detail', id],
    progress: (id) => ['teams', 'progress', id],
  },
  classes: {
    all: ['classes'],
    list: (params) => ['classes', 'list', params],
    courses: ['classes', 'courses'],
    detail: (id) => ['classes', 'detail', id],
  },
  schedules: {
    all: ['schedules'],
    list: (params) => ['schedules', 'list', params],
    availability: (params) => ['schedules', 'availability', params],
    detail: (id) => ['schedules', 'detail', id],
    myClass: ['schedules', 'my-class'],
    attendanceCalendar: ['schedules', 'attendance-calendar'],
  },
  attendance: {
    all: ['attendance'],
    bySchedule: (id) => ['attendance', 'schedule', id],
    byUser: (id) => ['attendance', 'user', id],
    analyticsByEmployee: (params) => ['attendance', 'analytics', 'employee', params],
    analyticsByTeam: (params) => ['attendance', 'analytics', 'team', params],
    analyticsByClass: (params) => ['attendance', 'analytics', 'class', params],
    myStats: ['attendance', 'my-stats'],
  },
  enrollments: {
    all: ['enrollments'],
    list: (params) => ['enrollments', 'list', params],
    byTeam: (teamId, params) => ['enrollments', 'team', teamId, params],
    byUser: (userId) => ['enrollments', 'user', userId],
  },
  evaluations: {
    all: ['evaluations'],
    list: (params) => ['evaluations', 'list', params],
    detail: (id) => ['evaluations', 'detail', id],
  },
  learning: {
    programs: (params) => ['learning', 'programs', params],
    program: (id) => ['learning', 'program', id],
    cohorts: (params) => ['learning', 'cohorts', params],
    cohort: (id) => ['learning', 'cohort', id],
  },
  dashboard: {
    stats: ['dashboard', 'stats'],
  },
  sync: {
    status: ['sync', 'status'],
  },
  exportHr: {
    stats: ['export', 'stats'],
  },
  search: {
    global: (q) => ['search', 'global', q],
  },
};
