const XLSX = require('xlsx');
const wb = XLSX.readFile('./Data/okok_FIXED_v2.xlsx');

// Find the STUDENTS sheet
const sheetNames = wb.SheetNames;
console.log('All sheets:', sheetNames);

// Look for "Student" or similar
const studentSheet = sheetNames.find(n => n.toLowerCase().includes('student') && !n.toLowerCase().includes('pivot'));
console.log('\nUsing sheet:', studentSheet || 'NOT FOUND');

if (studentSheet) {
  const ws = wb.Sheets[studentSheet];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log('Total rows:', data.length);
  // Find header row (first row with "Emp Code")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i] || [];
    if (row.some(c => String(c).includes('Emp Code') || String(c).includes('Full Name'))) {
      headerIdx = i;
      break;
    }
  }
  console.log('Header row index:', headerIdx);
  if (headerIdx >= 0) {
    console.log('Headers:', JSON.stringify(data[headerIdx]));
    console.log('\n--- First 3 data rows ---');
    for (let i = headerIdx + 1; i < Math.min(headerIdx + 4, data.length); i++) {
      console.log('Row:', JSON.stringify(data[i]));
    }
    
    // Count data rows
    let count = 0;
    const statuses = {};
    for (let i = headerIdx + 1; i < data.length; i++) {
      if (data[i][0]) {
        count++;
        const st = data[i][4] || 'empty';
        statuses[st] = (statuses[st] || 0) + 1;
      }
    }
    console.log('\nTotal data rows:', count);
    console.log('Status distribution:', JSON.stringify(statuses, null, 2));
  }
}
