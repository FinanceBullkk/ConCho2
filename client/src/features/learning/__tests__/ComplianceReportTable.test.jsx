import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ComplianceReportTable from '../ComplianceReportTable';

const report = {
  summary: {
    rows: 6,
    overdue: 2,
    complete: 3,
    issued: 2,
    expiring: 1,
    expired: 1,
  },
  rows: [
    {
      learner: { id: 'u1', empCode: '000011', name: 'Alice Nguyen' },
      org: { departmentName: 'Sales', managerName: 'Manager One' },
      assignment: {
        id: 'a1',
        title: 'Quarterly Compliance',
        targetName: 'Cyber Hygiene',
        dueDate: '2026-06-30T00:00:00.000Z',
        status: 'overdue',
      },
      certificate: {
        state: 'expired',
        number: 'CERT-1',
        validUntil: '2026-06-01T00:00:00.000Z',
      },
    },
    {
      learner: { id: 'u2', empCode: '000012', name: 'Bob Tran' },
      org: { departmentName: 'Ops', managerName: 'Manager Two' },
      assignment: {
        id: 'a2',
        title: 'Code of Conduct',
        targetName: 'Ethics',
        dueDate: '2026-07-15T00:00:00.000Z',
        status: 'complete',
      },
      certificate: {
        state: 'issued',
        number: 'CERT-2',
        validUntil: null,
      },
    },
  ],
};

describe('ComplianceReportTable', () => {
  it('renders the compliance summary tiles', () => {
    render(<ComplianceReportTable report={report} />);

    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Certified')).toBeInTheDocument();
    expect(screen.getByText('Expiring')).toBeInTheDocument();
  });

  it('renders learner, org, assignment, due date, and certificate state columns', () => {
    render(<ComplianceReportTable report={report} />);

    expect(screen.getByText('Alice Nguyen')).toBeInTheDocument();
    expect(screen.getByText('000011')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('Manager One')).toBeInTheDocument();
    expect(screen.getByText('Quarterly Compliance')).toBeInTheDocument();
    expect(screen.getByText('Cyber Hygiene')).toBeInTheDocument();
    expect(screen.getByText('Jun 30, 2026')).toBeInTheDocument();
    expect(screen.getAllByText('Overdue').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Expired').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Valid until Jun 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('CERT-2')).toBeInTheDocument();
  });
});
