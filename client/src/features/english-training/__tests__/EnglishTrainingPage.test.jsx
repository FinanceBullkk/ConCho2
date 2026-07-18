import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EnglishTrainingPage from '../EnglishTrainingPage';

vi.mock('../useEnglishTraining', () => ({
  useEnglishCohorts: () => ({ data: [{ id: 'co1', classCode: 'A1', status: 'active', activeMembers: 12, runs: 2 }] }),
  useEnglishCourses: () => ({ data: [{ id: 'c1', courseCode: 'FOUNDATION', courseName: 'Foundation', expectedUnits: 20, maxAbsencesAllowed: 2, runs: 4 }] }),
  useEnglishEmployees: () => ({ data: [{ id: 'e1', empCode: '000123', fullName: 'Alex Nguyen', email: 'alex@example.com', employmentStatus: 'active' }] }),
  useEnglishSessions: () => ({ data: [{ id: 's1', classCode: 'A1', courseName: 'Foundation', sessionNumber: 1, heldAt: '2026-07-01T10:00:00.000Z', presentCount: 1, absentCount: 0 }] }),
  useEnglishSessionAttendance: () => ({ data: { id: 's1', classCode: 'A1', courseName: 'Foundation', sessionNumber: 1, roster: [{ enrollmentId: 'en1', employeeCode: '000123', employeeName: 'Alex Nguyen', enrollmentStatus: 'active', attendanceStatus: 'present' }] } }),
  useEnglishEligibility: () => ({ data: [{ enrollmentId: 'en1', employeeCode: '000123', employeeName: 'Alex Nguyen', classCode: 'A1', courseName: 'Foundation', absenceCount: 0, allowedAbsences: 2, eligibilityStatus: 'within_limit' }] }),
  useEnglishIssues: () => ({ data: [{ code: 'missing_bu', count: 3 }] }),
  useEnglishIssueDetails: () => ({
    data: [{
      id: 'dq1', code: 'missing_bu', entityType: 'employee', entityKey: '000123',
      employeeCode: '000123', employeeName: 'Alex Nguyen', classCode: null,
      businessUnit: null, jobRole: null,
      sourceSheet: 'STUDENTS', sourceRow: 12, detail: { field: 'email' },
    }],
  }),
  useCorrectEnglishEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('EnglishTrainingPage', () => {
  it('shows imported cohorts and switches to the searchable employee view', () => {
    render(<EnglishTrainingPage />);
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Courses' }));
    expect(screen.getByText('FOUNDATION')).toBeInTheDocument();
    expect(screen.getByText('Foundation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Employees' }));
    expect(screen.getByText('000123')).toBeInTheDocument();
    expect(screen.getByText('Alex Nguyen')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search by employee code or name' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Data-quality issues' }));
    expect(screen.getByText('missing_bu')).toBeInTheDocument();
    expect(screen.getByText('Select an issue to inspect affected records.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View details for missing_bu' }));
    expect(screen.getByRole('region', { name: 'Affected records' })).toBeInTheDocument();
    expect(screen.getByText('employee')).toBeInTheDocument();
    expect(screen.getByText('STUDENTS · row 12')).toBeInTheDocument();
    expect(screen.getByText('{"field":"email"}')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
    expect(screen.getByText('Correct employee data')).toBeInTheDocument();
    expect(screen.getByText('Business unit')).toBeInTheDocument();
    expect(screen.getByText('Job role')).toBeInTheDocument();
    expect(screen.getByLabelText('Business unit')).toBeRequired();
    expect(screen.getByRole('button', { name: 'Save correction' })).toBeDisabled();
  });

  it('shows imported sessions, attendance roster, and eligibility', () => {
    render(<EnglishTrainingPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sessions' }));
    expect(screen.getByText('View attendance')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View attendance' }));
    expect(screen.getByRole('region', { name: 'Session attendance' })).toBeInTheDocument();
    expect(screen.getByText('present')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Eligibility' }));
    expect(screen.getByText('within_limit')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search by employee, class, or course' })).toBeInTheDocument();
  });
});
