const router = require('express').Router();
const { getSettings, updateSettings } = require('../controllers/settingController');
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');

router.route('/')
  .get(protect, roleGuard('Admin'), getSettings)
  .put(protect, roleGuard('Admin'), updateSettings);

module.exports = router;
