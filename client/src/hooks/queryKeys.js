// Centralized query key factory — keep all keys here so invalidation is consistent.
export const qk = {
  auth: {
    me: ['auth', 'me'],
  },
  access: {
    capabilityMatrix: ['access', 'capability-matrix'],
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
    // Callable for world-scoped variants (English-class separation):
    // call with no params for the base prefix (also used for invalidation).
    attendanceCalendar: (params) =>
      params ? ['schedules', 'attendance-calendar', params] : ['schedules', 'attendance-calendar'],
    config: ['schedules', 'config'],
    myWaitlist: ['schedules', 'waitlist', 'mine'],
    waitlist: (id) => ['schedules', 'waitlist', id],
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
    roster: (classId) => ['evaluations', 'roster', classId],
  },
  learning: {
    all: ['learning'],
    programs: (params) => ['learning', 'programs', params],
    program: (id) => ['learning', 'program', id],
    cohorts: (params) => ['learning', 'cohorts', params],
    cohort: (id) => ['learning', 'cohort', id],
    enrollments: (params) => ['learning', 'enrollments', params],
    myEnrollments: ['learning', 'enrollments', 'mine'],
    feedback: (params) => ['learning', 'feedback', params],
    // Per-learner completion checklist + certificates (Cohesion P1).
    completion: (params) => ['learning', 'completion', params],
    certificates: (params) => ['learning', 'certificates', params],
    completionReport: (cohortId) => ['learning', 'completion-report', cohortId],
    completionRollup: ['learning', 'completion-rollup'],
    complianceReport: (params) => ['learning', 'compliance-report', params],
    paths: (params) => ['learning', 'paths', params],
    path: (id) => ['learning', 'path', id],
    pathProgress: (id) => ['learning', 'path-progress', id],
    assignments: (params) => ['learning', 'assignments', params],
    assignment: (id) => ['learning', 'assignment', id],
    myAssignments: ['learning', 'assignments', 'mine'],
    dashboardOperational: (params) => ['learning', 'dashboard', 'operational', params],
    dashboardExecutive: (params) => ['learning', 'dashboard', 'executive', params],
    costConfig: ['learning', 'dashboard', 'cost-config'],
    sessions: (params) => ['learning', 'sessions', params],
  },
  assessment: {
    all: ['assessment'],
    assessments: (params) => ['assessment', 'assessments', params],
    assessment: (id) => ['assessment', 'assessment', id],
    questionBank: (params) => ['assessment', 'question-bank', params],
    attempts: (params) => ['assessment', 'attempts', params],
    myResults: ['assessment', 'results', 'mine'],
  },
  org: {
    all: ['org'],
    departments: (params) => ['org', 'departments', params],
    offices: (params) => ['org', 'offices', params],
    myTeam: ['org', 'my-team'],
  },
  rooms: {
    all: ['rooms'],
    list: (params) => ['rooms', 'list', params],
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
  notifications: {
    all: ['notifications'],
    mine: ['notifications', 'mine'],
  },
};
