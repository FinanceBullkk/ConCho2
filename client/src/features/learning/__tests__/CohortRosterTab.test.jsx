import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CohortRosterTab from '../CohortRosterTab';

// S4 — the roster centerpiece: multi-select, at-risk filter, and the bulk
// Issue-cert / Nudge actions wired to the real mutations.

const h = vi.hoisted(() => ({ issue: vi.fn(), nudge: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../hooks/useLearning', () => ({
  useIssueCertificate: () => ({ mutateAsync: h.issue, isPending: false }),
  useNudgeCohort: () => ({ mutateAsync: h.nudge, isPending: false }),
}));

const rows = [
  { learner: { id: 'u1', name: 'An Bui', empCode: '1', department: 'Sales' }, attendancePercent: 100, assessmentRequired: true, assessmentMet: true, feedbackRequired: true, feedbackMet: true, complete: true, certificate: null },
  { learner: { id: 'u2', name: 'Linh Dang', empCode: '2', department: 'Ops' }, attendancePercent: 25, assessmentRequired: true, assessmentMet: false, feedbackRequired: true, feedbackMet: false, complete: false, certificate: null },
  { learner: { id: 'u3', name: 'Mai Dang', empCode: '3', department: 'Sales' }, attendancePercent: 75, assessmentRequired: true, assessmentMet: true, feedbackRequired: false, feedbackMet: false, complete: false, certificate: null },
];

const renderTab = () =>
  render(<MemoryRouter><CohortRosterTab cohortId="co1" rows={rows} /></MemoryRouter>);

describe('CohortRosterTab (S4)', () => {
  beforeEach(() => {
    h.issue.mockReset(); h.issue.mockResolvedValue({});
    h.nudge.mockReset(); h.nudge.mockResolvedValue({ notified: 1 });
  });

  it('renders every learner and filters to at-risk only', async () => {
    const user = userEvent.setup();
    renderTab();
    expect(screen.getByText('An Bui')).toBeInTheDocument();
    expect(screen.getByText('Linh Dang')).toBeInTheDocument();
    expect(screen.getByText('Mai Dang')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'At-risk only' }));
    expect(screen.getByText('Linh Dang')).toBeInTheDocument(); // 25% + not complete
    expect(screen.queryByText('An Bui')).toBeNull();
    expect(screen.queryByText('Mai Dang')).toBeNull();
  });

  it('bulk-issues certificates for the selected learners', async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByRole('checkbox', { name: 'An Bui' }));
    await user.click(screen.getByRole('button', { name: 'Issue cert' }));
    // Confirm dialog
    await user.click(screen.getByRole('button', { name: 'Issue certificates' }));

    expect(h.issue).toHaveBeenCalledTimes(1);
    expect(h.issue).toHaveBeenCalledWith({ cohortId: 'co1', userId: 'u1' });
  });

  it('sends a nudge to the selected learners', async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByRole('checkbox', { name: 'Linh Dang' }));
    await user.click(screen.getByRole('button', { name: 'Nudge' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Send nudge' }));

    expect(h.nudge).toHaveBeenCalledWith({ cohortId: 'co1', userIds: ['u2'], message: undefined });
  });
});
