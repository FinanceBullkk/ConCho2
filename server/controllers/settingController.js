const Setting = require('../models/Setting');
const { handleError } = require('../helpers/handleError');

// GET /api/settings
const getSettings = async (req, res) => {
  try {
    const settings = await Setting.find();
    res.json({ success: true, data: settings });
  } catch (error) {
    handleError(res, error);
  }
};

// PUT /api/settings
// Expects body: { settings: [{ key, value }, ...] }
// SEC-ADD-05: Whitelist of allowed setting keys to prevent arbitrary key injection
const ALLOWED_SETTING_KEYS = ['ALLOWED_TIME_SLOTS'];

const updateSettings = async (req, res) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings)) {
      return res.status(400).json({ success: false, message: 'Expected an array of settings' });
    }

    // Only accept whitelisted keys
    const validItems = settings.filter((item) =>
      item.key && item.value !== undefined && ALLOWED_SETTING_KEYS.includes(item.key)
    );

    const rejectedKeys = settings
      .filter((item) => item.key && !ALLOWED_SETTING_KEYS.includes(item.key))
      .map((item) => item.key);

    if (validItems.length > 0) {
      await Setting.bulkWrite(
        validItems.map((item) => ({
          updateOne: {
            filter: { key: item.key },
            update: { $set: { value: item.value } },
            upsert: true,
          },
        }))
      );
    }

    const updated = await Setting.find({ key: { $in: validItems.map((i) => i.key) } });

    const response = { success: true, data: updated };
    if (rejectedKeys.length > 0) {
      response.warning = `Ignored unknown setting keys: ${rejectedKeys.join(', ')}`;
    }
    res.json(response);
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getSettings, updateSettings };
