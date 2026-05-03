const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Setting Model
// ──────────────────────────────────────────────────────────
// Stores system-wide configuration as key-value pairs.
// Examples:
// - key: 'ALLOWED_TIME_SLOTS', value: [ {sh:10, sm:0, eh:11, em:0}, ... ]
// - key: 'COURSE_SESSIONS', value: { 'Foundation': 16, ... }
// ──────────────────────────────────────────────────────────

const settingSchema = new mongoose.Schema({
  key: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
  },
  value: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true 
  },
  description: {
    type: String,
    default: '',
  }
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);
