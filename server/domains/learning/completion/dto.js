const idOf = (value) => (value && value._id ? value._id : value) || null;

// Full certificate view for authenticated Admin/Teacher/learner-self listings.
const certificateDto = (cert) => {
  if (!cert) return null;
  // userId is a bare ObjectId on a freshly-created cert and a populated user on
  // list reads — detect population by an actual field, and fall back to the
  // immutable `learnerName` snapshot otherwise.
  const u = cert.userId;
  const populated = u && typeof u === 'object' && u.name !== undefined;
  return {
    id: cert._id,
    certificateNumber: cert.certificateNumber,
    verificationCode: cert.verificationCode,
    learner: {
      id: idOf(cert.userId),
      name: (populated && u.name) || cert.learnerName || '',
      empCode: populated ? u.empCode : undefined,
      department: populated ? u.department : undefined,
    },
    cohortId: idOf(cert.cohortId),
    cohortCode: cert.cohortCode,
    programId: idOf(cert.programId),
    programName: cert.programName,
    status: cert.status,
    issuedAt: cert.issuedAt,
    issuedBy: idOf(cert.issuedBy),
    revokedAt: cert.revokedAt,
    revokedReason: cert.revokedReason || '',
    completion: cert.completionSnapshot,
    createdAt: cert.createdAt,
  };
};

// Public verification view — no auth, so expose only what a verifier needs and
// nothing internal (no ids, no verificationCode, no policy internals).
const publicVerificationDto = (cert) => {
  if (!cert) return { valid: false, status: 'not_found' };
  return {
    valid: cert.status === 'Issued',
    status: cert.status,
    certificateNumber: cert.certificateNumber,
    learnerName: cert.learnerName,
    programName: cert.programName,
    cohortCode: cert.cohortCode,
    issuedAt: cert.issuedAt,
    revokedAt: cert.status === 'Revoked' ? cert.revokedAt : undefined,
  };
};

module.exports = { certificateDto, publicVerificationDto };
