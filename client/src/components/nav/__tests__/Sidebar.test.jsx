import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';

// Role + capability filtered sidebar. We assert by href (no dependence on i18n
// strings). Sidebar uses the REAL useRole, which reads the role off the mocked
// useAuth → real PERMISSION_MAP drives perm-gated items. Groups default open.
const h = vi.hoisted(() => ({ user: null, myTeam: { count: 0 }, persona: 'admin' }));

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../../../context/PersonaContext', () => ({ usePersona: () => ({ persona: h.persona }) }));
vi.mock('../../../hooks/useOrg', () => ({ useMyTeam: () => ({ data: h.myTeam }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
// These tests verify ROLE + CAPABILITY gating — independent of which modules a
// given deployment hides via feature flags. Force all features ON so the
// assertions test the permanent gating logic, not the local feature choices.
// (Feature-flag gating itself is covered in feature-gating.test.js.)
vi.mock('../../../config/features', () => ({ isFeatureEnabled: () => true }));

function renderSidebar(initialPath = '/home') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar />
    </MemoryRouter>,
  );
}
const hrefs = (c) => Array.from(c.querySelectorAll('a')).map((a) => a.getAttribute('href'));

beforeEach(() => { h.user = null; h.myTeam = { count: 0 }; h.persona = 'admin'; });

describe('Sidebar — section-group navigation (Phase 03)', () => {
  it('renders nothing without a user', () => {
    const { container } = renderSidebar();
    expect(container).toBeEmptyDOMElement();
  });

  it('Admin sees every section as deep-link sub-items', () => {
    h.user = { role: 'Admin' };
    const links = hrefs(renderSidebar().container);
    [
      '/home',
      '/learning?tab=programs', '/learning?tab=paths',
      '/grading',                                          // unified Grading workspace (Learning group)
      '/people?tab=users', '/people?tab=teams',            // Teams moved to People (converge Phase 4)
      '/reports?tab=overview', '/reports?tab=hr-export',
      '/system?tab=settings',
    ].forEach((p) => expect(links).toContain(p));
    // English operations now lives in its own workspace, not Admin Console.
    expect(links).not.toContain('/calendar?tab=schedules');
    expect(links).not.toContain('/calendar?tab=attendance');
    expect(links).not.toContain('/mobile-attendance');
    expect(hrefs(renderSidebar().container)).not.toContain('/english-training');
    expect(hrefs(renderSidebar().container).some((h) => h === '/english' || h.startsWith('/english?'))).toBe(false);
  });

  // (Teacher role retired — no Teacher nav to assert.)

  it('Coordinator: learning incl. Paths, reports L&D, people org (not Users); no System/English', () => {
    h.user = { role: 'Coordinator' };
    const links = hrefs(renderSidebar().container);
    expect(links).toContain('/learning?tab=paths');              // manage:path = Coord
    expect(links).not.toContain('/learning?tab=feedback');       // read:feedback = Admin/Teacher
    expect(links).toContain('/reports?tab=learning');
    expect(links).not.toContain('/reports?tab=overview');
    expect(links).toContain('/people?tab=departments');
    expect(links).not.toContain('/people?tab=users');            // read:users = Admin
    expect(links).not.toContain('/system?tab=settings');
    expect(links).not.toContain('/english?tab=schedules');
  });

  it('learner persona shows the /me/* surfaces and hides the admin sections', () => {
    h.user = { role: 'Admin' };
    h.persona = 'learner';
    const links = hrefs(renderSidebar('/me/programs').container);
    ['/home', '/me/programs', '/me/catalog', '/me/sessions', '/me/transcript'].forEach((p) =>
      expect(links).toContain(p));
    ['/learning?tab=programs', '/reports?tab=overview', '/people?tab=users', '/system?tab=settings']
      .forEach((p) => expect(links).not.toContain(p));
  });

  it('learner English: hidden for a Coordinator, shown for a Participant', () => {
    h.persona = 'learner';
    h.user = { role: 'Coordinator' };
    expect(hrefs(renderSidebar().container)).not.toContain('/english');
    h.user = { role: 'Participant' };
    expect(hrefs(renderSidebar().container)).toContain('/english');
  });

  it('English Operations workspace exposes role-correct navigation', () => {
    h.persona = 'english';
    h.user = { role: 'Admin' };
    const links = hrefs(renderSidebar('/english-operations?tab=overview').container);
    expect(links).toContain('/english-operations?tab=overview');
    expect(links).toContain('/english-operations?tab=learners');
    expect(links).toContain('/english-operations?tab=schedule');
    expect(links).toContain('/english-operations?tab=attendance');
    expect(links).toContain('/mobile-attendance');
    expect(links).not.toContain('/learning?tab=programs');
  });

  it('injects My Team only when the user has direct reports', () => {
    h.user = { role: 'Admin' };
    h.myTeam = { count: 0 };
    expect(hrefs(renderSidebar().container)).not.toContain('/my-team');
    h.myTeam = { count: 3 };
    expect(hrefs(renderSidebar().container)).toContain('/my-team');
  });

  it('marks the active section sub-item with aria-current (default tab when no ?tab)', () => {
    h.user = { role: 'Admin' };
    const { container } = renderSidebar('/learning');
    const active = container.querySelector('a[aria-current="page"]');
    expect(active).toHaveAttribute('href', '/learning?tab=programs');
  });
});
