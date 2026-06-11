/**
 * diagnose-login-state.js — one-off READ-ONLY login diagnosis.
 *
 * Checks why a known seed/admin account gets "Invalid credentials":
 * lists user empCodes, inspects the target user's auth-relevant fields,
 * and bcrypt-compares candidate seed passwords offline (no writes, no API).
 *
 * Usage: node scripts/dev-tools/diagnose-login-state.js [empCode]
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Some local networks refuse SRV DNS lookups (querySrv ECONNREFUSED) —
// resolve Atlas SRV via public DNS instead.
require('dns').setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const TARGET = process.argv[2] || '000001';
// Seed logins documented in .claude/rules/commands.md
const CANDIDATES = ['admin12345', 'teacher123', 'participant123'];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const users = mongoose.connection.db.collection('users');

  const all = await users
    .find({}, { projection: { empCode: 1, role: 1, isDeleted: 1, lockUntil: 1, failedLoginAttempts: 1, mustChangePassword: 1, mfaEnabled: 1, createdAt: 1 } })
    .sort({ empCode: 1 })
    .toArray();

  console.log(`DB: ${mongoose.connection.name} — ${all.length} users`);
  for (const u of all) {
    console.log(
      `  ${String(u.empCode).padEnd(8)} role=${String(u.role).padEnd(11)} deleted=${!!u.isDeleted} ` +
      `failed=${u.failedLoginAttempts ?? 0} locked=${u.lockUntil ? new Date(u.lockUntil).toISOString() : 'no'} ` +
      `mustChangePw=${!!u.mustChangePassword} mfa=${!!u.mfaEnabled} created=${u.createdAt ? new Date(u.createdAt).toISOString() : '?'}`
    );
  }

  const target = await users.findOne({ empCode: TARGET });
  if (!target) {
    console.log(`\nTarget ${TARGET}: NOT FOUND (no document with this empCode at all)`);
  } else {
    console.log(`\nTarget ${TARGET}:`);
    console.log(`  hash present: ${!!target.password} (${target.password ? target.password.slice(0, 7) + '…' : 'n/a'})`);
    console.log(`  passwordChangedAt: ${target.passwordChangedAt ? new Date(target.passwordChangedAt).toISOString() : 'unset'}`);
    for (const pw of CANDIDATES) {
      const ok = target.password ? await bcrypt.compare(pw, target.password) : false;
      console.log(`  bcrypt('${pw}') → ${ok ? 'MATCH' : 'no'}`);
    }
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Diagnosis failed:', err.message);
  process.exit(1);
});
