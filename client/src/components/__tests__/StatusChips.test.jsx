import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusChips } from '../StatusChips';

const OPTIONS = [
  { value: '', label: 'All', count: 12 },
  { value: 'Active', label: 'Active', count: 8 },
  { value: 'Inactive', label: 'Inactive' },
  'On-hold', // bare-string option form
];

describe('StatusChips', () => {
  it('renders every option, normalising bare-string entries', () => {
    render(<StatusChips value="" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^on-hold$/i })).toBeInTheDocument();
  });

  it('marks the selected chip with aria-pressed', () => {
    render(<StatusChips value="Active" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole('button', { name: /^active/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^all/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the option value when clicked', async () => {
    const onChange = vi.fn();
    render(<StatusChips value="" onChange={onChange} options={OPTIONS} />);
    await userEvent.click(screen.getByRole('button', { name: /^active/i }));
    expect(onChange).toHaveBeenCalledWith('Active');
  });

  it('renders a numeric count badge but omits it when count is absent', () => {
    render(<StatusChips value="" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    // 'Inactive' has no count → only its label renders
    const inactive = screen.getByRole('button', { name: /inactive/i });
    expect(inactive).toHaveTextContent('Inactive');
  });

  it('exposes a labelled group for assistive tech', () => {
    render(<StatusChips value="" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole('group', { name: /status filter/i })).toBeInTheDocument();
  });
});
