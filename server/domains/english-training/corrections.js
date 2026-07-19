// English-training correction use-cases. Raw workbook rows are immutable;
// corrections live in a stable overlay and are re-applied after every import.

const repo = require('./repository.pg');
const { ServiceError } = require('../../helpers/ServiceError');

async function correctEmployeeOrg({ empCode, businessUnit, jobRole, reason, actor }) {
  await repo.assertArchiveWritable();
  return repo.withTransaction(async (client) => {
    const employee = await repo.findEmployeeForCorrection(empCode, client);
    if (!employee) throw new ServiceError('English-training employee not found', 404);

    const existing = await repo.getEmployeeCorrection(employee.emp_code, client);
    const before = {
      businessUnit: existing?.business_unit || null,
      jobRole: existing?.job_role || null,
    };
    const after = {
      businessUnit: businessUnit === undefined ? before.businessUnit : businessUnit,
      jobRole: jobRole === undefined ? before.jobRole : jobRole,
    };
    const correctedBy = actor?._id ? String(actor._id) : null;

    const correction = await repo.saveEmployeeCorrection({
      empCode: employee.emp_code,
      businessUnit: after.businessUnit,
      jobRole: after.jobRole,
      reason,
      correctedBy,
    }, client);
    const snapshotsUpdated = await repo.backfillUnknownEnrollmentSnapshots(
      employee.emp_code,
      { businessUnit, jobRole },
      client,
    );
    const issuesResolved = await repo.resolveEmployeeIssues(
      employee.emp_code,
      { businessUnit, jobRole },
      { reason, correctedBy },
      client,
    );
    await repo.recordEmployeeCorrectionHistory({
      empCode: employee.emp_code, before, after, reason, correctedBy,
    }, client);

    return {
      employee: { empCode: employee.emp_code, fullName: employee.full_name },
      correction: {
        businessUnit: correction.business_unit,
        jobRole: correction.job_role,
        reason: correction.reason,
      },
      before,
      after,
      snapshotsUpdated,
      issuesResolved,
    };
  });
}

module.exports = { correctEmployeeOrg };
