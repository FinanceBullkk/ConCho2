import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ClassesPanel from '../ClassesPanel';

const leaveMutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'admin-1', role: 'Admin' } }),
}));

vi.mock('../useEnglishOperations', () => ({
  useCanonicalEnglishClasses: () => ({
    isLoading: false,
    data: [{
      id: 'class-1', classCode: 'EL034', displayName: 'Alpha', status: 'active',
      capacity: 12, activeMembers: 7, runs: 2, currentPic: 'People Team',
    }],
  }),
  useCanonicalEnglishCourses: () => ({ isLoading: false, data: [] }),
  useCanonicalEnglishEmployees: () => ({ data: [] }),
  useCreateCanonicalEnglishClass: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLeaveCanonicalRunEnrollment: () => leaveMutation,
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
});
