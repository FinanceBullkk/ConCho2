import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportsTab from '../ReportsTab';

const loadRollup = vi.fn();

vi.mock('../../../hooks/useLearning', () => ({
  useLearningCohorts: () => ({ data: { data: [{ _id: 'c1', cohortCode: 'EL001', programName: 'English' }] } }),
  useCompletionReport: () => ({ data: null, isLoading: false }),
  useCompletionRollup: () => ({
    data: null,
    isFetching: false,
    refetch: loadRollup,
  }),
  useDownloadCompletionReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('ReportsTab', () => {
  it('does not load heavy rollups until requested', async () => {
    const user = userEvent.setup();
    loadRollup.mockResolvedValueOnce({});

    render(<ReportsTab />);

    expect(loadRollup).not.toHaveBeenCalled();
    expect(screen.getByText('Rollups are ready on demand')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /load rollups/i }));
    expect(loadRollup).toHaveBeenCalledTimes(1);
  });
});
