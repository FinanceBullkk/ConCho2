import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CompletionReportTable from '../CompletionReportTable';

const report = {
  cohort: { id: 'c1', code: 'EL001', programName: 'English' },
  summary: { total: 2, complete: 1, completionRate: 50, certificatesIssued: 1 },
  rows: [
    {
      learner: { id: 'u1', empCode: '000011', name: 'Alice', department: 'Sales' },
      attendancePercent: 100,
      assessmentRequired: true,
      assessmentMet: true,
      feedbackRequired: false,
      feedbackMet: true,
      complete: true,
      certificate: { number: 'CERT-2026-000001', status: 'Issued' },
    },
    {
      learner: { id: 'u2', empCode: '000012', name: 'Bob', department: 'Sales' },
      attendancePercent: 20,
      assessmentRequired: true,
      assessmentMet: false,
      feedbackRequired: false,
      feedbackMet: true,
      complete: false,
      certificate: null,
    },
  ],
};

describe('CompletionReportTable', () => {
  it('renders the summary tiles from the report', () => {
    render(<CompletionReportTable report={report} />);
    // completionRate rendered as "50%"
    expect(screen.getByText('50%')).toBeInTheDocument();
    // certificatesIssued
    expect(screen.getByText('Certificates')).toBeInTheDocument();
  });

  it('renders one row per learner with attendance and certificate', () => {
    render(<CompletionReportTable report={report} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('CERT-2026-000001')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  it('shows Met/Unmet for a required dimension and N/A when not required', () => {
    render(<CompletionReportTable report={report} />);
    // Alice assessment required + met → "Met"; Bob assessment required + unmet → "Unmet"
    expect(screen.getByText('Met')).toBeInTheDocument();
    expect(screen.getByText('Unmet')).toBeInTheDocument();
    // feedback not required for either → N/A em dash appears (cohort + cells)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});
