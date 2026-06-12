import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../DashboardPage';

// UX-09: while the forced-password-change modal owns the screen, the home
// dashboard must not fire its queries (they all 403 on the
// mustChangePassword gate) or mount anything that would render an error
// boundary behind the modal.

const h = vi.hoisted(() => ({
  auth: { user: null, isAdmin: false, isParticipant: true },
  statsCalls: [],
  filterCalls: [],
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => h.auth,
}));

vi.mock('../../../hooks/useDashboard', () => ({
  useDashboardStats: (filters, opts) => {
    h.statsCalls.push(opts);
    return { data: undefined, isLoading: false, isError: false };
  },
  useDashboardFilterOptions: (opts) => {
    h.filterCalls.push(opts);
    return { data: undefined };
  },
}));

vi.mock('../ParticipantDashboard', () => ({
  default: () => <div data-testid="participant-dashboard" />,
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  h.statsCalls.length = 0;
  h.filterCalls.length = 0;
});

describe('DashboardPage — forced-password gate (UX-09)', () => {
  it('renders nothing and disables queries while mustChangePassword', () => {
    h.auth = { user: { mustChangePassword: true }, isAdmin: false, isParticipant: true };
    const { container } = renderPage();

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('participant-dashboard')).toBeNull();
    expect(h.statsCalls[0]).toEqual({ enabled: false });
    expect(h.filterCalls[0]).toEqual({ enabled: false });
  });

  it('disables admin queries too while mustChangePassword', () => {
    h.auth = { user: { mustChangePassword: true }, isAdmin: true, isParticipant: false };
    const { container } = renderPage();

    expect(container).toBeEmptyDOMElement();
    expect(h.statsCalls[0]).toEqual({ enabled: false });
  });

  it('mounts the participant dashboard once the password is rotated', () => {
    h.auth = { user: { mustChangePassword: false }, isAdmin: false, isParticipant: true };
    renderPage();

    expect(screen.getByTestId('participant-dashboard')).toBeInTheDocument();
  });
});
