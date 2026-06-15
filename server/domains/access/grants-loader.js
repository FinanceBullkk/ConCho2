const Role = require('../../models/Role');
const { ROLE_CAPABILITIES, ALL_CAPABILITIES, setLiveGrants } = require('../../policy/capabilities');

// ──────────────────────────────────────────────────────────
// Role-grants loader (TMS.update gap #2). Bridges the persisted `Role` docs and
// the in-memory `liveGrants` store that `roleHasCapability` reads. Called once
// at boot (server.js) and after every role edit (use-cases).
// ──────────────────────────────────────────────────────────
const SYSTEM_ROLES = [
  { key: 'Admin', name: 'Administrator' },
  { key: 'Coordinator', name: 'Coordinator' },
  { key: 'Teacher', name: 'Teacher' },
  { key: 'Participant', name: 'Participant' },
];

// Seed grants for a system role from the static scaffold (Admin = all).
const seedCapsFor = (key) =>
  (key === 'Admin' ? [...ALL_CAPABILITIES] : [...(ROLE_CAPABILITIES[key] || [])]);

// Idempotent: create each system role only if missing ($setOnInsert), so an
// admin's later capability edits are NEVER clobbered on reboot.
const seedSystemRoles = async () => {
  for (const { key, name } of SYSTEM_ROLES) {
    await Role.updateOne(
      { key },
      { $setOnInsert: { key, name, system: true, capabilities: seedCapsFor(key), isDeleted: false } },
      { upsert: true },
    );
  }
};

// Load all live roles into `liveGrants`. System roles fall back to the static
// scaffold if (somehow) absent, so authz can never come up empty.
const loadGrantsIntoMemory = async () => {
  const roles = await Role.find({ isDeleted: false }).lean();
  const grants = {};
  for (const role of roles) grants[role.key] = role.capabilities || [];
  for (const { key } of SYSTEM_ROLES) if (!grants[key]) grants[key] = seedCapsFor(key);
  setLiveGrants(grants);
  return grants;
};

const initRoleGrants = async () => {
  await seedSystemRoles();
  await loadGrantsIntoMemory();
};

module.exports = { SYSTEM_ROLES, seedCapsFor, seedSystemRoles, loadGrantsIntoMemory, initRoleGrants };
