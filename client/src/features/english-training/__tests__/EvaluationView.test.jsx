import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EnglishTrainingPage from '../EnglishTrainingPage';

const batchMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('../useEnglishTraining', () => ({
  // page hooks (overview renders first as the default tab, then we switch)
  useEnglishOverview: () => ({ data: { cohortsTotal: 0, cohortsActive: 0, employeesTotal: 0, employeesActive: 0, coursesTotal: 0, runsTotal: 0, runsCompleted: 0, openDqIssues: 0, pendingExamRuns: 71, pendingExamLearners: 349 } }),
  useEnglishCohorts: () => ({ data: [] }),
  useEnglishCourses: () => ({ data: [] }),
  useEnglishEmployees: () => ({ data: [] }),
  useEnglishSessions: () => ({ data: [] }),
  useEnglishSessionAttendance: () => ({ data: null }),
  useEnglishEligibility: () => ({ data: [] }),
  useEnglishIssues: () => ({ data: [] }),
  useEnglishIssueDetails: () => ({ data: [] }),
  useCorrectEnglishEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // evaluation hooks
  useEnglishLevels: () => ({ data: [{ code: 'advanced', displayName: 'Advanced', rank: 13 }], isLoading: false }),
  useEnglishPendingExamEntries: () => ({
    data: [{ courseRunId: 'r1', classCode: 'A1', courseName: 'Foundation', endDate: '2026-07-01', pendingCount: 2 }],
    isLoading: false, isError: false,
  }),
  useEnglishCourseRun: () => ({
    data: {
      classCode: 'A1', courseName: 'Foundation', runNumber: 1, endDate: '2026-07-01',
      roster: [
        { id: 'en1', empCode: '000123', fullName: 'Alex Nguyen', attendanceRatio: 0.9, attendanceThresholdRatio: 0.8, sitEligible: true, examLevelCode: null, examDate: null },
        { id: 'en2', empCode: '000999', fullName: 'Sam Tran', attendanceRatio: 0.7, attendanceThresholdRatio: 0.8, sitEligible: false, examLevelCode: null, examDate: null },
      ],
    },
    isLoading: false, isError: false,
  }),
  useRecordExamResultsBatch: () => ({ mutate: batchMock, isPending: false }),
  useDeleteExamResult: () => ({ mutate: deleteMock, isPending: false }),
}));

describe('EvaluationView (exam result & level)', () => {
  it('defaults the class exam date to the run end date and saves all eligible levels at once', () => {
    render(<EnglishTrainingPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));

    // Worklist of completed runs waiting for levels.
    expect(screen.getByText('Needs level (completed runs)')).toBeInTheDocument();
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    // Open the roster for that run (replaces the worklist — no long scroll).
    fireEvent.click(screen.getByRole('button', { name: 'Enter levels' }));
    expect(screen.getByText('Alex Nguyen', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Not eligible (attendance below target)')).toBeInTheDocument();
    expect(screen.getByText('Eligible')).toBeInTheDocument();

    // The shared date defaults to the run's end date.
    expect(screen.getByLabelText('Exam date (whole class)')).toHaveValue('2026-07-01');

    // The not-eligible learner's level control is disabled.
    const levelSelects = screen.getAllByLabelText('Level');
    expect(levelSelects[0]).toBeEnabled();   // Alex (eligible)
    expect(levelSelects[1]).toBeDisabled();  // Sam (not eligible)

    // Pick Alex's level, then Save all (only the eligible, changed learner is sent).
    fireEvent.change(levelSelects[0], { target: { value: 'advanced' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save all (1)' }));

    expect(batchMock).toHaveBeenCalledWith([{ enrollmentId: 'en1', levelCode: 'advanced', examDate: '2026-07-01' }]);
  });
});
