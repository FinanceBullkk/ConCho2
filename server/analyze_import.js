const XLSX = require('../node_modules/xlsx');
const wb = XLSX.readFile('../Data/okok_FIXED_v2.xlsx');

// ═══ ATTENDANCE_LOG deep analysis ═══
const ws = wb.Sheets['ATTENDANCE_LOG'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
const headers = data[0];
console.log('Headers:', headers);
console.log('Total records:', data.length - 1);

const rows = data.slice(1).filter(r => r[0]);
console.log('Valid rows:', rows.length);

// Show first 5 rows with parsed dates
console.log('\n═══ Sample rows ═══');
for (let i = 0; i < 5; i++) {
  const r = rows[i];
  const dateNum = r[5];
  const dateStr = typeof dateNum === 'number' 
    ? new Date((dateNum - 25569) * 86400000).toISOString().slice(0, 10) 
    : dateNum;
  console.log({
    classCode: r[0],
    courseName: r[1],
    empCode: r[2],
    fullName: r[3],
    sessionOrder: r[4],
    date: dateStr,
    status: r[6],
    pic: r[7],
  });
}

// ═══ Unique sessions (Class + Course + Session + Date) ═══
const sessions = new Map();
const classCoursePairs = new Set();
for (const r of rows) {
  const dateNum = r[5];
  const dateStr = typeof dateNum === 'number' 
    ? new Date((dateNum - 25569) * 86400000).toISOString().slice(0, 10) 
    : String(dateNum);
  
  const key = `${r[0]}|${r[1]}|${r[4]}|${dateStr}`;
  if (!sessions.has(key)) {
    sessions.set(key, { classCode: r[0], courseName: r[1], sessionOrder: r[4], date: dateStr, pic: r[7], students: [] });
  }
  sessions.get(key).students.push({ empCode: String(r[2]), status: r[6] });
  classCoursePairs.add(`${r[0]}|${r[1]}`);
}

console.log('\n═══ Summary ═══');
console.log('Unique sessions:', sessions.size);
console.log('Unique class+course pairs:', classCoursePairs.size);

console.log('\n═══ All class+course pairs ═══');
for (const pair of [...classCoursePairs].sort()) {
  const [cc, cn] = pair.split('|');
  // Count sessions for this pair
  let cnt = 0;
  for (const [k] of sessions) {
    if (k.startsWith(pair + '|')) cnt++;
  }
  console.log(`  ${cc} / ${cn}: ${cnt} sessions`);
}

// ═══ Status values ═══
const statuses = {};
for (const r of rows) {
  statuses[r[6]] = (statuses[r[6]] || 0) + 1;
}
console.log('\n═══ Status values ═══', statuses);

// ═══ STUDENTS level data ═══
console.log('\n═══════════════════════════════════════════════');
console.log('STUDENTS — Level Data');
console.log('═══════════════════════════════════════════════');
const sws = wb.Sheets['STUDENTS'];
const sdata = XLSX.utils.sheet_to_json(sws, { header: 1 });
const sHeaderIdx = sdata.findIndex(r => r && r.some(c => String(c) === 'Emp Code'));
const sHeaders = sdata[sHeaderIdx];
console.log('Columns 7-8:', sHeaders[7], '|', sHeaders[8]);

const sRows = sdata.slice(sHeaderIdx + 1).filter(r => r[0]);
const entranceLevels = {};
const currentLevels = {};
let withBoth = 0;
for (const r of sRows) {
  if (r[7]) entranceLevels[r[7]] = (entranceLevels[r[7]] || 0) + 1;
  if (r[8]) currentLevels[r[8]] = (currentLevels[r[8]] || 0) + 1;
  if (r[7] && r[8]) withBoth++;
}
console.log('Students with both levels:', withBoth, '/', sRows.length);
console.log('Entrance levels:', JSON.stringify(entranceLevels));
console.log('Current levels:', JSON.stringify(currentLevels));
