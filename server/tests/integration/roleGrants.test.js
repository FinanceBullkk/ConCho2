const { getApp, teardown } = require('../setup');
require('../../models/Role'); // registered for the active-backend helpers' model lookup
const {
  roleHasCapability, setLiveGrants, ROLE_CAPABILITIES, CAPABILITIES,
} = require('../../policy/capabilities');
const { seedSystemRoles, loadGrantsIntoMemory } = require('../../domains/access/grants-loader');
const {
  findActiveRowWhere, findActiveRowsWhere, updateActiveRow, deleteActiveRowsWhere,
} = require('../pg-test-utils');

// TMS.update gap #2 P3-S1 — the DB→liveGrants bridge. Verifies seeding the
// system roles, loading edits into the in-memory store, and idempotent seeding.
// Reads/edits/cleanup go through the ACTIVE backend (phase-05 A1: the seed +
// grants refresh are dual-backend, so a Mongoose read is stale on the PG lane).

beforeAll(async () => { await getApp(); });
afterEach(async () => { await deleteActiveRowsWhere('Role', {}); setLiveGrants(ROLE_CAPABILITIES); });
afterAll(async () => { setLiveGrants(ROLE_CAPABILITIES); await teardown(); });

describe('role grants loader (gap #2)', () => {
  test('seeds the 4 system roles from the static scaffold', async () => {
    await seedSystemRoles();
    const roles = await findActiveRowsWhere('Role', {});
    expect(roles.map((r) => r.key).sort()).toEqual(['Admin', 'Coordinator', 'Participant', 'Teacher']);
    expect(roles.every((r) => r.system)).toBe(true);
    const teacher = roles.find((r) => r.key === 'Teacher');
    expect(teacher.capabilities).toContain(CAPABILITIES.ENROLLMENT_READ);
    expect(teacher.capabilities).not.toContain(CAPABILITIES.PROGRAM_MANAGE);
  });

  test('loadGrantsIntoMemory reflects DB edits in roleHasCapability', async () => {
    await seedSystemRoles();
    const teacher = await findActiveRowWhere('Role', { key: 'Teacher' });
    await updateActiveRow('Role', teacher._id, { capabilities: [CAPABILITIES.PROGRAM_MANAGE] });
    await loadGrantsIntoMemory();

    expect(roleHasCapability('Teacher', CAPABILITIES.PROGRAM_MANAGE)).toBe(true);
    expect(roleHasCapability('Teacher', CAPABILITIES.ENROLLMENT_READ)).toBe(false);
    expect(roleHasCapability('Admin', CAPABILITIES.PROGRAM_MANAGE)).toBe(true); // superuser invariant
  });

  test('seeding is idempotent and never clobbers an admin-edited grant', async () => {
    await seedSystemRoles();
    const before = await findActiveRowWhere('Role', { key: 'Teacher' });
    await updateActiveRow('Role', before._id, { capabilities: ['custom.only'] });
    await seedSystemRoles(); // re-run (reboot)
    const teacher = await findActiveRowWhere('Role', { key: 'Teacher' });
    expect(teacher.capabilities).toEqual(['custom.only']); // seed-if-missing left it alone
  });
});
