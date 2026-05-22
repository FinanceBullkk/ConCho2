require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('ERROR: MONGO_URI is not set.'); process.exit(1); }

async function run() {
  await mongoose.connect(MONGO_URI);
  const User = require('./models/User');
  const hashed = await bcrypt.hash('admin12345', 10);
  const existing = await User.findOne({ empCode: '000001' });

  if (existing) {
    await User.updateOne({ empCode: '000001' }, {
      $set: { password: hashed, mustChangePassword: true, status: 'Active',
              failedLoginAttempts: 0, lockUntil: null, isDeleted: false }
    });
    console.log('✅ Password reset to: admin12345');
  } else {
    await User.create({ empCode: '000001', name: 'Admin', role: 'Admin',
                        department: 'Management', password: 'admin12345',
                        mustChangePassword: true });
    console.log('✅ Admin user created.');
  }
  await mongoose.disconnect();
}
run().catch(err => { console.error(err.message); process.exit(1); });