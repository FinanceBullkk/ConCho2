/**
 * Fix Level Data Import
 * Reimports entrance/current level from STUDENTS sheet
 */
const XLSX = require('../node_modules/xlsx');
const API = 'http://localhost:3000/api';
let CK = '';

async function main() {
  // Login
  const lr = await fetch(API + '/auth/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({empCode: '000001', password: 'admin12345'}),
  });
  CK = (lr.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  console.log('Login:', CK ? 'OK' : 'FAIL');

  // Get all users
  const userMap = {};
  for (let p = 1; ; p++) {
    const r = await (await fetch(`${API}/users?page=${p}&limit=200`, { headers: { Cookie: CK } })).json();
    for (const u of (r.data || [])) userMap[u.empCode] = u._id;
    if (p >= (r.pages || 1)) break;
  }
  console.log('Users:', Object.keys(userMap).length);

  // Read Excel
  const wb = XLSX.readFile('../Data/okok_FIXED_v2.xlsx');
  const sws = wb.Sheets['STUDENTS'];
  const sdata = XLSX.utils.sheet_to_json(sws, { header: 1 });
  const sHeaderIdx = sdata.findIndex(r => r && r.some(c => String(c) === 'Emp Code'));
  const headers = sdata[sHeaderIdx];
  console.log('Level columns:', headers[7], '|', headers[8]);
  
  const sRows = sdata.slice(sHeaderIdx + 1).filter(r => r[0]);

  let updated = 0, skipped = 0, errors = 0;
  for (const r of sRows) {
    const empCode = String(r[0]).trim().toUpperCase();
    const entranceLevel = String(r[7] || '').trim();
    const currentLevel = String(r[8] || '').trim();
    const userId = userMap[empCode];
    
    if (!userId) { skipped++; continue; }
    if (!entranceLevel && !currentLevel) { skipped++; continue; }

    try {
      const res = await fetch(`${API}/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: CK },
        body: JSON.stringify({ entranceLevel, currentLevel }),
      });
      const data = await res.json();
      if (res.ok) {
        updated++;
        if (updated <= 3) console.log(`  ✅ ${empCode}: ${entranceLevel} → ${currentLevel}`);
      } else {
        errors++;
        if (errors <= 3) console.log(`  ❌ ${empCode}: ${data.message}`);
      }
    } catch (e) {
      errors++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${errors} errors`);
}

main().catch(console.error);
