const repository = require('./repository');
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

// Idempotent: create each system role only if missing, so an admin's later
// capability edits are NEVER clobbered on reboot. Dual-backend (phase-05 A1):
// the seed goes through the DB_BACKEND-selected repository — previously a raw
// `Role.updateOne` upsert wrote Mongo even in PG mode, so grants persisted to
// one store while authz read the other (split-brain RBAC).
const seedSystemRoles = async () => {
  for (const { key, name } of SYSTEM_ROLES) {
    // eslint-disable-next-line no-await-in-loop -- 4 fixed system roles, boot-time
    await repository.seedRoleIfMissing({ key, name, capabilities: seedCapsFor(key) });
  }
};

// Load all live roles into `liveGrants`. System roles fall back to the static
// scaffold if (somehow) absent, so authz can never come up empty. Reads through
// the DB_BACKEND-selected repository so a grant edit written to PG is reflected
// in live authz (the direct Role.find read only saw Mongo — access writes are
// ported to repository.pg, so the refresh must read the same backend).
const loadGrantsIntoMemory = async () => {
  const roles = await repository.listLive();
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
