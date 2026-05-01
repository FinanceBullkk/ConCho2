const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { roleGuard } = require('../middleware/roleGuard');
const { getDashboardStats } = require('../controllers/dashboardController');

// GET /api/dashboard/stats — Admin analytics dashboard
router.get('/stats', protect, roleGuard('Admin'), getDashboardStats);

module.exports = router;
