import { describe, it, expect, vi } from 'vitest';

// Mechanism test for the feature-flag layer (config/features.js → nav-config
// isItemVisible). Mock a KNOWN feature config so the test verifies the wiring,
// not the deployment's actual on/off choices.
vi.mock('../../../config/features', () => ({
  isFeatureEnabled: (key) => key !== 'disabledMod',
}));

import { isItemVisible } from '../nav-config';

const ALL = { Admin: 'full', Coordinator: 'full', Teacher: 'full', Participant: 'full' };
const allow = () => true;

describe('nav feature-flag gating (isItemVisible)', () => {
  it('hides an item whose feature flag is disabled — even for Admin', () => {
    expect(isItemVisible({ path: '/x', access: ALL, feature: 'disabledMod' }, 'Admin', allow)).toBe(false);
  });

  it('shows an item whose feature flag is enabled', () => {
    expect(isItemVisible({ path: '/y', access: ALL, feature: 'enabledMod' }, 'Admin', allow)).toBe(true);
  });

  it('shows an item with no feature tag (gating is opt-in)', () => {
    expect(isItemVisible({ path: '/z', access: ALL }, 'Admin', allow)).toBe(true);
  });

  it('still applies role gating on top of an enabled feature', () => {
    const item = { path: '/a', access: { Admin: 'full' }, feature: 'enabledMod' };
    expect(isItemVisible(item, 'Participant', allow)).toBe(false);
  });

  it('feature gating wins over an allowed role (disabled feature hides it regardless)', () => {
    const item = { path: '/b', access: ALL, feature: 'disabledMod', perm: undefined };
    expect(isItemVisible(item, 'Participant', allow)).toBe(false);
  });
});
