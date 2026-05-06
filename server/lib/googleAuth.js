const { google } = require('googleapis');
const fs = require('fs');
const logger = require('./logger');

// ──────────────────────────────────────────────────────────
// Google API Authentication (Service Account + Domain-Wide Delegation)
// ──────────────────────────────────────────────────────────
// Used by both the Sheets sync (read-only) and the Calendar service
// (write events on behalf of users in the org).
//
// Why DWD: A normal service account can only access resources owned
// by itself. With Domain-Wide Delegation enabled in Workspace Admin,
// the service account can impersonate ANY user in the domain and
// act as them. This is what lets us create a calendar event
// "from" a user without that user ever logging in.
//
// Credential resolution order (first hit wins):
//   1. GOOGLE_SERVICE_ACCOUNT_KEY_JSON  — full JSON string in env (Render)
//   2. GOOGLE_SERVICE_ACCOUNT_KEY        — file path (local dev)
// ──────────────────────────────────────────────────────────

let cachedCredentials = null;

const loadCredentials = () => {
  if (cachedCredentials) return cachedCredentials;

  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  if (inline) {
    try {
      cachedCredentials = JSON.parse(inline);
      return cachedCredentials;
    } catch (err) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_JSON is not valid JSON');
    }
  }

  const filePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (filePath && fs.existsSync(filePath)) {
    cachedCredentials = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return cachedCredentials;
  }

  return null;
};

/**
 * Get an authenticated Google API client.
 *
 * @param {Object} opts
 * @param {string[]} opts.scopes  - e.g. ['https://www.googleapis.com/auth/calendar']
 * @param {string}   [opts.subject] - email of the workspace user to impersonate (DWD)
 * @returns {google.auth.JWT|null} authed client, or null if not configured
 */
const getAuthClient = ({ scopes, subject } = {}) => {
  const creds = loadCredentials();
  if (!creds) return null;

  // Prefer JWT auth so we can pass `subject` for domain-wide delegation.
  // GoogleAuth would also work but JWT keeps DWD explicit and obvious.
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes,
    subject: subject || undefined,
  });
};

const isConfigured = () => loadCredentials() !== null;

const warnIfMissing = () => {
  if (!isConfigured()) {
    logger.warn(
      'Google service-account credentials not configured. ' +
      'Set GOOGLE_SERVICE_ACCOUNT_KEY_JSON (prod) or GOOGLE_SERVICE_ACCOUNT_KEY (dev). ' +
      'Calendar + Sheets integration will be disabled.'
    );
  }
};

module.exports = { getAuthClient, isConfigured, warnIfMissing };
