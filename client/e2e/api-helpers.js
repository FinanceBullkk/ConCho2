// @ts-check

/**
 * API helpers for E2E fixture setup/teardown (QA-018b).
 *
 * Specs drive the UI for the behavior under test, but build their data
 * fixtures through the real REST API (cookies + CSRF), exactly like the SPA
 * does. All helpers take a Playwright APIRequestContext (`request` fixture
 * or `page.request`) — cookies persist on the context between calls.
 */

const ADMIN = { empCode: process.env.E2E_ADMIN_CODE || '000001', password: process.env.E2E_ADMIN_PASS || 'admin12345' };

/** Fetch a CSRF token (also sets the csrf cookie on the context). */
export async function csrfHeaders(request) {
  const res = await request.get('/api/auth/csrf');
  if (!res.ok()) throw new Error(`GET /api/auth/csrf failed: ${res.status()}`);
  const body = await res.json();
  return { 'x-csrf-token': body.data.csrfToken };
}

/**
 * Log the request context in via the API (sets the tms_token cookie).
 * Returns the login response body.
 */
export async function apiLogin(request, { empCode, password }) {
  const headers = await csrfHeaders(request);
  const res = await request.post('/api/auth/login', { headers, data: { empCode, password } });
  if (!res.ok()) throw new Error(`Login as ${empCode} failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function apiLoginAdmin(request) {
  return apiLogin(request, ADMIN);
}

/** GET wrapper that asserts 2xx and returns the parsed body. */
export async function apiGet(request, url) {
  const res = await request.get(url);
  if (!res.ok()) throw new Error(`GET ${url} failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** Mutating wrapper (CSRF attached) that asserts 2xx and returns the body. */
export async function apiSend(request, method, url, data) {
  const headers = await csrfHeaders(request);
  const res = await request.fetch(url, { method, headers, data });
  if (!res.ok()) throw new Error(`${method} ${url} failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/** Find a seed user's id by empCode (Admin context required). */
export async function findUserIdByEmpCode(request, empCode) {
  const body = await apiGet(request, `/api/users?search=${empCode}&limit=5`);
  const user = body.data.find((u) => u.empCode === empCode);
  if (!user) throw new Error(`Seed user ${empCode} not found — run server/scripts/seed.js`);
  return user._id;
}

/** Find a seed class by classCode (e.g. EL001/EL002). */
export async function findClassByCode(request, classCode) {
  const body = await apiGet(request, `/api/classes?classCode=${classCode}`);
  const cls = body.data.find((c) => c.classCode === classCode);
  if (!cls) throw new Error(`Seed class ${classCode} not found — run server/scripts/seed.js`);
  return cls;
}

/** Find a seed team by exact name. */
export async function findTeamByName(request, name) {
  const body = await apiGet(request, '/api/teams');
  const team = body.data.find((t) => t.name === name);
  if (!team) throw new Error(`Seed team "${name}" not found — run server/scripts/seed.js`);
  return team;
}

/**
 * Create a PAST session for attendance fixtures by scanning backwards for a
 * free slot (yesterday → up to ~4 weeks back, all 5 default VN windows).
 *
 * Past sessions cannot be deleted once started ("attendance is preserved"),
 * so re-runs against a persistent dev DB cannot clean up after themselves —
 * instead each run claims the next free {classId, startTime}. Collision and
 * weekly-cap rejections just advance the scan. Stays within the 30-day
 * attendance edit window.
 */
export async function createPastSessionInFreeSlot(request, { classId, bookedTeamId }) {
  const SLOT_STARTS_UTC = [6, 8, 3, 7, 4]; // 13:00, 15:00, 10:00, 14:00, 11:00 VN
  for (let daysBack = 1; daysBack <= 27; daysBack += 1) {
    for (const hour of SLOT_STARTS_UTC) {
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - daysBack);
      start.setUTCHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setUTCHours(hour + 1, 0, 0, 0);

      const headers = await csrfHeaders(request);
      const res = await request.post('/api/schedules', {
        headers,
        data: { classId, bookedTeamId, startTime: start.toISOString(), endTime: end.toISOString() },
      });
      if (res.ok()) return (await res.json()).data;
      // 4xx = slot taken / weekly cap — keep scanning. Anything 5xx is real.
      if (res.status() >= 500) throw new Error(`POST /api/schedules failed: ${res.status()} ${await res.text()}`);
    }
  }
  throw new Error('No free past slot found in the last 27 days — clean up old e2e fixture sessions.');
}

/**
 * Create a Schedule as Admin, retrying once after deleting a leftover live
 * session at the same {classId, startTime} (a previous failed run's fixture
 * would otherwise 4xx on the partial unique index / collision guard).
 * FUTURE sessions only — past sessions refuse deletion.
 */
export async function createScheduleWithRetry(request, payload) {
  const headers = await csrfHeaders(request);
  let res = await request.post('/api/schedules', { headers, data: payload });
  if (!res.ok()) {
    const listing = await apiGet(request, `/api/schedules?classId=${payload.classId}`);
    const leftover = (listing.data || []).find(
      (s) => new Date(s.startTime).getTime() === new Date(payload.startTime).getTime()
        && (s.status || 'scheduled') === 'scheduled',
    );
    if (leftover) {
      await apiSend(request, 'DELETE', `/api/schedules/${leftover._id}`);
      res = await request.post('/api/schedules', { headers: await csrfHeaders(request), data: payload });
    }
  }
  if (!res.ok()) throw new Error(`POST /api/schedules failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return body.data;
}
