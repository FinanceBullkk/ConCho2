import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';

// Role-filtered sidebar: assert by href so we don't depend on i18n strings.
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

describe('Sidebar — role-filtered navigation', () => {
  it('renders nothing without a user', () => {
    const { container } = renderSidebar();
    expect(container).toBeEmptyDOMElement();
  });

  it('Admin sees every group/item', () => {
    h.user = { role: 'Admin' };
    const { container } = renderSidebar();
    const links = hrefs(container);
    ['/home', '/learning', '/calendar', '/english', '/reports', '/people', '/system'].forEach((p) =>
      expect(links).toContain(p));
  });

  it('Teacher sees training + reports, not people/system', () => {
    h.user = { role: 'Teacher' };
    const links = hrefs(renderSidebar().container);
    ['/home', '/learning', '/calendar', '/english', '/reports'].forEach((p) => expect(links).toContain(p));
    expect(links).not.toContain('/people');
    expect(links).not.toContain('/system');
  });

  it('Coordinator sees learning/reports/people, not calendar/english/system', () => {
    h.user = { role: 'Coordinator' };
    const links = hrefs(renderSidebar().container);
    ['/home', '/learning', '/reports', '/people'].forEach((p) => expect(links).toContain(p));
    ['/calendar', '/english', '/system'].forEach((p) => expect(links).not.toContain(p));
  });

  it('Participant sees only home + english', () => {
    h.user = { role: 'Participant' };
    const links = hrefs(renderSidebar().container);
    expect(links).toContain('/home');
    expect(links).toContain('/english');
    ['/learning', '/calendar', '/reports', '/people', '/system'].forEach((p) => expect(links).not.toContain(p));
  });

  it('injects My Team only when the user has direct reports', () => {
    h.user = { role: 'Teacher' };
    h.myTeam = { count: 0 };
    expect(hrefs(renderSidebar().container)).not.toContain('/my-team');
    h.myTeam = { count: 3 };
    expect(hrefs(renderSidebar().container)).toContain('/my-team');
  });

  it('marks the active route with aria-current', () => {
    h.user = { role: 'Admin' };
    const { container } = renderSidebar('/learning');
    const active = container.querySelector('a[aria-current="page"]');
    expect(active).toHaveAttribute('href', '/learning');
  });

  it('learner persona shows the /me/* surfaces and hides the admin groups', () => {
    h.user = { role: 'Admin' };
    h.persona = 'learner';
    const links = hrefs(renderSidebar('/me/programs').container);
    ['/home', '/me/programs', '/me/catalog', '/me/sessions', '/me/transcript'].forEach((p) =>
      expect(links).toContain(p));
    // admin-only groups are not present in learner mode
    ['/learning', '/reports', '/people', '/system'].forEach((p) => expect(links).not.toContain(p));
  });

  it('learner persona hides English for a Coordinator (no access) but shows it for a Participant', () => {
    h.persona = 'learner';
    h.user = { role: 'Coordinator' };
    expect(hrefs(renderSidebar().container)).not.toContain('/english');
    h.user = { role: 'Participant' };
    expect(hrefs(renderSidebar().container)).toContain('/english');
  });
});
