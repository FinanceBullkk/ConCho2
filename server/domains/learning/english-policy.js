const { ServiceError } = require('../../helpers/ServiceError');

const DEFAULT_ENGLISH_LEVELS = Object.freeze([
  ['foundation', 'Foundation'],
  ['beginner', 'Beginner'],
  ['beginner_2', 'Beginner 2'],
  ['beginner_3', 'Beginner 3'],
  ['pre_intermediate', 'Pre-Intermediate'],
  ['pre_intermediate_1', 'Pre-Intermediate 1'],
  ['pre_intermediate_2', 'Pre-Intermediate 2'],
  ['pre_intermediate_3', 'Pre-Intermediate 3'],
  ['intermediate', 'Intermediate'],
  ['intermediate_1', 'Intermediate 1'],
  ['intermediate_2', 'Intermediate 2'],
  ['upper_intermediate', 'Upper-Intermediate'],
  ['advanced', 'Advanced'],
].map(([code, displayName], index) => Object.freeze({ code, displayName, order: index + 1 })));

const defaultEnglishPolicy = () => ({
  maxAbsencesAllowed: 2,
  absenceStatuses: ['A'],
  levelScale: DEFAULT_ENGLISH_LEVELS.map((level) => ({ ...level })),
});

const normalizeEnglishPolicy = (policy) => policy == null ? null : ({
  maxAbsencesAllowed: Number(policy.maxAbsencesAllowed),
  absenceStatuses: [...(policy.absenceStatuses || ['A'])],
  levelScale: [...(policy.levelScale || [])]
    .map((level) => ({
      code: String(level.code).trim().toLowerCase(),
      displayName: String(level.displayName).trim(),
      order: Number(level.order),
    }))
    .sort((a, b) => a.order - b.order),
});

const assertEnglishProgramConfig = (program) => {
  if (program.category !== 'english') {
    if (program.englishPolicy != null) {
      throw new ServiceError('englishPolicy is only valid for English programs', 400);
    }
    return;
  }
  if (program.schedulingMode !== 'nomination') {
    throw new ServiceError('English programs must use nomination scheduling', 400);
  }
  const policy = normalizeEnglishPolicy(program.englishPolicy);
  if (!policy) throw new ServiceError('English programs require englishPolicy', 400);
  if (!Number.isInteger(policy.maxAbsencesAllowed) || policy.maxAbsencesAllowed < 0) {
    throw new ServiceError('maxAbsencesAllowed must be a non-negative integer', 400);
  }
  if (policy.levelScale.length !== 13) {
    throw new ServiceError('English levelScale must contain exactly 13 levels', 400);
  }
  const codes = new Set(policy.levelScale.map((level) => level.code));
  const orders = new Set(policy.levelScale.map((level) => level.order));
  if (codes.size !== 13 || orders.size !== 13) {
    throw new ServiceError('English level codes and orders must be unique', 400);
  }
};

module.exports = {
  DEFAULT_ENGLISH_LEVELS,
  defaultEnglishPolicy,
  normalizeEnglishPolicy,
  assertEnglishProgramConfig,
};
