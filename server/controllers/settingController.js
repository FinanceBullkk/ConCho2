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
const updateSettings = async (req, res) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings)) {
      return res.status(400).json({ success: false, message: 'Expected an array of settings' });
    }

    const validItems = settings.filter((item) => item.key && item.value !== undefined);

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

    res.json({ success: true, data: updated });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getSettings, updateSettings };
