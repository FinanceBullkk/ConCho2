import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportsPage from '../ReportsPage';

// Mock useRole — we exercise the permission-based tab visibility here.
const mockCan = vi.fn();
vi.mock('@/hooks/useRole', () => ({
  useRole: () => ({ can: mockCan }),
}));

// Heavy child components are not under test; stub them so we can assert
// purely on the tab strip and active-tab routing.
vi.mock('../HRExportPage', () => ({ default: () => <div data-testid="hr-export-page">HR Export</div> }));
vi.mock('../../features/sync/SyncPage', () => ({ default: () => <div data-testid="sync-page">Sync</div> }));
vi.mock('../../features/evaluations/EvaluationPage', () => ({ default: () => <div data-testid="eval-page">Evaluations</div> }));
vi.mock('../../features/attendance/AttendanceDashboardPage', () => ({ default: () => <div data-testid="analytics-page">Analytics</div> }));

function renderReports(initialPath = '/reports') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ReportsPage />
    </MemoryRouter>
  );
}

describe('ReportsPage — tab visibility per role', () => {
  beforeEach(() => {
    mockCan.mockReset();
  });

  it('Admin sees all four tabs', () => {
    mockCan.mockImplementation(() => true);
    renderReports();
    expect(screen.getByRole('tab', { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /hr export/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /sheets sync/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /evaluations/i })).toBeInTheDocument();
  });

  it('Teacher sees only analytics + evaluations (no HR Export, no Sheets Sync)', () => {
    // Teacher permissions: read:attendance + read:evaluations only
    mockCan.mockImplementation(
      (p) => p === 'read:attendance' || p === 'read:evaluations'
    );
    renderReports();
    expect(screen.getByRole('tab', { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /evaluations/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /hr export/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /sheets sync/i })).not.toBeInTheDocument();
  });

  it('Teacher requesting ?tab=hr-export falls back to first allowed tab', () => {
    mockCan.mockImplementation(
      (p) => p === 'read:attendance' || p === 'read:evaluations'
    );
    renderReports('/reports?tab=hr-export');
    // analytics is the first tab Teacher can see — its panel must render
    expect(screen.getByTestId('analytics-page')).toBeInTheDocument();
    // hr-export panel must NOT render
    expect(screen.queryByTestId('hr-export-page')).not.toBeInTheDocument();
  });

  it('renders empty-state header when user has no report permissions at all', () => {
    mockCan.mockImplementation(() => false);
    renderReports();
    expect(screen.getByRole('heading', { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByText(/no reports available/i)).toBeInTheDocument();
  });
});
