const { ServiceError } = require('../../helpers/ServiceError');
const repository = require('./managed-people-repository.pg');
const archiveRepository = require('./repository.pg');

const clean = (value) => (typeof value === 'string' ? value.trim() : value);

const listManagedPeople = async (input) => ({
  rows: await repository.list(input),
  total: await repository.count(input),
});

const createManagedPerson = async (input) => repository.createManaged({
  empCode: clean(input.empCode).toUpperCase(),
  name: clean(input.name),
  email: clean(input.email)?.toLowerCase() || null,
  department: clean(input.department) || '',
  position: clean(input.position) || '',
  status: input.status || 'Active',
});

const updateManagedPerson = async (id, input) => {
  const before = await repository.findById(id);
  if (!before) throw new ServiceError('Managed learner not found', 404);
  if (before.canLogin !== false) {
    throw new ServiceError('Login-enabled users must be maintained in Admin Console', 409);
  }
  const update = {};
  for (const key of ['name', 'email', 'department', 'position', 'status']) {
    if (input[key] !== undefined) update[key] = clean(input[key]);
  }
  if (update.email === '') update.email = null;
  const after = await repository.updateManaged(id, update);
  return { before, after };
};

const provisionArchivePeople = async () => {
  await archiveRepository.assertArchiveWritable();
  const people = await repository.listArchivePeopleForProvisioning();
  const report = { linked: [], created: [], alreadyLinked: [], collisions: [], rejected: [] };
  const validCode = /^[A-Z0-9][A-Z0-9_-]{0,31}$/;

  for (const person of people) {
    const empCode = person.emp_code?.trim().toUpperCase() || '';
    if (person.user_id && !person.linked_user_deleted) {
      report.alreadyLinked.push({ empCode, userId: person.user_id });
      continue;
    }
    if (!validCode.test(empCode) || !person.full_name?.trim()) {
      report.rejected.push({ empCode, reason: 'Invalid employee code or missing name' });
      continue;
    }
    if (person.user_id && person.linked_user_deleted) {
      report.collisions.push({ empCode, reason: 'Archive row points to a soft-deleted user' });
      continue;
    }
    // Sequential by design: each record owns a short transaction and the
    // returned report preserves deterministic workbook order.
    // eslint-disable-next-line no-await-in-loop
    const result = await repository.linkOrCreate(person);
    if (result.outcome === 'linked') report.linked.push(result);
    else if (result.outcome === 'created') report.created.push(result);
    else report.collisions.push(result);
  }
  return report;
};

module.exports = {
  listManagedPeople,
  createManagedPerson,
  updateManagedPerson,
  provisionArchivePeople,
};
