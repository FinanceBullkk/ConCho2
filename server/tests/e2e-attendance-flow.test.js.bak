/**
 * E2E Integration Test — Attendance Flow
 * ────────────────────────────────────────
 * Covers: Login → Calendar → Mark Attendance → Verify Status → Role Guard → Analytics
 *
 * Prerequisites:
 *   1. Server running on localhost:5000
 *   2. Seed data loaded (node seed.js)
 *
 * Run:
 *   npx jest tests/e2e-attendance-flow.test.js --runInBand --forceExit
 */

const axios = require('axios');

const BASE = 'http://localhost:5000/api';
let adminCookie, teacherCookie, participantCookie;
let testScheduleId;

// ── Helper: create authenticated axios instance ──────────
const authedClient = (cookie) =>
  axios.create({
    baseURL: BASE,
    headers: { Cookie: cookie },
    validateStatus: () => true, // Don't throw on 4xx/5xx
  });

const extractCookie = (res) => {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return '';
  return setCookie.map((c) => c.split(';')[0]).join('; ');
};

// ══════════════════════════════════════════════════════════
// TEST SUITE
// ══════════════════════════════════════════════════════════

describe('E2E: Full Attendance Flow', () => {
  // ── 1. Authentication ───────────────────────────────────
  describe('1. Authentication', () => {
    test('Admin can login', async () => {
      const res = await axios.post(`${BASE}/auth/login`, {
        empCode: '000001',
        password: 'admin12345',
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.user.role).toBe('Admin');
      adminCookie = extractCookie(res);
      expect(adminCookie).toContain('tms_token');
    });

    test('Teacher can login', async () => {
      const res = await axios.post(`${BASE}/auth/login`, {
        empCode: '000002',
        password: 'teacher123',
      });
      expect(res.status).toBe(200);
      teacherCookie = extractCookie(res);
    });

    test('Participant can login', async () => {
      const res = await axios.post(`${BASE}/auth/login`, {
        empCode: '000004',
        password: 'participant123',
      });
      expect(res.status).toBe(200);
      participantCookie = extractCookie(res);
    });

    test('Invalid credentials return 401', async () => {
      const res = await axios.post(
        `${BASE}/auth/login`,
        { empCode: '000001', password: 'wrongpassword' },
        { validateStatus: () => true }
      );
      expect(res.status).toBe(401);
      expect(res.data.success).toBe(false);
    });

    test('GET /auth/me returns current user', async () => {
      const api = authedClient(adminCookie);
      const res = await api.get('/auth/me');
      expect(res.status).toBe(200);
      expect(res.data.data.empCode).toBe('000001');
    });
  });

  // ── 2. Attendance Calendar ──────────────────────────────
  describe('2. Attendance Calendar', () => {
    test('Returns schedules with pre-computed attendance status', async () => {
      const api = authedClient(adminCookie);
      const res = await api.get('/schedules/attendance-calendar');

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(Array.isArray(res.data.data)).toBe(true);

      if (res.data.data.length > 0) {
        const first = res.data.data[0];
        expect(['none', 'pending', 'partial', 'done']).toContain(
          first.attendanceStatus
        );
        expect(typeof first.markedCount).toBe('number');
        expect(first.classId).toBeDefined();
      }
    });

    test('Schedules with 0 enrollees have status "none" (not "done")', async () => {
      const api = authedClient(adminCookie);
      const res = await api.get('/schedules/attendance-calendar');

      const emptySchedules = res.data.data.filter(
        (s) => (s.enrolledCount || 0) === 0
      );

      emptySchedules.forEach((s) => {
        expect(s.attendanceStatus).toBe('none');
      });
    });

    test('Supports optional date range filtering', async () => {
      const api = authedClient(adminCookie);
      const res = await api.get('/schedules/attendance-calendar', {
        params: { from: '2026-01-01', to: '2026-12-31' },
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
    });

    test('Teacher can access attendance calendar', async () => {
      const api = authedClient(teacherCookie);
      const res = await api.get('/schedules/attendance-calendar');
      expect(res.status).toBe(200);
    });

    test('Participant CANNOT access attendance calendar (403)', async () => {
      const api = authedClient(participantCookie);
      const res = await api.get('/schedules/attendance-calendar');
      expect(res.status).toBe(403);
    });
  });

  // ── 3. Attendance Marking ───────────────────────────────
  describe('3. Attendance Marking', () => {
    test('Teacher can mark attendance for a schedule', async () => {
      const api = authedClient(teacherCookie);

      // Find a schedule with enrolled users
      const calRes = await api.get('/schedules/attendance-calendar');
      const withStudents = calRes.data.data.find(
        (s) => (s.enrolledCount || 0) > 0
      );

      if (!withStudents) {
        console.log(
          '⚠️ No schedule with students found — skipping mark test'
        );
        return;
      }

      testScheduleId = withStudents._id;

      // Get full schedule to find enrolled users
      const schedRes = await api.get(`/schedules/${testScheduleId}`);
      const enrolledUsers = schedRes.data.data.enrolledUsers || [];

      if (enrolledUsers.length === 0) return;

      // Mark all as Present
      const records = enrolledUsers.map((u) => ({
        userId: u._id || u,
        status: 'P',
        remark: 'E2E test',
      }));

      const markRes = await api.post(`/attendance/${testScheduleId}`, {
        records,
      });
      expect(markRes.status).toBe(200);
      expect(markRes.data.success).toBe(true);
    });

    test('Calendar status updates after marking', async () => {
      if (!testScheduleId) return;

      const api = authedClient(teacherCookie);
      const res = await api.get('/schedules/attendance-calendar');
      const updated = res.data.data.find(
        (s) => s._id.toString() === testScheduleId.toString()
      );

      if (updated) {
        expect(['done', 'partial']).toContain(updated.attendanceStatus);
        expect(updated.markedCount).toBeGreaterThan(0);
      }
    });

    test('Participant CANNOT mark attendance (403)', async () => {
      if (!testScheduleId) return;

      const api = authedClient(participantCookie);
      const res = await api.post(`/attendance/${testScheduleId}`, {
        records: [{ userId: '000000000000000000000000', status: 'P' }],
      });
      expect(res.status).toBe(403);
    });
  });

  // ── 4. Authorization Guards ─────────────────────────────
  describe('4. Authorization Guards', () => {
    test('Participant can only view OWN attendance (M-06 fix)', async () => {
      const api = authedClient(participantCookie);

      // View own → should work
      const meRes = await api.get('/auth/me');
      const myId = meRes.data.data._id;
      const ownRes = await api.get(`/attendance/user/${myId}`);
      expect(ownRes.status).toBe(200);

      // View someone else's → should be 403
      // Use a fake ObjectId that's not the participant's
      const fakeId = '000000000000000000000099';
      const otherRes = await api.get(`/attendance/user/${fakeId}`);
      expect(otherRes.status).toBe(403);
    });

    test('Admin can view any user attendance', async () => {
      const api = authedClient(adminCookie);
      const meRes = await api.get('/auth/me');
      const res = await api.get(`/attendance/user/${meRes.data.data._id}`);
      expect(res.status).toBe(200);
    });

    test('Participant cannot access admin routes', async () => {
      const api = authedClient(participantCookie);
      const res = await api.get('/users');
      expect(res.status).toBe(403);
    });
  });

  // ── 5. Analytics Integration ────────────────────────────
  describe('5. Analytics Integration', () => {
    test('Analytics by-employee returns valid data', async () => {
      const api = authedClient(adminCookie);
      const res = await api.get('/attendance/analytics/by-employee');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);

      if (res.data.data.length > 0) {
        const first = res.data.data[0];
        expect(first.empCode).toBeDefined();
        expect(typeof first.attendanceRate).toBe('number');
        expect(first.attendanceRate).toBeGreaterThanOrEqual(0);
        expect(first.attendanceRate).toBeLessThanOrEqual(100);
      }
    });

    test('Analytics by-team returns valid data', async () => {
      const api = authedClient(adminCookie);
      const res = await api.get('/attendance/analytics/by-team');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
    });

    test('Export stats return pending/exported counts', async () => {
      const api = authedClient(adminCookie);
      const res = await api.get('/export/stats');

      expect(res.status).toBe(200);
      expect(typeof res.data.data.pending).toBe('number');
      expect(typeof res.data.data.exported).toBe('number');
      expect(typeof res.data.data.total).toBe('number');
    });
  });

  // ── 6. Data Integrity ───────────────────────────────────
  describe('6. Data Integrity', () => {
    test('Health check endpoint works', async () => {
      const res = await axios.get(`${BASE.replace('/api', '')}/api/health`);
      expect(res.status).toBe(200);
      expect(res.data.status).toBe('ok');
    });

    test('404 for unknown routes', async () => {
      const api = authedClient(adminCookie);
      const res = await api.get('/nonexistent-route');
      expect(res.status).toBe(404);
    });

    test('Unauthenticated request returns 401', async () => {
      const res = await axios.get(`${BASE}/users`, {
        validateStatus: () => true,
      });
      expect(res.status).toBe(401);
    });
  });
});
