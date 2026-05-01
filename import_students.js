/**
 * Import STUDENTS data from Excel into MongoDB
 * 
 * Maps Excel columns → User model fields:
 *   Emp Code → empCode
 *   Full Name → name  
 *   BU → department
 *   ROLE → position (DEV, QC, Designer...)
 *   Status → status (Active, Inactive, Waiting for class)
 *   Drop reason → dropReason
 *   
 * Skips: PIC, Current Course, Entrance/Current Level (not in User model yet)
 * 
 * SAFE: Uses upsert — if empCode exists, updates. If not, creates.
 */

const XLSX = require('xlsx');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './server/.env' });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ No MONGODB_URI found. Check server/.env');
  process.exit(1);
}

// Status mapping: Excel → TMS
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
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected\n');

  // Load User model
  const User = require('./server/models/User');

  // Read Excel
  const wb = XLSX.readFile('./Data/okok_FIXED_v2.xlsx');
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
  console.log('📋 Headers:', headers.join(' | '));

  // Column indices
  const COL = {
    empCode: headers.indexOf('Emp Code'),
    name: headers.indexOf('Full Name'),
    bu: headers.indexOf('BU'),
    role: headers.indexOf('ROLE'),
    status: headers.indexOf('Status'),
    dropReason: headers.indexOf('Drop reason'),
    dropDefine: headers.indexOf('Define of drop\n(not inc. resign)'),
  };

  console.log('Column mapping:', JSON.stringify(COL));

  // Default password hash
  const defaultHash = await bcrypt.hash('default123', 12);

  let created = 0, updated = 0, skipped = 0, errors = 0;
  const rows = data.slice(headerIdx + 1).filter(r => r[COL.empCode]);

  console.log('\n📥 Processing ' + rows.length + ' rows...\n');

  for (const row of rows) {
    const empCode = String(row[COL.empCode]).trim().toUpperCase();
    const name = String(row[COL.name] || '').trim();
    const department = String(row[COL.bu] || '').trim();
    const position = String(row[COL.role] || '').trim();
    const rawStatus = String(row[COL.status] || 'Active').trim();
    const status = STATUS_MAP[rawStatus] || 'Active';
    
    // Combine drop info
    let dropReason = '';
    if (row[COL.dropDefine]) dropReason += String(row[COL.dropDefine]).trim();
    if (row[COL.dropReason]) {
      if (dropReason) dropReason += ' — ';
      dropReason += String(row[COL.dropReason]).trim();
    }

    if (!name) {
      skipped++;
      continue;
    }

    try {
      const existing = await User.findOne({ empCode });
      
      if (existing) {
        // Update existing user (don't overwrite password or role)
        await User.findOneAndUpdate(
          { empCode },
          {
            name,
            department,
            position,
            status,
            dropReason: dropReason || existing.dropReason || '',
          },
          { runValidators: true }
        );
        updated++;
      } else {
        // Create new user
        await User.create({
          empCode,
          name,
          role: 'Participant', // Default role for imported students
          department,
          position,
          status,
          dropReason,
          password: defaultHash,
        });
        created++;
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

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
