import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReconcilePage from '../ReconcilePage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
    getTrend: vi.fn().mockResolvedValue({ data: { data: [] } }),
    triggerRun: vi.fn().mockResolvedValue({ data: { data: fixture.report } }),
    heal: vi.fn().mockResolvedValue({ data: { data: { check: 'counter_drift', attempted: 1, healed: 1, failed: 0, remaining: 0, results: [] } } }),
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

  it('offers Auto-heal only for a healable check and calls heal on click', async () => {
    const { reconcileAPI } = await import('../../../api/api');
    renderPage();

    // Filter to a healable check (counter_drift) by clicking its summary card.
    const cardLabel = (await screen.findAllByText('Counter drift'))[0];
    fireEvent.click(cardLabel.closest('button'));

    // The healable check exposes an Auto-heal action; clicking it calls heal().
    const healBtn = await screen.findByRole('button', { name: /Auto-heal 1/i });
    fireEvent.click(healBtn);

    await waitFor(() => expect(reconcileAPI.heal).toHaveBeenCalledWith('counter_drift'));
  });

  it('does NOT offer Auto-heal for a non-healable check', async () => {
    renderPage();

    const cardLabel = (await screen.findAllByText('Duplicate active enrollment'))[0];
    fireEvent.click(cardLabel.closest('button'));

    expect(await screen.findByText(/Needs manual review/i)).toBeInTheDocument();
    // No Auto-heal ACTION button (named "Auto-heal <n>"); the "Auto-healable"
    // card hint is not a button action.
    expect(screen.queryByRole('button', { name: /Auto-heal \d/i })).not.toBeInTheDocument();
  });
});
