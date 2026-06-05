const STATE_WEIGHT = { issued: 1, expiring: 2, missing: 3, expired: 4, revoked: 5 };

const idOf = (value) => (value && value._id ? value._id : value);
const idString = (value) => (idOf(value) ? idOf(value).toString() : '');
const uniq = (values) => [...new Set(values.filter(Boolean).map((v) => v.toString()))];

const endOfUtcDay = (value) => {
  const d = new Date(value);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

const targetPrograms = (assignment) => {
  if (assignment.targetType === 'path') return assignment.pathId?.programs || [];
  return assignment.programId ? [assignment.programId] : [];
};

const targetLabel = (assignment) =>
  assignment.targetType === 'path'
    ? assignment.pathId?.title || ''
    : assignment.programId?.name || '';

const deriveCertificateState = (cert, now = new Date()) => {
  if (!cert) return 'missing';
  if (cert.isDeleted) return 'missing';
  if (cert.status === 'Revoked') return 'revoked';
  if (cert.status !== 'Issued') return 'missing';
  if (!cert.validUntil) return 'issued';

  const validUntil = new Date(cert.validUntil);
  if (validUntil < endOfUtcDay(now)) return 'expired';
  if (validUntil <= endOfUtcDay(new Date(now.getTime() + 30 * 86400000))) return 'expiring';
  return 'issued';
};

const preferCertificate = (current, next) => {
  if (!current) return next;
  const currentRank = current.status === 'Issued' ? 2 : 1;
  const nextRank = next.status === 'Issued' ? 2 : 1;
  if (currentRank !== nextRank) return nextRank > currentRank ? next : current;
  return new Date(next.issuedAt || 0) > new Date(current.issuedAt || 0) ? next : current;
};

const buildCertificateMap = (certificates) => {
  const map = new Map();
  certificates.forEach((cert) => {
    const key = `${idString(cert.userId)}:${idString(cert.programId)}`;
    map.set(key, preferCertificate(map.get(key), cert));
  });
  return map;
};

const certificateDto = (cert, state) => ({
  id: cert?._id || null,
  number: cert?.certificateNumber || '',
  status: cert?.status || null,
  issuedAt: cert?.issuedAt || null,
  validFrom: cert?.validFrom || null,
  validUntil: cert?.validUntil || null,
  validityDays: cert?.validityDays ?? null,
  state,
});

const programCertificate = (userId, programId, certByUserProgram, now) => {
  const cert = certByUserProgram.get(`${userId}:${programId}`);
  return certificateDto(cert, deriveCertificateState(cert, now));
};

const assignmentCertificate = (userId, assignment, certByUserProgram, now) => {
  const states = targetPrograms(assignment).map((program) =>
    programCertificate(userId, idString(program), certByUserProgram, now));
  if (!states.length) return certificateDto(null, 'missing');
  return states.reduce((worst, current) =>
    STATE_WEIGHT[current.state] > STATE_WEIGHT[worst.state] ? current : worst);
};

module.exports = {
  idOf,
  idString,
  uniq,
  targetPrograms,
  targetLabel,
  deriveCertificateState,
  certificateState: deriveCertificateState,
  buildCertificateMap,
  assignmentCertificate,
};
