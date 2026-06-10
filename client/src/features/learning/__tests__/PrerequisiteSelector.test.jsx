import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PrerequisiteSelector from '../PrerequisiteSelector';

const options = [
  { _id: 'p1', code: 'ENG_A', name: 'English A' },
  { _id: 'p2', code: 'ENG_B', name: 'English B' },
];

describe('PrerequisiteSelector', () => {
  it('renders one checkbox per option, reflecting the current value', () => {
    render(<PrerequisiteSelector options={options} value={['p1']} onChange={() => {}} />);
    expect(screen.getByText('English A')).toBeInTheDocument();
    expect(screen.getByText('ENG_B')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).not.toBeChecked();
  });

  it('adds an id when an unchecked option is toggled', () => {
    const onChange = vi.fn();
    render(<PrerequisiteSelector options={options} value={['p1']} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(onChange).toHaveBeenCalledWith(['p1', 'p2']);
  });

  it('removes an id when a checked option is toggled', () => {
    const onChange = vi.fn();
    render(<PrerequisiteSelector options={options} value={['p1', 'p2']} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onChange).toHaveBeenCalledWith(['p2']);
  });

  it('shows the empty message when no options are available', () => {
    render(<PrerequisiteSelector options={[]} value={[]} onChange={() => {}} />);
    expect(screen.getByText('No other active programs available.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
