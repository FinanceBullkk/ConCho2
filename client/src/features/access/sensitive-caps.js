// Capabilities that grant elevated/config power — granting them to the wrong
// role is a lockout/security risk, so the roles matrix flags them with an amber
// shield (screenshots 13–14). Pure module (no component) so the matrix views can
// share it without tripping react-refresh.
export const SENSITIVE_CAPS = new Set([
  'role.manage', 'settings.manage', 'user.manage', 'org.manage',
  'automation.manage', 'branding.manage', 'data.transfer', 'audit.read', 'system.ops',
]);

export const isSensitiveCap = (cap) => SENSITIVE_CAPS.has(cap);
