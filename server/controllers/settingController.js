const Setting = require('../models/Setting');

// GET /api/settings
const getSettings = async (req, res) => {
  try {
    const settings = await Setting.find();
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

    const updated = [];
    for (const item of settings) {
      if (item.key && item.value !== undefined) {
        const s = await Setting.findOneAndUpdate(
          { key: item.key },
          { value: item.value },
          { new: true, upsert: true }
        );
        updated.push(s);
      }
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getSettings, updateSettings };
