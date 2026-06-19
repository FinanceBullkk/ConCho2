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
      '/calendar?tab=schedules', '/calendar?tab=attendance',
      '/english?tab=teams',
      '/reports?tab=overview', '/reports?tab=hr-export',
      '/people?tab=users', '/system?tab=settings',
    ].forEach((p) => expect(links).toContain(p));
    // English Evaluations tab retired (converge Phase 4 C3) — folded into /grading.
    expect(hrefs(renderSidebar().container)).not.toContain('/english?tab=evaluations');
  });

  it('Teacher: learning (read, no Paths), reports (no Overview), unified calendar attendance + Grading; no People/System', () => {
    h.user = { role: 'Teacher' };
    const links = hrefs(renderSidebar().container);
    expect(links).toContain('/learning?tab=programs');
    expect(links).toContain('/learning?tab=assignments');
    expect(links).not.toContain('/learning?tab=paths');         // manage:path = Admin/Coord
    expect(links).toContain('/reports?tab=learning');
    expect(links).not.toContain('/reports?tab=overview');        // read:dashboard = Admin
    expect(links).toContain('/calendar?tab=attendance');         // unified attendance (both worlds)
    expect(links).not.toContain('/calendar?tab=schedules');      // admin-only
    expect(links).toContain('/grading');                         // rubric grading folded into the unified Grading workspace
    expect(links).not.toContain('/english?tab=evaluations');     // retired — folded into /grading
    expect(links).not.toContain('/english?tab=teams');           // admin-only
    expect(links).not.toContain('/people?tab=users');
    expect(links).not.toContain('/system?tab=settings');
  });

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

  it('injects My Team only when the user has direct reports', () => {
    h.user = { role: 'Teacher' };
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
