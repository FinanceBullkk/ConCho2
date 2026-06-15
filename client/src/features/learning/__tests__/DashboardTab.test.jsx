import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardTab from '../DashboardTab';

// The operational KPI tiles are now click-through (<Link> to the drill list),
// so the panel must render inside a router — as it always does in the app.
const renderTab = () => render(<DashboardTab />, { wrapper: MemoryRouter });

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
  // Executive hooks (panel detail is covered by DashboardExecutivePanel.test).
  useExecutiveDashboard: () => ({ data: null, isLoading: true, isError: false, refetch: vi.fn() }),
  useCostConfig: () => ({ data: null }),
  useSetCostConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // Dept-performance table (own component/test) — loading stub here.
  useDepartmentPerformance: () => ({ data: null, isLoading: true, isError: false }),
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
    renderTab();

    expect(screen.getByText('Completion rate')).toBeInTheDocument();
    // 50% appears twice now: the completion-rate tile AND the Overall-completion
    // donut centre (both read the same real completionRate).
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
    expect(screen.getByText('Attendance rate')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('Overdue learners')).toBeInTheDocument();
    expect(screen.getByText('Quarterly onboarding')).toBeInTheDocument();
    expect(screen.getByText('Member One')).toBeInTheDocument();
    expect(screen.getByText('Training coverage')).toBeInTheDocument();
    expect(screen.getByText('4.2/5')).toBeInTheDocument();
  });

  it('shows the Executive toggle for Admins and mounts the executive panel', async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByRole('tab', { name: /executive/i }));
    // Executive hook is mocked as loading → the panel skeleton mounts.
    expect(screen.getByTestId('executive-skeleton')).toBeInTheDocument();
  });

  it('hides the Executive toggle for non-admin report readers', () => {
    mocks.state.isAdmin = false;
    renderTab();

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
    renderTab();

    expect(screen.getByText('Some metrics could not be computed: coverage')).toBeInTheDocument();
    expect(screen.getByText('This metric could not be computed right now.')).toBeInTheDocument();
    // Other blocks still present.
    expect(screen.getByText('Attendance rate')).toBeInTheDocument();
  });

  it('shows a skeleton while loading and a retry action on error', async () => {
    const user = userEvent.setup();
    mocks.state.data = null;
    mocks.state.isLoading = true;
    const { rerender } = renderTab();
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
    renderTab();

    expect(mocks.dashboardCalls.at(-1)).toEqual({ window: '30' });
    // Window picker is now a segmented control (prototype `.seg`) — click the segment.
    const group = screen.getByRole('group', { name: 'Window' });
    await user.click(within(group).getByRole('button', { name: '90 days' }));
    expect(mocks.dashboardCalls.at(-1)).toEqual({ window: '90' });
  });
});
