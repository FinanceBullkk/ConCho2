import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar, FilterSelect } from '../FilterBar';

describe('FilterBar', () => {
  it('renders a search input and forwards keystrokes to onSearch', async () => {
    const onSearch = vi.fn();
    render(<FilterBar search="" onSearch={onSearch} searchPlaceholder="Search users…" />);
    const input = screen.getByLabelText('Search users…');
    await userEvent.type(input, 'a');
    expect(onSearch).toHaveBeenCalledWith('a');
  });

  it('omits the search input entirely when onSearch is not provided', () => {
    render(<FilterBar />);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('shows a clear button only when search is non-empty and clears on click', async () => {
    const onSearch = vi.fn();
    const { rerender } = render(<FilterBar search="" onSearch={onSearch} />);
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();

    rerender(<FilterBar search="anna" onSearch={onSearch} />);
    await userEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(onSearch).toHaveBeenLastCalledWith('');
  });

  it('renders select filters and reports the chosen value', async () => {
    const onChange = vi.fn();
    render(
      <FilterBar
        filters={[
          { key: 'role', placeholder: 'All Roles', options: ['Admin', 'Teacher'], value: '', onChange },
        ]}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('All Roles'), 'Teacher');
    expect(onChange).toHaveBeenCalledWith('Teacher');
  });

  it('renders trailing action children', () => {
    render(
      <FilterBar onSearch={() => {}}>
        <button type="button">+ New</button>
      </FilterBar>,
    );
    expect(screen.getByRole('button', { name: '+ New' })).toBeInTheDocument();
  });
});

describe('FilterSelect', () => {
  it('renders the placeholder as the empty-value option plus object/string options', () => {
    render(
      <FilterSelect
        placeholder="All Statuses"
        value=""
        onChange={() => {}}
        options={['Active', { value: 'OnHold', label: 'On hold' }]}
      />,
    );
    expect(screen.getByRole('option', { name: 'All Statuses' })).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'On hold' })).toHaveValue('OnHold');
  });
});
