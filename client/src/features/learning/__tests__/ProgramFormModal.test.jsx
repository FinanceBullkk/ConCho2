import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProgramFormModal from '../ProgramFormModal';

const createFn = vi.fn();
const updateFn = vi.fn();
const archiveFn = vi.fn();
const onClose = vi.fn();

vi.mock('../../../hooks/useLearning', () => ({
  useLearningPrograms: () => ({ data: { data: [] } }),
  useCreateProgram: () => ({ mutateAsync: createFn, isPending: false }),
  useUpdateProgram: () => ({ mutateAsync: updateFn, isPending: false }),
  useArchiveProgram: () => ({ mutateAsync: archiveFn, isPending: false }),
}));

describe('ProgramFormModal — program policies', () => {
  beforeEach(() => {
    createFn.mockReset();
    createFn.mockResolvedValue({});
    updateFn.mockReset();
    updateFn.mockResolvedValue({});
    onClose.mockReset();
  });

  it('submits the policy objects (completion/capacity/facilitator) on create', async () => {
    const user = userEvent.setup();
    render(<ProgramFormModal program={null} onClose={onClose} />);

    await user.type(screen.getByLabelText('Code'), 'COMP101');
    await user.type(screen.getByLabelText('Name'), 'Compliance 101');

    const threshold = screen.getByLabelText('Attendance threshold (%)');
    await user.clear(threshold);
    await user.type(threshold, '80');
    await user.click(screen.getByLabelText('Requires assessment to complete'));
    await user.type(screen.getByLabelText('Max participants per cohort'), '25');
    await user.click(screen.getByLabelText(/A facilitator must be assigned/));

    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(createFn).toHaveBeenCalledTimes(1);
    const payload = createFn.mock.calls[0][0];
    expect(payload.completionPolicy).toEqual({
      attendanceThresholdPercent: 80, requiresAssessment: true, requiresFeedback: false,
    });
    expect(payload.capacityPolicy).toEqual({ maxParticipants: 25, maxParticipantsPerSession: null });
    expect(payload.facilitatorPolicy).toEqual({ assignmentRequired: true, visibility: 'all_facilitators' });
    expect(payload.certificateValidityDays).toBeNull();
  });

  it('prefills the persisted policies in edit mode', () => {
    const program = {
      _id: 'p1', code: 'EDIT1', name: 'Edit Me', category: 'compliance',
      schedulingMode: 'admin_scheduled', deliveryMode: 'online', status: 'active',
      defaultSessionCount: 3, prerequisitePrograms: [],
      completionPolicy: { attendanceThresholdPercent: 90, requiresAssessment: true, requiresFeedback: false },
      capacityPolicy: { maxParticipants: 10, maxParticipantsPerSession: null },
      facilitatorPolicy: { assignmentRequired: true, visibility: 'assigned_only' },
      certificateValidityDays: 365,
    };
    render(<ProgramFormModal program={program} onClose={onClose} />);

    expect(screen.getByLabelText('Attendance threshold (%)')).toHaveValue(90);
    expect(screen.getByLabelText('Max participants per cohort')).toHaveValue(10);
    expect(screen.getByLabelText('Certificate validity (days)')).toHaveValue(365);
    expect(screen.getByLabelText(/A facilitator must be assigned/)).toBeChecked();
    expect(screen.getByLabelText('Facilitator visibility')).toHaveValue('assigned_only');
  });
});
