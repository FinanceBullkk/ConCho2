import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import PathProgramsEditor from '../PathProgramsEditor';

const options = [
  { _id: 'p1', code: 'ENG_A', name: 'English A' },
  { _id: 'p2', code: 'ENG_B', name: 'English B' },
  { _id: 'p3', code: 'ENG_C', name: 'English C' },
];

describe('PathProgramsEditor', () => {
  it('renders selected programs in order and excludes them from the add dropdown', () => {
    render(<PathProgramsEditor options={options} value={['p1', 'p2']} onChange={() => {}} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('English A')).toBeInTheDocument();
    expect(within(items[1]).getByText('English B')).toBeInTheDocument();
    // only the unselected program (English C) is offered in the add dropdown
    expect(screen.getByRole('option', { name: /English C/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /English A/ })).not.toBeInTheDocument();
  });

  it('appends a program when one is picked from the dropdown', () => {
    const onChange = vi.fn();
    render(<PathProgramsEditor options={options} value={['p1']} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Add a program…'), { target: { value: 'p3' } });
    expect(onChange).toHaveBeenCalledWith(['p1', 'p3']);
  });

  it('removes a program', () => {
    const onChange = vi.fn();
    render(<PathProgramsEditor options={options} value={['p1', 'p2']} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText('Remove')[0]);
    expect(onChange).toHaveBeenCalledWith(['p2']);
  });

  it('reorders a program with the move-down control', () => {
    const onChange = vi.fn();
    render(<PathProgramsEditor options={options} value={['p1', 'p2']} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText('Move down')[0]);
    expect(onChange).toHaveBeenCalledWith(['p2', 'p1']);
  });

  it('disables move-up on the first row and move-down on the last', () => {
    render(<PathProgramsEditor options={options} value={['p1', 'p2']} onChange={() => {}} />);
    expect(screen.getAllByLabelText('Move up')[0]).toBeDisabled();
    expect(screen.getAllByLabelText('Move down')[1]).toBeDisabled();
  });

  it('disables the dropdown when every program is already added', () => {
    render(<PathProgramsEditor options={options} value={['p1', 'p2', 'p3']} onChange={() => {}} />);
    const dropdown = screen.getByLabelText('Add a program…');
    expect(dropdown).toBeDisabled();
    expect(within(dropdown).getByText('All programs added')).toBeInTheDocument();
  });
});
