const { getApp, teardown } = require('../setup');
const Role = require('../../models/Role');
const {
  roleHasCapability, setLiveGrants, ROLE_CAPABILITIES, CAPABILITIES,
} = require('../../policy/capabilities');
const { seedSystemRoles, loadGrantsIntoMemory } = require('../../domains/access/grants-loader');

// TMS.update gap #2 P3-S1 — the DB→liveGrants bridge. Verifies seeding the
// system roles, loading edits into the in-memory store, and idempotent seeding.

beforeAll(async () => { await getApp(); });
afterEach(async () => { await Role.deleteMany({}); setLiveGrants(ROLE_CAPABILITIES); });
afterAll(async () => { setLiveGrants(ROLE_CAPABILITIES); await teardown(); });

describe('role grants loader (gap #2)', () => {
  test('seeds the 4 system roles from the static scaffold', async () => {
    await seedSystemRoles();
    const roles = await Role.find({}).lean();
    expect(roles.map((r) => r.key).sort()).toEqual(['Admin', 'Coordinator', 'Participant', 'Teacher']);
    expect(roles.every((r) => r.system)).toBe(true);
    const teacher = roles.find((r) => r.key === 'Teacher');
    expect(teacher.capabilities).toContain(CAPABILITIES.ENROLLMENT_READ);
    expect(teacher.capabilities).not.toContain(CAPABILITIES.PROGRAM_MANAGE);
  });

  test('loadGrantsIntoMemory reflects DB edits in roleHasCapability', async () => {
    await seedSystemRoles();
    await Role.updateOne({ key: 'Teacher' }, { $set: { capabilities: [CAPABILITIES.PROGRAM_MANAGE] } });
    await loadGrantsIntoMemory();

    expect(roleHasCapability('Teacher', CAPABILITIES.PROGRAM_MANAGE)).toBe(true);
    expect(roleHasCapability('Teacher', CAPABILITIES.ENROLLMENT_READ)).toBe(false);
    expect(roleHasCapability('Admin', CAPABILITIES.PROGRAM_MANAGE)).toBe(true); // superuser invariant
  });

  test('seeding is idempotent and never clobbers an admin-edited grant', async () => {
    await seedSystemRoles();
    await Role.updateOne({ key: 'Teacher' }, { $set: { capabilities: ['custom.only'] } });
    await seedSystemRoles(); // re-run (reboot)
    const teacher = await Role.findOne({ key: 'Teacher' }).lean();
    expect(teacher.capabilities).toEqual(['custom.only']); // $setOnInsert left it alone
  });
});
