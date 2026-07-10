/**
 * Dev-only (UX review) — clear the seed admin's mustChangePassword flag on the
 * EPHEMERAL in-memory DB so an automated screenshot tour can log in straight to
 * the dashboard. Targets whatever MONGO_URI is set (the memory-server URI).
 *
 *   MONGO_URI=<mem-uri> node scripts/dev-tools/clear-must-change-password.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const User = require('../../models/User');

(async () => {
  await connectDB();
  const r = await User.updateOne({ empCode: '000001' }, { $set: { mustChangePassword: false } });
  console.log('cleared mustChangePassword for admin 000001:', JSON.stringify(r));
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
