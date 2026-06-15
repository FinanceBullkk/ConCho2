import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SessionDetailPage from '../SessionDetailPage';
import { schedulesAPI, attendanceAPI } from '../../../api/api';

// S5 — one-submit 4-state attendance. Mocks the schedule + prior-marks reads
// and the bulkMark mutation; verifies the submitted payload.

const h = vi.hoisted(() => ({ bulk: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../api/api', () => ({
  schedulesAPI: { getById: vi.fn() },
  attendanceAPI: { getBySchedule: vi.fn() },
}));
vi.mock('../../../hooks/useRole', () => ({ useRole: () => ({ isAdmin: false }) }));
vi.mock('../../../hooks/useAttendance', () => ({
  useBulkMarkAttendance: () => ({ mutateAsync: h.bulk, isPending: false }),
}));

const schedule = {
  _id: 'sc1',
  classId: { classCode: 'LEAD-C1', courseName: 'Leadership Essentials' },
  startTime: '2026-05-26T07:00:00.000Z',
  enrolledUsers: [
    { _id: 'u1', name: 'Nam Hoang', empCode: '1', department: 'Sales' },
    { _id: 'u2', name: 'Thu Le', empCode: '2', department: 'Ops' },
  ],
};

const renderAt = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/learning/sessions/sc1']}>
        <Routes>
          <Route path="/learning/sessions/:id" element={<SessionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('SessionDetailPage (S5)', () => {
  beforeEach(() => {
    h.bulk.mockReset(); h.bulk.mockResolvedValue({});
    schedulesAPI.getById.mockResolvedValue({ data: { data: schedule } });
    attendanceAPI.getBySchedule.mockResolvedValue({ data: { data: [{ userId: 'u1', status: 'P' }] } });
  });

  it('loads the roster and submits all-present', async () => {
    const user = userEvent.setup();
    renderAt();

    expect(await screen.findByText('Nam Hoang')).toBeInTheDocument();
    expect(screen.getByText('Thu Le')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All present' }));
    await user.click(screen.getByRole('button', { name: 'Submit attendance' }));

    expect(h.bulk).toHaveBeenCalledWith({
      scheduleId: 'sc1',
      records: [{ userId: 'u1', status: 'P' }, { userId: 'u2', status: 'P' }],
    });
  });

  it('marks an individual learner absent and submits the 4-state payload', async () => {
    const user = userEvent.setup();
    renderAt();

    const row = (await screen.findByText('Thu Le')).closest('li');
    await user.click(within(row).getByRole('button', { name: 'Absent' }));
    await user.click(screen.getByRole('button', { name: 'Submit attendance' }));

    expect(h.bulk).toHaveBeenCalledWith({
      scheduleId: 'sc1',
      records: [{ userId: 'u1', status: 'P' }, { userId: 'u2', status: 'A' }],
    });
  });
});
