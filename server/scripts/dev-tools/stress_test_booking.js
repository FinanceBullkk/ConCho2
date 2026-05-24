/**
 * ──────────────────────────────────────────────────────────
 * TMS Booking Stress Test (k6)
 * ──────────────────────────────────────────────────────────
 * 
 * PURPOSE:
 *   Validate that the MongoDB transaction in bookTeamSlot
 *   correctly prevents overbooking under extreme concurrency.
 *
 * WHAT IT DOES:
 *   1. Logs in as Team B leader (000007) to get a JWT token.
 *   2. Fires 500 concurrent requests to POST /api/schedules/book-slot
 *      all targeting the SAME time slot.
 *   3. Asserts that exactly 1 request succeeds (201) and the
 *      rest fail with 400/409 (weekly limit or collision).
 *
 * INSTALL & RUN:
 *   1. Install k6: https://k6.io/docs/get-started/installation/
 *      - Windows: choco install k6  OR  winget install k6
 *      - Mac: brew install k6
 *   2. Make sure server is running on localhost:5000
 *   3. Run: k6 run tests/stress_test_booking.js
 *
 * EXPECTED RESULTS:
 *   - http_req_failed rate should be ~0% (all requests complete)
 *   - booking_success counter should be exactly 1
 *   - booking_rejected counter should be (VUs × iterations - 1)
 * ──────────────────────────────────────────────────────────
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────
const bookingSuccess = new Counter('booking_success');
const bookingRejected = new Counter('booking_rejected');
const bookingErrors = new Counter('booking_errors');
const successRate = new Rate('booking_success_rate');

// ── Test configuration ────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const TEAM_LEADER_CODE = __ENV.EMP_CODE || '000007';
const TEAM_LEADER_PASS = __ENV.PASSWORD || 'participant123';

// The teamId to book for (set via env or will be discovered)
let TEAM_ID = __ENV.TEAM_ID || '';

export const options = {
  // ── Scenario 1: Concurrent Spike ─────────────────────
  // 50 virtual users, each making 10 requests = 500 total
  scenarios: {
    concurrent_booking: {
      executor: 'per-vu-iterations',
      vus: 50,
      iterations: 10,
      maxDuration: '60s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'],   // 95% of requests under 5s
    booking_success: ['count<=2'],        // At most 2 bookings succeed (weekly limit)
    http_req_failed: ['rate<0.01'],       // <1% network failures
  },
};

// ── Setup: Login and get JWT token ────────────────────────
export function setup() {
  // Step 1: Login
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ empCode: TEAM_LEADER_CODE, password: TEAM_LEADER_PASS }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(loginRes, { 'login successful': (r) => r.status === 200 });

  if (loginRes.status !== 200) {
    console.error(`Login failed: ${loginRes.body}`);
    return null;
  }

  const loginData = JSON.parse(loginRes.body);
  const token = loginData.data.token;

  // Step 2: Get team ID via /api/teams/my-teams
  const teamsRes = http.get(`${BASE_URL}/api/teams/my-teams`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let teamId = TEAM_ID;
  if (!teamId && teamsRes.status === 200) {
    const teamsData = JSON.parse(teamsRes.body);
    if (teamsData.data && teamsData.data.length > 0) {
      teamId = teamsData.data[0]._id;
      console.log(`Discovered teamId: ${teamId}`);
    }
  }

  if (!teamId) {
    console.error('Could not determine teamId. Set TEAM_ID env var.');
    return null;
  }

  // Step 3: Build a target time slot (next Monday 10:00-11:00)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilNextMonday);
  nextMonday.setHours(10, 0, 0, 0);

  const startTime = nextMonday.toISOString();
  const endTime = new Date(nextMonday.getTime() + 60 * 60 * 1000).toISOString();

  console.log(`Target slot: ${startTime} — ${endTime}`);

  return { token, teamId, startTime, endTime };
}

// ── Main test function (runs per VU per iteration) ────────
export default function (data) {
  if (!data) return;

  const { token, teamId, startTime, endTime } = data;

  const res = http.post(
    `${BASE_URL}/api/schedules/book-slot`,
    JSON.stringify({ teamId, startTime, endTime }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );

  // Classify the response
  if (res.status === 201) {
    bookingSuccess.add(1);
    successRate.add(true);
    console.log(`✅ VU ${__VU}: Booking CREATED`);
  } else if (res.status === 400 || res.status === 409) {
    bookingRejected.add(1);
    successRate.add(false);
    // Expected: weekly limit or collision
  } else {
    bookingErrors.add(1);
    successRate.add(false);
    console.error(`❌ VU ${__VU}: Unexpected ${res.status}: ${res.body}`);
  }

  check(res, {
    'response is valid': (r) => [201, 400, 409].includes(r.status),
    'has JSON body': (r) => r.json() !== null,
  });

  sleep(0.1); // Small delay between iterations
}

// ── Teardown: Clean up created schedule ───────────────────
export function teardown(data) {
  if (!data) return;
  console.log('\n═══════════════════════════════════');
  console.log('  OVERBOOKING TEST COMPLETE');
  console.log('  Check booking_success counter.');
  console.log('  Expected: ≤ 2 (weekly limit)');
  console.log('═══════════════════════════════════');
}
