import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectionBar } from '../SelectionBar';

describe('SelectionBar', () => {
  it('renders nothing when nothing is selected', () => {
    const { container, rerender } = render(<SelectionBar count={0} onClear={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SelectionBar count={undefined} onClear={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a singular label and region for one selected row', () => {
    render(<SelectionBar count={1} onClear={() => {}} />);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '1 row selected' })).toBeInTheDocument();
  });

  it('pluralises the region label for multiple rows', () => {
    render(<SelectionBar count={3} onClear={() => {}} />);
    expect(screen.getByRole('region', { name: '3 rows selected' })).toBeInTheDocument();
  });

  it('renders inline action children', () => {
    render(
      <SelectionBar count={2} onClear={() => {}}>
        <button type="button">Export selected</button>
      </SelectionBar>,
    );
    expect(screen.getByRole('button', { name: 'Export selected' })).toBeInTheDocument();
  });

  it('invokes onClear from the Clear button', async () => {
    const onClear = vi.fn();
    render(<SelectionBar count={2} onClear={onClear} />);
    await userEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
