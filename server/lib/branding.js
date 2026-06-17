// ──────────────────────────────────────────────────────────
// Branding cache (TMS.update gap #5) — a synchronous accessor over the
// TenantConfig singleton for the email + certificate pipelines.
//
// Templates are sync string builders, so they can't await a DB read. We keep a
// tiny in-memory snapshot, seeded with the SAME defaults as the model ("TMS"),
// loaded once at boot and refreshed whenever an admin saves the branding. Until
// loaded, callers get the defaults → behaviour is identical to the old
// hardcoded strings (zero change for an unconfigured tenant).
// ──────────────────────────────────────────────────────────

const DEFAULTS = Object.freeze({
  orgName: 'TMS',
  accentColor: '#3b6fe0',
  logoUrl: '',
  certificateTitle: 'Certificate of Completion',
  emailSignature: '',
});

let cache = { ...DEFAULTS };

/** Current branding snapshot (sync — never throws). */
const getBrandingCached = () => cache;

/** Merge a (partial) config into the cache. Called after a branding save. */
const setBrandingCache = (cfg) => {
  if (cfg && typeof cfg === 'object') {
    cache = {
      orgName: cfg.orgName || DEFAULTS.orgName,
      accentColor: cfg.accentColor || DEFAULTS.accentColor,
      logoUrl: cfg.logoUrl ?? DEFAULTS.logoUrl,
      certificateTitle: cfg.certificateTitle || DEFAULTS.certificateTitle,
      emailSignature: cfg.emailSignature ?? DEFAULTS.emailSignature,
    };
  }
  return cache;
};

/** Load the singleton from the DB into the cache (boot + on demand). Fail-soft. */
const loadBranding = async () => {
  try {
    // Lazy require keeps the model access behind the branding domain repository
    // (Phase 0 PG-readiness) without a boot-order cycle.
    const brandingRepository = require('../domains/branding/repository');
    const doc = await brandingRepository.getSingleton();
    if (doc) setBrandingCache(doc);
  } catch {
    // best-effort — keep the defaults if the DB is unavailable
  }
  return cache;
};

/** Email sign-off line, branded. */
const emailSignature = () => {
  const b = cache;
  return b.emailSignature || `${b.orgName || 'TMS'} Training System`;
};

module.exports = { DEFAULTS, getBrandingCached, setBrandingCache, loadBranding, emailSignature };
