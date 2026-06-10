import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardExecutivePanel from '../DashboardExecutivePanel';

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  mutateAsync: vi.fn(),
  state: {
    data: null,
    isLoading: false,
    isError: false,
    costConfig: null,
  },
}));

// Mirrors the server contract (domains/learning/dashboard/README.md).
const bundle = {
  generatedAt: '2026-06-10T06:00:00.000Z',
  windowDays: 30,
  errors: [],
  coverage: {
    windowDays: 30,
    activeParticipants: 100,
    engagedParticipants: 60,
    coveragePercent: 60,
    departments: [{ department: 'Sales', active: 40, engaged: 30, percent: 75 }],
  },
  trend: {
    months: [
      { month: '2026-01', enrollments: 5, certificatesIssued: 2 },
      { month: '2026-02', enrollments: 8, certificatesIssued: 3 },
      { month: '2026-03', enrollments: 6, certificatesIssued: 4 },
      { month: '2026-04', enrollments: 9, certificatesIssued: 5 },
      { month: '2026-05', enrollments: 7, certificatesIssued: 6 },
      { month: '2026-06', enrollments: 10, certificatesIssued: 7 },
    ],
  },
  kirkpatrick: {
    l1Reaction: { measured: true, averageRating: 4.2, submissions: 25 },
    l2Learning: { measured: true, passRate: 80, attempts: 50 },
    l3Behavior: { measured: false, reason: 'survey pending' },
    l4Results: { measured: false, reason: 'kpi link pending' },
    l5Roi: { measured: false, reason: 'needs L4' },
  },
  mobility: { activePaths: 3, certificateBasedPathCompletions: 12, basis: 'certificates' },
  certificates: { totalIssued: 40, valid: 30, nonExpiring: 10, expiring30: 5, expired: 10, revoked: 1 },
  financials: { configured: false },
};

const configuredFinancials = {
  configured: true,
  currency: 'VND',
  annualBudgetMinor: 1000000,
  activeEmployees: 5,
  completionsTrailing12Months: 2,
  costPerEmployeeMinor: 200000,
  costPerCompletionMinor: 500000,
};

vi.mock('../../../hooks/useLearningDashboard', () => ({
  useExecutiveDashboard: () => ({
    data: mocks.state.data,
    isLoading: mocks.state.isLoading,
    isError: mocks.state.isError,
    refetch: mocks.refetch,
  }),
  useCostConfig: () => ({ data: mocks.state.costConfig }),
  useSetCostConfig: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));

describe('DashboardExecutivePanel', () => {
  beforeEach(() => {
    mocks.refetch.mockReset();
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockResolvedValue({});
    mocks.state.data = bundle;
    mocks.state.isLoading = false;
    mocks.state.isError = false;
    mocks.state.costConfig = null;
  });

  it('renders trend, honest Kirkpatrick, certificate donut, mobility, and coverage', () => {
    render(<DashboardExecutivePanel />);

    expect(screen.getByText('6-month activity trend')).toBeInTheDocument();
    expect(screen.getByText('2026-01 → 2026-06')).toBeInTheDocument();

    expect(screen.getByText('4.2/5 from 25 submissions')).toBeInTheDocument();
    expect(screen.getByText('80% pass rate over 50 attempts')).toBeInTheDocument();
    expect(screen.getAllByText('Not yet measured')).toHaveLength(3); // L3, L4, L5

    expect(screen.getByText('Certificate validity')).toBeInTheDocument();
    expect(screen.getByText('Active paths')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    expect(screen.getByText('Coverage by department')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('shows the budget CTA + form when financials are unconfigured, and saves integer minor units', async () => {
    const user = userEvent.setup();
    render(<DashboardExecutivePanel />);

    expect(
      screen.getByText('Set the annual L&D budget to unlock cost-per-employee and cost-per-completion.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Annual budget (minor units)'), '2000000');
    await user.click(screen.getByRole('button', { name: /save budget/i }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      annualBudgetMinor: 2000000,
      currency: 'VND',
      avgLoadedHourlyCostMinor: null,
    });
  });

  it('rejects a non-integer budget client-side without calling the API', async () => {
    const user = userEvent.setup();
    render(<DashboardExecutivePanel />);

    await user.type(screen.getByLabelText('Annual budget (minor units)'), '10.5');
    await user.click(screen.getByRole('button', { name: /save budget/i }));

    expect(
      screen.getByText('Enter a whole non-negative budget and a 3-letter currency code.'),
    ).toBeInTheDocument();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it('renders financial tiles when configured (no fabricated numbers path)', () => {
    mocks.state.data = { ...bundle, financials: configuredFinancials };
    mocks.state.costConfig = { annualBudgetMinor: 1000000, currency: 'VND', avgLoadedHourlyCostMinor: null };
    render(<DashboardExecutivePanel />);

    expect(screen.getByText('Cost per employee')).toBeInTheDocument();
    expect(screen.getByText('200,000 VND')).toBeInTheDocument();
    expect(screen.getByText('Cost per completion')).toBeInTheDocument();
    expect(screen.getByText('500,000 VND')).toBeInTheDocument();
    // Form hidden behind Edit when configured.
    expect(screen.queryByRole('button', { name: /save budget/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit budget/i })).toBeInTheDocument();
  });

  it('marks a failed metric unavailable and shows the partial warning', () => {
    mocks.state.data = { ...bundle, trend: null, errors: [{ metric: 'trend', message: 'boom' }] };
    render(<DashboardExecutivePanel />);

    expect(screen.getByText('Some metrics could not be computed: trend')).toBeInTheDocument();
    expect(screen.getByText('This metric could not be computed right now.')).toBeInTheDocument();
    expect(screen.getByText('Kirkpatrick measurement')).toBeInTheDocument();
  });

  it('shows a skeleton while loading and retry on error', async () => {
    const user = userEvent.setup();
    mocks.state.data = null;
    mocks.state.isLoading = true;
    const { rerender } = render(<DashboardExecutivePanel />);
    expect(screen.getByTestId('executive-skeleton')).toBeInTheDocument();

    mocks.state.isLoading = false;
    mocks.state.isError = true;
    rerender(<DashboardExecutivePanel />);
    expect(screen.getByText('Could not load the executive dashboard')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});
