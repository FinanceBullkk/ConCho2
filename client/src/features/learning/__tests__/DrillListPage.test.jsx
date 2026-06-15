import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DrillListPage from '../DrillListPage';

// S1 — the operational-dashboard drill list. Verifies that the URL metric maps
// to the right compliance filter and that learner rows render.

const h = vi.hoisted(() => ({ compliance: vi.fn() }));

vi.mock('../../../hooks/useLearning', () => ({
  useComplianceReport: (filters) => h.compliance(filters),
}));

const sampleReport = {
  rows: [
    {
      learner: { id: 'u1', name: 'An Bui', empCode: '000118' },
      org: { departmentName: 'Sales' },
      assignment: { id: 'a1', targetName: 'Security Awareness', dueDate: '2026-05-01', status: 'overdue' },
      certificate: { state: 'missing' },
    },
    {
      learner: { id: 'u2', name: 'Bao Tran', empCode: '000119' },
      org: { departmentName: 'Engineering' },
      assignment: { id: 'a1', targetName: 'Security Awareness', dueDate: '2026-05-01', status: 'overdue' },
      certificate: { state: 'missing' },
    },
  ],
};

const renderAt = (search) =>
  render(
    <MemoryRouter initialEntries={[`/reports/drill${search}`]}>
      <DrillListPage />
    </MemoryRouter>,
  );

describe('DrillListPage (S1 drill-through)', () => {
  beforeEach(() => h.compliance.mockReset());

  it('maps metric=overdue to a status:overdue compliance filter and renders learners', () => {
    h.compliance.mockReturnValue({ data: sampleReport, isLoading: false, isError: false });
    renderAt('?metric=overdue');

    expect(h.compliance).toHaveBeenCalledWith({ status: 'overdue' });
    expect(screen.getByText('An Bui')).toBeInTheDocument();
    expect(screen.getByText('Bao Tran')).toBeInTheDocument();
    expect(screen.getByText('2 records')).toBeInTheDocument();
  });

  it('maps metric=expiring to a certificateState:expiring filter', () => {
    h.compliance.mockReturnValue({ data: { rows: [] }, isLoading: false, isError: false });
    renderAt('?metric=expiring');

    expect(h.compliance).toHaveBeenCalledWith({ certificateState: 'expiring' });
    expect(screen.getByText('No records match this view.')).toBeInTheDocument();
  });

  it('passes a department id through as a departmentId filter', () => {
    h.compliance.mockReturnValue({ data: { rows: [] }, isLoading: false, isError: false });
    renderAt('?metric=department&id=dep1&label=Sales');

    expect(h.compliance).toHaveBeenCalledWith({ departmentId: 'dep1' });
  });

  it('shows an error state when the report fails to load', () => {
    h.compliance.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderAt('?metric=overdue');

    expect(screen.getByText("Couldn't load this list.")).toBeInTheDocument();
  });
});
