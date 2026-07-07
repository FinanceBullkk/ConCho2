// Dual-backend (Mongo ⇔ Postgres) — Phase 5 slice 4 (B4); DB_BACKEND selects.
const settingsRepo = require('../domains/settings/repository');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');
const schedulingWindowPolicy = require('../domains/schedule/scheduling-window-policy');

// GET /api/settings
const getSettings = async (req, res) => {
  try {
    const settings = await settingsRepo.findAll();
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

    // Wave E1: validate scheduling config before persisting it. An empty array
    // is allowed (disables booking, keeps history visible); malformed or
    // overlapping windows are rejected (400) via the shared policy.
    for (const item of validItems) {
      if (item.key === 'ALLOWED_TIME_SLOTS') {
        schedulingWindowPolicy.assertSlotsValidForWrite(item.value);
      }
    }

    // Audit PR L (SEC-013): capture the before-state so the audit row has
    // a real {before, after} diff per key, not just the new value.
    const beforeDocs = validItems.length
      ? await settingsRepo.findByKeysLean(validItems.map((i) => i.key))
      : [];
    const beforeByKey = Object.fromEntries(beforeDocs.map((d) => [d.key, d.value]));

    if (validItems.length > 0) {
      await settingsRepo.upsertMany(validItems);
    }

    const updated = await settingsRepo.findByKeys(validItems.map((i) => i.key));

    // Audit PR L (SEC-013): one audit row per setting changed. Diff lets a
    // reviewer see the exact before/after — useful when a setting flip
    // breaks the app and we need to know who flipped what when.
    for (const item of validItems) {
      const before = beforeByKey[item.key];
      // Skip unchanged writes (idempotent PUT) — keeps audit table compact.
      if (JSON.stringify(before) === JSON.stringify(item.value)) continue;
      auditService.record({
        req,
        action: before === undefined ? 'created' : 'updated',
        entity: 'Setting',
        diff: { [item.key]: { before: before ?? null, after: item.value } },
        note: `setting ${item.key}`,
      });
    }

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
