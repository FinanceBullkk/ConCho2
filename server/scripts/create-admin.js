require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ──────────────────────────────────────────────────────────
// create-admin.js — bootstrap the first admin user
// ──────────────────────────────────────────────────────────
// AUDIT PR E (SEC-012): The old version baked a constant password
// 'admin12345' at bcrypt cost 10 — both predictable AND weaker than
// the app's pre('save') hook which uses cost 12. Any operator who
// ran it produced an account every audit transcript could guess.
//
// New version:
//   1. Generates a CRYPTOGRAPHICALLY RANDOM 24-char password.
//   2. Prints it ONCE to stdout for the operator to capture.
//   3. Sets mustChangePassword: true so the admin is forced to rotate
//      on first login regardless. The temp password is the safety-net
//      for the rotation flow, not the final credential.
//   4. Hashing is delegated to the User pre('save') hook (bcrypt cost
//      12) instead of hashing inline at cost 10 — single source of
//      truth, no drift.
// ──────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('ERROR: MONGO_URI is not set.'); process.exit(1); }

// 16 random bytes → 22-char base64 → strip URL-unsafe chars
const generateTempPassword = () =>
  crypto.randomBytes(18).toString('base64').replace(/[/+=]/g, '').slice(0, 24);

async function run() {
  await mongoose.connect(MONGO_URI);
  const User = require('./models/User');
  const tempPassword = generateTempPassword();

  const existing = await User.findOne({ empCode: '000001' });

  if (existing) {
    // Reset path — assign + save() so the pre('save') hook hashes at cost 12.
    existing.password = tempPassword;
    existing.mustChangePassword = true;
    existing.status = 'Active';
    existing.failedLoginAttempts = 0;
    existing.lockUntil = null;
    existing.isDeleted = false;
    await existing.save();
    console.log('✅ Admin password reset.');
  } else {
    await User.create({
      empCode: '000001',
      name: 'Admin',
      role: 'Admin',
      department: 'Management',
      password: tempPassword,         // pre('save') hashes at cost 12
      mustChangePassword: true,
    });
    console.log('✅ Admin user created.');
  }

  console.log('');
  console.log('┌────────────────────────────────────────────────────────┐');
  console.log('│  empCode      : 000001                                 │');
  console.log(`│  TEMP password: ${tempPassword.padEnd(38)} │`);
  console.log('│                                                        │');
  console.log('│  ⚠ Copy this NOW — it is not stored anywhere else.    │');
  console.log('│  ⚠ You will be forced to change it on first login.    │');
  console.log('└────────────────────────────────────────────────────────┘');

  await mongoose.disconnect();
}

run().catch(err => { console.error(err.message); process.exit(1); });
