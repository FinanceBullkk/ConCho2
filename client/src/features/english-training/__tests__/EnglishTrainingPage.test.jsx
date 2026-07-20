import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EnglishTrainingPage from '../EnglishTrainingPage';

vi.mock('../useEnglishTraining', () => ({
  useEnglishOverview: () => ({ data: { cohortsTotal: 52, cohortsActive: 52, employeesTotal: 308, employeesActive: 292, coursesTotal: 6, runsTotal: 91, runsCompleted: 80, openDqIssues: 182, pendingExamRuns: 71, pendingExamLearners: 349 } }),
  useEnglishCohorts: () => ({ data: [{ id: 'co1', classCode: 'A1', status: 'active', activeMembers: 12, runs: 2 }] }),
  useEnglishClassDetail: () => ({ data: {
    id: 'co1', classCode: 'A1', status: 'active', displayName: 'Alpha cohort',
    runs: [{
      id: 'r1', runNumber: 1, status: 'active', courseName: 'Foundation', attendanceThresholdRatio: 0.8,
      roster: [{ enrollmentId: 'en1', empCode: '000123', fullName: 'Alex Nguyen', enrollmentStatus: 'active', markedCount: 10, presentCount: 9, attendanceRatio: 0.9, attendanceThresholdRatio: 0.8, eligibilityStatus: 'within_limit', examLevelName: 'A1', examDate: '2026-07-10T00:00:00.000Z' }],
    }],
  } }),
  useEnglishCourses: () => ({ data: [{ id: 'c1', courseCode: 'FOUNDATION', courseName: 'Foundation', expectedUnits: 20, attendanceThresholdRatio: 0.8, runs: 4 }] }),
  useEnglishEmployees: () => ({ data: [{ id: 'e1', empCode: '000123', fullName: 'Alex Nguyen', email: 'alex@example.com', employmentStatus: 'active' }] }),
  useEnglishSessions: () => ({ data: [{ id: 's1', classCode: 'A1', courseName: 'Foundation', sessionNumber: 1, heldAt: '2026-07-01T10:00:00.000Z', presentCount: 1, absentCount: 0 }] }),
  useEnglishSessionAttendance: () => ({ data: { id: 's1', classCode: 'A1', courseName: 'Foundation', sessionNumber: 1, roster: [{ enrollmentId: 'en1', employeeCode: '000123', employeeName: 'Alex Nguyen', enrollmentStatus: 'active', attendanceStatus: 'present' }] } }),
  useEnglishEligibility: () => ({ data: [{ enrollmentId: 'en1', employeeCode: '000123', employeeName: 'Alex Nguyen', classCode: 'A1', courseName: 'Foundation', attendanceRatio: 0.9, attendanceThresholdRatio: 0.8, eligibilityStatus: 'within_limit' }] }),
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
  it('opens on an overview and switches to the cohort/course/employee views', () => {
    render(<EnglishTrainingPage />);
    // Default landing is the task-oriented overview, not a raw table.
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('349')).toBeInTheDocument();  // learners awaiting a level
    expect(screen.getByText('182')).toBeInTheDocument();  // open DQ issues

    fireEvent.click(screen.getByRole('tab', { name: 'Classes' }));
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Courses' }));
    expect(screen.getByText('FOUNDATION')).toBeInTheDocument();
    expect(screen.getByText('Foundation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Employees' }));
    expect(screen.getByText('000123')).toBeInTheDocument();
    expect(screen.getByText('Alex Nguyen')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();  // employmentStatus rendered as a badge
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

  it('overview "needs attention" cards jump to the relevant tab', () => {
    render(<EnglishTrainingPage />);
    // The open-issues card is an actionable button that navigates to Issues.
    fireEvent.click(screen.getByRole('button', { name: /Review issues/ }));
    expect(screen.getByText('missing_bu')).toBeInTheDocument();
    expect(screen.getByText('Select an issue to inspect affected records.')).toBeInTheDocument();
  });

  it('opens a class 360° detail from the Classes tab and returns via back', () => {
    render(<EnglishTrainingPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Classes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open class A1' }));
    // One place: course run + learner attendance summary + eligibility + level.
    expect(screen.getByText('Foundation')).toBeInTheDocument();
    expect(screen.getByText('000123 · Alex Nguyen')).toBeInTheDocument();
    expect(screen.getByText('9/10 · 90% / 80%')).toBeInTheDocument();
    expect(screen.getByText('Within limit')).toBeInTheDocument();  // eligibility badge
    fireEvent.click(screen.getByRole('button', { name: '← Back to classes' }));
    expect(screen.getByRole('button', { name: 'Open class A1' })).toBeInTheDocument();
  });

  it('shows imported sessions, attendance roster, and eligibility', () => {
    render(<EnglishTrainingPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sessions' }));
    expect(screen.getByText('View attendance')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View attendance' }));
    expect(screen.getByRole('region', { name: 'Session attendance' })).toBeInTheDocument();
    expect(screen.getByText('present')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Eligibility' }));
    expect(screen.getByText('Within limit')).toBeInTheDocument();  // eligibilityStatus badge
    expect(screen.getByRole('textbox', { name: 'Search by employee, class, or course' })).toBeInTheDocument();
  });
});
