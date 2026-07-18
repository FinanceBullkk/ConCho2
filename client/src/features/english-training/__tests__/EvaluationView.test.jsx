import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EnglishTrainingPage from '../EnglishTrainingPage';

const recordMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('../useEnglishTraining', () => ({
  // page hooks (unused on the evaluation tab, kept minimal)
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
      classCode: 'A1', courseName: 'Foundation', runNumber: 1,
      roster: [
        { id: 'en1', empCode: '000123', fullName: 'Alex Nguyen', absenceCount: 1, sitEligible: true, examLevelCode: null, examDate: null },
        { id: 'en2', empCode: '000999', fullName: 'Sam Tran', absenceCount: 3, sitEligible: false, examLevelCode: null, examDate: null },
      ],
    },
    isLoading: false, isError: false,
  }),
  useRecordExamResult: () => ({ mutate: recordMock, isPending: false }),
  useDeleteExamResult: () => ({ mutate: deleteMock, isPending: false }),
}));

describe('EvaluationView (exam result & level)', () => {
  it('lists completed runs needing levels and records a level for an eligible learner', () => {
    render(<EnglishTrainingPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));

    // Worklist of completed runs waiting for levels.
    expect(screen.getByText('Needs level (completed runs)')).toBeInTheDocument();
    expect(screen.getByText('A1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    // Open the roster for that run.
    fireEvent.click(screen.getByRole('button', { name: 'Enter levels' }));
    expect(screen.getByText('Alex Nguyen', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Not eligible (>2 absences)')).toBeInTheDocument();
    expect(screen.getByText('Eligible')).toBeInTheDocument();

    // The not-eligible learner's level control is disabled.
    const levelSelects = screen.getAllByLabelText('Level');
    expect(levelSelects[0]).toBeEnabled();   // Alex (eligible)
    expect(levelSelects[1]).toBeDisabled();  // Sam (not eligible)

    // Record a level for the eligible learner.
    fireEvent.change(levelSelects[0], { target: { value: 'advanced' } });
    fireEvent.change(screen.getAllByLabelText('Exam date')[0], { target: { value: '2026-07-05' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);

    expect(recordMock).toHaveBeenCalledWith({ enrollmentId: 'en1', levelCode: 'advanced', examDate: '2026-07-05' });
  });
});
