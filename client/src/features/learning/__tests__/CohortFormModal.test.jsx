import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CohortFormModal from '../CohortFormModal';

const create = vi.fn();
const onClose = vi.fn();
const cf = vi.hoisted(() => ({ defs: [] }));

vi.mock('../../../hooks/useLearning', () => ({
  useCreateCohort: () => ({ mutateAsync: create, isPending: false }),
  useLearningPrograms: () => ({ data: { data: [{ _id: 'p1', name: 'Onboarding', code: 'ONB' }] } }),
}));
vi.mock('../../custom-fields/useCustomFields', () => ({
  useCustomFields: () => ({ data: cf.defs }),
}));

describe('CohortFormModal', () => {
  beforeEach(() => {
    create.mockReset(); create.mockResolvedValue({});
    onClose.mockReset();
    cf.defs = [];
  });

  it('creates a cohort with Cohort custom field values', async () => {
    cf.defs = [{ _id: 'd1', key: 'cost_center', label: 'Cost center', type: 'text' }];
    const user = userEvent.setup();
    render(<CohortFormModal onClose={onClose} />);

    // Pick the program (first combobox) and fill the custom field.
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'p1');
    await user.type(screen.getByLabelText('Cost center'), 'CC-100');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(create).toHaveBeenCalledWith({
      programId: 'p1',
      status: 'Ongoing',
      customFields: { cost_center: 'CC-100' },
    });
  });

  it('omits customFields when no Cohort fields are defined', async () => {
    const user = userEvent.setup();
    render(<CohortFormModal onClose={onClose} />);

    await user.selectOptions(screen.getAllByRole('combobox')[0], 'p1');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(create).toHaveBeenCalledWith({ programId: 'p1', status: 'Ongoing' });
  });
});
