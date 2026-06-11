const XLSX = require('../node_modules/xlsx');
const wb = XLSX.readFile('../Data/okok_FIXED_v2.xlsx');

// ══════════════════════════════════════════════
// 1. STUDENTS sheet — full analysis
// ══════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('SHEET: STUDENTS');
console.log('═'.repeat(60));
const studentsWs = wb.Sheets['STUDENTS'];
const students = XLSX.utils.sheet_to_json(studentsWs, { header: 1 });
let sHeaderIdx = students.findIndex(r => r && r.some(c => String(c) === 'Emp Code'));
const sHeaders = students[sHeaderIdx];
console.log('Headers:', sHeaders.filter(Boolean).join(' | '));
const sRows = students.slice(sHeaderIdx + 1).filter(r => r[0]);
console.log('Total rows:', sRows.length);

// Unique BUs
const bus = {};
const positions = {};
const pics = {};
const courses = {};
const entranceLevels = {};
const currentLevels = {};
sRows.forEach(r => {
  bus[r[2]] = (bus[r[2]] || 0) + 1;
  positions[r[3]] = (positions[r[3]] || 0) + 1;
  if (r[5]) pics[r[5]] = (pics[r[5]] || 0) + 1;
  if (r[6]) courses[r[6]] = (courses[r[6]] || 0) + 1;
  if (r[7]) entranceLevels[r[7]] = (entranceLevels[r[7]] || 0) + 1;
  if (r[8]) currentLevels[r[8]] = (currentLevels[r[8]] || 0) + 1;
});
console.log('\nBU distribution:', JSON.stringify(bus));
console.log('Position distribution:', JSON.stringify(positions));
console.log('PIC (Teachers):', JSON.stringify(pics));
console.log('Current Courses:', JSON.stringify(courses));
console.log('Entrance Levels:', JSON.stringify(entranceLevels));
console.log('Current Levels:', JSON.stringify(currentLevels));

// ══════════════════════════════════════════════
// 2. ATTENDANCE_LOG — detailed attendance history
// ══════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('SHEET: ATTENDANCE_LOG');
console.log('═'.repeat(60));
const attWs = wb.Sheets['ATTENDANCE_LOG'];
const attData = XLSX.utils.sheet_to_json(attWs, { header: 1 });
const attHeaders = attData[0];
console.log('Headers:', attHeaders.filter(Boolean).join(' | '));
const attRows = attData.slice(1).filter(r => r[0]);
console.log('Total records:', attRows.length);

// Unique values
const attClasses = {};
const attCourses = {};
const attStatuses = {};
const attPics = {};
attRows.forEach(r => {
  attClasses[r[0]] = (attClasses[r[0]] || 0) + 1;
  attCourses[r[1]] = (attCourses[r[1]] || 0) + 1;
  attStatuses[r[6]] = (attStatuses[r[6]] || 0) + 1;
  if (r[7]) attPics[r[7]] = (attPics[r[7]] || 0) + 1;
});
console.log('\nClasses:', JSON.stringify(attClasses));
console.log('Courses:', JSON.stringify(attCourses));
console.log('Statuses:', JSON.stringify(attStatuses));
console.log('PICs:', JSON.stringify(attPics));

// Date range
const dates = attRows.map(r => r[5]).filter(d => typeof d === 'number');
const minDate = new Date((Math.min(...dates) - 25569) * 86400000);
const maxDate = new Date((Math.max(...dates) - 25569) * 86400000);
console.log('Date range:', minDate.toISOString().slice(0,10), 'to', maxDate.toISOString().slice(0,10));

// ══════════════════════════════════════════════
// 3. COURSE_PLAN
// ══════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('SHEET: COURSE_PLAN');
console.log('═'.repeat(60));
const cpWs = wb.Sheets['COURSE_PLAN'];
const cpData = XLSX.utils.sheet_to_json(cpWs, { header: 1 });
cpData.slice(0, 15).forEach(r => {
  if (r[0]) console.log('  ' + r[0] + ' → ' + r[1] + ' sessions');
});

// ══════════════════════════════════════════════
// 4. PIC — Teacher assignments
// ══════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('SHEET: PIC');
console.log('═'.repeat(60));
const picWs = wb.Sheets['PIC'];
const picData = XLSX.utils.sheet_to_json(picWs, { header: 1 });
picData.slice(0, 20).forEach(r => {
  if (r[0]) console.log('  ' + r[0] + ' → ' + r[1]);
});

// ══════════════════════════════════════════════
// 5. CLASS_DATES
// ══════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('SHEET: CLASS_DATES');
console.log('═'.repeat(60));
const cdWs = wb.Sheets['CLASS_DATES'];
const cdData = XLSX.utils.sheet_to_json(cdWs, { header: 1 });
cdData.slice(0, 20).forEach(r => {
  if (r[0] && typeof r[2] === 'number') {
    const d = new Date((r[2] - 25569) * 86400000);
    console.log('  ' + r[0] + ' / ' + r[1] + ' → started ' + d.toISOString().slice(0,10));
  } else if (r[0]) {
    console.log('  ' + r[0] + ' / ' + r[1] + ' → ' + r[2]);
  }
});

// ══════════════════════════════════════════════
// 6. LEVEL_HELPER
// ══════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('SHEET: LEVEL_HELPER');
console.log('═'.repeat(60));
const lhWs = wb.Sheets['LEVEL_HELPER'];
const lhData = XLSX.utils.sheet_to_json(lhWs, { header: 1 });
lhData.slice(0, 20).forEach(r => {
  if (r[0]) console.log('  ' + r[0] + ' = ' + r[1]);
});

// ══════════════════════════════════════════════
// 7. PROGRESS sheet
// ══════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('SHEET: PROGRESS');
console.log('═'.repeat(60));
const prWs = wb.Sheets['PROGRESS'];
const prData = XLSX.utils.sheet_to_json(prWs, { header: 1 });
console.log('Headers:', prData[0].filter(Boolean).join(' | '));
prData.slice(1, 10).forEach(r => {
  if (r[0]) console.log('  ' + r[0] + ': NotTested=' + r[1] + ' Regressed=' + r[2] + ' NoProgress=' + r[3] + ' Minor=' + r[4] + ' Lv1→2=' + r[5] + ' Lv2→3=' + r[6] + ' Lv3→4=' + r[7] + ' Total=' + r[11]);
});

// ══════════════════════════════════════════════
// 8. DASHBOARD sheet
// ══════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('SHEET: DASHBOARD');
console.log('═'.repeat(60));
const dbWs = wb.Sheets['DASHBOARD'];
const dbData = XLSX.utils.sheet_to_json(dbWs, { header: 1 });
for (let i = 0; i < Math.min(40, dbData.length); i++) {
  const row = dbData[i];
  if (row && row.some(c => c !== null && c !== undefined && c !== '')) {
    console.log('Row ' + i + ':', JSON.stringify(row.filter(c => c !== null && c !== undefined)));
  }
}

// ══════════════════════════════════════════════
// 9. ATTENDANCE_INPUT — wide format
// ══════════════════════════════════════════════
console.log('\n' + '═'.repeat(60));
console.log('SHEET: ATTENDANCE_INPUT');
console.log('═'.repeat(60));
const aiWs = wb.Sheets['ATTENDANCE_INPUT'];
const aiData = XLSX.utils.sheet_to_json(aiWs, { header: 1 });
console.log('Headers:', aiData[0].filter(Boolean).join(' | '));
console.log('Total rows:', aiData.length - 1);
// Count unique class+course combos
const classCourses = {};
aiData.slice(1).forEach(r => {
  if (r[0] && r[2]) {
    const key = r[2] + '/' + r[4];
    classCourses[key] = (classCourses[key] || 0) + 1;
  }
});
console.log('Class/Course combos:', JSON.stringify(classCourses));
