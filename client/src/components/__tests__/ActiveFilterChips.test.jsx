import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveFilterChips } from '../ActiveFilterChips';

const makeFilters = () => [
  { key: 'role', label: 'Role: Admin', onRemove: vi.fn() },
  { key: 'bu', label: 'BU: Sales', onRemove: vi.fn() },
];

describe('ActiveFilterChips', () => {
  it('renders nothing when there are no filters', () => {
    const { container } = render(<ActiveFilterChips filters={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one removable pill per active filter', () => {
    render(<ActiveFilterChips filters={makeFilters()} />);
    expect(screen.getByText('Role: Admin')).toBeInTheDocument();
    expect(screen.getByText('BU: Sales')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove role: admin filter/i })).toBeInTheDocument();
  });

  it('calls the matching onRemove when a pill × is clicked', async () => {
    const filters = makeFilters();
    render(<ActiveFilterChips filters={filters} />);
    await userEvent.click(screen.getByRole('button', { name: /remove bu: sales filter/i }));
    expect(filters[1].onRemove).toHaveBeenCalledTimes(1);
    expect(filters[0].onRemove).not.toHaveBeenCalled();
  });

  it('renders "Clear all" only when onClearAll is provided and invokes it', async () => {
    const onClearAll = vi.fn();
    const { rerender } = render(<ActiveFilterChips filters={makeFilters()} />);
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull();

    rerender(<ActiveFilterChips filters={makeFilters()} onClearAll={onClearAll} />);
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });
});
