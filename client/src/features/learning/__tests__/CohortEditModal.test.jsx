import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CohortEditModal from '../CohortEditModal';

const update = vi.fn();
const remove = vi.fn();
const onClose = vi.fn();
const cf = vi.hoisted(() => ({ defs: [] }));

vi.mock('../../../hooks/useLearning', () => ({
  useUpdateCohort: () => ({ mutateAsync: update, isPending: false }),
  useDeleteCohort: () => ({ mutateAsync: remove, isPending: false }),
}));
vi.mock('../../custom-fields/useCustomFields', () => ({
  useCustomFields: () => ({ data: cf.defs }),
}));

const cohort = { _id: 'c1', cohortCode: 'LD001', programName: 'Onboarding', status: 'Ongoing', totalSessions: 5 };

describe('CohortEditModal', () => {
  beforeEach(() => {
    update.mockReset(); update.mockResolvedValue({});
    remove.mockReset(); remove.mockResolvedValue({});
    onClose.mockReset();
    cf.defs = [];
  });

  it('saves status + totalSessions via useUpdateCohort', async () => {
    const user = userEvent.setup();
    render(<CohortEditModal cohort={cohort} onClose={onClose} />);

    // NB: the test i18n backend returns translation KEYS, so button/labels
    // appear as e.g. "common.save" / "common.delete".
    await user.selectOptions(screen.getByRole('combobox'), 'Completed');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(update).toHaveBeenCalledWith({ id: 'c1', data: { status: 'Completed', totalSessions: 5 } });
    expect(onClose).toHaveBeenCalled();
  });

  it('deletes only after a confirm click (two-step) via useDeleteCohort', async () => {
    const user = userEvent.setup();
    render(<CohortEditModal cohort={cohort} onClose={onClose} />);

    // First click arms the confirm; does not delete yet.
    await user.click(screen.getByRole('button', { name: 'common.delete' }));
    expect(remove).not.toHaveBeenCalled();

    // Second click confirms.
    await user.click(screen.getByRole('button', { name: 'common.confirmDelete' }));
    expect(remove).toHaveBeenCalledWith('c1');
    expect(onClose).toHaveBeenCalled();
  });

  it('edits + saves Cohort custom field values', async () => {
    cf.defs = [{ _id: 'd1', key: 'cost_center', label: 'Cost center', type: 'text' }];
    const user = userEvent.setup();
    render(<CohortEditModal cohort={{ ...cohort, customFields: { cost_center: 'CC-1' } }} onClose={onClose} />);

    const input = screen.getByLabelText('Cost center');
    await user.clear(input);
    await user.type(input, 'CC-9');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(update).toHaveBeenCalledWith({
      id: 'c1',
      data: { status: 'Ongoing', totalSessions: 5, customFields: { cost_center: 'CC-9' } },
    });
  });
});
