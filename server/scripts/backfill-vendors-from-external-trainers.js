/**
 * Backfill the A2 Vendor catalog from legacy Schedule.externalTrainer names and
 * link each session through Schedule.vendorId.
 *
 * One `type:'individual'` Vendor is created per DISTINCT external-trainer name
 * (case-insensitive), carrying that trainer's email/phone/org as its primary
 * contact. Every scheduled session with that name + no vendorId is then linked.
 * Idempotent: re-running reuses vendors created on a prior run and only links
 * still-unlinked sessions.
 *
 * Usage:
 *   cd server && node scripts/backfill-vendors-from-external-trainers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Schedule = require('../models/Schedule');
const Vendor = require('../models/Vendor');

const norm = (s) => (s || '').trim().toLowerCase();

async function run() {
  await connectDB();

  // Distinct external-trainer names on sessions not yet linked to a vendor.
  const sessions = await Schedule.find({
    'externalTrainer.name': { $exists: true, $ne: null },
    vendorId: null,
  }).select('externalTrainer vendorId').lean();

  // Group sessions by normalized trainer name.
  const byName = new Map();
  for (const s of sessions) {
    const key = norm(s.externalTrainer?.name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, { sample: s.externalTrainer, ids: [] });
    byName.get(key).ids.push(s._id);
  }

  let vendorsCreated = 0;
  let vendorsReused = 0;
  let linked = 0;

  for (const [, { sample, ids }] of byName) {
    // Reuse an individual vendor with the same name if a prior run created it.
    let vendor = await Vendor.findOne({ name: sample.name, type: 'individual' }).lean();
    if (!vendor) {
      vendor = await Vendor.create({
        name: sample.name,
        type: 'individual',
        contacts: [{
          name: sample.name,
          email: sample.email || '',
          phone: sample.phone || '',
          role: sample.org || '',
        }],
        note: 'Migrated from Schedule.externalTrainer (A2 backfill).',
      });
      vendorsCreated += 1;
    } else {
      vendorsReused += 1;
    }
    const res = await Schedule.updateMany(
      { _id: { $in: ids } },
      { $set: { vendorId: vendor._id } },
    );
    linked += res.modifiedCount || 0;
  }

  console.log(JSON.stringify({
    success: true,
    distinctTrainers: byName.size,
    vendorsCreated,
    vendorsReused,
    sessionsLinked: linked,
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
