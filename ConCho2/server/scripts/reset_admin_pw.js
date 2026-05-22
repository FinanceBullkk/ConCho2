/**
 * One-time script to reset admin (000001) password to 'admin12345'.
 * Run: node scripts/reset_admin_pw.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      family: 4,               // Force IPv4 — avoids IPv6 DNS issues
    });
    console.log('✅ Connected to MongoDB');

    const User = require('../models/User');
    const newPassword = 'admin12345';
    const salt = await bcrypt.genSalt(12);
    const hashed = await bcrypt.hash(newPassword, salt);

    const result = await User.collection.updateOne(
      { empCode: '000001' },
      { $set: { password: hashed, passwordChangedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      console.log('❌ User 000001 not found!');
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log('✅ Admin password reset to "admin12345"');
    console.log('   Existing sessions are now invalidated (passwordChangedAt updated).');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  }
})();
