import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EnrollLearnersModal from '../EnrollLearnersModal';

const bulk = vi.fn();
const withdraw = vi.fn();
const onClose = vi.fn();

vi.mock('../../../hooks/useLearning', () => ({
  useLearningEnrollments: () => ({ data: { data: [] }, isLoading: false }),
  useBulkEnrollLearners: () => ({ mutateAsync: bulk, isPending: false }),
  useWithdrawEnrollment: () => ({ mutate: withdraw, isPending: false }),
}));

vi.mock('../../../hooks/useUsers', () => ({
  useUsers: () => ({
    data: {
      data: [
        { _id: 'u1', name: 'Alice', empCode: 'A1' },
        { _id: 'u2', name: 'Bob', empCode: 'B1' },
      ],
    },
  }),
}));

const cohort = { _id: 'c1', cohortCode: 'SE-2026', programName: 'Safety' };

describe('EnrollLearnersModal (bulk)', () => {
  beforeEach(() => {
    bulk.mockReset();
    bulk.mockResolvedValue({ enrolledCount: 2, skipped: [] });
    onClose.mockReset();
  });

  it('bulk-enrolls the selected learners in one call', async () => {
    const user = userEvent.setup();
    render(<EnrollLearnersModal cohort={cohort} onClose={onClose} />);

    // Select all candidates, then submit.
    await user.click(screen.getByText(/Select all/));
    await user.click(screen.getByRole('button', { name: /Enroll 2/ }));

    expect(bulk).toHaveBeenCalledTimes(1);
    expect(bulk.mock.calls[0][0]).toEqual({ cohortId: 'c1', userIds: ['u1', 'u2'] });
  });

  it('disables the enroll button until at least one learner is selected', () => {
    render(<EnrollLearnersModal cohort={cohort} onClose={onClose} />);
    // Nothing selected → the submit button shows "Enroll 0" and is disabled.
    expect(screen.getByRole('button', { name: /Enroll 0/ })).toBeDisabled();
  });
});
