import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import QuickActions from '../QuickActions';

// QuickActions shows LIVE operational signals (not nav shortcuts). It reads the
// shared operational dashboard and renders one linked tile per available metric
// block, with alert styling when something needs attention.

const h = vi.hoisted(() => ({
  can: () => true,
  isAdmin: false,
  op: { data: undefined, isLoading: false },
}));

vi.mock('../../../hooks/useRole', () => ({
  useRole: () => ({ can: h.can, isAdmin: h.isAdmin }),
}));

vi.mock('../../../hooks/useLearningDashboard', () => ({
  useOperationalDashboard: () => h.op,
}));

const renderQA = () =>
  render(
    <MemoryRouter>
      <QuickActions />
    </MemoryRouter>,
  );

beforeEach(() => {
  h.can = (p) => p === 'read:reports';
  h.isAdmin = false;
  h.op = { data: undefined, isLoading: false };
});

describe('QuickActions — contextual operational tiles', () => {
  it('renders nothing for a role without read:reports', () => {
    h.can = () => false;
    const { container } = renderQA();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a skeleton while loading', () => {
    h.op = { data: undefined, isLoading: true };
    const { container } = renderQA();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('renders nothing when every metric block is missing (fail-soft)', () => {
    h.op = { data: { errors: [{ metric: 'all' }] }, isLoading: false };
    const { container } = renderQA();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders linked tiles with live values and an expired-cert alert', () => {
    h.op = {
      isLoading: false,
      data: {
        assignments: { overdueLearners: 3 },
        certificates: { expired: 2, expiring30: 5 },
        sessions: { next7Days: 4 },
        completion: { summary: { completionRate: 78 } },
      },
    };
    renderQA();

    const overdue = screen.getByRole('link', { name: /overdue learners/i });
    expect(overdue).toHaveAttribute('href', '/learning?tab=assignments');
    expect(overdue).toHaveTextContent('3');

    const certs = screen.getByRole('link', { name: /certificates expiring/i });
    expect(certs).toHaveAttribute('href', '/reports?tab=completion');
    expect(certs).toHaveTextContent('5');
    expect(certs).toHaveTextContent(/2 expired/i);

    expect(screen.getByRole('link', { name: /sessions next 7 days/i })).toHaveAttribute('href', '/english-operations?tab=schedule');
    expect(screen.getByRole('link', { name: /completion rate/i })).toHaveTextContent('78%');
  });

  it('routes the overdue + certs tiles to the drill list for admins', () => {
    h.isAdmin = true;
    h.op = {
      isLoading: false,
      data: { assignments: { overdueLearners: 3 }, certificates: { expired: 0, expiring30: 5 }, sessions: null, completion: null },
    };
    renderQA();
    expect(screen.getByRole('link', { name: /overdue learners/i })).toHaveAttribute('href', '/reports/drill?metric=overdue');
    expect(screen.getByRole('link', { name: /certificates expiring/i })).toHaveAttribute('href', '/reports/drill?metric=expiring');
  });

  it('skips tiles whose metric block is null', () => {
    h.op = {
      isLoading: false,
      data: { assignments: { overdueLearners: 1 }, certificates: null, sessions: null, completion: null },
    };
    renderQA();
    expect(screen.getByRole('link', { name: /overdue learners/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /certificates expiring/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /sessions next 7 days/i })).toBeNull();
  });
});
