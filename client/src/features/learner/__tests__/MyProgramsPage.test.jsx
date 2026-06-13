import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyProgramsPage from '../MyProgramsPage';

// Cohesion P1 — enrollment list entry into the per-program hub.

const h = vi.hoisted(() => ({
  enrollments: { data: { data: [] }, isLoading: false },
  cohorts: { data: { data: [] }, isLoading: false },
}));

vi.mock('../../../hooks/useLearning', () => ({
  useLearningEnrollments: () => h.enrollments,
  useLearningCohorts: () => h.cohorts,
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <MyProgramsPage />
    </MemoryRouter>,
  );

describe('MyProgramsPage — my enrollments list (Cohesion P1)', () => {
  it('renders one card per active enrollment linking to the program hub', () => {
    h.enrollments = {
      data: {
        data: [
          { id: 'e1', cohortId: 'c1', cohortCode: 'LD001', status: 'Active' },
          { id: 'e2', cohortId: 'c2', cohortCode: 'LD002', status: 'Dropped' }, // filtered out
        ],
      },
      isLoading: false,
    };
    h.cohorts = {
      data: {
        data: [
          { _id: 'c1', programName: 'Data Privacy Basics', cohortCode: 'LD001', totalSessions: 4, bookedSessions: 2 },
          { _id: 'c2', programName: 'Old Program', cohortCode: 'LD002', totalSessions: 4, bookedSessions: 0 },
        ],
      },
      isLoading: false,
    };
    renderPage();

    expect(screen.getByText('Data Privacy Basics')).toBeInTheDocument();
    expect(screen.queryByText('Old Program')).toBeNull();
    expect(screen.getByText(/2\/4 sessions scheduled/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /data privacy basics/i }))
      .toHaveAttribute('href', '/me/programs/c1');
  });

  it('shows the empty state with a catalog pointer when no enrollments', () => {
    h.enrollments = { data: { data: [] }, isLoading: false };
    h.cohorts = { data: { data: [] }, isLoading: false };
    renderPage();

    expect(screen.getByText(/no program enrollments/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse catalog/i })).toHaveAttribute('href', '/me/catalog');
  });
});
