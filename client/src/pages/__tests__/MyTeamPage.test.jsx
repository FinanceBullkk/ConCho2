import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MyTeamPage from '../MyTeamPage';

// Mutable mock return for useMyTeam (vi.mock is hoisted — use vi.hoisted).
const h = vi.hoisted(() => ({ ret: { data: undefined, isLoading: true } }));

vi.mock('../../hooks/useOrg', () => ({
  useMyTeam: () => h.ret,
}));

beforeEach(() => {
  h.ret = { data: undefined, isLoading: true };
});

describe('MyTeamPage', () => {
  it('renders a loading skeleton while fetching', () => {
    h.ret = { data: undefined, isLoading: true };
    const { container } = render(<MyTeamPage />);
    // TableSkeleton marks its wrapper aria-busy while loading.
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('shows the empty state when the user has no reports', () => {
    h.ret = { data: { reports: [], summary: { reports: 0, certificates: 0, completedPrograms: 0 } }, isLoading: false };
    render(<MyTeamPage />);
    expect(screen.getByText(/No direct reports/i)).toBeInTheDocument();
  });

  it('renders summary tiles + the roster when reports exist', () => {
    h.ret = {
      isLoading: false,
      data: {
        count: 1,
        summary: { reports: 1, certificates: 3, completedPrograms: 2 },
        reports: [{
          _id: 'u1', name: 'Bob Tran', empCode: '000200', role: 'Participant', status: 'Active',
          department: { name: 'Sales', code: 'SAL' },
          training: { activeEnrollments: 1, completedPrograms: 2, certificates: 3 },
        }],
      },
    };
    render(<MyTeamPage />);
    expect(screen.getByText('Bob Tran')).toBeInTheDocument();
    expect(screen.getByText('Direct reports')).toBeInTheDocument();
    expect(screen.getByText('Programs completed')).toBeInTheDocument();
  });
});
