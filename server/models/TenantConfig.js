const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// TenantConfig — org branding + template config (TMS.update gap #5).
//
// A SINGLETON (one row, key='default') holding the white-label settings that
// feed the existing certificate + email pipeline: org name, brand accent, logo,
// and the certificate title. Default values reproduce the current hardcoded
// behaviour ("TMS"), so an unconfigured tenant is byte-identical to before.
// ──────────────────────────────────────────────────────────

const tenantConfigSchema = new mongoose.Schema(
  {
    // Fixed singleton key — there is only ever one TenantConfig document.
    key: { type: String, default: 'default', unique: true },
    orgName: { type: String, trim: true, default: 'TMS' },
    // Brand accent as a hex color (drives certificate + UI accent).
    accentColor: { type: String, trim: true, default: '#3b6fe0' },
    logoUrl: { type: String, trim: true, default: '' },
    certificateTitle: { type: String, trim: true, default: 'Certificate of Completion' },
    // Optional email sign-off; blank → falls back to "<orgName> Training System".
    emailSignature: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

// Fetch-or-create the singleton (upsert). Returns a lean doc.
tenantConfigSchema.statics.getSingleton = function getSingleton() {
  return this.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
};

module.exports = mongoose.model('TenantConfig', tenantConfigSchema);
