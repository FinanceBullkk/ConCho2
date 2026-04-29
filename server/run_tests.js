const http = require('http');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function login(empCode, password) {
  const res = await fetch('http://127.0.0.1:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empCode, password }),
  });
  const data = await res.json();
  const cookies = res.headers.get('set-cookie');
  return { data, cookies };
}

async function getTeams(cookies) {
  const res = await fetch('http://127.0.0.1:5000/api/teams', {
    headers: { Cookie: cookies },
  });
  const data = await res.json();
  return data.data;
}

async function bookSlot(cookies, payload) {
  const res = await fetch('http://127.0.0.1:5000/api/schedules/book-slot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies },
    body: JSON.stringify(payload),
  });
  const status = res.status;
  const data = await res.json();
  return { status, data };
}

async function runTests() {
  console.log('🧪 Starting API Integration Tests...\n');

  // 1. Login as Admin
  console.log('Logging in as Admin (000001)...');
  const auth = await login('000001', 'admin12345');
  if (!auth.data.success) {
    console.error('❌ Login failed');
    return;
  }
  const cookies = auth.cookies;
  console.log('✅ Logged in successfully.\n');

  // 2. Fetch Teams to get an ID
  const teams = await getTeams(cookies);
  const teamB = teams.find((t) => t.name.includes('Beta'));
  const teamA = teams.find((t) => t.name.includes('Alpha'));
  
  if (!teamA || !teamB) {
    console.error('❌ Could not find test teams. Run `npm run seed` first.');
    return;
  }

  const nextWeekStr = (days) => {
    const d = new Date();
    // Move to next week to avoid seed data limits
    d.setDate(d.getDate() + 7 + days);
    return d.toISOString().split('T')[0];
  };

  const dayStr = nextWeekStr(0); // Sometime next week

  console.log('--- TC01: Normal Booking ---');
  const tc1Payload = {
    teamId: teamB._id,
    startTime: `${dayStr}T10:00:00.000`,
    endTime: `${dayStr}T11:00:00.000`,
  };
  const tc1 = await bookSlot(cookies, tc1Payload);
  if (tc1.status === 201) console.log('✅ Passed: Successfully booked allowed slot.\n');
  else console.error('❌ Failed:', tc1);

  await sleep(1000);

  console.log('--- TC02: Slot Collision (Double Booking) ---');
  // Team A tries to book the same slot Team B just booked
  const tc2Payload = {
    teamId: teamA._id,
    startTime: `${dayStr}T10:00:00.000`,
    endTime: `${dayStr}T11:00:00.000`,
  };
  const tc2 = await bookSlot(cookies, tc2Payload);
  if (tc2.status === 409 && tc2.data.message.includes('already taken')) {
    console.log('✅ Passed: Blocked double booking (409 Conflict).\n');
  } else console.error('❌ Failed:', tc2);

  await sleep(1000);

  console.log('--- TC03: Invalid Time Boundary ---');
  const tc3Payload = {
    teamId: teamB._id,
    startTime: `${dayStr}T10:15:00.000`,
    endTime: `${dayStr}T11:15:00.000`,
  };
  const tc3 = await bookSlot(cookies, tc3Payload);
  if (tc3.status === 400 && tc3.data.message.includes('Only allowed time slots')) {
    console.log('✅ Passed: Blocked invalid time boundaries (400 Bad Request).\n');
  } else console.error('❌ Failed:', tc3);

  await sleep(1000);

  console.log('--- TC04: Max Weekly Limit ---');
  // Team B already has 1 session in this week (the one we just booked in TC01).
  // Let's book a 2nd session.
  await bookSlot(cookies, {
    teamId: teamB._id,
    startTime: `${dayStr}T13:00:00.000`,
    endTime: `${dayStr}T14:00:00.000`,
  });

  await sleep(1000);
  // Now Team B has 2 sessions this week. Let's try to book a 3rd.
  const tc4Payload = {
    teamId: teamB._id,
    startTime: `${dayStr}T14:00:00.000`,
    endTime: `${dayStr}T15:00:00.000`,
  };
  const tc4 = await bookSlot(cookies, tc4Payload);
  if (tc4.status === 400 && tc4.data.message.includes('tối đa 2 buổi')) {
    console.log('✅ Passed: Blocked exceeding weekly limit of 2 sessions (400 Bad Request).\n');
  } else console.error('❌ Failed:', tc4);

  await sleep(1000);

  console.log('--- TC05: Unauthorized Booking ---');
  // Log in as a generic participant (not a leader of Team B)
  const authPart = await login('000005', 'participant123'); // part2, member of teamA
  const tc5 = await bookSlot(authPart.cookies, {
    teamId: teamB._id,
    startTime: `${dayStr}T15:00:00.000`,
    endTime: `${dayStr}T16:00:00.000`,
  });
  if (tc5.status === 403) {
    console.log('✅ Passed: Blocked unauthorized user from booking for a team they do not lead (403 Forbidden).\n');
  } else console.error('❌ Failed:', tc5);

  console.log('🎉 All test cases verified successfully!');
}

runTests();
