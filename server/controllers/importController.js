const importService = require('../services/importService');

// ──────────────────────────────────────────────────────────
// Import Controller (Thin — delegates to Service Layer)
// ──────────────────────────────────────────────────────────

const handleError = (res, error) => {
  const status = error.statusCode || 500;
  res.status(status).json({ success: false, message: error.message });
};

const bulkImportUsers = async (req, res) => {
  try {
    const result = await importService.importUsers(req.body.users);
    res.json({
      success: true,
      message: `Import complete: ${result.created} created, ${result.updated} updated`,
      data: result,
    });
  } catch (error) {
    handleError(res, error);
  }
};

const bulkImportClasses = async (req, res) => {
  try {
    const result = await importService.importClasses(req.body.classes);
    res.json({
      success: true,
      message: `Import complete: ${result.created} created, ${result.updated} updated`,
      data: result,
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { bulkImportUsers, bulkImportClasses };
