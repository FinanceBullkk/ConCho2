import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ClassesPanel from '../ClassesPanel';

const leaveMutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const transferMutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'admin-1', role: 'Admin' } }),
}));

vi.mock('../useEnglishOperations', () => ({
  useCanonicalEnglishClasses: () => ({
    isLoading: false,
    data: [{
      id: 'class-1', classCode: 'EL034', displayName: 'Alpha', status: 'active',
      capacity: 12, activeMembers: 7, runs: 2, currentPic: 'People Team',
    }, {
      id: 'class-2', classCode: 'EL035', displayName: 'Beta', status: 'active',
      capacity: 12, activeMembers: 3, runs: 1, currentPic: 'People Team',
    }, {
      id: 'class-3', classCode: 'EL036', displayName: 'Gamma', status: 'active',
      capacity: 3, activeMembers: 3, runs: 1, currentPic: 'People Team',
    }],
  }),
  useCanonicalEnglishCourseRuns: () => ({
    isLoading: false,
    data: [
      { id: 'run-1', cohortId: 'class-1', classCode: 'EL034', courseCode: 'COM1', courseName: 'Communication 1', nextSessionNumber: 2, transferStartSessionNumber: 2 },
      { id: 'run-2', cohortId: 'class-2', classCode: 'EL035', courseCode: 'COM2', courseName: 'Communication 2', nextSessionNumber: 5, transferStartSessionNumber: 4 },
      { id: 'run-3', cohortId: 'class-3', classCode: 'EL036', courseCode: 'COM3', courseName: 'Communication 3', nextSessionNumber: 3, transferStartSessionNumber: 2 },
    ],
  }),
  useCanonicalEnglishCourses: () => ({ isLoading: false, data: [] }),
  useCanonicalEnglishEmployees: () => ({ data: [] }),
  useCreateCanonicalEnglishClass: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLeaveCanonicalRunEnrollment: () => leaveMutation,
  useTransferCanonicalRunEnrollment: () => transferMutation,
  useCanonicalEnglishClass: () => ({
    isLoading: false,
    data: {
      id: 'class-1', classCode: 'EL034', displayName: 'Alpha', status: 'active',
      capacity: 12, currentPic: 'People Team',
      runs: [{
        id: 'run-1', courseCode: 'COM1', courseName: 'Communication 1',
        runNumber: 1, status: 'active', attendanceThresholdRatio: 0.8,
        roster: [{
          enrollmentId: 'enrollment-1', empCode: 'E001', fullName: 'Alice',
          enrollmentStatus: 'active', startSessionNumber: 1,
          attendanceRatio: 0.8, markedCount: 10, presentCount: 8,
          eligibilityStatus: 'within_limit',
        }],
      }],
    },
  }),
}));

describe('canonical English Classes panel', () => {
  it('groups stable classes by current PIC and renders the Course Run roster', () => {
    render(<ClassesPanel />);

    expect(screen.getByText('PIC · People Team')).toBeInTheDocument();
    expect(screen.getAllByText('EL034 · Alpha').length).toBeGreaterThan(0);
    expect(screen.getByText('Current PIC: People Team')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    // Status enums render as operator-facing labels, not the raw codes.
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(screen.queryByText('within_limit')).not.toBeInTheDocument();
    expect(screen.queryByText('Add course')).not.toBeInTheDocument();
  });

  it('submits the learner leave intent from an active roster row', async () => {
    const user = userEvent.setup();
    leaveMutation.mutateAsync.mockResolvedValueOnce({});
    render(<ClassesPanel />);

    await user.click(screen.getByRole('button', { name: 'Mark left' }));
    await user.clear(screen.getByLabelText('Last active date'));
    await user.type(screen.getByLabelText('Last active date'), '2026-07-20');
    await user.type(screen.getByLabelText('Reason'), 'Work schedule changed');
    await user.click(screen.getByRole('button', { name: 'Confirm leave' }));

    expect(leaveMutation.mutateAsync).toHaveBeenCalledWith({
      courseRunId: 'run-1', enrollmentId: 'enrollment-1',
      data: { lastActiveDate: '2026-07-20', reason: 'Work schedule changed' },
    });
  });

  it('submits a cross-class learner transfer with the destination proposal', async () => {
    const user = userEvent.setup();
    transferMutation.mutateAsync.mockResolvedValueOnce({});
    render(<ClassesPanel />);

    await user.click(screen.getByRole('button', { name: 'Transfer learner' }));
    await user.selectOptions(screen.getByLabelText('Destination'), 'run-2');
    await user.clear(screen.getByLabelText('Transfer date'));
    await user.type(screen.getByLabelText('Transfer date'), '2026-07-21');
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));

    expect(transferMutation.mutateAsync).toHaveBeenCalledWith({
      sourceCourseRunId: 'run-1', enrollmentId: 'enrollment-1',
      data: {
        targetCourseRunId: 'run-2', transferDate: '2026-07-21',
        confirmedStartSessionNumber: 4,
      },
    });
  });

  it('requires and submits a reason when transferring into a full class', async () => {
    const user = userEvent.setup();
    transferMutation.mutateAsync.mockResolvedValueOnce({});
    render(<ClassesPanel />);

    await user.click(screen.getByRole('button', { name: 'Transfer learner' }));
    await user.selectOptions(screen.getByLabelText('Destination'), 'run-3');

    expect(screen.getByText('Capacity override required: projected 4 / 3 learners.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm transfer' })).toBeDisabled();
    await user.type(screen.getByLabelText('Capacity override reason'), 'HR approved an additional seat');
    await user.click(screen.getByRole('button', { name: 'Confirm transfer' }));

    expect(transferMutation.mutateAsync).toHaveBeenCalledWith({
      sourceCourseRunId: 'run-1', enrollmentId: 'enrollment-1',
      data: {
        targetCourseRunId: 'run-3', transferDate: expect.any(String),
        confirmedStartSessionNumber: 2,
        capacityOverrideReason: 'HR approved an additional seat',
      },
    });
  });
});
