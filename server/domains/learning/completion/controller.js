const auditService = require('../../../services/auditService');
const { handleError } = require('../../../helpers/handleError');
const useCases = require('./use-cases');
const { certificateDto, publicVerificationDto } = require('./dto');

const getCompletion = async (req, res) => {
  try {
    const data = await useCases.getCompletion(req.query, req.user);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const listCertificates = async (req, res) => {
  try {
    const certs = await useCases.listCertificates(req.query, req.user);
    res.json({ success: true, count: certs.length, data: certs.map(certificateDto) });
  } catch (error) {
    handleError(res, error);
  }
};

const issueCertificate = async (req, res) => {
  try {
    const cert = await useCases.issueCertificate(req.body, req.user);
    auditService.record({
      req,
      action: 'created',
      entity: 'Certificate',
      entityId: cert._id,
      diff: { after: { certificateNumber: cert.certificateNumber, userId: cert.userId, cohortId: cert.cohortId } },
      note: 'Certificate issued on completion',
    });
    res.status(201).json({ success: true, data: certificateDto(cert) });
  } catch (error) {
    handleError(res, error);
  }
};

const revokeCertificate = async (req, res) => {
  try {
    const { before, after } = await useCases.revokeCertificate(req.params.id, req.body?.reason);
    auditService.record({
      req,
      action: 'revoked',
      entity: 'Certificate',
      entityId: req.params.id,
      diff: auditService.diff(before, after),
      note: 'Certificate revoked',
    });
    res.json({ success: true, data: certificateDto(after) });
  } catch (error) {
    handleError(res, error);
  }
};

// Public — no auth. Always 200 with a validity flag (avoids leaking existence
// via status codes); unknown codes resolve to { valid: false, status: 'not_found' }.
const verifyCertificate = async (req, res) => {
  try {
    const cert = await useCases.verifyCertificate(req.params.code);
    res.json({ success: true, data: publicVerificationDto(cert) });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getCompletion,
  listCertificates,
  issueCertificate,
  revokeCertificate,
  verifyCertificate,
};
