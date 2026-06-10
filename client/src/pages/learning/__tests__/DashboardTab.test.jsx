import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardTab from '../DashboardTab';

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  dashboardCalls: [],
  state: {
    isAdmin: true,
    data: null,
    isLoading: false,
    isError: false,
  },
}));

// A populated bundle mirroring the server contract
// (domains/learning/dashboard/README.md).
const bundle = {
  generatedAt: '2026-06-10T03:00:00.000Z',
  windowDays: 30,
  errors: [],
  completion: {
    summary: { cohorts: 2, learners: 10, complete: 5, completionRate: 50, certificatesIssued: 4 },
    programs: [
      { key: 'p1', label: 'English Foundation', cohorts: 1, learners: 6, complete: 4, completionRate: 66.67, certificatesIssued: 2 },
    ],
    departments: [
      { key: 'Sales', label: 'Sales', cohorts: 1, learners: 4, complete: 2, completionRate: 40, certificatesIssued: 2 },
    ],
  },
  attendance: { totalRecords: 20, presentRecords: 17, rate: 85 },
  sessions: { upcoming: 3, next7Days: 2, past: 12 },
  assignments: {
    activeAssignments: 2,
    overdueLearners: 1,
    topOverdue: [{
      assignmentId: 'a1',
      assignmentTitle: 'Quarterly onboarding',
      dueDate: '2026-06-01T00:00:00.000Z',
      learner: { id: 'u1', empCode: '000012', name: 'Member Two', department: 'Sales' },
    }],
  },
  certificates: {
    expired: 1,
    expiring30: 2,
    expiring60: 3,
    topExpiring: [{
      certificateNumber: 'CERT-1',
      learnerName: 'Member One',
      programName: 'English Foundation',
      validUntil: '2026-07-01T00:00:00.000Z',
    }],
  },
  assessments: { totalAttempts: 8, passedAttempts: 6, passRate: 75 },
  feedback: {
    count: 5,
    averageRating: 4.2,
    byProgram: [{ programId: 'p1', programName: 'English Foundation', count: 5, averageRating: 4.2 }],
  },
  coverage: { windowDays: 30, activeParticipants: 100, engagedParticipants: 60, coveragePercent: 60 },
};

vi.mock('../../../hooks/useLearningDashboard', () => ({
  useOperationalDashboard: (params) => {
    mocks.dashboardCalls.push(params);
    return {
      data: mocks.state.data,
      isLoading: mocks.state.isLoading,
      isError: mocks.state.isError,
      refetch: mocks.refetch,
    };
  },
}));

vi.mock('../../../hooks/useRole', () => ({
  useRole: () => ({ isAdmin: mocks.state.isAdmin }),
}));

describe('DashboardTab', () => {
  beforeEach(() => {
    mocks.refetch.mockReset();
    mocks.dashboardCalls.length = 0;
    mocks.state.isAdmin = true;
    mocks.state.data = bundle;
    mocks.state.isLoading = false;
    mocks.state.isError = false;
  });

  it('renders the operational KPI tiles from the bundle', () => {
    render(<DashboardTab />);

    expect(screen.getByText('Completion rate')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Attendance rate')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('Overdue learners')).toBeInTheDocument();
    expect(screen.getByText('Quarterly onboarding')).toBeInTheDocument();
    expect(screen.getByText('Member One')).toBeInTheDocument();
    expect(screen.getByText('Training coverage')).toBeInTheDocument();
    expect(screen.getByText('4.2/5')).toBeInTheDocument();
  });

  it('shows the Executive toggle for Admins with a placeholder view', async () => {
    const user = userEvent.setup();
    render(<DashboardTab />);

    await user.click(screen.getByRole('tab', { name: /executive/i }));
    expect(screen.getByText('Executive view')).toBeInTheDocument();
  });

  it('hides the Executive toggle for non-admin report readers', () => {
    mocks.state.isAdmin = false;
    render(<DashboardTab />);

    expect(screen.queryByRole('tab', { name: /executive/i })).not.toBeInTheDocument();
    // The operational panel still renders for Teachers.
    expect(screen.getByText('Completion rate')).toBeInTheDocument();
  });

  it('marks failed metrics unavailable without breaking the rest (fail-soft)', () => {
    mocks.state.data = {
      ...bundle,
      coverage: null,
      errors: [{ metric: 'coverage', message: 'boom' }],
    };
    render(<DashboardTab />);

    expect(screen.getByText('Some metrics could not be computed: coverage')).toBeInTheDocument();
    expect(screen.getByText('This metric could not be computed right now.')).toBeInTheDocument();
    // Other blocks still present.
    expect(screen.getByText('Attendance rate')).toBeInTheDocument();
  });

  it('shows a skeleton while loading and a retry action on error', async () => {
    const user = userEvent.setup();
    mocks.state.data = null;
    mocks.state.isLoading = true;
    const { rerender } = render(<DashboardTab />);
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();

    mocks.state.isLoading = false;
    mocks.state.isError = true;
    rerender(<DashboardTab />);
    expect(screen.getByText('Could not load the dashboard')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it('passes the selected window to the dashboard hook', async () => {
    const user = userEvent.setup();
    render(<DashboardTab />);

    expect(mocks.dashboardCalls.at(-1)).toEqual({ window: '30' });
    await user.selectOptions(screen.getByLabelText('Window'), '90');
    expect(mocks.dashboardCalls.at(-1)).toEqual({ window: '90' });
  });
});
