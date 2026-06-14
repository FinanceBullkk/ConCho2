import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomFieldInput } from '../custom-field-input';

// TMS.update gap #6 — the shared renderer now covers all 7 field types. The
// builder + cohort forms reuse this, so these cases protect every consumer.

vi.mock('../../../hooks/useUsers', () => ({
  useUsers: () => ({ data: { data: [{ _id: 'u1', name: 'An Bui', empCode: '000118' }] } }),
}));

const renderInput = (def, value, onChange = vi.fn()) =>
  render(<CustomFieldInput def={def} value={value} onChange={onChange} />);

describe('CustomFieldInput (all types)', () => {
  it('renders a number input', () => {
    renderInput({ key: 'grade', label: 'Grade', type: 'number' }, '');
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it('renders a date input', () => {
    renderInput({ key: 'hire', label: 'Hire date', type: 'date' }, '2026-06-15');
    expect(screen.getByLabelText('Hire date')).toHaveValue('2026-06-15');
  });

  it('renders a toggle and emits a boolean', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderInput({ key: 'active', label: 'Active', type: 'toggle' }, false, onChange);
    await user.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders a multiselect and emits the toggled array', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderInput({ key: 'skills', label: 'Skills', type: 'multiselect', options: ['SQL', 'Excel'] }, ['SQL'], onChange);
    await user.click(screen.getByRole('checkbox', { name: 'Excel' }));
    expect(onChange).toHaveBeenCalledWith(['SQL', 'Excel']);
  });

  it('renders a user picker populated from the users list', () => {
    renderInput({ key: 'owner', label: 'Owner', type: 'user' }, '');
    expect(screen.getByRole('option', { name: 'An Bui (000118)' })).toBeInTheDocument();
  });

  it('still renders text + select', () => {
    const { rerender } = renderInput({ key: 't', label: 'T', type: 'text' }, 'hi');
    expect(screen.getByLabelText('T')).toHaveValue('hi');
    rerender(<CustomFieldInput def={{ key: 's', label: 'S', type: 'select', options: ['A'] }} value="A" onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'A' })).toBeInTheDocument();
  });
});
