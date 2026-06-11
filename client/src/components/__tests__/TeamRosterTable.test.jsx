import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TeamRosterTable from '../TeamRosterTable';

const report = (over = {}) => ({
  _id: 'u1', name: 'Alice Nguyen', empCode: '000123', role: 'Participant', status: 'Active',
  department: { _id: 'd1', name: 'Engineering', code: 'ENG' },
  training: { activeEnrollments: 2, completedPrograms: 1, certificates: 1 },
  ...over,
});

describe('TeamRosterTable', () => {
  it('shows an empty state when there are no reports', () => {
    render(<TeamRosterTable reports={[]} />);
    expect(screen.getByText(/no direct reports/i)).toBeInTheDocument();
  });

  it('renders a report row with its training rollup', () => {
    render(<TeamRosterTable reports={[report()]} />);
    expect(screen.getByText('Alice Nguyen')).toBeInTheDocument();
    expect(screen.getByText('000123')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
  });

  it('falls back to the legacy free-text department string', () => {
    render(<TeamRosterTable reports={[report({ department: 'Sales' })]} />);
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });
});
