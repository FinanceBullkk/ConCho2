import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminAnalyticsPanel from '../AdminAnalyticsPanel';

// AdminAnalyticsPanel is the training-analytics body extracted from the old
// Home dashboard (now Reports▸Overview). It must preserve the UX-09 gate: while
// mustChangePassword, the dashboard queries stay DISABLED (they all 403 on the
// password gate), and the panel renders nothing.

const h = vi.hoisted(() => ({
  auth: { user: null, isAdmin: true },
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

const renderPanel = () =>
  render(
    <MemoryRouter>
      <AdminAnalyticsPanel />
    </MemoryRouter>,
  );

beforeEach(() => {
  h.statsCalls.length = 0;
  h.filterCalls.length = 0;
});

describe('AdminAnalyticsPanel — UX-09 query gate', () => {
  it('renders nothing and disables queries while mustChangePassword', () => {
    h.auth = { user: { mustChangePassword: true }, isAdmin: true };
    const { container } = renderPanel();

    expect(container).toBeEmptyDOMElement();
    expect(h.statsCalls[0]).toEqual({ enabled: false });
    expect(h.filterCalls[0]).toEqual({ enabled: false });
  });

  it('enables the analytics queries for an Admin past the password gate', () => {
    h.auth = { user: { mustChangePassword: false, name: 'Adam' }, isAdmin: true };
    renderPanel();

    expect(h.statsCalls[0]).toEqual({ enabled: true });
    expect(h.filterCalls[0]).toEqual({ enabled: true });
  });
});
