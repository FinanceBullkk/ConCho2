import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssignTrainersModal from '../AssignTrainersModal';

const setTrainers = vi.fn();
const onClose = vi.fn();
// Default: Admin (holds every permission, incl. read:users for the picker).
let canImpl = () => true;

vi.mock('../../../hooks/useLearning', () => ({
  useSetTrainers: () => ({ mutateAsync: setTrainers, isPending: false }),
}));

vi.mock('../../../hooks/useUsers', () => ({
  // RQ-shaped result: data is the unwrapped { data: [...] } envelope.
  useUsers: () => ({
    data: {
      data: [
        { _id: 't1', name: 'Tina Teacher', empCode: '000002' },
        { _id: 't2', name: 'Theo Teacher', empCode: '000003' },
      ],
    },
  }),
}));

vi.mock('../../../hooks/useRole', () => ({
  useRole: () => ({ can: (p) => canImpl(p) }),
}));

const baseSession = {
  scheduleId: 's1',
  sessionInstructors: [{ _id: 't1', name: 'Tina Teacher', empCode: '000002' }],
  externalTrainer: null,
};

describe('AssignTrainersModal', () => {
  beforeEach(() => {
    setTrainers.mockReset();
    setTrainers.mockResolvedValue({});
    onClose.mockReset();
    canImpl = () => true;
  });

  it('submits the current internal trainers and no external when nothing changes', async () => {
    const user = userEvent.setup();
    render(<AssignTrainersModal session={baseSession} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Save trainers' }));

    expect(setTrainers).toHaveBeenCalledTimes(1);
    expect(setTrainers.mock.calls[0][0]).toEqual({
      id: 's1',
      data: { internalIds: ['t1'], externalTrainer: null },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('adds an internal trainer picked from the (Admin-only) picker', async () => {
    const user = userEvent.setup();
    render(<AssignTrainersModal session={baseSession} onClose={onClose} />);

    // t1 is already assigned → the pool offers t2.
    await user.selectOptions(screen.getByRole('combobox', { name: /add a trainer/i }), 't2');
    await user.click(screen.getByRole('button', { name: 'Save trainers' }));

    expect(setTrainers.mock.calls[0][0].data.internalIds).toEqual(['t1', 't2']);
  });

  it('requires a name when an external trainer is toggled on', async () => {
    const user = userEvent.setup();
    render(<AssignTrainersModal session={baseSession} onClose={onClose} />);

    await user.click(screen.getByRole('checkbox', { name: 'Add an external trainer' }));
    await user.click(screen.getByRole('button', { name: 'Save trainers' }));

    expect(setTrainers).not.toHaveBeenCalled();
    expect(screen.getByText('An external trainer needs a name.')).toBeInTheDocument();
  });

  it('submits an external trainer record (empty optional fields → null)', async () => {
    const user = userEvent.setup();
    render(<AssignTrainersModal session={baseSession} onClose={onClose} />);

    await user.click(screen.getByRole('checkbox', { name: 'Add an external trainer' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Vera Vendor');
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'vera@ext.com');
    await user.click(screen.getByRole('button', { name: 'Save trainers' }));

    expect(setTrainers.mock.calls[0][0].data.externalTrainer).toEqual({
      name: 'Vera Vendor', email: 'vera@ext.com', phone: null, org: null,
    });
  });

  it('hides the add picker for a non-admin (no read:users) and omits internalIds on save', async () => {
    canImpl = (p) => p !== 'read:users';
    const user = userEvent.setup();
    render(<AssignTrainersModal session={baseSession} onClose={onClose} />);

    // Current internal trainers stay visible (read-only chips, no picker).
    expect(screen.getByText('Tina Teacher')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /add a trainer/i })).not.toBeInTheDocument();

    // Saving must NOT send internalIds (the server keeps the existing set) —
    // otherwise a stale assigned trainer would 400-block an external-only save.
    await user.click(screen.getByRole('button', { name: 'Save trainers' }));
    expect(setTrainers).toHaveBeenCalledTimes(1);
    expect(setTrainers.mock.calls[0][0].data).toEqual({ externalTrainer: null });
  });
});
