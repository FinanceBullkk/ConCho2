import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssignmentsTab from '../AssignmentsTab';

const archive = vi.fn();
const state = {
  canManage: true,
  assignments: [],
};

const assignment = {
  _id: 'a1',
  title: 'Quarterly Compliance',
  description: 'Required for field teams',
  targetType: 'program',
  target: { _id: 'p1', name: 'Code of Conduct', code: 'COC' },
  dueDate: '2026-06-09T00:00:00.000Z',
  departments: [{ _id: 'd1' }, { _id: 'd2' }],
  users: [{ _id: 'u1' }],
  summary: { total: 4, complete: 1, in_progress: 1, overdue: 2, not_started: 0 },
};

vi.mock('../../../hooks/useLearning', () => ({
  useLearningAssignments: () => ({ data: { data: state.assignments }, isLoading: false }),
  useArchiveAssignment: () => ({ mutateAsync: archive, isPending: false }),
}));

vi.mock('../../../hooks/useRole', () => ({
  useRole: () => ({
    can: (permission) => (permission === 'manage:assignments' ? state.canManage : permission === 'read:assignments'),
  }),
}));

vi.mock('../AssignmentFormModal', () => ({
  default: ({ onClose }) => (
    <div role="dialog" aria-label="Create Assignment">
      <button type="button" onClick={onClose}>Close</button>
    </div>
  ),
}));

describe('AssignmentsTab', () => {
  beforeEach(() => {
    archive.mockReset();
    archive.mockResolvedValue({});
    state.canManage = true;
    state.assignments = [assignment];
  });

  it('renders assignment target, due date, progress summary, and audience', () => {
    render(<AssignmentsTab />);

    expect(screen.getByText('Quarterly Compliance')).toBeInTheDocument();
    expect(screen.getByText('Code of Conduct')).toBeInTheDocument();
    expect(screen.getByText('Jun 9, 2026')).toBeInTheDocument();
    expect(screen.getByText('1 Done')).toBeInTheDocument();
    expect(screen.getByText('2 Overdue')).toBeInTheDocument();
    expect(screen.getByText('2 departments + 1 user')).toBeInTheDocument();
  });

  it('opens the create modal for assignment managers', async () => {
    const user = userEvent.setup();
    render(<AssignmentsTab />);

    await user.click(screen.getByRole('button', { name: /new assignment/i }));
    expect(screen.getByRole('dialog', { name: /create assignment/i })).toBeInTheDocument();
  });

  it('does not show management actions to readers', () => {
    state.canManage = false;
    render(<AssignmentsTab />);

    expect(screen.queryByRole('button', { name: /new assignment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
  });

  it('requires a second click before archiving', async () => {
    const user = userEvent.setup();
    render(<AssignmentsTab />);

    await user.click(screen.getByRole('button', { name: /^archive$/i }));
    expect(archive).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /confirm archive/i }));
    expect(archive).toHaveBeenCalledWith('a1');
  });
});
