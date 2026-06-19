import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ScheduleDrawer } from '../ScheduleDrawer';

// Converge Phase 4 slice A2: the unified Schedules calendar surfaces BOTH
// worlds, so the edit drawer must handle team-less (cohort) sessions — no team
// picker, team not required, and the (absent) team binding left untouched on
// save. Team sessions keep the team picker. (Create stays team-only — the
// manual-create API requires a team; cohort sessions are created in Learning.)

const h = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), del: vi.fn() }));

vi.mock('../../hooks/useSchedules', () => ({
  useCreateSchedule: () => ({ mutateAsync: h.create, isPending: false }),
  useUpdateSchedule: () => ({ mutateAsync: h.update, isPending: false }),
  useDeleteSchedule: () => ({ mutateAsync: h.del, isPending: false }),
}));

const classes = [{ _id: 'c1', classCode: 'LD001', courseName: 'Data Privacy' }];
const teams = [{ _id: 't1', name: 'Alpha', classId: { _id: 'c2', classCode: 'EL001' } }];

const cohortSession = {
  _id: 's1', classId: { _id: 'c1', classCode: 'LD001', courseName: 'Data Privacy' },
  bookedTeamId: null, startTime: '2026-06-20T03:00:00.000Z', endTime: '2026-06-20T04:00:00.000Z',
  roomLink: '', capacity: 20, deliveryType: 'cohort',
};

const teamSession = {
  _id: 's2', classId: { _id: 'c2', classCode: 'EL001', courseName: 'Business English' },
  bookedTeamId: { _id: 't1', name: 'Alpha' }, startTime: '2026-06-20T03:00:00.000Z', endTime: '2026-06-20T04:00:00.000Z',
  roomLink: '', capacity: 9, deliveryType: 'team',
};

const renderDrawer = (props) => render(
  <ScheduleDrawer
    isOpen mode="edit" schedule={cohortSession} prefill={null}
    classes={classes} teams={teams} allSchedules={[]}
    isReadOnly={false} onClose={() => {}} onSaved={() => {}} onDeleted={() => {}}
    {...props}
  />,
);

beforeEach(() => {
  h.update.mockReset(); h.update.mockResolvedValue({});
  h.create.mockReset(); h.create.mockResolvedValue({});
  h.del.mockReset();
});

describe('ScheduleDrawer — cohort (team-less) session edit', () => {
  it('a cohort session hides the team picker and shows a cohort note', () => {
    renderDrawer();
    expect(screen.queryByLabelText('Team')).toBeNull();
    expect(screen.getByText(/Cohort session/i)).toBeInTheDocument();
    // the class is still shown (read from schedule.classId)
    expect(screen.getByText('LD001')).toBeInTheDocument();
  });

  it('a team session keeps the team picker', () => {
    renderDrawer({ schedule: teamSession });
    expect(screen.getByLabelText('Team')).toBeInTheDocument();
    expect(screen.queryByText(/Cohort session/i)).toBeNull();
  });

  it('saving a cohort session omits bookedTeamId from the payload', async () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(h.update).toHaveBeenCalled());
    const arg = h.update.mock.calls[0][0];
    expect(arg.id).toBe('s1');
    expect(arg.data).not.toHaveProperty('bookedTeamId');
    expect(arg.data.classId).toBe('c1');
  });
});
