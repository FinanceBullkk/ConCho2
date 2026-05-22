/**
 * LEGACY ONE-OFF SCRIPT — DO NOT RUN IN PRODUCTION
 * ──────────────────────────────────────────────────────────
 * Import STUDENTS data from Excel into MongoDB.
 * Run from: e:\ConCho2\server> node import_students.js
 *
 * P3-09: This script hardcodes a default password ('default12345').
 * For production imports use POST /api/import/users (importService.js)
 * which reads IMPORT_DEFAULT_PASSWORD from the environment and enforces
 * mustChangePassword on every new user.
 * ──────────────────────────────────────────────────────────
 */

if (process.env.NODE_ENV === 'production') {
  console.error('❌ This legacy script must NOT be run in production. Use the /api/import/users endpoint instead.');
  process.exit(1);
}

const XLSX = require('../node_modules/xlsx');
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ No MONGODB_URI found. Check .env');
  process.exit(1);
}

const STATUS_MAP = {
  'Active': 'Active',
  'Inactive': 'Inactive',
  'Waiting for class': 'Waiting for class',
  'Dropped': 'Dropped',
  'Transferred': 'Transferred',
  'On-hold': 'On-hold',
};

async function main() {
  console.log('🔗 Connecting to MongoDB...');
  // Fallback: if SRV fails, use direct connection
  await mongoose.connect(MONGO_URI, { family: 4, serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected\n');

  const User = require('./models/User');

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
  if (headerIdx < 0) {
    console.error('❌ Could not find header row');
    process.exit(1);
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

  // Pass plaintext — User model pre-save hook hashes it. Do NOT pre-hash here.
  const DEFAULT_PASSWORD = 'default12345';

  let created = 0, updated = 0, skipped = 0, errors = 0;
  const rows = data.slice(headerIdx + 1).filter(r => r[COL.empCode]);

  console.log('📥 Processing ' + rows.length + ' rows...\n');

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
      const existing = await User.findOne({ empCode });

      if (existing) {
        await User.findOneAndUpdate(
          { empCode },
          { name, department, position, status, dropReason: dropReason || existing.dropReason || '' },
          { runValidators: true }
        );
        updated++;
        if (updated <= 5) console.log('  ♻️  Updated: ' + empCode + ' — ' + name);
      } else {
        await User.create({
          empCode, name,
          role: 'Participant',
          department, position, status, dropReason,
          password: DEFAULT_PASSWORD,
        });
        created++;
        if (created <= 5) console.log('  ✨ Created: ' + empCode + ' — ' + name);
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

  await mongoose.disconnect();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
