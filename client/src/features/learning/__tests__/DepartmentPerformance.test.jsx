import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DepartmentPerformance from '../DepartmentPerformance';

const h = vi.hoisted(() => ({ state: {} }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o?.count != null ? `${k}:${o.count}` : k) }) }));
vi.mock('../../../hooks/useLearningDashboard', () => ({ useDepartmentPerformance: () => h.state }));

const data = {
  windowDays: 30,
  departments: [
    { department: 'Engineering', headcount: 214, completionPercent: 84, coveragePercent: 81, overdueCount: 6 },
    { department: 'Sales', headcount: 168, completionPercent: 72, coveragePercent: 69, overdueCount: 14 },
  ],
};

beforeEach(() => { h.state = { data, isLoading: false, isError: false }; });

describe('DepartmentPerformance', () => {
  it('renders a table with per-dept metrics', () => {
    render(<DepartmentPerformance variant="table" />);
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('84%')).toBeInTheDocument();
    expect(screen.getByText('214')).toBeInTheDocument();
  });

  it('renders cards variant with people + overdue counts', () => {
    render(<DepartmentPerformance variant="cards" />);
    expect(screen.getByText('Sales')).toBeInTheDocument();
    expect(screen.getByText('learning.deptPerf.people:168')).toBeInTheDocument();
    expect(screen.getByText('learning.deptPerf.overdueCount:14')).toBeInTheDocument();
  });

  it('shows an empty state when there are no departments', () => {
    h.state = { data: { departments: [] }, isLoading: false, isError: false };
    render(<DepartmentPerformance variant="table" />);
    expect(screen.getByText('learning.deptPerf.empty')).toBeInTheDocument();
  });
});
