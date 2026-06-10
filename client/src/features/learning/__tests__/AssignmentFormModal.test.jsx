import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssignmentFormModal from '../AssignmentFormModal';

const create = vi.fn();
const onClose = vi.fn();

vi.mock('../../../hooks/useLearning', () => ({
  useLearningPrograms: () => ({
    data: { data: [{ _id: 'p1', name: 'Code of Conduct', code: 'COC' }] },
  }),
  useLearningPaths: () => ({
    data: { data: [{ _id: 'lp1', title: 'Onboarding Path', code: 'ONB' }] },
  }),
  useCreateAssignment: () => ({ mutateAsync: create, isPending: false }),
}));

vi.mock('../../../hooks/useOrg', () => ({
  useDepartments: () => ({ data: [{ _id: 'd1', name: 'People Ops', code: 'PO' }] }),
}));

vi.mock('../../../hooks/useUsers', () => ({
  useUsers: () => ({
    data: { data: [{ _id: 'u1', name: 'Alice Nguyen', empCode: '000001', status: 'Active' }] },
  }),
}));

describe('AssignmentFormModal', () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({});
    onClose.mockReset();
  });

  it('creates a program assignment for selected departments and users', async () => {
    const user = userEvent.setup();
    render(<AssignmentFormModal onClose={onClose} />);

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Quarterly Compliance');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Program' }), 'p1');
    await user.type(screen.getByLabelText('Due date'), '2026-06-30');
    await user.click(screen.getByRole('checkbox', { name: /people ops/i }));
    await user.click(screen.getByRole('checkbox', { name: /alice nguyen/i }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(create).toHaveBeenCalledWith({
      title: 'Quarterly Compliance',
      description: undefined,
      targetType: 'program',
      programId: 'p1',
      dueDate: '2026-06-30',
      userIds: ['u1'],
      departmentIds: ['d1'],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows validation when no audience is selected', async () => {
    const user = userEvent.setup();
    render(<AssignmentFormModal onClose={onClose} />);

    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Quarterly Compliance');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Program' }), 'p1');
    await user.type(screen.getByLabelText('Due date'), '2026-06-30');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a target, due date, and at least one user or department.')).toBeInTheDocument();
  });
});
