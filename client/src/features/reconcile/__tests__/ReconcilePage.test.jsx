import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReconcilePage from '../ReconcilePage';

const fixture = vi.hoisted(() => ({
  report: {
    _id: 'report-1',
    runAt: '2026-06-06T06:00:00.000Z',
    durationMs: 42,
    triggeredBy: 'manual',
    status: 'issues',
    summary: {
      missing_attendance: 0,
      duplicate_active_enrollment: 1,
      orphan_schedule_class: 1,
      multi_team_class: 1,
      counter_drift: 1,
      soft_deleted_in_team_members: 1,
      stale_waitlist_entry: 1,
      future_summary_key: 2,
      total: 8,
    },
    issues: [
      {
        check: 'duplicate_active_enrollment',
        description: 'Learner has two active enrollments',
        refs: { userId: 'user-1' },
      },
      {
        check: 'orphan_schedule_class',
        description: 'Schedule references a missing class',
      },
      {
        check: 'multi_team_class',
        description: 'Two teams reference one class',
      },
      {
        check: 'counter_drift',
        description: 'Employee counter is behind',
      },
      {
        check: 'soft_deleted_in_team_members',
        description: 'Deleted learner remains in team',
      },
      {
        check: 'stale_waitlist_entry',
        description: 'Waiting entry on a finished session',
      },
      {
        check: 'constructor',
        description: 'Prototype-like future check payload',
      },
      {
        check: 'future_check_type',
        description: 'Future check payload',
      },
    ],
  },
}));

vi.mock('../../../api/api', () => ({
  reconcileAPI: {
    getHistory: vi.fn().mockResolvedValue({ data: { data: [fixture.report] } }),
    getLatest: vi.fn().mockResolvedValue({ data: { data: fixture.report } }),
    getById: vi.fn(),
    triggerRun: vi.fn(),
  },
  cronAPI: {
    getHealth: vi.fn().mockResolvedValue({ data: { data: { jobs: [] } } }),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ReconcilePage />
    </QueryClientProvider>
  );
}

describe('ReconcilePage', () => {
  it('renders expanded reconciliation checks without crashing', async () => {
    renderPage();

    expect(await screen.findAllByText('Duplicate active enrollment')).toHaveLength(2);
    expect(screen.getAllByText('Orphan schedule class')).toHaveLength(2);
    expect(screen.getAllByText('Multiple teams for one class')).toHaveLength(2);
    expect(screen.getAllByText('Counter drift')).toHaveLength(2);
    expect(screen.getAllByText('Deleted user in team')).toHaveLength(2);
    // DATA-016 — new known check renders its own label, not the unknown fallback
    expect(screen.getAllByText('Stale waitlist entry')).toHaveLength(2);
    expect(screen.getByText('Waiting entry on a finished session')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown reconciliation check').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Learner has two active enrollments')).toBeInTheDocument();
    expect(screen.getByText('Prototype-like future check payload')).toBeInTheDocument();
    expect(screen.getByText('Future check payload')).toBeInTheDocument();
  });
});
