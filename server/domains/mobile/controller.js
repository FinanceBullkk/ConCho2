const { handleError } = require('../../helpers/handleError');
const useCases = require('./use-cases');

// ──────────────────────────────────────────────────────────
// mobile/controller — thin self-scoped handlers for B5 (/api/me).
// Push subscribe/unsubscribe are ephemeral per-device token writes (like the
// notification read-state) — not audited business data. The feed is a read.
// ──────────────────────────────────────────────────────────

const getVapidKey = async (req, res) => {
  try {
    res.json({ success: true, data: useCases.getVapidKey() });
  } catch (error) {
    handleError(res, error);
  }
};

const subscribe = async (req, res) => {
  try {
    await useCases.subscribe(req.user, req.body);
    res.status(201).json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
};

const unsubscribe = async (req, res) => {
  try {
    await useCases.unsubscribe(req.user, req.body.endpoint);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
};

const getFeed = async (req, res) => {
  try {
    const data = await useCases.buildFeed(req.user);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getVapidKey, subscribe, unsubscribe, getFeed };
