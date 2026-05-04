/**
 * Migration: Backfill isDeleted=false for existing User and Team records.
 * 
 * This is needed because the soft-delete middleware (UX-03) added
 * { isDeleted: { $ne: true } } filters to all queries, but existing
 * documents don't have the isDeleted field at all.
 * 
 * While MongoDB's $ne should handle missing fields correctly, this
 * migration ensures data consistency and prevents edge-case issues.
 *
 * Run: node server/scripts/migrate_soft_delete.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const run = async () => {
  await connectDB();
  console.log('🔄 Migrating: Backfill isDeleted=false for User and Team...\n');

  // Use raw collection access to bypass Mongoose middleware
  const userResult = await mongoose.connection.db.collection('users').updateMany(
    { isDeleted: { $exists: false } },
    { $set: { isDeleted: false, deletedAt: null } }
  );
  console.log(`✅ Users updated: ${userResult.modifiedCount}`);

  const teamResult = await mongoose.connection.db.collection('teams').updateMany(
    { isDeleted: { $exists: false } },
    { $set: { isDeleted: false, deletedAt: null } }
  );
  console.log(`✅ Teams updated: ${teamResult.modifiedCount}`);

  console.log('\n🏁 Migration complete.');
  await mongoose.disconnect();
};

run().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
