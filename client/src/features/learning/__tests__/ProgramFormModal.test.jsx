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

// Basics step reads org-defined custom fields (a React Query hook); stub it so
// the modal doesn't need a QueryClient and no custom-field section renders.
vi.mock('../../custom-fields/useCustomFields', () => ({
  useCustomFields: () => ({ data: [] }),
}));

// The builder is a 5-step wizard (Basics → Delivery → Completion → Certificate →
// Review); each step's controls only mount when that step is active, so the
// tests advance via the "Continue" button. The API payload contract is
// unchanged, so the payload assertions below match the legacy single-form modal.
const next = (user) => user.click(screen.getByRole('button', { name: 'Continue' }));

describe('ProgramFormModal — program builder policies', () => {
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

    // Step 1 — Basics
    await user.type(screen.getByLabelText('Code'), 'COMP101');
    await user.type(screen.getByLabelText('Name'), 'Compliance 101');
    await next(user);

    // Step 2 — Delivery (capacity + facilitator)
    await user.type(screen.getByLabelText('Max participants per cohort'), '25');
    await user.click(screen.getByLabelText(/A facilitator must be assigned/));
    await next(user);

    // Step 3 — Completion policy
    const threshold = screen.getByLabelText('Attendance threshold (%)');
    await user.clear(threshold);
    await user.type(threshold, '80');
    await user.click(screen.getByLabelText('Requires assessment to complete'));
    await next(user);

    // Step 4 — Certificate
    await user.click(screen.getByLabelText(/Auto-assign a recertification/));
    await next(user);

    // Step 5 — Review → submit
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(createFn).toHaveBeenCalledTimes(1);
    const payload = createFn.mock.calls[0][0];
    expect(payload.completionPolicy).toEqual({
      attendanceThresholdPercent: 80, requiresAssessment: true, requiresFeedback: false,
    });
    expect(payload.capacityPolicy).toEqual({ maxParticipants: 25, maxParticipantsPerSession: null });
    expect(payload.facilitatorPolicy).toEqual({ assignmentRequired: true, visibility: 'all_facilitators' });
    expect(payload.recertifyPolicy).toEqual({ autoAssign: true });
    expect(payload.certificateValidityDays).toBeNull();
    // ~10 sequential userEvent steps across the 5-step wizard; the default 5s
    // budget is tight under full-suite parallel load (passes in <4s isolated).
  }, 15000);

  it('prefills the persisted policies in edit mode', async () => {
    const user = userEvent.setup();
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

    // Step 2 — Delivery
    await next(user);
    expect(screen.getByLabelText('Max participants per cohort')).toHaveValue(10);
    expect(screen.getByLabelText(/A facilitator must be assigned/)).toBeChecked();
    expect(screen.getByLabelText('Facilitator visibility')).toHaveValue('assigned_only');

    // Step 3 — Completion policy
    await next(user);
    expect(screen.getByLabelText('Attendance threshold (%)')).toHaveValue(90);

    // Step 4 — Certificate
    await next(user);
    expect(screen.getByLabelText('Certificate validity (days)')).toHaveValue(365);
  });
});
