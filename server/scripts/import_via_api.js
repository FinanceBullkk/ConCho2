/**
 * Import STUDENTS data from Excel via the running API server
 * This bypasses the MongoDB connection issue by POSTing to the already-connected server.
 * 
 * Run from: e:\ConCho2\server> node import_via_api.js
 */

const XLSX = require('../node_modules/xlsx');

require('dotenv').config();

const API_BASE = 'http://localhost:3000/api';
let COOKIE = '';

async function apiGet(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { Cookie: COOKIE } });
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || res.statusText);
  }
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || res.statusText);
  }
  return res.json();
}

async function main() {
  const importPassword = process.env['IMPORT_DEFAULT_PASSWORD'];
  if (!importPassword) {
    console.error('IMPORT_DEFAULT_PASSWORD must be set before creating users.');
    process.exit(1);
  }

  // Login
  console.log('🔐 Logging in...');
  const loginRes = await fetch(API_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empCode: '000001', password: 'admin12345' }),
  });
  
  // Node 22+ uses getSetCookie()
  let cookies = [];
  if (typeof loginRes.headers.getSetCookie === 'function') {
    cookies = loginRes.headers.getSetCookie();
  }
  COOKIE = cookies.map(c => c.split(';')[0]).join('; ');
  console.log('  Raw cookies found:', cookies.length);
  if (COOKIE) {
    console.log('✅ Logged in with cookie\n');
  } else {
    // Fallback: parse from 'set-cookie' header value (may be joined)
    const raw = loginRes.headers.get('set-cookie') || '';
    if (raw) {
      // Multiple cookies may be joined by comma+space
      COOKIE = raw.split(/,\s*/).map(c => c.split(';')[0]).join('; ');
    }
    console.log('✅ Logged in (fallback cookie: ' + (COOKIE ? 'yes' : 'NONE') + ')\n');
  }

  // Read Excel
  const wb = XLSX.readFile('../Data/okok_FIXED_v2.xlsx');
  const ws = wb.Sheets['STUDENTS'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < 10; i++) {
    if (data[i] && data[i].some(c => String(c) === 'Emp Code')) {
      headerIdx = i;
      break;
    }
  }
  const headers = data[headerIdx];
  console.log('📋 Headers:', headers.filter(Boolean).join(' | '));

  const COL = {
    empCode: headers.indexOf('Emp Code'),
    name: headers.indexOf('Full Name'),
    bu: headers.indexOf('BU'),
    role: headers.indexOf('ROLE'),
    status: headers.indexOf('Status'),
    dropReason: headers.indexOf('Drop reason'),
    dropDefine: headers.findIndex(h => h && String(h).includes('Define of drop')),
  };

  const STATUS_MAP = {
    'Active': 'Active',
    'Inactive': 'Inactive',
    'Waiting for class': 'Waiting for class',
  };

  const rows = data.slice(headerIdx + 1).filter(r => r[COL.empCode]);
  console.log('📥 Processing ' + rows.length + ' rows...\n');

  // Get existing users
  let existingUsers = {};
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await apiGet('/users', { page: String(page), limit: '100' });
    for (const u of res.data) {
      existingUsers[u.empCode] = u._id;
    }
    hasMore = page < (res.pages || 1);
    page++;
  }
  console.log('📦 Found ' + Object.keys(existingUsers).length + ' existing users\n');

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const row of rows) {
    const empCode = String(row[COL.empCode]).trim().toUpperCase();
    const name = String(row[COL.name] || '').trim();
    const department = String(row[COL.bu] || '').trim();
    const position = String(row[COL.role] || '').trim();
    const rawStatus = String(row[COL.status] || 'Active').trim();
    const status = STATUS_MAP[rawStatus] || 'Active';

    let dropReason = '';
    if (COL.dropDefine >= 0 && row[COL.dropDefine]) dropReason += String(row[COL.dropDefine]).trim();
    if (COL.dropReason >= 0 && row[COL.dropReason]) {
      if (dropReason) dropReason += ' — ';
      dropReason += String(row[COL.dropReason]).trim();
    }

    if (!name) { skipped++; continue; }

    try {
      if (existingUsers[empCode]) {
        await apiPut('/users/' + existingUsers[empCode], {
          name, department, position, status, dropReason,
        });
        updated++;
        if (updated <= 3) console.log('  ♻️  Updated: ' + empCode + ' — ' + name);
      } else {
        await apiPost('/users', {
          empCode, name,
          role: 'Participant',
          department, position, status, dropReason,
          password: importPassword,
        });
        created++;
        if (created <= 3) console.log('  ✨ Created: ' + empCode + ' — ' + name);
      }
    } catch (err) {
      console.error('  ❌ ' + empCode + ' — ' + err.message);
      errors++;
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('✅ Import complete!');
  console.log('   Created: ' + created);
  console.log('   Updated: ' + updated);
  console.log('   Skipped: ' + skipped);
  console.log('   Errors:  ' + errors);
  console.log('═'.repeat(50));
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
